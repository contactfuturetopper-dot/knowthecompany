// Business plan tools on the server: who may use them, review invitation emails (sent through Brevo),
// and team logins. The browser side is the "Business tools" tab of the dashboard (app.js).
//
// Two team-only collections hold what these need:
//   InviteLog    one item per company per month: how many invitations went out, and a SHA-256 hash of
//                each address (never the address itself), so nobody is invited twice within 90 days.
//                The item with id "optout" holds hashes of addresses that asked never to be invited.
//   TeamInvites  one item per team invitation link: the hash of its token, who made it, when it expires,
//                and who used it.
import { auth } from "@wix/essentials";
import { items } from "@wix/data";
import { BREVO_API_KEY, INVITE_SENDER_EMAIL } from "astro:env/server";
import { adminTouched } from "./data";

export const INVITES_A_MONTH = 1000;
export const TEAM_MAX = 5;
export const ORIGIN = "https://www.knowthecompany.com";
const DAY = 86_400_000;

export const get = auth.elevate(items.get);
export const update = auth.elevate(items.update);
export const insert = auth.elevate(items.insert);
export const query = auth.elevate(items.query);

export const emailReady = () => !!(BREVO_API_KEY && INVITE_SENDER_EMAIL);

/* The company, if this member is one of its verified owners and it is on the Business plan. */
export async function businessCompany(memberId: string, companyId: string): Promise<any | null> {
  if (!companyId) return null;
  const c: any = await get("Companies", companyId).catch(() => null);
  if (!c || !adminTouched(c) || c.claimStatus !== "verified" || !(c.ownerMemberIds || []).includes(memberId)) return null;
  if (c.plan !== "business") return null;
  if (c.planEndsAt && new Date(c.planEndsAt).getTime() < Date.now() - DAY) return null;
  return c;
}

export async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}
export const monthKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 7);
const prevMonths = (n: number) => { const out: string[] = []; const d = new Date(); d.setUTCDate(1); for (let i = 0; i < n; i++) { out.push(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() - 1); } return out; };
export const logId = (company: string, month: string) => `${company}|${month}`;

export async function inviteLog(company: string, month = monthKey()): Promise<any> {
  return (await get("InviteLog", logId(company, month)).catch(() => null)) || { _id: logId(company, month), company, month, sent: 0, hashes: [] };
}
/* Hashes of everyone this company invited in the last 90 days (this month and the three before). */
export async function recentHashes(company: string): Promise<Set<string>> {
  const out = new Set<string>();
  for (const m of prevMonths(4)) { const l: any = await get("InviteLog", logId(company, m)).catch(() => null); (l?.hashes || []).forEach((h: string) => out.add(h)); }
  return out;
}
export async function optedOut(): Promise<Set<string>> {
  const l: any = await get("InviteLog", "optout").catch(() => null);
  return new Set(l?.hashes || []);
}
export async function addOptOut(hash: string) {
  const l: any = (await get("InviteLog", "optout").catch(() => null));
  if (!l) return insert("InviteLog", { _id: "optout", company: "", month: "", sent: 0, hashes: [hash] });
  if (!(l.hashes || []).includes(hash)) return update("InviteLog", { ...l, hashes: [...(l.hashes || []), hash] });
}
export const saveLog = (l: any, exists: boolean) => (exists ? update("InviteLog", l) : insert("InviteLog", l));

/* Opt-out links are signed, so nobody can opt someone else out by guessing. */
export async function optSig(hash: string): Promise<string> { return (await sha256(`${BREVO_API_KEY || ""}|optout|${hash}`)).slice(0, 24); }

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export function inviteEmail(company: any, kind: "customer" | "employee", link: string, optout: string) {
  const name = company.title || company._id;
  const who = kind === "employee" ? "worked there" : "bought from or used";
  const subject = kind === "employee" ? `How was working at ${name}? Share an honest review` : `How was your experience with ${name}? Share an honest review`;
  const html = `<!doctype html><html><body style="margin:0;background:#F3F5F8;font-family:Arial,Helvetica,sans-serif;color:#0F172A">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<div style="background:#fff;border-radius:16px;padding:28px">
<p style="font-size:14px;color:#5B6576;margin:0 0 18px">Know The Company</p>
<h1 style="font-size:22px;margin:0 0 14px">${esc(name)} would like your honest review</h1>
<p style="font-size:16px;line-height:1.5;margin:0 0 14px">${esc(name)} asked us to invite everyone who has ${who} ${kind === "employee" ? "" : "them "}to write a review on Know The Company. Good or bad, your honest experience helps other people decide.</p>
<p style="font-size:16px;line-height:1.5;margin:0 0 22px">${esc(name)} can reply to reviews, but it can't remove or change them, and it never sees who wrote an anonymous ${kind === "employee" ? "employee " : ""}review.</p>
<p style="margin:0 0 24px"><a href="${esc(link)}" style="display:inline-block;background:#1B2738;color:#fff;text-decoration:none;font-weight:bold;padding:13px 22px;border-radius:10px">Write your review</a></p>
<p style="font-size:13px;line-height:1.5;color:#5B6576;margin:0">You got this email because ${esc(name)} told us you ${kind === "employee" ? "worked with them" : "were their customer"}. We won't email you about ${esc(name)} again for at least 90 days. <a href="${esc(optout)}" style="color:#5B6576">Never send me review invitations</a>.</p>
</div>
<p style="font-size:12px;color:#5B6576;text-align:center;margin:16px 0 0">Know The Company · Agra, Uttar Pradesh, India · <a href="${ORIGIN}" style="color:#5B6576">knowthecompany.com</a></p>
</div></body></html>`;
  return { subject, html };
}

/* One call to Brevo with one message version per address (Brevo allows up to 1,000 per call). */
export async function sendBatch(company: any, kind: "customer" | "employee", link: string, to: { email: string; optout: string }[]) {
  const first = inviteEmail(company, kind, link, "{{params.optout}}");
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", "api-key": BREVO_API_KEY || "" },
    body: JSON.stringify({
      sender: { email: INVITE_SENDER_EMAIL, name: "Know The Company" },
      subject: first.subject,
      htmlContent: first.html,
      tags: ["review-invite", kind],
      messageVersions: to.map(t => ({ to: [{ email: t.email }], params: { optout: t.optout } })),
    }),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  return res.json().catch(() => ({}));
}

export const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;
export const TEAM_DAYS = 7;
export const teamExpiry = () => new Date(Date.now() + TEAM_DAYS * DAY);
