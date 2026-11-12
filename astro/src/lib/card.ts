// Trust card: a company's customer score and employee score side by side, as one image (1200 x 630).
// Served at /card/<slug>.svg (src/pages/card/[file].ts). Companies use it in proposals, pitch decks, careers
// pages and emails; it always links back to the company's page here.
//
// Everything on the card is counted from published reviews, the same cleaned list visitors see
// (lib/data.ts). A side shows a score only from MIN_REVIEWS reviews up, so a single review can't make a
// company look perfect or terrible. Nothing a company sets, and nothing it pays for, changes the card.
import { adminTouched } from "./data";

export const MIN_REVIEWS = 5;
const ORIGIN = "https://www.knowthecompany.com";

const x = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] as string);
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const avgOf = (l: any[]) => l.reduce((s, r) => s + Number(r.rating), 0) / l.length;
const FONT = "'Schibsted Grotesk', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export type CardData = {
  name: string; web: string; path: string; verified: boolean;
  customer: { n: number; avg: number | null };
  employee: { n: number; avg: number | null; recommend: number | null };
};

export function cardData(c: any, reviews: any[], path: string): CardData {
  const cu = reviews.filter(r => (r.type || "customer") === "customer");
  const em = reviews.filter(r => r.type === "employee");
  const enough = (l: any[]) => l.length >= MIN_REVIEWS;
  return {
    name: c.title || c._id, web: c.website || c._id, path,
    verified: adminTouched(c) && c.claimStatus === "verified",
    customer: { n: cu.length, avg: enough(cu) ? Math.round(avgOf(cu) * 10) / 10 : null },
    employee: {
      n: em.length, avg: enough(em) ? Math.round(avgOf(em) * 10) / 10 : null,
      recommend: enough(em) ? Math.round(em.filter(r => r.recommend === "yes").length / em.length * 100) : null,
    },
  };
}

/* Five stars, filled to the score. */
function stars(avg: number, x0: number, y0: number, size: number, id: string): string {
  const pts = "12,2.8 14.8,8.7 21.2,9.5 16.5,13.9 17.7,20.3 12,17.2 6.3,20.3 7.5,13.9 2.8,9.5 9.2,8.7";
  let out = "";
  for (let i = 0; i < 5; i++) {
    const fill = Math.max(0, Math.min(1, avg - i));
    const gx = x0 + i * (size + 8);
    out += `<g transform="translate(${gx} ${y0}) scale(${size / 24})"><defs><linearGradient id="${id}${i}"><stop offset="${fill}" stop-color="#F5B301"/><stop offset="${fill}" stop-color="#D9DEE6"/></linearGradient></defs><polygon points="${pts}" fill="url(#${id}${i})"/></g>`;
  }
  return out;
}

function side(x0: number, label: string, s: { n: number; avg: number | null }, extra: string, id: string): string {
  const head = `<text x="${x0 + 40}" y="268" font-size="30" font-weight="700" fill="#5B6576" letter-spacing="1">${label.toUpperCase()}</text>`;
  if (s.avg === null) {
    const msg = s.n === 0 ? "No reviews yet" : `${s.n} review${s.n === 1 ? "" : "s"} so far`;
    return `<rect x="${x0}" y="208" width="520" height="252" rx="28" fill="#F3F5F8"/>${head}
      <text x="${x0 + 40}" y="350" font-size="44" font-weight="800" fill="#0F172A">${msg}</text>
      <text x="${x0 + 40}" y="404" font-size="26" fill="#5B6576">A score shows from ${MIN_REVIEWS} reviews</text>`;
  }
  return `<rect x="${x0}" y="208" width="520" height="252" rx="28" fill="#F3F5F8"/>${head}
    <text x="${x0 + 40}" y="372" font-size="104" font-weight="800" fill="#0F172A">${s.avg.toFixed(1)}</text>
    ${stars(s.avg, x0 + 222, 312, 40, id)}
    <text x="${x0 + 222}" y="384" font-size="28" fill="#5B6576">from ${s.n} review${s.n === 1 ? "" : "s"}</text>
    ${extra ? `<text x="${x0 + 40}" y="428" font-size="26" font-weight="700" fill="#2F5200">${x(extra)}</text>` : ""}`;
}

const MARK = `<path d="M110 0H420A110 110 0 0 1 530 110V619A40 40 0 0 1 490 659H40A40 40 0 0 1 0 619V110A110 110 0 0 1 110 0Z" fill="#ADE436"/><rect x="86" y="100" width="146" height="124" rx="30" fill="#1B2738"/><rect x="298" y="100" width="145" height="124" rx="30" fill="#1B2738"/><rect x="86" y="278" width="146" height="124" rx="30" fill="#1B2738"/><rect x="298" y="278" width="145" height="124" rx="30" fill="#fff"/><path d="M361 400H397L379.5 428Z" fill="#fff"/><rect x="86" y="459" width="146" height="124" rx="30" fill="#1B2738"/><rect x="298" y="459" width="145" height="124" rx="30" fill="#1B2738"/>`;

export function cardSvg(d: CardData): string {
  const name = x(cut(d.name, 30));
  const nameW = Math.min(cut(d.name, 30).length * 31, 820);
  const ver = d.verified
    ? `<g transform="translate(${64 + nameW + 24} 70)"><rect width="196" height="52" rx="26" fill="#EAF7CF"/><path d="M22 27l8 8 16-17" stroke="#2F5200" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><text x="58" y="35" font-size="26" font-weight="700" fill="#2F5200">Verified</text></g>`
    : "";
  const rec = d.employee.recommend !== null ? `${d.employee.recommend}% would recommend working here` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="${FONT}" role="img" aria-label="${x(cardTitle(d))}">
  <title>${x(cardTitle(d))}</title>
  <rect width="1200" height="630" rx="0" fill="#FFFFFF"/>
  <text x="64" y="112" font-size="56" font-weight="800" fill="#0F172A">${name}</text>${ver}
  <text x="64" y="166" font-size="28" fill="#5B6576">${x(cut(d.web, 48))} · What customers and employees say</text>
  ${side(64, "Customers", d.customer, "", "c")}
  ${side(616, "Employees", d.employee, rec, "e")}
  <rect y="500" width="1200" height="130" fill="#1B2738"/>
  <g transform="translate(64 526) scale(0.118)">${MARK}</g>
  <text x="148" y="562" font-size="32" font-weight="800" fill="#FFFFFF">Know The Company</text>
  <text x="148" y="600" font-size="22" fill="#C9D3E1">knowthecompany.com${x(cut(d.path, 30))}</text>
  <text x="1136" y="562" font-size="20" fill="#C9D3E1" text-anchor="end">Scores come only from published reviews.</text>
  <text x="1136" y="596" font-size="20" fill="#C9D3E1" text-anchor="end">Companies can’t pay to change them.</text>
</svg>`;
}

/* One line for share previews and alt text. */
export function cardTitle(d: CardData): string {
  const parts = [
    d.customer.avg !== null ? `customers ${d.customer.avg.toFixed(1)} out of 5 (${d.customer.n} reviews)` : "",
    d.employee.avg !== null ? `employees ${d.employee.avg.toFixed(1)} out of 5 (${d.employee.n} reviews)` : "",
  ].filter(Boolean);
  return parts.length ? `${d.name} on Know The Company: ${parts.join(", ")}` : `${d.name} on Know The Company`;
}
export const cardUrl = (slug: string) => `${ORIGIN}/card/${slug}.svg`;
