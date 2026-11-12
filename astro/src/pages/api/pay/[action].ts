// Listing payments: /api/pay/subscribe, /verify, /cancel, /status (signed-in company owners) and /webhook
// (Razorpay). The rules are in src/lib/pay.ts.
import type { APIRoute } from "astro";
import {
  json, payReady, keyId, memberFrom, ownedCompany, billingFor, billingBySub, saveBilling, setCompanyPlan, rzp,
  planIdFor, firstChargeAt, subscriptionTotal, checkoutSignatureOk, webhookSignatureOk, billingView, LIVE, PRICES, PLAN_NAMES,
} from "../../../lib/pay";

const OFF = { error: "Payments aren’t switched on yet. Please try again soon, or contact us." };
const sec = (t: number | null | undefined) => (t ? new Date(t * 1000) : null);

export const POST: APIRoute = async ({ params, request }) => {
  const action = params.action;
  try {
    if (action === "webhook") return await webhook(request);
    if (!payReady()) return json(OFF, 503);
    const me = await memberFrom(request);
    if (!me) return json({ error: "Please log in again." }, 401);
    const body = await request.json().catch(() => ({}));
    const company = await ownedCompany(me.id, String(body.company || ""));
    if (!company) return json({ error: "Only someone who has claimed this company can manage its plan." }, 403);

    if (action === "status") {
      const rows = await billingFor(company._id);
      return json({ plan: company.plan === "plus" ? "plus" : "basic", planEndsAt: company.planEndsAt || "", billing: rows.slice(0, 5).map(billingView) });
    }

    if (action === "subscribe") {
      const plan = body.plan === "plus" ? "plus" : "basic";
      const currency = body.currency === "USD" ? "USD" : "INR";
      const live = (await billingFor(company._id)).find(b => LIVE.includes(b.status) && b.plan === plan);
      if (live) return json({ error: `Autopay for ${PLAN_NAMES[plan]} is already set up for this company.` }, 409);
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
      /* Plus starts now (its first days are free); Basic stays Basic and now renews by autopay. */
      await setCompanyPlan(company._id, row.plan === "plus" ? "plus" : (company.plan === "plus" ? "plus" : "basic"), until);
      /* Moving to Plus ends a Basic autopay that hasn't charged yet, so nobody pays twice. */
      if (row.plan === "plus") for (const b of await billingFor(company._id)) {
        if (b.subscriptionId !== row.subscriptionId && b.plan === "basic" && LIVE.includes(b.status)) {
          await rzp(`/subscriptions/${b.subscriptionId}/cancel`, "POST", { cancel_at_cycle_end: 0 }).catch(() => null);
          await saveBilling({ ...b, status: "cancelled", lastEvent: "replaced by plus" });
        }
      }
      return json({ ok: true, plan: row.plan, until: until ? until.toISOString() : "" });
    }

    if (action === "cancel") {
      const live = (await billingFor(company._id)).filter(b => LIVE.includes(b.status));
      if (!live.length) return json({ error: "There’s no autopay to cancel." }, 404);
      for (const b of live) {
        /* An autopay that hasn't charged yet ends now. One that has charged runs to the end of the paid year. */
        const started = b.status === "active";
        await rzp(`/subscriptions/${b.subscriptionId}/cancel`, "POST", { cancel_at_cycle_end: started ? 1 : 0 });
        await saveBilling({ ...b, status: started ? "cancelling" : "cancelled", lastEvent: "cancelled by owner" });
        if (!started && b.plan === "plus") await setCompanyPlan(company._id, "basic");
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
  if (event === "subscription.charged" || event === "subscription.activated") {
    await setCompanyPlan(row.company, row.plan, until);
  } else if (["subscription.cancelled", "subscription.completed", "subscription.halted", "subscription.expired"].includes(event) && row.plan === "plus") {
    /* Plus ends: the company keeps its page on Basic. */
    await setCompanyPlan(row.company, "basic");
  }
  return json({ ok: true });
}
