// Listing payments: /api/pay/subscribe, /verify, /cancel, /status (signed-in company owners) and /webhook
// (Razorpay). The rules are in src/lib/pay.ts.
import type { APIRoute } from "astro";
import { auth } from "@wix/essentials";
import { items } from "@wix/data";
import {
  json, payReady, webhookReady, keyId, memberFrom, ownedCompany, billingFor, billingBySub, saveBilling, setCompanyPlan, rzp,
  planIdFor, firstChargeAt, subscriptionTotal, checkoutSignatureOk, webhookSignatureOk, billingView, LIVE, PRICES, PLAN_NAMES, RANK, planKey,
} from "../../../lib/pay";
import { emailReady } from "../../../lib/business";

const OFF = { error: "Payments aren’t switched on yet. Please try again soon, or contact us." };
const getCompany = (id: string) => auth.elevate(items.get)("Companies", id).catch(() => null) as Promise<any>;
const sec = (t: number | null | undefined) => (t ? new Date(t * 1000) : null);

/* GET /api/pay/health: whether payments are switched on. Yes or no only, never the keys. */
export const GET: APIRoute = async ({ params }) => {
  if (params.action !== "health") return json({ error: "Unknown action" }, 404);
  return json({ payments: payReady(), webhook: webhookReady(), invites: emailReady() });
};

export const POST: APIRoute = async ({ params, request }) => {
  const action = params.action;
  try {
    if (action === "webhook") return await webhook(request);
    const me = await memberFrom(request);
    if (!me) return json({ error: "Please log in again." }, 401);
    const body = await request.json().catch(() => ({}));
    const company = await ownedCompany(me.id, String(body.company || ""));
    if (!company) return json({ error: "Only someone who has claimed this company can manage its plan." }, 403);

    if (action === "status") {
      const rows = await billingFor(company._id);
      return json({ ready: payReady(), plan: planKey(company.plan), planEndsAt: company.planEndsAt || "", billing: rows.slice(0, 5).map(billingView) });
    }
    /* Everything below talks to Razorpay, so it needs the keys. */
    if (!payReady()) return json(OFF, 503);

    if (action === "subscribe") {
      const plan = planKey(body.plan);
      const currency = body.currency === "USD" ? "USD" : "INR";
      const live = (await billingFor(company._id)).find(b => LIVE.includes(b.status) && b.plan === plan);
      if (live) return json({ error: `${PLAN_NAMES[plan]} is already set up for this company.` }, 409);
      let planId: string;
      try { planId = await planIdFor(plan, currency); }
      catch (e: any) { return json({ error: currency === "USD" ? "Paying in US dollars isn’t available yet. Please choose rupees." : "Couldn’t prepare the payment. Please try again." }, 502); }
      const start = firstChargeAt(plan, company);
      const sub = await rzp("/subscriptions", "POST", {
        plan_id: planId, total_count: subscriptionTotal, quantity: 1, customer_notify: 1,
        ...(start ? { start_at: Math.floor(start.getTime() / 1000) } : {}),
        notes: { company: company._id, member: me.id, plan },
      });
      await saveBilling({ company: company._id, member: me.id, plan, currency, subscriptionId: sub.id, status: sub.status || "created", startAt: start || null, lastEvent: "created" });
      return json({
        key: keyId(), subscriptionId: sub.id, plan, currency, amount: PRICES[plan][currency], startAt: start ? start.toISOString() : "",
        name: PLAN_NAMES[plan], company: company.title, prefill: { name: me.name, email: me.email },
      });
    }

    if (action === "verify") {
      const row = await billingBySub(String(body.subscriptionId || ""));
      if (!row || row.company !== company._id || row.member !== me.id) return json({ error: "That payment doesn’t match this company." }, 400);
      if (!(await checkoutSignatureOk(String(body.paymentId || ""), row.subscriptionId, String(body.signature || "")))) return json({ error: "We couldn’t confirm that payment with Razorpay." }, 400);
      const sub = await rzp(`/subscriptions/${row.subscriptionId}`);
      const until = sec(sub.current_end) || sec(sub.start_at) || (row.startAt ? new Date(row.startAt) : null);
      await saveBilling({ ...row, status: sub.status || "authenticated", currentEnd: until, lastEvent: "checkout" });
      /* A higher plan starts now (Plus with its free days, Business charged today). Autopay for the same
         or a lower plan keeps the company on the plan it has, and renews it. */
      const cur = planKey(company.plan), next = RANK[row.plan] >= RANK[cur] ? planKey(row.plan) : cur;
      await setCompanyPlan(company._id, next, until);
      /* Moving up ends the lower plans' autopay, so nobody pays twice: one that hasn't charged yet ends now,
         one that has charged stops renewing. */
      for (const b of await billingFor(company._id)) {
        if (b.subscriptionId !== row.subscriptionId && RANK[planKey(b.plan)] < RANK[planKey(row.plan)] && LIVE.includes(b.status)) {
          const started = b.status === "active";
          await rzp(`/subscriptions/${b.subscriptionId}/cancel`, "POST", { cancel_at_cycle_end: started ? 1 : 0 }).catch(() => null);
          await saveBilling({ ...b, status: started ? "cancelling" : "cancelled", lastEvent: `replaced by ${row.plan}` });
        }
      }
      return json({ ok: true, plan: row.plan, until: until ? until.toISOString() : "" });
    }

    if (action === "cancel") {
      const live = (await billingFor(company._id)).filter(b => LIVE.includes(b.status));
      if (!live.length) return json({ error: "There’s no plan renewal to cancel." }, 404);
      for (const b of live) {
        /* An autopay that hasn't charged yet ends now. One that has charged runs to the end of the paid year. */
        const started = b.status === "active";
        await rzp(`/subscriptions/${b.subscriptionId}/cancel`, "POST", { cancel_at_cycle_end: started ? 1 : 0 });
        await saveBilling({ ...b, status: started ? "cancelling" : "cancelled", lastEvent: "cancelled by owner" });
        if (!started && b.plan !== "basic") await setCompanyPlan(company._id, "basic");
      }
      return json({ ok: true });
    }
    return json({ error: "Unknown action" }, 404);
  } catch (e: any) {
    return json({ error: "Something went wrong with the payment. Please try again." }, 500);
  }
};

/* Razorpay tells us about renewals, failed charges and cancellations. Each event is checked against the
   webhook secret before anything changes. */
async function webhook(request: Request): Promise<Response> {
  const raw = await request.text();
  if (!(await webhookSignatureOk(raw, request.headers.get("X-Razorpay-Signature") || ""))) return json({ error: "bad signature" }, 400);
  const evt = JSON.parse(raw);
  const sub = evt.payload && evt.payload.subscription && evt.payload.subscription.entity;
  if (!sub || !sub.id) return json({ ok: true });
  const row = await billingBySub(sub.id);
  if (!row) return json({ ok: true });
  const until = sec(sub.current_end);
  await saveBilling({ ...row, status: sub.status || row.status, ...(until ? { currentEnd: until } : {}), lastEvent: String(evt.event || "") });
  const event = String(evt.event || "");
  const cur = planKey((await getCompany(row.company))?.plan);
  if (event === "subscription.charged" || event === "subscription.activated") {
    /* A renewal never moves a company down: a lower plan's last charge can't undo an upgrade. */
    await setCompanyPlan(row.company, RANK[planKey(row.plan)] >= RANK[cur] ? planKey(row.plan) : cur, until);
  } else if (["subscription.cancelled", "subscription.completed", "subscription.halted", "subscription.expired"].includes(event) && row.plan !== "basic" && cur === planKey(row.plan)) {
    /* The company's current paid plan ends: it falls back to the highest plan it still has running, or
       Basic. A plan replaced by an upgrade ending here changes nothing, because the company has moved on. */
    const still = (await billingFor(row.company)).filter(b => b.subscriptionId !== row.subscriptionId && [...LIVE, "cancelling"].includes(b.status));
    const top = still.reduce((k, b) => (RANK[planKey(b.plan)] > RANK[k] ? planKey(b.plan) : k), "basic");
    await setCompanyPlan(row.company, top);
  }
  return json({ ok: true });
}
