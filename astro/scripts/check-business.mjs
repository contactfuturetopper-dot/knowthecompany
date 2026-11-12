// Checks the paid-plan server code end to end against fakes: Wix data in memory, Razorpay and Brevo
// answered locally, members identified by their token. Covers upgrading Plus to Business, renewals and
// cancellations from Razorpay's webhook, review invitation emails (quota, 90-day repeat rule, opt-out) and
// team logins. Run: node scripts/check-business.mjs
import { build } from "esbuild";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ktc-biz-"));
const KEY = "rzp_secret_test", WH = "wh_secret_test";
const stubs = {
  "astro:env/server": `export const RAZORPAY_KEY_ID = "rzp_test_key", RAZORPAY_KEY_SECRET = "${KEY}", RAZORPAY_WEBHOOK_SECRET = "${WH}", BREVO_API_KEY = "brevo_test", INVITE_SENDER_EMAIL = "reviews@knowthecompany.com";`,
  "@wix/essentials": `export const auth = { elevate: f => f };`,
  "@wix/data": `export const items = globalThis.__items;`,
};
const plugin = { name: "stubs", setup(b) {
  b.onResolve({ filter: /^(astro:env\/server|@wix\/essentials|@wix\/data)$/ }, a => ({ path: a.path, namespace: "stub" }));
  b.onLoad({ filter: /.*/, namespace: "stub" }, a => ({ contents: stubs[a.path], loader: "js" }));
  b.onResolve({ filter: /\?raw$/ }, a => ({ path: path.resolve(a.resolveDir, a.path.replace(/\?raw$/, "")), namespace: "raw" }));
  b.onLoad({ filter: /.*/, namespace: "raw" }, a => ({ contents: fs.readFileSync(a.path, "utf8"), loader: "text" }));
} };
const bundle = async (rel, name) => {
  const out = path.join(tmp, name + ".mjs");
  await build({ entryPoints: [path.join(root, rel)], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "error", plugins: [plugin] });
  return out;
};

/* ---- Wix data, in memory ---- */
const db = {};
const col = c => (db[c] = db[c] || new Map());
let seq = 0;
const now = () => new Date().toISOString();
globalThis.__items = {
  get: async (c, id) => { const v = col(c).get(id); return v ? structuredClone(v) : null; },
  insert: async (c, it) => { const id = it._id || "id" + (++seq); const v = { ...structuredClone(it), _id: id, _createdDate: now(), _updatedDate: now() }; if (col(c).has(id)) throw new Error("exists"); col(c).set(id, v); return structuredClone(v); },
  update: async (c, it) => { const prev = col(c).get(it._id); if (!prev) throw new Error("missing " + it._id); const v = { ...structuredClone(it), _createdDate: prev._createdDate, _updatedDate: new Date(Date.now() + 1000).toISOString() }; col(c).set(it._id, v); return structuredClone(v); },
  query: c => { const f = []; let n = 50; const q = { eq: (k, v) => (f.push([k, v]), q), limit: x => ((n = x), q), find: async () => ({ items: [...col(c).values()].filter(it => f.every(([k, v]) => it[k] === v)).slice(0, n).map(x => structuredClone(x)) }) }; return q; },
};

/* ---- Razorpay, Brevo and Wix members, answered locally ---- */
const members = { "tok-m1": { id: "m1", loginEmail: "owner@acme.in", contact: { firstName: "Asha" } }, "tok-m2": { id: "m2", loginEmail: "dev@acme.in", contact: { firstName: "Dev" } }, "tok-m3": { id: "m3", loginEmail: "rev@x.in", contact: { firstName: "Rev" } } };
const rzpSubs = {}, rzpCalls = [], brevo = [];
let subN = 0;
globalThis.fetch = async (url, o = {}) => {
  const u = String(url), body = o.body ? JSON.parse(o.body) : null;
  const ok = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "Content-Type": "application/json" } });
  if (u.includes("/members/v1/members/my")) { const m = members[o.headers.Authorization]; return m ? ok({ member: m }) : ok({}, 401); }
  if (u.startsWith("https://api.razorpay.com/v1")) {
    const p = u.slice("https://api.razorpay.com/v1".length); rzpCalls.push([o.method || "GET", p, body]);
    if (p.startsWith("/plans") && (o.method || "GET") === "GET") return ok({ items: [] });
    if (p === "/plans") return ok({ id: "plan_" + body.notes.ktc });
    if (p === "/subscriptions") { const id = "sub_" + (++subN); rzpSubs[id] = { id, status: "created", plan_id: body.plan_id, start_at: body.start_at || null }; return ok(rzpSubs[id]); }
    let m = p.match(/^\/subscriptions\/(sub_\d+)\/cancel$/); if (m) { rzpSubs[m[1]].status = "cancelled"; return ok(rzpSubs[m[1]]); }
    m = p.match(/^\/subscriptions\/(sub_\d+)$/); if (m) return ok({ ...rzpSubs[m[1]], status: "active", current_end: Math.floor(Date.now() / 1000) + 365 * 86400 });
  }
  if (u === "https://api.brevo.com/v3/smtp/email") { brevo.push(body); return ok({ messageIds: body.messageVersions.map((_, i) => "m" + i) }); }
  throw new Error("unexpected fetch " + u);
};

const pay = await import(await bundle("src/pages/api/pay/[action].ts", "pay"));
const invite = await import(await bundle("src/pages/api/invite/[action].ts", "invite"));
const team = await import(await bundle("src/pages/api/team/[action].ts", "team"));
const call = async (mod, action, tok, body, method = "POST") => {
  const req = new Request("https://www.knowthecompany.com/api/x/" + action, { method, headers: { "Content-Type": "application/json", ...(tok ? { Authorization: tok } : {}) }, body: method === "POST" ? JSON.stringify(body || {}) : undefined });
  const res = await mod[method]({ params: { action }, request: req, url: new URL(req.url) });
  return { status: res.status, data: await res.json().catch(() => null), res };
};
const hmac = (k, m) => crypto.createHmac("sha256", k).update(m).digest("hex");
const webhook = async (event, sub) => {
  const raw = JSON.stringify({ event, payload: { subscription: { entity: { id: sub, status: ({ charged: "active", activated: "active", cancelled: "cancelled" })[event.split(".")[1]] || event.split(".")[1], current_end: Math.floor(Date.now() / 1000) + 365 * 86400 } } } });
  const req = new Request("https://www.knowthecompany.com/api/pay/webhook", { method: "POST", headers: { "X-Razorpay-Signature": hmac(WH, raw) }, body: raw });
  return (await pay.POST({ params: { action: "webhook" }, request: req })).status;
};
const ADMIN = "c0f544a7-207e-490b-b7d9-830ef39f49c7";
const company = () => col("Companies").get("acme.in");
col("Companies").set("acme.in", { _id: "acme.in", title: "Acme <Tools>", slug: "acme-tools", website: "acme.in", claimStatus: "verified", ownerMemberIds: ["m1"], plan: "plus", _owner: ADMIN, _createdDate: "2026-11-01T00:00:00Z", _updatedDate: "2026-11-02T00:00:00Z" });
col("Companies").set("other.in", { _id: "other.in", title: "Other", claimStatus: "verified", ownerMemberIds: ["m3"], plan: "plus", _owner: ADMIN, _createdDate: "2026-11-01T00:00:00Z", _updatedDate: "2026-11-02T00:00:00Z" });

/* ---- 1. Plus company sets up Plus autopay, then upgrades to Business ---- */
let r = await call(pay, "subscribe", "tok-m1", { company: "acme.in", plan: "plus" });
assert.equal(r.status, 200, "plus subscribe"); const plusSub = r.data.subscriptionId;
r = await call(pay, "verify", "tok-m1", { company: "acme.in", subscriptionId: plusSub, paymentId: "pay_1", signature: hmac(KEY, `pay_1|${plusSub}`) });
assert.equal(r.status, 200, "plus verify");
r = await call(pay, "subscribe", "tok-m1", { company: "acme.in", plan: "business" });
assert.equal(r.status, 200, "business subscribe"); assert.equal(r.data.amount, 1499900, "business price in paise"); assert.equal(r.data.startAt, "", "business is charged today, no free period");
const bizSub = r.data.subscriptionId;
assert.ok(rzpCalls.some(c => c[1] === "/plans" && c[2].item.amount === 1499900 && c[2].period === "yearly"), "a yearly ₹14,999 Razorpay plan is made");
r = await call(pay, "verify", "tok-m1", { company: "acme.in", subscriptionId: bizSub, paymentId: "pay_2", signature: "bad" });
assert.equal(r.status, 400, "a bad signature never upgrades"); assert.equal(company().plan, "plus");
r = await call(pay, "verify", "tok-m1", { company: "acme.in", subscriptionId: bizSub, paymentId: "pay_2", signature: hmac(KEY, `pay_2|${bizSub}`) });
assert.equal(r.status, 200, "business verify"); assert.equal(company().plan, "business", "company moves to Business");
const plusRow = [...col("Billing").values()].find(b => b.subscriptionId === plusSub);
assert.ok(["cancelling", "cancelled"].includes(plusRow.status), "the Plus autopay stops, so nobody pays twice");
assert.ok(rzpCalls.some(c => c[1] === `/subscriptions/${plusSub}/cancel`), "Plus cancelled at Razorpay");
/* Razorpay then reports the old Plus subscription as cancelled: the company must stay on Business. */
assert.equal(await webhook("subscription.cancelled", plusSub), 200); assert.equal(company().plan, "business", "a replaced plan ending doesn't downgrade");
assert.equal(await webhook("subscription.charged", bizSub), 200); assert.equal(company().plan, "business", "renewal keeps Business");
r = await call(pay, "status", "tok-m1", { company: "acme.in" });
assert.equal(r.data.plan, "business", "status reports Business");
r = await call(pay, "subscribe", "tok-m1", { company: "acme.in", plan: "business" });
assert.equal(r.status, 409, "no second Business autopay");
r = await call(pay, "status", "tok-m3", { company: "acme.in" });
assert.equal(r.status, 403, "someone else can't see or change the plan");

/* ---- 2. Review invitations ---- */
r = await call(invite, "status", "tok-m1", { company: "acme.in" });
assert.deepEqual([r.status, r.data.email, r.data.sent, r.data.limit], [200, true, 0, 1000], "invite status");
r = await call(invite, "send", "tok-m1", { company: "acme.in", kind: "customer", emails: ["Asha@Example.com", "asha@example.com", "ravi@example.com", "not-an-email"] });
assert.equal(r.status, 200, "send"); assert.equal(r.data.sent, 2, "duplicates merged, bad address left out"); assert.equal(r.data.invalid, 1);
const mail = brevo.at(-1);
assert.equal(mail.messageVersions.length, 2, "one message per person"); assert.ok(!mail.to, "no shared To line");
assert.ok(mail.subject.includes("Acme <Tools>") && mail.htmlContent.includes("Acme &lt;Tools&gt;") && !mail.htmlContent.includes("Acme <Tools>"), "company name escaped in the email");
assert.ok(mail.htmlContent.includes("https://www.knowthecompany.com/#invite-co-acme-tools") && mail.htmlContent.includes("{{params.optout}}") && /Good or bad/.test(mail.htmlContent), "review link, opt-out link and honest-review wording");
const log = col("InviteLog").get("acme.in|" + new Date().toISOString().slice(0, 7));
assert.equal(log.sent, 2); assert.ok(log.hashes.every(h => /^[a-f0-9]{64}$/.test(h)) && !JSON.stringify(log).includes("@"), "only hashes are stored, never addresses");
r = await call(invite, "send", "tok-m1", { company: "acme.in", kind: "customer", emails: ["ravi@example.com", "meera@example.com"] });
assert.deepEqual([r.data.sent, r.data.skippedRecent], [1, 1], "nobody is invited twice within 90 days");
/* opt-out */
const optUrl = new URL(mail.messageVersions.find(v => v.to[0].email === "asha@example.com").params.optout);
const optRes = await invite.GET({ params: { action: "optout" }, url: optUrl });
assert.equal(optRes.status, 200, "opt-out link works"); assert.ok((await optRes.text()).includes("won’t get review invitations"));
const forged = await invite.GET({ params: { action: "optout" }, url: new URL(optUrl.href.replace(/s=[^&]+/, "s=000")) });
assert.equal(forged.status, 400, "a forged opt-out link is refused");
col("InviteLog").delete("acme.in|" + new Date().toISOString().slice(0, 7)); /* pretend 90 days have passed */
r = await call(invite, "send", "tok-m1", { company: "acme.in", kind: "customer", emails: ["asha@example.com"] });
assert.deepEqual([r.data.sent, r.data.skippedOptOut], [0, 1], "someone who opted out is never invited again");
/* quota: a list bigger than what's left this month is refused whole, never cut down to the happy part */
const many = Array.from({ length: 1001 }, (_, i) => `p${i}@example.com`);
r = await call(invite, "send", "tok-m1", { company: "acme.in", kind: "customer", emails: many });
assert.equal(r.status, 409, "a list over the monthly limit is refused whole");
r = await call(invite, "send", "tok-m3", { company: "other.in", kind: "customer", emails: ["x@example.com"] });
assert.equal(r.status, 403, "Plus companies can't send invitations");
r = await call(invite, "send", "tok-m3", { company: "acme.in", kind: "customer", emails: ["x@example.com"] });
assert.equal(r.status, 403, "only the company's owners can send");
r = await call(invite, "send", null, { company: "acme.in", emails: ["x@example.com"] });
assert.equal(r.status, 401, "logged-out requests are refused");

/* ---- 3. Team logins ---- */
r = await call(team, "invite", "tok-m1", { company: "acme.in" });
assert.equal(r.status, 200); const token = r.data.link.split("#join-team-")[1];
assert.ok(/^[a-f0-9]{48}$/.test(token), "team link carries a random token");
assert.ok(![...col("TeamInvites").values()].some(i => JSON.stringify(i).includes(token)), "only the token's hash is stored");
col("Reviews").set("rv1", { _id: "rv1", _owner: "m3", company: "x.in" });
r = await call(team, "join", "tok-m3", { token });
assert.equal(r.status, 409, "a reviewer account can't join a company team");
r = await call(team, "join", "tok-m2", { token });
assert.equal(r.status, 200, "join"); assert.ok(company().ownerMemberIds.includes("m2"), "teammate added");
r = await call(team, "join", "tok-m2", { token: "f".repeat(48) });
assert.equal(r.status, 410, "an unknown or used link is refused");
r = await call(team, "list", "tok-m1", { company: "acme.in" });
assert.deepEqual(r.data.members.map(m => m.name), ["Asha", "Dev"], "team list names");
r = await call(team, "remove", "tok-m1", { company: "acme.in", member: "m1" });
assert.equal(r.status, 400, "you can't remove yourself");
r = await call(team, "remove", "tok-m1", { company: "acme.in", member: "m2" });
assert.equal(r.status, 200); assert.deepEqual(company().ownerMemberIds, ["m1"], "teammate removed");
col("Companies").set("acme.in", { ...company(), ownerMemberIds: ["m1", "a", "b", "c", "d"] });
r = await call(team, "invite", "tok-m1", { company: "acme.in" });
assert.equal(r.status, 409, "no more than 5 team logins");
col("Companies").set("acme.in", { ...company(), ownerMemberIds: ["m1"] });

/* ---- 4. Business ends ---- */
assert.equal(await webhook("subscription.cancelled", bizSub), 200);
assert.equal(company().plan, "basic", "when Business ends the company falls back to Basic");
r = await call(invite, "status", "tok-m1", { company: "acme.in" });
assert.equal(r.status, 403, "invitations stop with the plan");

console.log("BUSINESS CHECK: ok");
fs.rmSync(tmp, { recursive: true, force: true });
