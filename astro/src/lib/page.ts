// Works out what a page address is, and builds the page shell for it: the app's index.html with that
// page's title, description, canonical tag and robots tag, and a short text version of the page inside
// <main> for search engines and for the moment before the app starts. The app then draws the page.
import shell from "../generated/shell.html?raw";
import meta from "../generated/pages-meta.json";
import posts from "../generated/posts.json";
import catIntros from "../generated/cat-intros.json";
import factsData from "../generated/company-facts.json";
import { graph, orgNode, webPage, breadcrumbs, companyNodes, faqNode, type Crumb } from "./schema";

export const ORIGIN = "https://www.knowthecompany.com";
const CLIENT_ID = "5783d517-0173-420b-ba45-67e1d2efd460";
const API = "https://www.wixapis.com";

/* Keeps the whole site out of search engines until launch. Turn this off together with SITE_NOINDEX in
   app.js and the robots tag in index.html. */
export const SITE_NOINDEX = true;

const DEFAULT_DESC = "Customer and employee reviews of startups and growing companies, on one page. Know the company before you deal with it.";
const HOME_TITLE = "Know The Company · Customer and employee reviews of startups";
const NOINDEX_ROUTES = ["search", "login", "business-login", "dashboard", "my-reviews", "add"];
type Meta = { route: string; title: string; desc?: string; h1: string; intro?: string };
const PAGES = new Map((meta as Meta[]).map(m => [m.route, m]));

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
export const slug = (s: unknown) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const trim = (d: string) => d.length > 158 ? d.slice(0, 155).replace(/\s+\S*$/, "") + "…" : d;

/* ---- reading the site's data as a visitor ---- */
let token: { value: string; until: number } | null = null;
async function visitorToken(): Promise<string> {
  if (token && token.until > Date.now() + 60_000) return token.value;
  const res = await fetch(`${API}/oauth2/token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: CLIENT_ID, grantType: "anonymous" }) });
  if (!res.ok) throw new Error(`token ${res.status}`);
  const d = await res.json();
  token = { value: d.access_token, until: Date.now() + (d.expires_in || 3600) * 1000 };
  return token.value;
}
async function query(collection: string, filter: object, limit = 100, offset = 0): Promise<any[]> {
  const res = await fetch(`${API}/wix-data/v2/items/query`, {
    method: "POST",
    headers: { Authorization: await visitorToken(), "Content-Type": "application/json" },
    body: JSON.stringify({ dataCollectionId: collection, query: { filter, paging: { limit, offset } } }),
  });
  if (!res.ok) throw new Error(`query ${collection} ${res.status}`);
  return ((await res.json()).dataItems || []).map((d: any) => d.data);
}
async function categories(): Promise<string[]> {
  const res = await fetch(`${API}/wix-data/v2/items/query-distinct-values`, {
    method: "POST",
    headers: { Authorization: await visitorToken(), "Content-Type": "application/json" },
    body: JSON.stringify({ dataCollectionId: "Companies", fieldName: "category", filter: {}, paging: { limit: 100, offset: 0 } }),
  });
  if (!res.ok) throw new Error(`categories ${res.status}`);
  return ((await res.json()).distinctValues || []).filter((v: unknown) => typeof v === "string");
}

/* ---- addresses ---- */
/* `ld` is this page's structured data (schema.org JSON-LD), added to the shell as one @graph with the
   site's Organization and WebSite. */
export type Page = { status: number; path: string; title: string; desc: string; h1: string; body: string; noindex: boolean; ld?: object[]; ogType?: string; facts?: { id: string; data: Facts } } | { redirect: string };
export type Facts = { name?: string; legalName?: string | null; founded?: string | null; hq?: string | null; founders?: string[]; parent?: string | null; ownership?: string | null; employees?: string | null; products?: string[]; markets?: string | null; description?: string | null; status?: string | null; links?: Record<string, string | null>; sources?: { fact: string; url: string }[]; checked?: string };
const FACTS = factsData as Record<string, Facts>;
type Post = { slug: string; cat: string; date: string; title: string; excerpt: string; body: [string, string | string[]][] };
const catIntro = (name: string) => (catIntros as Record<string, string>)[name] || `Customer and employee reviews of ${name} companies: how they treat the people they serve and the people who work for them.`;
const POSTS = new Map((posts as Post[]).map(p => [p.slug, p]));

/** Old addresses (/#route is handled in the browser; /x.html and trailing slashes here) move to the clean one. */
export function cleanPath(pathname: string): string | null {
  let p = pathname;
  if (p !== "/" && p.endsWith("/")) p = p.replace(/\/+$/, "");
  if (p.endsWith(".html")) p = p.slice(0, -5);
  if (p === "/index") p = "/";
  if (p === "/sample") p = "/list";
  return p === pathname ? null : p || "/";
}

export async function resolvePage(pathname: string): Promise<Page> {
  const moved = cleanPath(pathname);
  if (moved) return { redirect: moved };
  const p = pathname;
  if (p === "/") return { status: 200, path: "/", title: HOME_TITLE, desc: DEFAULT_DESC, h1: "Know the company before you deal with it.", body: await homeBody(), noindex: false, ld: [webPage("/", HOME_TITLE, DEFAULT_DESC, { type: "WebPage", about: true })] };

  let m = p.match(/^\/(tools|blog)\/([a-z0-9-]+)$/);
  if (m) {
    const info = PAGES.get((m[1] === "tools" ? "tool-" : "blog-") + m[2]);
    if (info) return fromMeta(p, info);
  }
  m = p.match(/^\/([a-z-]+)$/);
  if (m && PAGES.has(m[1])) return fromMeta(p, PAGES.get(m[1]) as Meta);

  m = p.match(/^\/company\/([a-z0-9-]+)$/);
  if (m) {
    try {
      const [c] = await query("Companies", { slug: { $eq: m[1] } }, 1);
      if (c) {
        const name = c.title || c._id, cat = c.category || "Other";
        const title = `${name} reviews · Know The Company`, desc = trim(`${name} reviews from customers and employees. ${c.bio || ""}`);
        const reviews = await companyReviews(c._id).catch(() => []);
        const f = FACTS[c._id];
        const body = `<p><a href="/category/${slug(cat)}">${esc(cat)}</a> · ${esc(c.website || c._id)}</p>` + (c.bio ? `<p>${esc(c.bio)}</p>` : "") + reviewsHtml(name, reviews) + (f ? factsHtml(name, c, f, reviews) : "");
        const crumbs: Crumb[] = [{ name: cat, path: `/category/${slug(cat)}` }, { name, path: p }];
        const ld = [webPage(p, title, desc, { type: "ItemPage", mainEntity: `${ORIGIN}${p}#company`, crumbs: true }), breadcrumbs(p, crumbs), ...companyNodes(p, c, reviews, f)];
        if (f) ld.push(faqNode(p, faqFor(name, c, f, reviews)));
        return { status: 200, path: p, title, desc, h1: name, body, noindex: false, ld, ...(f ? { facts: { id: c._id, data: f } } : {}) };
      }
      return notFound(p);
    } catch { return unknown(p); }
  }

  m = p.match(/^\/category\/([a-z0-9-]+)$/);
  if (m) {
    try {
      const name = (await categories()).find(n => slug(n) === m![1]);
      if (!name) return notFound(p);
      const list = (await query("Companies", { category: { $eq: name } }, 100)).map(c => ({ s: c.slug || slug(c.title || c._id), n: c.title || c._id })).sort((a, b) => a.n.localeCompare(b.n));
      const body = `<p>${esc(catIntro(name))}</p><ul>${list.map(c => `<li><a href="/company/${c.s}">${esc(c.n)}</a></li>`).join("")}</ul>`;
      const title = `${name} · Know The Company`, desc = trim(catIntro(name));
      const ld = [
        webPage(p, title, desc, { type: "CollectionPage", mainEntity: `${ORIGIN}${p}#list`, crumbs: true }),
        breadcrumbs(p, [{ name: "All categories", path: "/categories" }, { name, path: p }]),
        { "@type": "ItemList", "@id": `${ORIGIN}${p}#list`, name: `${name} companies`, numberOfItems: list.length,
          itemListElement: list.map((c, i) => ({ "@type": "ListItem", position: i + 1, url: `${ORIGIN}/company/${c.s}`, name: c.n })) },
      ];
      return { status: 200, path: p, title, desc, h1: name, body, noindex: false, ld };
    } catch { return unknown(p); }
  }
  return notFound(p);
}
function fromMeta(path: string, m: Meta): Page {
  const desc = m.desc || DEFAULT_DESC;
  const post = m.route.startsWith("blog-") ? POSTS.get(m.route.slice(5)) : undefined;
  const body = (m.intro ? `<p>${esc(m.intro)}</p>` : "") + (post ? articleHtml(post) : "");
  return { status: 200, path, title: m.title, desc, h1: m.h1, body, noindex: NOINDEX_ROUTES.includes(m.route), ld: pageSchema(path, m, desc), ...(post ? { ogType: "article" } : {}) };
}
const PAGE_TYPES: Record<string, string> = { about: "AboutPage", contact: "ContactPage", categories: "CollectionPage", tools: "CollectionPage", blog: "CollectionPage", search: "SearchResultsPage" };
/* Structured data for the fixed pages: the page itself, its breadcrumb trail, and what it is about. */
function pageSchema(path: string, m: Meta, desc: string): object[] {
  const r = m.route;
  if (r.startsWith("blog-")) {
    const post = POSTS.get(r.slice(5));
    const crumbs: Crumb[] = [{ name: "Blog", path: "/blog" }, { name: m.h1, path }];
    const out: object[] = [webPage(path, m.title, desc, { type: "WebPage", mainEntity: `${ORIGIN}${path}#article`, crumbs: true }), breadcrumbs(path, crumbs)];
    if (post) out.push({
      "@type": "BlogPosting", "@id": `${ORIGIN}${path}#article`, headline: post.title, description: post.excerpt,
      datePublished: post.date, dateModified: post.date, articleSection: post.cat, inLanguage: "en",
      author: { "@id": `${ORIGIN}/#organization` }, publisher: { "@id": `${ORIGIN}/#organization` },
      mainEntityOfPage: { "@id": `${ORIGIN}${path}#webpage` }, isPartOf: { "@id": `${ORIGIN}/blog#blog` },
    });
    return out;
  }
  if (r.startsWith("tool-")) {
    return [
      webPage(path, m.title, desc, { type: "WebPage", mainEntity: `${ORIGIN}${path}#app`, crumbs: true }),
      breadcrumbs(path, [{ name: "Free tools", path: "/tools" }, { name: m.h1, path }]),
      { "@type": "WebApplication", "@id": `${ORIGIN}${path}#app`, name: m.h1, url: `${ORIGIN}${path}`, description: m.intro || desc,
        applicationCategory: "BusinessApplication", operatingSystem: "Any", browserRequirements: "Requires JavaScript",
        isAccessibleForFree: true, offers: { "@type": "Offer", price: "0", priceCurrency: "INR" }, provider: { "@id": `${ORIGIN}/#organization` } },
    ];
  }
  const out: object[] = [webPage(path, m.title, desc, { type: PAGE_TYPES[r] || "WebPage", crumbs: true, about: r === "about" || r === "contact" })];
  out.push(breadcrumbs(path, [{ name: m.h1 && m.h1.length < 60 ? m.h1 : (m.title.split(" · ")[0]), path }]));
  if (r === "blog") out.push({
    "@type": "Blog", "@id": `${ORIGIN}/blog#blog`, name: "Know The Company blog", url: `${ORIGIN}/blog`, description: m.intro || desc,
    publisher: { "@id": `${ORIGIN}/#organization` },
    blogPost: [...POSTS.values()].map(p => ({ "@type": "BlogPosting", headline: p.title, url: `${ORIGIN}/blog/${p.slug}`, datePublished: p.date })),
  });
  if (r === "tools") out.push({
    "@type": "ItemList", name: "Free career and company tools",
    itemListElement: (meta as Meta[]).filter(x => x.route.startsWith("tool-")).map((x, i) => ({ "@type": "ListItem", position: i + 1, url: `${ORIGIN}/tools/${x.route.slice(5)}`, name: x.h1 })),
  });
  return out;
}

/* Published reviews of one company, as a visitor sees them, without reviews written by any account that
   manages a company (the same rule the app and the badge apply). */
/* Members can insert items but only the team can edit them, and Wix gives a new item equal created and
   updated times. Reviews go live as soon as they are posted, but a reply stored on a review, or a company a
   member inserted with team-only fields filled in, counts only once an admin has touched it. Same rule as
   "trust" in app.js. */
const ADMIN_ID = "c0f544a7-207e-490b-b7d9-830ef39f49c7";
const tms = (d: unknown) => { const v = d && typeof d === "object" && "$date" in (d as object) ? (d as { $date: string }).$date : d; const t = Date.parse(String(v)); return isNaN(t) ? 0 : t; };
export const adminTouched = (it: any) => !!it && (it._owner === ADMIN_ID || tms(it._updatedDate) > tms(it._createdDate));
async function companyReviews(companyId: string): Promise<any[]> {
  const items = (await query("Reviews", { company: { $eq: companyId } }, 1000)).filter(r => r.type !== "interview" && Number(r.rating) > 0);
  const authors = [...new Set(items.map(r => r._owner).filter(Boolean))];
  const blocked = new Set<string>();
  for (let i = 0; i < authors.length; i += 50) {
    const owners = await query("Companies", { ownerMemberIds: { $hasSome: authors.slice(i, i + 50) } }, 100);
    owners.filter(adminTouched).forEach(c => (c.ownerMemberIds || []).forEach((id: string) => blocked.add(id)));
  }
  return items.filter(r => !blocked.has(r._owner));
}
/* ---- text versions of the page content, for search engines and AI crawlers that don't run JavaScript ---- */
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function monthYear(d: unknown): string {
  const v = d && typeof d === "object" && "$date" in (d as object) ? (d as { $date: string }).$date : d;
  const t = typeof v === "string" ? new Date(v) : null;
  return t && !isNaN(t.getTime()) ? `${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}` : "";
}
const stars = (n: unknown) => `${Number(n)} out of 5`;
function reviewsHtml(name: string, reviews: any[]): string {
  const sorted = [...reviews].sort((a, b) => String(monthIso(b._createdDate)).localeCompare(String(monthIso(a._createdDate))));
  const customer = sorted.filter(r => (r.type || "customer") === "customer");
  const employee = sorted.filter(r => r.type === "employee");
  const avg = (l: any[]) => (l.reduce((s, r) => s + Number(r.rating), 0) / l.length).toFixed(1);
  const reply = (r: any) => r.reply && adminTouched(r) ? `<blockquote><p><strong>Reply from ${esc(name)}:</strong> ${esc(r.reply)}</p></blockquote>` : "";
  let html = `<section><h2>Customer reviews of ${esc(name)}</h2>`;
  html += customer.length
    ? `<p>Rated ${avg(customer)} out of 5 from ${customer.length} customer review${customer.length === 1 ? "" : "s"}.</p>` + customer.slice(0, 20).map(r => `<article><h3>${esc(r.title || "Customer review")}</h3><p>${stars(r.rating)} · ${esc(r.displayName || "Reviewer")}${monthYear(r._createdDate) ? " · " + monthYear(r._createdDate) : ""}</p>${r.body ? `<p>${esc(r.body)}</p>` : ""}${reply(r)}</article>`).join("")
    : `<p>No customer reviews of ${esc(name)} yet. If you have bought from or used ${esc(name)}, you can write the first one.</p>`;
  html += `</section><section><h2>Employee reviews of ${esc(name)}</h2>`;
  if (employee.length) {
    const rec = employee.filter(r => r.recommend === "yes").length;
    html += `<p>Rated ${avg(employee)} out of 5 by ${employee.length} current or former employee${employee.length === 1 ? "" : "s"}. ${Math.round(rec / employee.length * 100)}% would recommend working there.</p>`;
    html += employee.slice(0, 20).map(r => `<article><h3>${esc(r.jobTitle || "Employee review")}</h3><p>${stars(r.rating)} · ${esc(r.employmentStatus || "Employee")}${r.anonymous || !r.displayName ? "" : " · " + esc(r.displayName)}${monthYear(r._createdDate) ? " · " + monthYear(r._createdDate) : ""}</p>${r.pros ? `<p><strong>Pros:</strong> ${esc(r.pros)}</p>` : ""}${r.cons ? `<p><strong>Cons:</strong> ${esc(r.cons)}</p>` : ""}${r.advice ? `<p><strong>Advice to management:</strong> ${esc(r.advice)}</p>` : ""}${reply(r)}</article>`).join("");
  } else html += `<p>No employee reviews of ${esc(name)} yet. Current and former employees can review anonymously.</p>`;
  return html + "</section>";
}
const monthIso = (d: unknown) => { const v = d && typeof d === "object" && "$date" in (d as object) ? (d as { $date: string }).$date : d; return typeof v === "string" ? v : ""; };
function articleHtml(post: Post): string {
  return (post.body || []).map(([k, v]) => k === "h" ? `<h2>${esc(v)}</h2>` : k === "ul" ? `<ul>${(v as string[]).map(i => `<li>${esc(i)}</li>`).join("")}</ul>` : `<p>${esc(v)}</p>`).join("");
}
const bandText = (b: string) => { const m = b.replace(/\s/g, "").match(/^([\d,]+)[-–]([\d,]+)$/); return m ? `between ${m[1]} and ${m[2]}` : /\+$/.test(b) ? `more than ${b.replace(/\+$/, "")}` : b; };
const listAnd = (a: string[]) => a.length < 2 ? (a[0] || "") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
const safeUrl = (u: unknown) => /^https:\/\/[^\s"'<>]+$/i.test(String(u || "")) ? String(u) : "";
const LINK_NAMES: [string, string][] = [["linkedin", "LinkedIn"], ["x", "X"], ["instagram", "Instagram"], ["facebook", "Facebook"], ["youtube", "YouTube"], ["appStore", "App Store"], ["playStore", "Google Play"]];
/** Questions people ask about a company, answered from its facts and its reviews (same as factFaq in app.js). */
function faqFor(name: string, c: any, f: Facts, reviews: any[]): [string, string][] {
  const q: [string, string][] = [];
  const customer = reviews.filter(r => (r.type || "customer") === "customer"), employee = reviews.filter(r => r.type === "employee");
  const avg = (l: any[]) => (l.reduce((s, r) => s + Number(r.rating), 0) / l.length).toFixed(1);
  q.push([`What does ${name} do?`, `${String(f.description || c.bio || "").split(/(?<=\.)\s/)[0]}${f.products && f.products.length ? ` Its main products and services include ${listAnd(f.products.slice(0, 4))}.` : ""}`]);
  if (f.founded) q.push([`When was ${name} founded?`, `${name} was founded in ${f.founded}${f.founders && f.founders.length ? ` by ${listAnd(f.founders)}` : ""}.`]);
  if (f.hq) q.push([`Where is ${name} based?`, `${name} is headquartered in ${f.hq}.${f.markets ? ` It operates in ${f.markets}.` : ""}`]);
  const tick = (f.ownership || "").match(/\(([^)]+)\)/);
  if (f.parent) q.push([`Who owns ${name}?`, `${name} is owned by ${f.parent}.`]);
  else if (/^Public/.test(f.ownership || "")) q.push([`Is ${name} a public company?`, `Yes. ${name} is publicly listed${tick ? ` (${tick[1]})` : ""}.`]);
  else if (f.ownership === "Private") q.push([`Is ${name} a public company?`, `No. ${name} is a privately held company.`]);
  if (f.employees) q.push([`How many people work at ${name}?`, `Public sources put ${name}'s team at ${bandText(f.employees)} people.`]);
  q.push([`What do customers and employees say about ${name}?`, customer.length || employee.length
    ? [customer.length ? `Customers rate ${name} ${avg(customer)} out of 5 from ${customer.length} review${customer.length === 1 ? "" : "s"}.` : "", employee.length ? `Employees rate it ${avg(employee)} out of 5 from ${employee.length} review${employee.length === 1 ? "" : "s"}.` : ""].filter(Boolean).join(" ")
    : `There are no reviews of ${name} on Know The Company yet. If you have used ${name} or worked there, you can write the first one.`]);
  return q;
}
function factsHtml(name: string, c: any, f: Facts, reviews: any[]): string {
  const rows = [["Founded", f.founded], ["Headquarters", f.hq], [f.founders && f.founders.length > 1 ? "Founders" : "Founder", (f.founders || []).join(", ")], ["Owned by", f.parent], ["Ownership", f.parent ? "" : f.ownership], ["Employees", f.employees], ["Operates in", f.markets], ["Legal name", f.legalName]].filter(r => r[1]) as [string, string][];
  const links = [["Website", `https://${c.website || c._id}`], ...LINK_NAMES.map(([k, l]) => [l, safeUrl((f.links || {})[k])])].filter(l => l[1]);
  let h = `<section><h2>About ${esc(name)}</h2>`;
  if (f.status && f.status !== "Active") h += `<p>${esc(f.status)}</p>`;
  if (f.description) h += `<p>${esc(f.description)}</p>`;
  if (f.products && f.products.length) h += `<h3>Products and services</h3><ul>${f.products.map(p => `<li>${esc(p)}</li>`).join("")}</ul>`;
  if (rows.length) h += `<h3>At a glance</h3><dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;
  h += `<h3>Official links</h3><ul>${links.map(([l, u]) => `<li><a href="${esc(u)}" rel="nofollow noopener">${esc(l)}</a></li>`).join("")}</ul>`;
  h += `<h3>Questions about ${esc(name)}</h3>${faqFor(name, c, f, reviews).map(([q, a]) => `<h4>${esc(q)}</h4><p>${esc(a)}</p>`).join("")}`;
  return h + `<p>These facts come from public sources${f.checked ? `, checked ${esc(f.checked)}` : ""}. They are not written or paid for by ${esc(name)}.</p></section>`;
}
const TOOL_LINKS: [string, string][] = (meta as Meta[]).filter(m => m.route.startsWith("tool-")).map(m => [`/tools/${m.route.slice(5)}`, m.h1]);
async function homeBody(): Promise<string> {
  const cats = await categories().catch(() => [] as string[]);
  return `<p>Customers and employees review the same company, on one page. Read what people say about startups and growing companies before you buy from them, work with them or join them.</p>
<h2>What customers and employees say, together</h2>
<p>Review sites usually cover one side: customers or employees. Every company page here has both, so you see how a company treats the people it works for and the people who work for it.</p>
<ul><li>Customers rate the quality of the work, product or service, communication and support, value for money, and whether the company kept its promises.</li><li>Employees rate culture and management, pay and benefits, career growth and work-life balance, anonymously or with their name.</li></ul>
<h2>Free for everyone, and no ratings bought</h2>
<p>Reading and writing reviews costs nothing. Companies can pay for listing tools, never for stars: paying never changes, hides or delays a review.</p>
${cats.length ? `<h2>Browse by category</h2><ul>${cats.sort().map(c => `<li><a href="/category/${slug(c)}">${esc(c)}</a></li>`).join("")}</ul>` : ""}
<h2>Free career and company tools</h2><ul>${TOOL_LINKS.map(([href, name]) => `<li><a href="${href}">${esc(name)}</a></li>`).join("")}</ul>
<h2>How it works</h2>
<ol><li>Search the company by name or website. Each page shows its reviews and whether the company is verified.</li><li>Read real experiences: customers share how they were treated, employees share anonymous reviews.</li><li>Share your own. Good or bad, every review is published the same way, and the company can reply.</li></ol>
<p><a href="/list">List your company</a> · <a href="/why-list">Why companies list here</a> · <a href="/pricing">Pricing</a></p>`;
}
function notFound(path: string): Page {
  return { status: 404, path, title: "Page not found · Know The Company", desc: DEFAULT_DESC, h1: "This page doesn’t exist", body: `<p>The link may be old or mistyped. Search for a company, or pick up from one of these pages.</p><ul><li><a href="/">Home</a></li><li><a href="/categories">All categories</a></li><li><a href="/search">Search companies</a></li><li><a href="/tools">Free tools</a></li><li><a href="/add">Add a missing company</a></li><li><a href="/help">Help centre</a></li></ul>`, noindex: true };
}
/* Wix couldn't be read: serve the app with general details and let it draw the page. */
function unknown(path: string): Page {
  return { status: 200, path, title: "Know The Company", desc: DEFAULT_DESC, h1: "", body: "", noindex: true };
}

/** The app's index.html with this page's details in it. */
export function renderShell(pg: Exclude<Page, { redirect: string }>): string {
  const robots = SITE_NOINDEX ? "noindex, nofollow" : pg.noindex ? "noindex, follow" : "index, follow";
  let html = shell
    .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(pg.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, () => `<meta name="description" content="${esc(pg.desc)}">`)
    .replace(/<link rel="canonical" href="[^"]*">/, () => `<link rel="canonical" href="${ORIGIN}${pg.path}">`)
    .replace(/<meta name="robots" content="[^"]*">/, () => `<meta name="robots" content="${robots}">`);
  if (!/<meta name="robots"/.test(html)) html = html.replace("</title>", () => `</title>\n<meta name="robots" content="${robots}">`);
  /* Link previews on WhatsApp, LinkedIn, X, Facebook and Slack. */
  const url = `${ORIGIN}${pg.path}`, shareTitle = pg.title.replace(/ · Know The Company$/, "");
  const og = [
    ["og:site_name", "Know The Company"], ["og:type", pg.ogType || "website"], ["og:url", url], ["og:title", shareTitle], ["og:description", pg.desc],
    ["og:image", `${ORIGIN}/og-image.png`], ["og:image:width", "1200"], ["og:image:height", "630"], ["og:image:alt", "Know The Company: customer and employee reviews of startups and growing companies"], ["og:locale", "en_GB"],
  ].map(([k, v]) => `<meta property="${k}" content="${esc(v)}">`).join("\n")
    + "\n" + [["twitter:card", "summary_large_image"], ["twitter:title", shareTitle], ["twitter:description", pg.desc], ["twitter:image", `${ORIGIN}/og-image.png`]].map(([k, v]) => `<meta name="${k}" content="${esc(v)}">`).join("\n");
  html = html.replace(/<!-- og -->[\s\S]*?<!-- \/og -->/, () => `<!-- og -->\n${og}\n<!-- /og -->`);
  if (pg.h1) html = html.replace('<main id="app">', () => `<main id="app"><div class="wrap" style="padding-block:40px"><h1>${esc(pg.h1)}</h1>${pg.body}</div>`);
  if (pg.facts) html = html.replace("</head>", () => `<script type="application/json" id="co-facts" data-id="${esc(pg.facts!.id)}">${JSON.stringify(pg.facts!.data).replace(/</g, "\\u003c")}</script>\n</head>`);
  if (pg.status === 200) html = html.replace("</head>", () => `<script type="application/ld+json" id="ld-json">${graph(pg.ld || [])}</script>\n</head>`);
  return html;
}

/* ---- sitemap ----
   Wix answers /sitemap.xml itself (and any address ending in sitemap.xml) with a sitemap of its own
   editor pages, which this headless site doesn't have. Ours lives at SITEMAP_PATH; it is submitted in
   Search Console and listed in robots.txt. It holds every page meant for search: the home page, the
   public fixed pages, tools, blog posts, categories and companies. */
export const SITEMAP_PATH = "/sitemap-ktc.xml";
const SITEMAP_SKIP = [...NOINDEX_ROUTES, "jobs"];
const routePath = (r: string) => r.startsWith("tool-") ? `/tools/${r.slice(5)}` : r.startsWith("blog-") ? `/blog/${r.slice(5)}` : `/${r}`;
const day = (d: unknown) => {
  const v = d && typeof d === "object" && "$date" in (d as object) ? (d as { $date: string }).$date : d;
  const t = typeof v === "string" ? new Date(v) : null;
  return t && !isNaN(t.getTime()) ? t.toISOString().slice(0, 10) : undefined;
};
export async function sitemapXml(): Promise<string> {
  const urls: { loc: string; lastmod?: string }[] = [{ loc: "/" }];
  for (const m of PAGES.values()) {
    if (SITEMAP_SKIP.includes(m.route)) continue;
    const post = m.route.startsWith("blog-") ? POSTS.get(m.route.slice(5)) : undefined;
    urls.push({ loc: routePath(m.route), lastmod: post ? day(post.date) : undefined });
  }
  for (const c of (await categories()).sort()) urls.push({ loc: `/category/${slug(c)}` });
  const companies: any[] = [];
  for (let offset = 0; offset < 50_000; offset += 100) {
    const page = await query("Companies", {}, 100, offset);
    companies.push(...page);
    if (page.length < 100) break;
  }
  const seen = new Set<string>();
  for (const c of companies) {
    const s = c.slug || slug(c.title || c._id);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    urls.push({ loc: `/company/${s}`, lastmod: day(c._updatedDate) });
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u => `  <url><loc>${esc(ORIGIN + u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`).join("\n") +
    `\n</urlset>\n`;
}
