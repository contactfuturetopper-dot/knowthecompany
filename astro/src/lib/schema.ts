// schema.org structured data (JSON-LD) for every page. Each page gets one @graph holding the site's
// Organization and WebSite, the page itself (WebPage or a more specific type), its breadcrumb trail, and
// what the page is about: a reviewed company with its rating and reviews, a list of companies, a blog
// post or a free tool. Nodes refer to each other by @id, so search engines read them as one picture.
export const ORIGIN = "https://www.knowthecompany.com";
const ORG_ID = `${ORIGIN}/#organization`;
const SITE_ID = `${ORIGIN}/#website`;
const SUPPORT_EMAIL = "knowthecompanysupport@gmail.com";

export type Crumb = { name: string; path: string };

/** Know The Company itself. */
export function orgNode() {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: "Know The Company",
    alternateName: "KnowTheCompany",
    url: `${ORIGIN}/`,
    logo: { "@type": "ImageObject", "@id": `${ORIGIN}/#logo`, url: `${ORIGIN}/logo.png`, contentUrl: `${ORIGIN}/logo.png`, width: 512, height: 512, caption: "Know The Company" },
    image: { "@id": `${ORIGIN}/#logo` },
    description: "Customer and employee reviews of startups and growing companies.",
    email: SUPPORT_EMAIL,
    contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: SUPPORT_EMAIL, availableLanguage: ["English"] },
  };
}
function siteNode() {
  return { "@type": "WebSite", "@id": SITE_ID, url: `${ORIGIN}/`, name: "Know The Company", alternateName: "KnowTheCompany", inLanguage: "en", publisher: { "@id": ORG_ID } };
}

/** The page itself. `crumbs` links it to its BreadcrumbList; `about` marks a page that is about Know The Company. */
export function webPage(path: string, title: string, description: string, o: { type?: string; mainEntity?: string; crumbs?: boolean; about?: boolean } = {}) {
  const url = `${ORIGIN}${path}`;
  return {
    "@type": o.type || "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: title,
    description,
    inLanguage: "en",
    isPartOf: { "@id": SITE_ID },
    ...(o.about ? { about: { "@id": ORG_ID } } : {}),
    ...(o.mainEntity ? { mainEntity: { "@id": o.mainEntity } } : {}),
    ...(o.crumbs ? { breadcrumb: { "@id": `${url}#breadcrumb` } } : {}),
  };
}

/** Home, then each crumb in order. */
export function breadcrumbs(path: string, crumbs: Crumb[]) {
  const all = [{ name: "Home", path: "/" }, ...crumbs];
  return {
    "@type": "BreadcrumbList",
    "@id": `${ORIGIN}${path}#breadcrumb`,
    itemListElement: all.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${ORIGIN}${c.path}` })),
  };
}

const isoDate = (d: unknown): string | undefined => {
  const v = d && typeof d === "object" && "$date" in (d as object) ? (d as { $date: string }).$date : d;
  if (typeof v !== "string" || !v) return undefined;
  const t = new Date(v);
  return isNaN(t.getTime()) ? undefined : t.toISOString().slice(0, 10);
};
const round1 = (n: number) => Math.round(n * 10) / 10;
const websiteUrl = (w: unknown) => {
  const s = String(w || "").trim();
  if (!s) return undefined;
  return /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, "")}`;
};

/** A reviewed company: an Organization with its customer rating and latest reviews, plus an
    EmployerAggregateRating when employees have rated it. Ratings are left out until there is a review. */
export function companyNodes(path: string, c: any, reviews: any[], f?: any) {
  const id = `${ORIGIN}${path}#company`;
  const customer = reviews.filter(r => (r.type || "customer") === "customer");
  const employee = reviews.filter(r => r.type === "employee");
  const avg = (list: any[]) => round1(list.reduce((s, r) => s + Number(r.rating), 0) / list.length);
  const org: Record<string, unknown> = {
    "@type": "Organization",
    "@id": id,
    name: c.title || c._id,
    url: websiteUrl(c.website || c._id),
    ...(c.bio ? { description: c.bio } : {}),
    ...(c.country && c.country !== "WW" ? { address: { "@type": "PostalAddress", addressCountry: c.country } } : {}),
    ...(c.category ? { knowsAbout: c.category } : {}),
    ...(/^https:\/\/static\.wixstatic\.com\//.test(String(c.logo || "")) ? { logo: c.logo, image: c.logo } : {}),
  };
  if (f) {
    if (f.description) org.description = f.description;
    if (f.legalName) org.legalName = f.legalName;
    if (f.founded) org.foundingDate = f.founded;
    if (f.founders && f.founders.length) org.founder = f.founders.map((n: string) => ({ "@type": "Person", name: n }));
    if (f.hq) { const parts = String(f.hq).split(",").map((x: string) => x.trim()); org.address = { "@type": "PostalAddress", addressLocality: parts[0], ...(parts.length > 1 ? { addressCountry: parts[parts.length - 1] } : {}) }; }
    if (f.parent) org.parentOrganization = { "@type": "Organization", name: f.parent };
    const band = String(f.employees || "").replace(/[\s,]/g, "").match(/^(\d+)[-–](\d+)$|^(\d+)\+$/);
    if (band) org.numberOfEmployees = band[3] ? { "@type": "QuantitativeValue", minValue: Number(band[3]) } : { "@type": "QuantitativeValue", minValue: Number(band[1]), maxValue: Number(band[2]) };
    const same = Object.values(f.links || {}).filter((u: any) => /^https:\/\//.test(String(u || "")));
    if (same.length) org.sameAs = same;
    if (f.products && f.products.length) org.makesOffer = f.products.slice(0, 6).map((p: string) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: p } }));
  }
  if (customer.length) {
    org.aggregateRating = { "@type": "AggregateRating", ratingValue: avg(customer), reviewCount: customer.length, ratingCount: customer.length, bestRating: 5, worstRating: 1 };
    org.review = [...customer]
      .sort((a, b) => String(isoDate(b._createdDate) || "").localeCompare(String(isoDate(a._createdDate) || "")))
      .slice(0, 10)
      .map(r => ({
        "@type": "Review",
        author: { "@type": "Person", name: String(r.displayName || "Reviewer").slice(0, 80) },
        ...(isoDate(r._createdDate) ? { datePublished: isoDate(r._createdDate) } : {}),
        ...(r.title ? { name: String(r.title).slice(0, 110) } : {}),
        ...(r.body ? { reviewBody: String(r.body).slice(0, 2000) } : {}),
        reviewRating: { "@type": "Rating", ratingValue: Number(r.rating), bestRating: 5, worstRating: 1 },
        publisher: { "@id": ORG_ID },
      }));
  }
  const out: object[] = [org];
  if (employee.length) out.push({
    "@type": "EmployerAggregateRating",
    "@id": `${ORIGIN}${path}#employer-rating`,
    itemReviewed: { "@id": id },
    ratingValue: avg(employee),
    ratingCount: employee.length,
    bestRating: 5,
    worstRating: 1,
  });
  return out;
}

/** A list of questions and answers shown on the page. */
export function faqNode(path: string, qa: [string, string][]) {
  return { "@type": "FAQPage", "@id": `${ORIGIN}${path}#faq`, isPartOf: { "@id": `${ORIGIN}${path}#webpage` },
    mainEntity: qa.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };
}

/** The whole @graph as text that is safe inside a <script> tag. */
export function graph(nodes: object[]): string {
  const json = JSON.stringify({ "@context": "https://schema.org", "@graph": [orgNode(), siteNode(), ...nodes] });
  return json.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
