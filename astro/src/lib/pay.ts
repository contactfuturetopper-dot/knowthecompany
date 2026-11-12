// Listing payments with Razorpay Subscriptions (yearly autopay).
//
// Flow: a verified company owner presses a plan button on their dashboard. The browser calls
// /api/pay/subscribe with the member's own access token. This file checks who they are (Wix members API)
// and that they manage the company, finds or creates the Razorpay plan, creates a subscription and records
// it in the team-only Billing collection. The browser opens Razorpay Checkout for that subscription; when
// the customer approves the autopay, /api/pay/verify checks Razorpay's signature and switches the company's
// plan. Renewals, failures and cancellations arrive at /api/pay/webhook.
//
// Keys come from Wix's server environment (astro.config.mjs), never from the code or the browser.
import { auth } from "@wix/essentials";
import { items } from "@wix/data";
import { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET } from "astro:env/server";
import { adminTouched } from "./data";

export const PRICES: Record<string, Record<string, number>> = {
  // smallest currency unit: paise and cents
  basic: { INR: 49900, USD: 900 },
  plus: { INR: 99900, USD: 1900 },
  business: { INR: 1499900, USD: 17900 },
};
export const PLAN_NAMES: Record<string, string> = { basic: "Basic listing", plus: "Plus listing", business: "Business listing" };
/* Higher plans include everything in the lower ones. */
export const RANK: Record<string, number> = { basic: 0, plus: 1, business: 2 };
export const planKey = (p: unknown) => (p === "business" ? "business" : p === "plus" ? "plus" : "basic");
export const PLUS_TRIAL_DAYS = 30;
/* Launch offer, same dates as app.js: Basic free for the first year, Plus free for its first 30 days. */
export const LAUNCH = Date.now() < Date.parse("2027-04-01T00:00:00+05:30");
const DAY = 86_400_000;
const YEARS = 10; /* yearly charges for up to ten years; customers can cancel any time */

export const payReady = () => !!(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);
export const webhookReady = () => !!RAZORPAY_WEBHOOK_SECRET;
export const keyId = () => RAZORPAY_KEY_ID || "";

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

/* ---- who is asking: the member's own Wix access token, checked with Wix ---- */
export async function memberFrom(request: Request): Promise<{ id: string; email: string; name: string } | null> {
  const token = request.headers.get("Authorization") || "";
  if (!token) return null;
  const res = await fetch("https://www.wixapis.com/members/v1/members/my?fieldsets=FULL", { headers: { Authorization: token } });
  if (!res.ok) return null;
  const m = (await res.json()).member || {};
  if (!m.id) return null;
  const c = m.contact || {}, p = m.profile || {};
  return { id: m.id, email: m.loginEmail || "", name: [c.firstName, c.lastName].filter(Boolean).join(" ") || p.nickname || "" };
}

/* ---- data, read and written with the project's elevated permission ---- */
const get = auth.elevate(items.get);
const update = auth.elevate(items.update);
const insert = auth.elevate(items.insert);
const query = auth.elevate(items.query);

/* The company, if this member may manage its plan: a verified owner, or someone whose claim on it is
   still being checked (they can choose and pay for a plan straight away; the Verified badge follows the
   check). Not when someone else is already the company's verified owner. */
export async function ownedCompany(memberId: string, companyId: string): Promise<any | null> {
  if (!companyId) return null;
  const c: any = await get("Companies", companyId).catch(() => null);
  if (!c) return null;
  const owners: string[] = adminTouched(c) && c.claimStatus === "verified" ? (c.ownerMemberIds || []) : [];
  if (owners.includes(memberId)) return c;
  if (owners.length) return null;
  const claims = (await query("Claims").eq("company", companyId).limit(50).find()).items;
  return claims.some((cl: any) => cl._owner === memberId && cl.status !== "rejected") ? c : null;
}

export async function billingFor(companyId: string): Promise<any[]> {
  const res = await query("Billing").eq("company", companyId).limit(50).find();
  return res.items.sort((a: any, b: any) => +new Date(b._createdDate) - +new Date(a._createdDate));
}
export async function billingBySub(subscriptionId: string): Promise<any | null> {
  const res = await query("Billing").eq("subscriptionId", subscriptionId).limit(1).find();
  return res.items[0] || null;
}
export const saveBilling = (row: any) => (row._id ? update("Billing", row) : insert("Billing", row));

/* Switch the company's plan. Only this server and the team change it. */
export async function setCompanyPlan(companyId: string, plan: string, until?: Date | null) {
  const c: any = await get("Companies", companyId);
  if (!c) return;
  /* Writing here marks the company as touched by the team, so anything a member set on a company they
     added themselves (verified status, owners, badges) is cleared first. Only the team verifies. */
  const clean = adminTouched(c) ? {} : { claimStatus: "none", verifiedVia: "", ownerMemberIds: [], employerPage: null, warning: null, logo: "" };
  await update("Companies", { ...c, ...clean, plan, ...(until ? { planEndsAt: until } : {}) });
}

/* ---- Razorpay API ---- */
export async function rzp(path: string, method = "GET", body?: unknown): Promise<any> {
  const res = await fetch("https://api.razorpay.com/v1" + path, {
    method,
    headers: { Authorization: "Basic " + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((data.error && data.error.description) || `Razorpay ${res.status}`), { status: res.status, code: data.error && data.error.code });
  return data;
}

/* The Razorpay plan for a listing plan and currency, made once and then reused. */
const planCache = new Map<string, string>();
export async function planIdFor(plan: string, currency: string): Promise<string> {
  const amount = PRICES[plan][currency];
  const tag = `ktc-${plan}-${currency}-${amount}`;
  if (planCache.has(tag)) return planCache.get(tag)!;
  for (let skip = 0; skip < 1000; skip += 100) {
    const page = await rzp(`/plans?count=100&skip=${skip}`);
    const hit = (page.items || []).find((p: any) => p.notes && p.notes.ktc === tag);
    if (hit) { planCache.set(tag, hit.id); return hit.id; }
    if ((page.items || []).length < 100) break;
  }
  const made = await rzp("/plans", "POST", {
    period: "yearly", interval: 1,
    item: { name: `Know The Company ${PLAN_NAMES[plan]}`, amount, currency, description: `${PLAN_NAMES[plan]}, renews every year` },
    notes: { ktc: tag },
  });
  planCache.set(tag, made.id);
  return made.id;
}

/* When the first charge falls. If the company's current plan already runs to a date (planEndsAt), autopay
   starts then. Otherwise Plus starts with its free days during the launch offer, and Basic is free for a year. */
export function firstChargeAt(plan: string, company: any): Date | null {
  const now = Date.now();
  const ends = company.planEndsAt ? new Date(company.planEndsAt).getTime() : 0;
  /* A plan that is already paid or free until a date keeps that date: autopay starts after it. */
  const cur = planKey(company.plan);
  /* Autopay for the plan the company already has (or a lower one) starts when the current period ends. */
  if (ends > now + DAY && RANK[plan] <= RANK[cur]) return new Date(ends);
  /* Business has no free period: its first year starts, and is charged, today. */
  if (plan === "business") return null;
  if (plan === "plus") return LAUNCH ? new Date(now + PLUS_TRIAL_DAYS * DAY) : null;
  return LAUNCH ? new Date(now + 365 * DAY) : null;
}
export const subscriptionTotal = YEARS;

/* ---- signatures ---- */
async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}
const sameText = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
/* Checkout's signature: payment id, a pipe, then the subscription id this server created. */
export async function checkoutSignatureOk(paymentId: string, subscriptionId: string, signature: string) {
  return !!RAZORPAY_KEY_SECRET && sameText(await hmacHex(RAZORPAY_KEY_SECRET, `${paymentId}|${subscriptionId}`), String(signature || ""));
}
export async function webhookSignatureOk(rawBody: string, signature: string) {
  return !!RAZORPAY_WEBHOOK_SECRET && sameText(await hmacHex(RAZORPAY_WEBHOOK_SECRET, rawBody), String(signature || ""));
}

/* What a billing row looks like to its owner. */
export const billingView = (b: any) => ({
  plan: b.plan, currency: b.currency, status: b.status,
  startAt: b.startAt ? new Date(b.startAt).toISOString() : "", currentEnd: b.currentEnd ? new Date(b.currentEnd).toISOString() : "",
});
export const LIVE = ["authenticated", "active", "pending"];
