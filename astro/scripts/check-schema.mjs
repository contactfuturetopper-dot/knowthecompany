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
const companies = [{ _id: "futuretopper.in", title: "Future Topper", slug: "future-topper", category: "Education & E-learning", website: "futuretopper.in", country: "IN", bio: "Exam prep <app>", ownerMemberIds: ["owner1"] }];
const reviews = [
  { _id: "r1", _owner: "m2", company: "futuretopper.in", type: "customer", rating: 5, displayName: "Asha", title: "Great", body: "Good notes </script>", _createdDate: { $date: "2026-11-01T10:00:00Z" } },
  { _id: "r2", _owner: "m3", company: "futuretopper.in", rating: 4, displayName: "Ravi", body: "Helpful", _createdDate: "2026-10-20T10:00:00Z" },
  { _id: "r3", _owner: "owner1", company: "futuretopper.in", type: "customer", rating: 1, displayName: "Owner", body: "self" },
  { _id: "r4", _owner: "m4", company: "futuretopper.in", type: "employee", rating: 3 },
];
globalThis.fetch = async (url, init) => {
  const body = init && init.body ? JSON.parse(init.body) : {};
  const ok = d => ({ ok: true, json: async () => d });
  if (url.endsWith("/oauth2/token")) return ok({ access_token: "t", expires_in: 3600 });
  if (url.endsWith("query-distinct-values")) return ok({ distinctValues: ["Education & E-learning"] });
  const f = body.query.filter;
  if (body.dataCollectionId === "Companies") {
    if (f.slug) return ok({ dataItems: companies.filter(c => c.slug === f.slug.$eq).map(data => ({ data })) });
    if (f.category) return ok({ dataItems: companies.filter(c => c.category === f.category.$eq).map(data => ({ data })) });
    if (f.ownerMemberIds) return ok({ dataItems: companies.filter(c => c.ownerMemberIds.some(id => f.ownerMemberIds.$hasSome.includes(id))).map(data => ({ data })) });
  }
  if (body.dataCollectionId === "Reviews") return ok({ dataItems: reviews.filter(r => r.company === f.company.$eq).map(data => ({ data })) });
  throw new Error("unexpected " + url + JSON.stringify(body));
};
const { resolvePage, renderShell } = await import(out);
for (const p of ["/", "/company/future-topper", "/category/education-and-e-learning", "/blog/reply-to-negative-reviews", "/tools/hike", "/tools", "/blog", "/about", "/pricing", "/nope"]) {
  const pg = await resolvePage(p);
  const html = renderShell(pg);
  const m = html.match(/<script type="application\/ld\+json" id="ld-json">([\s\S]*?)<\/script>/);
  if (!m) { console.log(p, pg.status, "no ld"); continue; }
  const g = JSON.parse(m[1])["@graph"];
  console.log(p, pg.status, g.map(n => n["@type"]).join(","));
  if (p === "/company/future-topper") { const c = g.find(n => n["@id"]?.endsWith("#company")); console.log(JSON.stringify(c, null, 1)); console.log(JSON.stringify(g.find(n => n["@type"] === "EmployerAggregateRating"))); console.log(JSON.stringify(g.find(n => n["@type"] === "BreadcrumbList"))); fs.writeFileSync(path.join(tmp, "company.html"), html); }
  if (p === "/blog/reply-to-negative-reviews") console.log(JSON.stringify(g.find(n => n["@type"] === "BlogPosting")));
}
{
  const pg = await resolvePage("/company/future-topper");
  const html = renderShell(pg);
  const ld = html.match(/<script type="application\/ld\+json" id="ld-json">([\s\S]*?)<\/script>/)[1];
  assert.ok(!/<\/script/i.test(ld), "review text must not close the script tag");
  const c = JSON.parse(ld)["@graph"].find(n => n["@id"]?.endsWith("#company"));
  assert.equal(c.aggregateRating.reviewCount, 2, "the owner's own review is left out");
  assert.equal(c.aggregateRating.ratingValue, 4.5);
  assert.equal(c.url, "https://futuretopper.in");
  const nf = renderShell(await resolvePage("/nope"));
  assert.ok(!nf.includes("ld-json"), "no structured data on a missing page");
  console.log("SCHEMA CHECK: ok");
}
