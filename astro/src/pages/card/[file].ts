// Trust card image: /card/<company slug>.svg. Drawn by src/lib/card.ts from the company's published reviews.
import type { APIRoute } from "astro";
import { allCompanies, reviewsByCompany, slug as slugOf } from "../../lib/page";
import { awaitingListing } from "../../lib/data";
import { cardData, cardSvg } from "../../lib/card";

export const GET: APIRoute = async ({ params }) => {
  const m = String(params.file || "").match(/^([a-z0-9-]+)\.svg$/);
  const notFound = () => new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  if (!m) return notFound();
  try {
    const cos = await allCompanies();
    const c = cos.find(co => (co.slug || slugOf(co.title || co._id)) === m[1] && !awaitingListing(co));
    if (!c) return notFound();
    const reviews = (await reviewsByCompany()).by.get(c._id) || [];
    return new Response(cardSvg(cardData(c, reviews, `/company/${m[1]}`)), {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
        "Access-Control-Allow-Origin": "*",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Unavailable", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "60" } });
  }
};
