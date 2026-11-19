// Basic needs autopay once its free period ends. Run by the daily job (/api/pay/reminders) after the
// reminder emails: a verified company with no running autopay and no paid time left, whose free period is
// over, gets planLapsed = true. While lapsed, the site hides its Verified badge and its replies, and its
// dashboard shows only "Plan and payments". Its page and reviews stay public. Setting up autopay clears the
// flag at once (setCompanyPlan in pay.ts); this run also clears it if paid time or autopay appears.
//
// Free period, counted from the company's first claim that wasn't rejected:
//   claimed before 19 November 2026 (promised "first year free"): 12 months
//   claimed from then until the launch offer ends (1 April 2027):  BASIC_FREE_MONTHS (6)
//   claimed after the launch offer:                                none
// A verified company with no claim on record (set up by the team by hand) is never lapsed here.
import { auth } from "@wix/essentials";
import { items } from "@wix/data";
import { adminTouched } from "./data";
import { addMonths, BASIC_FREE_MONTHS, LIVE } from "./pay";

export const SIX_MONTH_START = Date.parse("2026-11-19T00:00:00+05:30");
export const LAUNCH_ENDS = Date.parse("2027-04-01T00:00:00+05:30");

const query = auth.elevate(items.query);
const update = auth.elevate(items.update);

/* When the company's free period ends, from the date of its first claim. */
export function freeEndsAt(claimedAt: number): number {
  if (claimedAt < SIX_MONTH_START) return addMonths(new Date(claimedAt), 12).getTime();
  if (claimedAt < LAUNCH_ENDS) return addMonths(new Date(claimedAt), BASIC_FREE_MONTHS).getTime();
  return claimedAt;
}

/* Whether a company should be lapsed now, given its billing rows and first claim date (0 = none). */
export function shouldLapse(company: any, billing: any[], claimedAt: number, now = Date.now()): boolean {
  if (!claimedAt) return false;
  const paidUntil = company.planEndsAt ? new Date(company.planEndsAt).getTime() : 0;
  if (paidUntil > now) return false;
  const running = billing.some(b => LIVE.includes(b.status) || (b.status === "cancelling" && b.currentEnd && new Date(b.currentEnd).getTime() > now));
  if (running) return false;
  return now >= freeEndsAt(claimedAt);
}

export async function runLapses(now = Date.now()) {
  const res = { companies: 0, lapsed: 0, restored: 0 };
  const cos = (await query("Companies").eq("claimStatus", "verified").limit(1000).find()).items.filter(adminTouched);
  for (const c of cos) {
    res.companies++;
    const claims = (await query("Claims").eq("company", c._id).limit(50).find()).items.filter((cl: any) => cl.status !== "rejected");
    const claimedAt = claims.reduce((t: number, cl: any) => Math.min(t, new Date(cl._createdDate).getTime() || Infinity), Infinity);
    const billing = (await query("Billing").eq("company", c._id).limit(50).find()).items;
    const lapse = shouldLapse(c, billing, Number.isFinite(claimedAt) ? claimedAt : 0, now);
    if (lapse === !!c.planLapsed) continue;
    await update("Companies", { ...c, planLapsed: lapse });
    lapse ? res.lapsed++ : res.restored++;
  }
  return res;
}
