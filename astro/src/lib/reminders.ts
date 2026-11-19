// Emails before a free period ends and autopay makes its first charge (Basic's 6 free months, Plus's 30 days).
//
// A GitHub Actions job (.github/workflows/reminders.yml) calls POST /api/pay/reminders once a day with the
// REMINDER_SECRET in the X-Reminder-Secret header (Wix hosting answers any "Authorization: Bearer" request
// with its 404 page, so the secret has its own header). This file finds every autopay that is set up but hasn't charged yet (Billing status
// "authenticated") and emails its owner 15, 7 and 2 days before the first charge. Wix sends the emails
// (Email Transmissions API). Each reminder is sent once: the days already reminded are kept on the Billing
// row in remindersSent. Razorpay separately sends the bank's 24-hour pre-debit notice.
import { auth } from "@wix/essentials";
import { items } from "@wix/data";
import { emailTransmissions } from "@wix/email-transmissions";
import { REMINDER_SECRET } from "astro:env/server";
import { PRICES, PLAN_NAMES, saveBilling } from "./pay";

export const REMIND_DAYS = [15, 7, 2];
const DAY = 86_400_000;
const ORIGIN = "https://www.knowthecompany.com";

const query = auth.elevate(items.query);
const get = auth.elevate(items.get);
const send = auth.elevate(emailTransmissions.sendEmailTransmission);

export const remindersReady = () => !!REMINDER_SECRET;

/* The job's secret, compared without leaking timing. */
export function reminderAuthOk(header: string): boolean {
  const want = REMINDER_SECRET || "";
  if (!want || header.length !== want.length) return false;
  let d = 0;
  for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ header.charCodeAt(i);
  return d === 0;
}

/* Which reminder is due for a first charge at `startAt`: the nearest of 15, 7 and 2 days that has been
   reached and not sent yet. One email a day at most, so a late run doesn't send three at once. */
export function dueReminder(startAt: number, sent: number[], now = Date.now()): number | null {
  const left = Math.ceil((startAt - now) / DAY);
  if (left < 1 || left > REMIND_DAYS[0]) return null;
  const due = REMIND_DAYS.filter(d => left <= d && !sent.includes(d));
  return due.length ? Math.min(...due) : null;
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
const money = (plan: string, currency: string) => {
  const v = (PRICES[plan]?.[currency] ?? 0) / 100;
  return currency === "USD" ? `$${v.toLocaleString("en-US")}` : `₹${v.toLocaleString("en-IN")}`;
};
const dateText = (t: number) => new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

/* The subject counts the days actually left (a late run can send the 7-day reminder with 3 days to go). */
export function reminderEmail(row: any, company: any, now = Date.now()) {
  const name = company?.title || "your company";
  const plan = PLAN_NAMES[row.plan] || "Basic listing";
  const amount = money(row.plan, row.currency || "INR");
  const at = new Date(row.startAt).getTime();
  const when = dateText(at);
  const left = Math.max(1, Math.round((at - now) / DAY));
  const link = `${ORIGIN}/dashboard`;
  const subject = `${left === 1 ? "Tomorrow" : `In ${left} days`}: ${amount} autopay for ${name}'s ${plan}`;
  const html = `<!doctype html><html><body style="margin:0;background:#F3F5F8;font-family:Arial,Helvetica,sans-serif;color:#0F172A">
<div style="max-width:560px;margin:0 auto;padding:28px 20px"><div style="background:#fff;border-radius:16px;padding:28px">
<p style="font-size:14px;color:#5B6576;margin:0 0 18px">Know The Company</p>
<h1 style="font-size:22px;margin:0 0 14px">Your free period ends on ${esc(when)}</h1>
<p style="font-size:16px;line-height:1.5;margin:0 0 14px">${esc(name)}'s ${esc(plan)} has been free so far. On <b>${esc(when)}</b>, autopay will charge <b>${esc(amount)}</b> for the next year, through the UPI, card or bank mandate you set up with Razorpay. It then renews once a year.</p>
<p style="font-size:16px;line-height:1.5;margin:0 0 22px">Want to keep your listing? You don't need to do anything. Don't want to continue? Cancel autopay before ${esc(when)} and nothing is charged.</p>
<p style="margin:0 0 22px"><a href="${link}" style="display:inline-block;background:#0F172A;color:#fff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px">Manage or cancel autopay</a></p>
<p style="font-size:13px;line-height:1.5;color:#5B6576;margin:0">Your bank or UPI app will also notify you a day before the charge. Paying never changes your ratings or reviews. Questions? Reply to this email.</p>
</div></div></body></html>`;
  const text = `${name}'s ${plan} has been free so far. On ${when}, autopay will charge ${amount} for the next year, then once a year. To keep your listing, do nothing. To stop, cancel autopay before ${when}: ${link}`;
  return { subject, html, text };
}

/* One daily run. Returns counts only, never addresses. */
export async function runReminders(now = Date.now()) {
  const res = { checked: 0, sent: 0, skippedNoEmail: 0, failed: 0 };
  const rows = (await query("Billing").eq("status", "authenticated").limit(1000).find()).items;
  for (const row of rows) {
    if (!row.startAt) continue;
    res.checked++;
    const sentDays: number[] = Array.isArray(row.remindersSent) ? row.remindersSent : [];
    const days = dueReminder(new Date(row.startAt).getTime(), sentDays, now);
    if (days === null) continue;
    if (!row.email) { res.skippedNoEmail++; continue; }
    try {
      const company: any = await get("Companies", row.company).catch(() => null);
      const mail = reminderEmail(row, company, now);
      await send(
        { emailSubject: mail.subject, emailHtmlContent: mail.html, emailTextContent: mail.text, senderName: "Know The Company", toRecipients: [{ emailAddress: row.email }], type: "TRANSACTIONAL" as any },
        { idempotencyKey: await keyFor(`${row.subscriptionId}|${days}`) },
      );
      await saveBilling({ ...row, remindersSent: [...sentDays, days], lastEvent: `reminder ${days}d` });
      res.sent++;
    } catch {
      res.failed++;
    }
  }
  return res;
}

/* A stable GUID per subscription and reminder, so a retried run can't send the same email twice. */
async function keyFor(s: string): Promise<string> {
  const h = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
