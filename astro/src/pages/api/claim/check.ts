// Website check for a company claim: POST /api/claim/check { company } with the member's access token.
//
// The claimant adds a DNS TXT record or a meta tag carrying the random token saved on their claim. This
// endpoint looks for it (DNS over HTTPS, then the homepage) on the website the company is listed with. When
// it's there, a claim on a company the team listed is verified straight away: the claim is marked verified
// and the member becomes the page's owner. Claims that added a new company, or companies that someone else
// already owns, still go to the team.
import type { APIRoute } from "astro";
import { auth } from "@wix/essentials";
import { items } from "@wix/data";
import { json, memberFrom } from "../../../lib/pay";
import { adminTouched } from "../../../lib/data";

const get = auth.elevate(items.get);
const update = auth.elevate(items.update);
const query = auth.elevate(items.query);

const domOf = (w: string) => String(w || "").toLowerCase().trim().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[\/?#:]/)[0];

async function txtHas(domain: string, token: string): Promise<boolean> {
  for (const name of [domain, "_knowthecompany." + domain]) {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`, { headers: { Accept: "application/dns-json" } }).catch(() => null);
    if (!res || !res.ok) continue;
    const d = await res.json().catch(() => ({}));
    if ((d.Answer || []).some((a: any) => String(a.data || "").replace(/"\s*"/g, "").includes(token))) return true;
  }
  return false;
}
async function tagHas(domain: string, token: string): Promise<boolean> {
  for (const url of [`https://${domain}/`, `https://www.${domain}/`]) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
    try {
      const res = await fetch(url, { signal: ctl.signal, redirect: "follow", headers: { "User-Agent": "KnowTheCompany-Verify/1.0 (+https://www.knowthecompany.com)" } });
      if (!res.ok) continue;
      const html = (await res.text()).slice(0, 400_000);
      const re = /<meta\s[^>]*name=["']knowthecompany-verification["'][^>]*>/gi;
      for (const m of html.match(re) || []) if (m.includes(token)) return true;
    } catch { /* try the next address */ } finally { clearTimeout(t); }
  }
  return false;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const me = await memberFrom(request);
    if (!me) return json({ error: "Please log in again." }, 401);
    const body = await request.json().catch(() => ({}));
    const companyId = String(body.company || "");
    const claims = (await query("Claims").eq("company", companyId).limit(50).find()).items
      .filter((c: any) => c._owner === me.id && c.method === "website" && c.status === "pending" && c.token)
      .sort((a: any, b: any) => +new Date(b._createdDate) - +new Date(a._createdDate));
    const claim: any = claims[0];
    if (!claim) return json({ error: "There’s no website check waiting for this company." }, 404);
    const company: any = await get("Companies", companyId).catch(() => null);
    const domain = company ? domOf(company.website || company._id) : "";
    if (!domain) return json({ error: "This company has no website to check." }, 400);

    const found = (await txtHas(domain, claim.token)) ? "dns" : (await tagHas(domain, claim.token)) ? "tag" : "";
    if (!found) return json({ ok: false, domain, message: `We couldn’t find the record on ${domain} yet. DNS changes can take up to an hour to show. Try again in a little while.` });

    const ownedByOther = adminTouched(company) && company.claimStatus === "verified" && (company.ownerMemberIds || []).some((id: string) => id !== me.id);
    if (claim.kind !== "claim" || !adminTouched(company) || ownedByOther) {
      await update("Claims", { ...claim, message: [claim.message, `Website check passed (${found}) on ${new Date().toISOString().slice(0, 10)}. Needs a team check.`].filter(Boolean).join(" ") });
      return json({ ok: true, verified: false, message: "Your website check passed. Our team will confirm the claim shortly." });
    }
    await update("Claims", { ...claim, status: "verified", message: [claim.message, `Verified automatically by website (${found}) on ${new Date().toISOString().slice(0, 10)}.`].filter(Boolean).join(" ") });
    await update("Companies", { ...company, claimStatus: "verified", verifiedVia: "website", ownerMemberIds: [...new Set([...(company.ownerMemberIds || []), me.id])] });
    return json({ ok: true, verified: true, message: "Verified. Your company page is now yours to manage." });
  } catch (e) {
    return json({ error: "The website check didn’t work this time. Please try again." }, 500);
  }
};
