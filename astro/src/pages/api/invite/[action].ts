// Review invitations by email for Business companies: /api/invite/status and /api/invite/send (the owner's
// own access token), and /api/invite/optout (the link in every invitation). Rules in src/lib/business.ts:
// up to INVITES_A_MONTH emails a month per company, nobody twice within 90 days, never anyone who opted out.
import type { APIRoute } from "astro";
import { json, memberFrom } from "../../../lib/pay";
import {
  businessCompany, emailReady, inviteLog, recentHashes, optedOut, addOptOut, saveLog, optSig, sha256, sendBatch,
  INVITES_A_MONTH, EMAIL_RE, ORIGIN, monthKey,
} from "../../../lib/business";
import { slug } from "../../../lib/page";

export const POST: APIRoute = async ({ params, request }) => {
  try {
    const me = await memberFrom(request);
    if (!me) return json({ error: "Please log in again." }, 401);
    const body = await request.json().catch(() => ({}));
    const company = await businessCompany(me.id, String(body.company || ""));
    if (!company) return json({ error: "Review invitations come with the Business plan, for the company's verified owners." }, 403);
    const log = await inviteLog(company._id);

    if (params.action === "status") return json({ email: emailReady(), month: monthKey(), sent: log.sent || 0, limit: INVITES_A_MONTH });

    if (params.action === "send") {
      if (!emailReady()) return json({ error: "Email invitations aren’t switched on yet. Use your WhatsApp and review links for now." }, 503);
      const kind = body.kind === "employee" ? "employee" : "customer";
      const raw: string[] = Array.isArray(body.emails) ? body.emails.map((e: unknown) => String(e || "").trim().toLowerCase()) : [];
      const valid = [...new Set(raw.filter(e => EMAIL_RE.test(e) && e.length <= 254))];
      const invalid = raw.filter(e => e && !EMAIL_RE.test(e)).length;
      if (!valid.length) return json({ error: "No valid email addresses found in your list." }, 400);
      const left = Math.max(0, INVITES_A_MONTH - (log.sent || 0));
      const [recent, out] = await Promise.all([recentHashes(company._id), optedOut()]);
      const fresh: { email: string; hash: string }[] = [];
      let skippedRecent = 0, skippedOptOut = 0;
      for (const e of valid) {
        const h = await sha256(e);
        if (out.has(h)) { skippedOptOut++; continue; }
        if (recent.has(h)) { skippedRecent++; continue; }
        fresh.push({ email: e, hash: h });
      }
      if (fresh.length > left) return json({ error: `This list has ${fresh.length} new addresses, and you have ${left} invitations left this month. Invitations must go to your whole list, so send it next month, or split it by month and send each part in full.` }, 409);
      if (!fresh.length) return json({ ok: true, sent: 0, skippedRecent, skippedOptOut, invalid, left });
      const page = `${ORIGIN}/#invite-${kind === "employee" ? "team-" : ""}co-${company.slug || slug(company.title || company._id)}`;
      const to = await Promise.all(fresh.map(async f => ({ email: f.email, optout: `${ORIGIN}/api/invite/optout?h=${f.hash}&s=${await optSig(f.hash)}` })));
      await sendBatch(company, kind, page, to);
      const exists = (log.sent || 0) > 0 || (log.hashes || []).length > 0;
      await saveLog({ ...log, sent: (log.sent || 0) + fresh.length, hashes: [...(log.hashes || []), ...fresh.map(f => f.hash)] }, exists);
      return json({ ok: true, sent: fresh.length, skippedRecent, skippedOptOut, invalid, left: left - fresh.length });
    }
    return json({ error: "Unknown action" }, 404);
  } catch (e: any) {
    return json({ error: "Sending didn’t work this time. Please try again in a few minutes." }, 500);
  }
};

/* The "never send me review invitations" link. */
export const GET: APIRoute = async ({ params, url }) => {
  if (params.action !== "optout") return json({ error: "Unknown action" }, 404);
  const h = String(url.searchParams.get("h") || ""), s = String(url.searchParams.get("s") || "");
  const page = (title: string, text: string, status = 200) => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title} · Know The Company</title></head><body style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:60px auto;padding:0 20px;color:#0F172A"><h1 style="font-size:24px">${title}</h1><p style="font-size:16px;line-height:1.5">${text}</p><p><a href="${ORIGIN}">Know The Company</a></p></body></html>`, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  if (!/^[a-f0-9]{64}$/.test(h) || s !== (await optSig(h))) return page("That link didn’t work", "The link may be incomplete. Copy the whole link from the email and try again.", 400);
  try { await addOptOut(h); } catch { return page("Please try again", "We couldn’t save that just now. Try the link again in a few minutes.", 503); }
  return page("You won’t get review invitations again", "No company can send you a review invitation through Know The Company from now on. You can still write reviews whenever you like.");
};
