// Checks the structured data (JSON-LD) the server adds to each page, against mocked Wix data:
// every page parses, a company page carries its rating without the owner's own review, and nothing in
// the data can close the <script> tag early. Run: node scripts/check-schema.mjs (after npm run sync).
import { build } from "esbuild";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const tmp = fs.mkdtempSync(path.join((await import("node:os")).tmpdir(), "ktc-ld-"));
const out = path.join(tmp, "page.bundle.mjs");
await build({
  entryPoints: [path.join(root, "src/lib/page.ts")], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "error",
  plugins: [{ name: "raw", setup(b) {
    b.onResolve({ filter: /\?raw$/ }, a => ({ path: path.resolve(a.resolveDir, a.path.replace(/\?raw$/, "")), namespace: "raw" }));
    b.onLoad({ filter: /.*/, namespace: "raw" }, a => ({ contents: fs.readFileSync(a.path, "utf8"), loader: "text" }));
  } }],
});
const companies = [{ _id: "futuretopper.in", title: "Future Topper", slug: "future-topper", category: "Education & E-learning", website: "futuretopper.in", country: "IN", bio: "Exam prep <app>", ownerMemberIds: ["owner1"], _owner: "c0f544a7-207e-490b-b7d9-830ef39f49c7" },
  { _id: "1password.com", title: "1Password", slug: "1password", website: "1password.com", category: "Technology & Software", country: "CA", bio: "Password manager.", ownerMemberIds: [], _owner: "c0f544a7-207e-490b-b7d9-830ef39f49c7", _updatedDate: { $date: "2026-11-01T00:00:00Z" } }];
const reviews = [
  { _id: "r1", _owner: "m2", _updatedDate: "2026-11-02T09:00:00Z", company: "futuretopper.in", type: "customer", rating: 5, displayName: "Asha", title: "Great", body: "Good notes </script>", _createdDate: { $date: "2026-11-01T10:00:00Z" } },
  { _id: "r2", _owner: "m3", _updatedDate: "2026-11-02T09:00:00Z", company: "futuretopper.in", rating: 4, displayName: "Ravi", body: "Helpful", _createdDate: "2026-10-20T10:00:00Z" },
  { _id: "r3", _owner: "owner1", _updatedDate: "2026-11-03T09:00:00Z", company: "futuretopper.in", type: "customer", rating: 1, displayName: "Owner", body: "self" },
  { _id: "r4", _owner: "m4", _updatedDate: "2026-11-04T09:00:00Z", company: "futuretopper.in", type: "employee", rating: 3 },
  { _id: "r5", _owner: "m5", _createdDate: "2026-11-05T00:00:00Z", _updatedDate: "2026-11-05T00:00:00Z", company: "futuretopper.in", type: "customer", rating: 5, displayName: "Sneaky", body: "SELF PUBLISHED" },
];
/* For the sitemap: 250 companies, so it has to page through them, plus one duplicate slug and one with no slug. */
const allCompanies = [...companies, ...Array.from({ length: 247 }, (_, i) => ({ _id: `c${i}.com`, title: `Co ${i}`, slug: `co-${i}`, _updatedDate: { $date: "2026-11-01T00:00:00Z" } })),
  { _id: "dup.com", title: "Dup", slug: "co-1" }, { _id: "a-b.com", title: "A & B" }];
globalThis.fetch = async (url, init) => {
  const body = init && init.body ? JSON.parse(init.body) : {};
  const ok = d => ({ ok: true, json: async () => d });
  if (url.endsWith("/oauth2/token")) return ok({ access_token: "t", expires_in: 3600 });
  if (url.endsWith("query-distinct-values")) return ok({ distinctValues: ["Education & E-learning"] });
  const f = body.query.filter;
  if (body.dataCollectionId === "Companies") {
    if (f.slug) return ok({ dataItems: companies.filter(c => c.slug === f.slug.$eq).map(data => ({ data })) });
    if (f.category) return ok({ dataItems: companies.filter(c => c.category === f.category.$eq).map(data => ({ data })) });
    if (!Object.keys(f).length) { const { limit, offset } = body.query.paging; return ok({ dataItems: allCompanies.slice(offset, offset + limit).map(data => ({ data })) }); }
    if (f.ownerMemberIds) return ok({ dataItems: companies.filter(c => c.ownerMemberIds.some(id => f.ownerMemberIds.$hasSome.includes(id))).map(data => ({ data })) });
  }
  if (body.dataCollectionId === "Reviews") { if (!f.company) { const { limit, offset } = body.query.paging; return ok({ dataItems: reviews.slice(offset, offset + limit).map(data => ({ data })) }); } return ok({ dataItems: reviews.filter(r => r.company === f.company.$eq).map(data => ({ data })) }); }
  throw new Error("unexpected " + url + JSON.stringify(body));
};
const { resolvePage, renderShell, sitemapXml, SITEMAP_PATH } = await import(out);
for (const p of ["/", "/company/future-topper", "/category/education-and-e-learning", "/tools/hike", "/tools", "/blog", "/about", "/pricing", "/nope"]) {
  const pg = await resolvePage(p);
  const html = renderShell(pg);
  const m = html.match(/<script type="application\/ld\+json" id="ld-json">([\s\S]*?)<\/script>/);
  if (!m) { console.log(p, pg.status, "no ld"); continue; }
  const g = JSON.parse(m[1])["@graph"];
  console.log(p, pg.status, g.map(n => n["@type"]).join(","));
  if (p === "/company/future-topper") { const c = g.find(n => n["@id"]?.endsWith("#company")); console.log(JSON.stringify(c, null, 1)); console.log(JSON.stringify(g.find(n => n["@type"] === "EmployerAggregateRating"))); console.log(JSON.stringify(g.find(n => n["@type"] === "BreadcrumbList"))); fs.writeFileSync(path.join(tmp, "company.html"), html); }
}
{
  const pg = await resolvePage("/company/future-topper");
  const html = renderShell(pg);
  const ld = html.match(/<script type="application\/ld\+json" id="ld-json">([\s\S]*?)<\/script>/)[1];
  assert.ok(!/<\/script/i.test(ld), "review text must not close the script tag");
  const c = JSON.parse(ld)["@graph"].find(n => n["@id"]?.endsWith("#company"));
  assert.equal(c.aggregateRating.reviewCount, 3, "the owner's own review is left out");
  assert.equal(c.aggregateRating.ratingValue, 4.7);
  assert.equal(c.url, "https://futuretopper.in");
  const nf = renderShell(await resolvePage("/nope"));
  assert.ok(!nf.includes("ld-json"), "no structured data on a missing page");
  console.log("SCHEMA CHECK: ok");
}

/* What crawlers that don't run JavaScript see: real page text, and link preview tags. */
{
  const co = renderShell(await resolvePage("/company/future-topper"));
  const main = co.slice(co.indexOf('<main id="app">'), co.indexOf("</main>"));
  assert.ok(main.includes("Customer reviews of Future Topper") && main.includes("Rated 4.7 out of 5 from 3 customer reviews"), "company page lists its reviews");
  assert.ok(main.includes("SELF PUBLISHED"), "reviews go live as soon as they are posted");
  assert.ok(main.includes("Good notes &lt;/script&gt;") && !main.includes(">self<"), "review text is escaped and the owner's review is left out");
  assert.ok(main.includes("Employee reviews of Future Topper"));
  assert.ok(co.includes('<meta property="og:title" content="Future Topper reviews">') && co.includes('<meta name="twitter:card" content="summary_large_image">'), "link preview tags");
  assert.equal((co.match(/property="og:title"/g) || []).length, 1, "one og:title");
  assert.ok(co.includes('<meta property="og:url" content="https://www.knowthecompany.com/company/future-topper">'));
  const home = renderShell(await resolvePage("/"));
  assert.ok(home.includes('<a href="/category/education-and-e-learning">') && home.includes("How it works"), "home page has text and category links");
  const cat = await resolvePage("/category/education-and-e-learning");
  assert.ok(cat.desc.startsWith("Reviews of online courses") && cat.body.includes("Reviews of online courses"), "category intro");
  assert.equal((await resolvePage("/blog")).status, 404, "no blog while there are no posts");
  const fp = await resolvePage("/company/1password"), fhtml = renderShell(fp);
  assert.ok(!fp.noindex && fhtml.includes("About 1Password") && fhtml.includes("When was 1Password founded?") && fhtml.includes('id="co-facts" data-id="1password.com"'), "researched facts are on the page");
  assert.ok(fp.ld.some(n => n["@type"] === "FAQPage") && fp.ld.find(n => n["@id"] && n["@id"].endsWith("#company")).foundingDate, "facts in structured data");
  console.log("PAGE TEXT CHECK: ok");
}

/* Sitemap: every company once, public pages only, valid XML escaping, and not at an address Wix takes over. */
{
  assert.ok(!SITEMAP_PATH.endsWith("sitemap.xml"), "Wix answers any address ending in sitemap.xml itself");
  const xml = await sitemapXml();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert.equal(new Set(locs).size, locs.length, "no duplicate URLs");
  for (const want of ["/", "/pricing", "/tools/hike", "/category/education-and-e-learning", "/company/future-topper"])
    assert.ok(locs.includes("https://www.knowthecompany.com" + want), "sitemap has " + want);
  for (const not of ["/company/co-246", "/company/a-and-b", "/blog", "/login", "/search", "/dashboard", "/add", "/jobs", "/my-reviews", "/business-login"])
    assert.ok(!locs.includes("https://www.knowthecompany.com" + not), "sitemap leaves out " + not);
  assert.ok(locs.includes("https://www.knowthecompany.com/company/1password") && xml.includes("<lastmod>2026-11-01</lastmod>"), "a company with researched facts is listed");
  assert.ok(!/&(?!amp;|lt;|gt;|quot;|#39;)/.test(xml), "XML is escaped");
  console.log(`SITEMAP CHECK: ok (${locs.length} URLs)`);
}
