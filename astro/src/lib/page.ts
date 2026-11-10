// Works out what a page address is, and builds the page shell for it: the app's index.html with that
// page's title, description, canonical tag and robots tag, and a short text version of the page inside
// <main> for search engines and for the moment before the app starts. The app then draws the page.
import shell from "../generated/shell.html?raw";
import meta from "../generated/pages-meta.json";

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
async function query(collection: string, filter: object, limit = 100): Promise<any[]> {
  const res = await fetch(`${API}/wix-data/v2/items/query`, {
    method: "POST",
    headers: { Authorization: await visitorToken(), "Content-Type": "application/json" },
    body: JSON.stringify({ dataCollectionId: collection, query: { filter, paging: { limit, offset: 0 } } }),
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
export type Page = { status: number; path: string; title: string; desc: string; h1: string; body: string; noindex: boolean } | { redirect: string };

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
  if (p === "/") return { status: 200, path: "/", title: HOME_TITLE, desc: DEFAULT_DESC, h1: "Know the company before you deal with it.", body: "", noindex: false };

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
        const body = `<p><a href="/category/${slug(cat)}">${esc(cat)}</a> · ${esc(c.website || c._id)}</p>` + (c.bio ? `<p>${esc(c.bio)}</p>` : "");
        return { status: 200, path: p, title: `${name} reviews · Know The Company`, desc: trim(`${name} reviews from customers and employees. ${c.bio || ""}`), h1: name, body, noindex: false };
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
      const body = `<p>Compare companies by real customer experiences</p><ul>${list.map(c => `<li><a href="/company/${c.s}">${esc(c.n)}</a></li>`).join("")}</ul>`;
      return { status: 200, path: p, title: `${name} · Know The Company`, desc: `Compare ${name} companies by honest customer and employee reviews.`, h1: name, body, noindex: false };
    } catch { return unknown(p); }
  }
  return notFound(p);
}
function fromMeta(path: string, m: Meta): Page {
  return { status: 200, path, title: m.title, desc: m.desc || DEFAULT_DESC, h1: m.h1, body: m.intro ? `<p>${esc(m.intro)}</p>` : "", noindex: NOINDEX_ROUTES.includes(m.route) };
}
function notFound(path: string): Page {
  return { status: 404, path, title: "Page not found · Know The Company", desc: DEFAULT_DESC, h1: "Page not found", body: "<p>That link doesn't match a company or category.</p>", noindex: true };
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
  if (pg.h1 && pg.path !== "/") html = html.replace('<main id="app">', () => `<main id="app"><div class="wrap" style="padding-block:40px"><h1>${esc(pg.h1)}</h1>${pg.body}</div>`);
  return html;
}
