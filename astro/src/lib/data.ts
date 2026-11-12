// The site's data as visitors may see it, read on the server.
//
// Reviews are readable only by the team and by each review's own writer (collection permission), so the
// writer's member ID never reaches a visitor. This file reads them with the project's own elevated
// permission and hands out a cleaned copy: no member IDs, no internal notes, labels only where the team
// set them, ratings only from 1 to 5, and one review per person per company. app.js and the server pages
// both use it, so the rules live in one place.
import { auth } from "@wix/essentials";
import { items } from "@wix/data";

export const ADMIN_ID = "c0f544a7-207e-490b-b7d9-830ef39f49c7";
const tms = (d: unknown) => { const v = d && typeof d === "object" && "$date" in (d as object) ? (d as { $date: string }).$date : d; const t = d instanceof Date ? d.getTime() : Date.parse(String(v)); return isNaN(t) ? 0 : t; };
/* A company its owner listed goes live once its plan is set up or the team approves it (both mark it as
   touched by the team). Until then it stays off public pages. Same rule as awaitingCo in app.js. */
export const awaitingListing = (it: any) => !!it && it.addedBy === "owner" && !adminTouched(it);
export const adminTouched = (it: any) => !!it && (it._owner === ADMIN_ID || tms(it._updatedDate) > tms(it._createdDate));
const iso = (d: unknown) => { const t = tms(d); return t ? new Date(t).toISOString() : ""; };
export const slugOf = (s: unknown) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const validRating = (n: unknown) => Number.isInteger(Number(n)) && Number(n) >= 1 && Number(n) <= 5;

/* Plain values only: REST `{ $date }` wrappers and SDK Date objects both become ISO strings. */
export function plain(v: any): any {
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object") {
    const k = Object.keys(v);
    if (k.length === 1 && k[0] === "$date") return iso(v);
    return Object.fromEntries(k.map(x => [x, plain(v[x])]));
  }
  return v;
}

/* Every review, read with the project's elevated permission. */
export async function allReviewsElevated(companyId?: string): Promise<any[]> {
  const query = auth.elevate(items.query);
  const out: any[] = [];
  for (let skip = 0; skip < 50_000; skip += 1000) {
    let q = query("Reviews").limit(1000).skip(skip);
    if (companyId) q = q.eq("company", companyId);
    const res = await q.find();
    out.push(...res.items.map(plain));
    if (res.items.length < 1000) break;
  }
  return out;
}

/* When two companies share an address (slug), the one the team created or edited wins, then the oldest.
   A member can add a company, but can't take over the page of one that already exists. */
export function dedupeCompanies(cos: any[]): any[] {
  const best = new Map<string, any>();
  const better = (a: any, b: any) => adminTouched(a) !== adminTouched(b) ? adminTouched(a) : tms(a._createdDate) < tms(b._createdDate);
  for (const c of cos) {
    const s = c.slug || slugOf(c.title || c._id);
    const prev = best.get(s);
    if (!prev || better(c, prev)) best.set(s, c);
  }
  const keep = new Set(best.values());
  return cos.filter(c => keep.has(c));
}

const PUBLIC_FIELDS = ["_id", "_createdDate", "_updatedDate", "company", "companySlug", "type", "displayName", "anonymous", "rating", "subRatings", "title", "body", "pros", "cons", "advice", "recommend", "employmentStatus", "jobTitle", "location", "tenure", "experienceDate", "invited", "firstHand"];
const TEAM_FIELDS = ["proofChecked", "workEmailVerified", "reply", "replyAt", "importedFrom", "originalDate"];

/* The reviews a visitor may see, cleaned. `cos` must be the companies list (for who manages what). */
export function publicReviews(raw: any[], cos: any[]): any[] {
  const owners = new Set<string>();
  cos.filter(adminTouched).forEach(c => (c.ownerMemberIds || []).forEach((id: string) => owners.add(id)));
  const list = raw.map(plain)
    .filter(r => r.type !== "interview" && validRating(r.rating) && !(r._owner && owners.has(r._owner)))
    .sort((a, b) => tms(b._createdDate) - tms(a._createdDate));
  const seen = new Set<string>(), out: any[] = [];
  for (const r of list) {
    const companyId = typeof r.company === "object" && r.company ? r.company._id : r.company;
    const team = adminTouched(r);
    /* One review per person per company and review type: the newest counts. Reviews the team imported
       for a company are each their own reviewer, so they are never merged. */
    if (r._owner && r._owner !== ADMIN_ID) {
      const key = `${r._owner}|${companyId}|${r.type || "customer"}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    const clean: any = { _team: team };
    for (const k of PUBLIC_FIELDS) if (r[k] !== undefined) clean[k] = r[k];
    clean.company = companyId;
    clean.rating = Number(r.rating);
    if (r.anonymous) clean.displayName = "";
    if (team) for (const k of TEAM_FIELDS) if (r[k] !== undefined) clean[k] = r[k];
    out.push(clean);
  }
  return out;
}
