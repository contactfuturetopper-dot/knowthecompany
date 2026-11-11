// Everything the browser app needs to draw any page, in one cached response: companies, the reviews a
// visitor may see (cleaned in lib/data.ts) and what verified owners wrote. The CDN keeps it for a minute,
// so most visits get it straight from the cache instead of making several slow calls to Wix.
// ?company=<id> returns only that company's reviews (and no companies), for pages that need just one.
import type { APIRoute } from "astro";
import { allCompanies, rawReviews, queryAll } from "../../lib/page";
import { publicReviews, plain } from "../../lib/data";

export const GET: APIRoute = async ({ url }) => {
  try {
    const company = url.searchParams.get("company") || "";
    const cos = await allCompanies();
    const rvs = publicReviews(await rawReviews(company || undefined), cos);
    const body = company
      ? { rvs }
      : { cos: cos.map(plain), rvs, own: (await queryAll("OwnerContent", { kind: { $in: ["profile", "reply"] } })).map(plain) };
    return new Response(JSON.stringify({ ...body, t: Date.now() }), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "unavailable" }), { status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }
};
