import { queryItems, insertItem, updateItem, removeItem } from "/js/wix/items.js";
import { toItem } from "/js/wix/items-core.js";
import { imgSrc, imgRatio } from "/js/wix/media.js";
import { wixRequest, accessToken } from "/js/wix/client.js";
import { WIX_CLIENT_ID } from "/js/wix/config.js";
import { subscribeMember, getMemberState, login as memberLogin, register as memberRegister, verifyEmail as memberVerify, logout as memberLogout } from "/js/wix/member-store.js";

const COUNTRY = {"AE": "United Arab Emirates", "AR": "Argentina", "AT": "Austria", "AU": "Australia", "BD": "Bangladesh", "BE": "Belgium", "BG": "Bulgaria", "BM": "Bermuda", "BR": "Brazil", "CA": "Canada", "CH": "Switzerland", "CL": "Chile", "CN": "China", "CO": "Colombia", "CY": "Cyprus", "CZ": "Czechia", "DE": "Germany", "DK": "Denmark", "EE": "Estonia", "EG": "Egypt", "ES": "Spain", "ET": "Ethiopia", "FI": "Finland", "FR": "France", "GB": "United Kingdom", "Global": "Global", "HK": "Hong Kong", "HU": "Hungary", "ID": "Indonesia", "IE": "Ireland", "IL": "Israel", "IN": "India", "IS": "Iceland", "IT": "Italy", "JP": "Japan", "KE": "Kenya", "KR": "South Korea", "KW": "Kuwait", "LI": "Liechtenstein", "LK": "Sri Lanka", "LT": "Lithuania", "LU": "Luxembourg", "MA": "Morocco", "MX": "Mexico", "MY": "Malaysia", "NG": "Nigeria", "NL": "Netherlands", "NO": "Norway", "NZ": "New Zealand", "PA": "Panama", "PE": "Peru", "PH": "Philippines", "PK": "Pakistan", "PL": "Poland", "PT": "Portugal", "QA": "Qatar", "RO": "Romania", "RU": "Russia", "SA": "Saudi Arabia", "SE": "Sweden", "SG": "Singapore", "SK": "Slovakia", "TG": "Togo", "TH": "Thailand", "TR": "Türkiye", "TW": "Taiwan", "US": "United States", "UY": "Uruguay", "VN": "Vietnam", "ZA": "South Africa"};
const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

/* ---------- page addresses ----------
   Every page has a clean address, such as /company/future-topper or /pricing. The site runs on Wix's
   server hosting (the astro/ folder): the server answers every address with this app and the page's
   own title, description and canonical tag, and the app reads the page from the address. Old links
   still work: /#route and /page.html addresses are moved to the clean one. */
const PAGE_ROUTES = ['categories', 'search', 'tools', 'why-list', 'add', 'claim', 'list', 'dashboard', 'login', 'business-login', 'my-reviews', 'jobs', 'guidelines', 'blog', 'write-for-us', 'about', 'contact', 'help', 'terms', 'privacy', 'pricing', 'refunds'];
const PAGE_TITLES = { categories: 'All categories', search: 'Search companies', tools: 'Free tools', 'why-list': 'Why list your company', add: 'Add a company', claim: 'Claim your company page', list: 'List your company', dashboard: 'Company dashboard', login: 'Log in', 'business-login': 'Company login', 'my-reviews': 'My reviews', jobs: 'Jobs', guidelines: 'How Know The Company works', blog: 'Blog for companies', 'write-for-us': 'Write for us', about: 'About us', contact: 'Contact us', help: 'Help centre', terms: 'Terms of use', privacy: 'Privacy policy', pricing: 'Plans and pricing', refunds: 'Refunds and cancellations' };
const PATH_KINDS = [['company', 'co-'], ['category', 'cat-'], ['blog', 'blog-'], ['tools', 'tool-']];
function routeOfPath(path) {
  let p = path; try { p = decodeURIComponent(path); } catch (e) {}
  p = p.replace(/\.html$/, '').replace(/\/+$/, '') || '/';
  if (p === '/' || p === '/index') return 'home';
  for (const [dir, pre] of PATH_KINDS) { const m = p.match(new RegExp('^/' + dir + '/([a-z0-9-]+)$')); if (m) return pre + m[1]; }
  const m = p.match(/^\/([a-z-]+)$/);
  return m && (PAGE_ROUTES.includes(m[1]) || m[1] === 'sample') ? m[1] : 'not-found';
}
const curRoute = () => location.hash.length > 1 ? location.hash.slice(1) : routeOfPath(location.pathname);
function routeOfHref(href) {
  if (!href) return '';
  if (href[0] === '#') return href.slice(1) || 'home';
  try { const u = new URL(href, location.href); if (u.origin !== location.origin) return ''; return u.hash.length > 1 ? u.hash.slice(1) : routeOfPath(u.pathname); } catch (e) { return ''; }
}
function urlFor(r) {
  if (!r || r === 'home') return '/';
  if (r === 'sample') return '/list';
  for (const [dir, pre] of PATH_KINDS) if (r.startsWith(pre) && /^[a-z0-9-]+$/.test(r.slice(pre.length))) return '/' + dir + '/' + r.slice(pre.length);
  if (PAGE_ROUTES.includes(r)) return '/' + r;
  if (r === 'not-found') return location.pathname;
  return '/#' + r;
}
const isRoute = r => r === 'home' || r === 'sample' || PAGE_ROUTES.includes(r) || r.startsWith('invite-') || r.startsWith('join-team-') || !!(BYID[r] || CATBYID[r] || POSTBYID[r] || TOOLBYID[r]);
/* Swap the address bar to the page's clean address (keeps any ?query). */
function canonicalUrl() {
  const u = urlFor(curRoute());
  if (location.pathname + location.hash === u) return;
  const k = u.indexOf('#');
  history.replaceState(history.state, '', k < 0 ? u + location.search : u.slice(0, k) + location.search + u.slice(k));
}
function navigate(r, replace) {
  history[replace ? 'replaceState' : 'pushState'](null, '', urlFor(r));
  routeChanged();
}
/* Links are written as href="#route" in the views; point them at the real address so people and search
   engines see it, and handle clicks without reloading the page. */
function realLinks(root) {
  if (!root || !root.querySelectorAll) return;
  const list = root.matches && root.matches('a[href^="#"]') ? [root] : [];
  root.querySelectorAll('a[href^="#"]').forEach(a => list.push(a));
  for (const a of list) { const r = a.getAttribute('href').slice(1); if (r && isRoute(r)) { const u = urlFor(r); if (!u.startsWith('/#')) a.setAttribute('href', u); } }
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initials = n => String(n || '?').replace(/[^A-Za-z0-9 ]/g,' ').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase() || String(n || '?')[0];

COUNTRY.WW = 'Online / worldwide';

/* ---------- trust ----------
   Signed-in members can insert items (a review, a missing company) but only the site's admins can edit them
   afterwards. Wix stamps a new item with the same created and updated time, so an item a member inserted and
   nobody on the team has touched since still has equal times. Reviews go live as soon as they are posted, but
   anything an item claims that only the team may decide (a review's "Proof checked" or "Work email verified"
   label or a reply stored on it; a company's verified status, plan, owners or employer page) is ignored until
   an admin has edited it. Items the admin account inserted are trusted. */
const ADMIN_ID = 'c0f544a7-207e-490b-b7d9-830ef39f49c7';
const tms = d => { const v = d && typeof d === 'object' && !(d instanceof Date) && '$date' in d ? d.$date : d; const t = v instanceof Date ? v.getTime() : Date.parse(v); return isNaN(t) ? 0 : t; };
const adminTouched = it => !!it && (it._team === true || it._owner === ADMIN_ID || tms(it._updatedDate) > tms(it._createdDate));
const validRating = n => Number.isInteger(Number(n)) && Number(n) >= 1 && Number(n) <= 5;
/* When two companies share an address, the one the team created or edited wins, then the oldest, so a
   member can add a company but can't take over the page of one that already exists. Same rule as lib/data.ts. */
function dedupeCos(items) {
  const best = new Map();
  const better = (a, b) => adminTouched(a) !== adminTouched(b) ? adminTouched(a) : tms(a._createdDate) < tms(b._createdDate);
  for (const it of items) { const k = it.slug || slug(it.title || it._id); const p = best.get(k); if (!p || better(it, p)) best.set(k, it); }
  const keep = new Set(best.values());
  return items.filter(it => keep.has(it));
}
/* A company its owner listed goes live once its plan is set up or the team approves it (either one marks
   it as touched by the team). Until then only the member who listed it sees it. Same rule as lib/data.ts. */
const awaitingCo = it => !!it && it.addedBy === 'owner' && !adminTouched(it);
const trustedCo = it => adminTouched(it) ? it : { ...it, claimStatus: 'none', verifiedVia: '', plan: 'none', ownerMemberIds: [], employerPage: null, warning: null, logo: '' };
/* The company's logo: its official icon, imported by the team into the site's media library, or one its owners set. */
const logoOf = c => { const u = String((c && c.raw && c.raw.logo) || ''); return /^https:\/\/[^\s"'<>]+$/.test(u) ? u : ''; };

/* ---------- companies, from the Wix CMS (collection "Companies") ---------- */
const mkCo = raw => { const it = trustedCo(raw); return {
  wid: it._id, pending: awaitingCo(raw), name: it.title || it._id, web: it.website || it._id, cat: it.category || 'Other', cc: it.country || 'WW', bio: it.bio || '',
  added: it.addedBy === 'reviewer' ? 1 : it.addedBy === 'owner' ? 2 : 0, country: COUNTRY[it.country] || it.country || COUNTRY.WW,
  id: 'co-' + (it.slug || slug(it.title || it._id)), catId: 'cat-' + slug(it.category || 'Other'), raw: it
}; };
/* Keeps the whole site out of search engines until launch. Set to false to let pages be indexed
   (and remove the robots meta tag in index.html). */
const SITE_NOINDEX = false; /* the site is open to search engines (launched 11 Nov 2026) */
let COS = [], CATS = [], BYID = {}, BYWID = {}, CATBYID = {}, FORM_CATS = [];
/* Every category a company can pick when it's listed or added. Categories already in use are merged in,
   and "Other" always comes last. */
/* One line about each category, shown under its heading and used as its search description. */
const CAT_INTROS = {
  'Fintech & Banking': 'Reviews of payment apps, digital banks and lending startups: how they handle your money, your KYC and your complaints, and how they treat their teams.',
  'Education & E-learning': 'Reviews of online courses, tutoring apps and learning platforms from students, parents and the teachers and staff who work there.',
  'Jobs & Freelancing': 'Reviews of job boards, freelance marketplaces and HR and payroll software, from people hiring, people looking for work and the staff behind them.',
  'Mobility & Logistics': 'Reviews of ride-hailing apps, car marketplaces, scooters, buses and delivery networks: pricing, safety, support and what it is like to drive or work for them.',
  'Crypto Exchanges': 'Reviews of crypto exchanges and wallets: fees, withdrawals, frozen accounts and support, plus what employees say about the company behind the app.',
  'E-commerce & Marketplaces': 'Reviews of online shops and resale marketplaces: deliveries, returns, refunds and seller support, and how the companies treat their staff.',
  'Technology & Software': 'Reviews of software companies, from password managers and developer tools to privacy apps: product quality, billing, support and working culture.',
  'Social Media & Entertainment': 'Reviews of social apps, creator platforms, streaming services and game studios, from users, creators and the people who build them.',
  'Stock Brokers & Investing': 'Reviews of brokers and investing apps: charges, order execution, withdrawals and customer support, and what working there is really like.',
  'Real Estate': 'Reviews of property portals, brokers and coworking companies: whether listings match reality, deposits, service, and what employees say.',
  'Travel & Hospitality': 'Reviews of booking sites, bus and train apps, hotel chains and tour platforms: cancellations, refunds, hidden fees and support when plans go wrong.',
  'Web Hosting & Website Builders': 'Reviews of web hosts and website builders: uptime, speed, renewal prices, migrations and support, from site owners and the teams who run them.',
  'Food & Delivery': 'Reviews of food and grocery delivery apps: order accuracy, delivery times and refunds, and how riders and staff are treated.',
  'Consumer Brands': 'Reviews of direct-to-consumer brands in food, beauty and home: product quality, delivery and returns, and life inside the company.',
  'Health & Wellness': 'Reviews of health apps, doctor booking platforms, online pharmacies and wellbeing services: quality of care, privacy, billing and support.',
  'Consumer Electronics': 'Reviews of phone, audio and wearable brands: build quality, warranty claims and service centres, and what employees say about working there.',
  'IT Services & Consulting': 'Reviews of IT services and consulting firms: what clients say about delivery and support, and what engineers say about projects, appraisals, bench time and work-life balance.',
  'Accounting & Tax': 'Reviews of accounting, GST billing and tax filing software and services: accuracy, ease of use, pricing and support, plus what their teams say about working there.',
  'Insurance': 'Reviews of insurers and insurance marketplaces: buying a policy, claim settlement, renewals and support, and how the companies treat their staff.',
  'Beauty & Personal Care': 'Reviews of skincare, makeup and grooming brands: product quality, delivery, returns and support, and what it is like to work for them.',
  'Fashion & Apparel': 'Reviews of clothing and fashion brands: fit, quality, delivery, returns and refunds, and how the brands treat their teams.',
  'Jewellery & Accessories': 'Reviews of jewellery and accessories brands: product quality, certification, delivery and after-sales service, and what employees say.',
  'Home & Furniture': 'Reviews of mattress, furniture and home brands: product quality, delivery, installation, returns and warranty claims, and life inside the company.',
  'Groceries & Retail': 'Reviews of grocery delivery and retail apps: freshness, delivery times, refunds and support, plus what delivery partners and staff say.',
  'Food & Beverage Brands': 'Reviews of packaged food, snack and drink brands: taste, ingredients, delivery and support, and how the brands treat their teams.',
  'Home Services & Repairs': 'Reviews of home services apps and companies: cleaning, repairs, salon and appliance service, pricing, punctuality, and what service partners say.',
  'Sports & Fitness': 'Reviews of gyms, fitness studios and workout apps: trainers, facilities, memberships and cancellations, and what it is like to work there.',
  'Pharmacy & Medicines': 'Reviews of online pharmacies and medicine delivery apps: genuine medicines, delivery, refunds and support, and how they treat their staff.',
  'Automotive': 'Reviews of vehicle makers and automotive companies, including electric scooters: build quality, service centres, software updates and support, and what employees say.',
};
const catIntro = name => CAT_INTROS[name] || `Customer and employee reviews of ${name} companies: how they treat the people they serve and the people who work for them.`;
/* Search descriptions for the fixed pages. */
const PAGE_DESCS = {
  categories: 'Browse startups and growing companies by category, from fintech and education to travel, crypto and food delivery, and read what customers and employees say.',
  search: 'Search Know The Company for any startup or growing company by name or website, and read its customer and employee reviews.',
  tools: 'Free tools for your career and business: compare job offers, work out a salary hike, set a freelance rate, and estimate gratuity and HRA in India.',
  'why-list': 'Why companies list on Know The Company: a verified page, public replies to reviews, and an honest record that customers, job seekers and AI search can find.',
  add: 'Can\'t find a company? Add it to Know The Company and write the first review. The company can claim its page later.',
  claim: 'Claim your company’s page on Know The Company. Verify it in minutes, reply to customer and employee reviews and set up your employer page.',
  list: 'Add your company to Know The Company. Reply to customer and employee reviews and show job seekers what working with you is like.',
  dashboard: 'Manage your company page on Know The Company: your details, replies to reviews and your listing plan.',
  login: 'Log in or create a free Know The Company account to write customer and employee reviews.',
  'business-login': 'Company login for Know The Company. Manage your company page, reply to reviews and check your plan.',
  'my-reviews': 'See the reviews you have written on Know The Company and keep track of replies.',
  jobs: 'Jobs at companies you can check first. Job listings are coming to Know The Company soon; until then, read employee reviews before you apply.',
  guidelines: 'How Know The Company works: who can write a review, what we take down and why, how companies reply, and why paying never changes a rating.',
  'write-for-us': 'Write for Know The Company. We publish practical guest articles for business owners on reviews, customers, hiring and growth.',
  about: 'Know The Company is an open review site where customers and employees review the same startups and growing companies, side by side on one page.',
  contact: 'Contact Know The Company about reviews, company listings, payments or anything else. We usually reply within 2 working days.',
  help: 'Help for reviewers, employees and companies: writing a review, staying anonymous as an employee, claiming a company page and paid plans.',
  terms: 'The terms for using Know The Company: who can write reviews, what they must be, company pages, paid listings and what we can remove.',
  privacy: 'How Know The Company collects, uses and protects your data: what we collect, what we never do with it, cookies, and your rights.',
  pricing: 'Know The Company plans and pricing: Basic, Plus and Business listings. Reading and writing reviews is free. Companies pay for listing tools in INR or USD, and paying never changes a rating.',
  refunds: 'Refunds and cancellations for paid Know The Company listings: how autopay works, how to cancel a plan and when a refund applies.',
  'tool-offer': 'Compare two job offers side by side on salary, bonus, benefits and costs, and see which one is worth more each year. Free, no sign-up.',
  'tool-hike': 'Salary hike calculator: work out your new salary from a percentage hike, or the hike behind a new offer, in any currency. Free, no sign-up.',
  'tool-rate': 'Freelance rate calculator: find the hourly and day rate you need to hit your income target after business costs, time off and non-billable hours.',
  'tool-gratuity': 'Gratuity calculator for India: estimate the gratuity you get on leaving a job, using the 15/26 formula. Free, no sign-up.',
  'tool-hra': 'HRA exemption calculator for India: see how much of your house rent allowance is tax-free under the old tax regime. Free, no sign-up.'
};
const ALL_CATS = ['Accounting & Tax', 'Advertising & Marketing', 'Aerospace & Defense', 'Agriculture & Farming', 'Airlines', 'Architecture & Interior Design', 'Automotive', 'Beauty & Personal Care', 'Chemicals & Materials', 'Construction & Engineering', 'Consumer Brands', 'Consumer Electronics', 'Crypto Exchanges', 'E-commerce & Marketplaces', 'Education & E-learning', 'Energy & Utilities', 'Events & Weddings', 'Fashion & Apparel', 'Fintech & Banking', 'Food & Beverage Brands', 'Food & Delivery', 'Gaming', 'Government & Public Services', 'Groceries & Retail', 'Health & Wellness', 'Healthcare & Hospitals', 'Home & Furniture', 'Home Services & Repairs', 'HR & Staffing', 'Industrial & Manufacturing', 'Insurance', 'IT Services & Consulting', 'Jewellery & Accessories', 'Jobs & Freelancing', 'Legal Services', 'Media & News', 'Mining & Metals', 'Mobility & Logistics', 'Non-profits & NGOs', 'Pets & Animal Care', 'Pharmacy & Medicines', 'Printing & Packaging', 'Professional Services', 'Real Estate', 'Restaurants & Cafés', 'Security Services', 'Semiconductors & Hardware', 'Social Media & Entertainment', 'Sports & Fitness', 'Stock Brokers & Investing', 'Technology & Software', 'Telecom & Internet', 'Textiles', 'Travel & Hospitality', 'Web Hosting & Website Builders'];
const formCats = () => [...new Set(ALL_CATS.concat(CATS.map(k => k.name)))].filter(n => n !== 'Other').sort((a, b) => a.localeCompare(b)).concat('Other');
const CLAIMS = {};
const SB_CATS = [];
const ensureCat = (name, id) => { let k = CATBYID[id]; if (!k) { const w = name.replace(/&/g, '').split(/\s+/).filter(Boolean); k = { name, id, items: [], short: (w[0][0] + (w[1] ? w[1][0] : '')).toUpperCase(), tone: (CATS.length % 6) + 1 }; CATS.push(k); CATBYID[id] = k; } return k; };
function indexCompanies(items) {
  const me = S.user ? S.user.id : '';
  COS = dedupeCos(items).filter(it => !awaitingCo(it) || (me && it._owner === me)).map(mkCo);
  CATS = []; CATBYID = {};
  COS.forEach(c => { let k = CATS.find(x => x.name === c.cat); if (!k) { k = { name: c.cat, id: c.catId, items: [] }; CATS.push(k); } k.items.push(c); });
  CATS.forEach((k, i) => { const w = k.name.replace(/&/g,'').split(/\s+/).filter(Boolean); k.short = (w[0][0] + (w[1] ? w[1][0] : '')).toUpperCase(); k.tone = (i % 6) + 1; });
  BYID = Object.fromEntries(COS.map(c => [c.id, c]));
  BYWID = Object.fromEntries(COS.map(c => [c.wid, c]));
  CATBYID = Object.fromEntries(CATS.map(c => [c.id, c]));
  FORM_CATS = formCats();
  for (const k of Object.keys(CLAIMS)) delete CLAIMS[k];
  COS.forEach(c => { const s = c.raw.claimStatus; if (s === 'verified' || s === 'pending') CLAIMS[c.id] = { verified: s === 'verified' ? (c.raw.verifiedVia || 'email') : 'pending', plan: ['plus', 'business'].includes(c.raw.plan) ? c.raw.plan : 'basic' }; });
  computeFeatured();
}
function addCompanyLocal(it) { const c = mkCo(it); COS.push(c); BYID[c.id] = c; BYWID[c.wid] = c; ensureCat(c.cat, c.catId).items.push(c); FORM_CATS = formCats(); return c; }
/* A company's item id is its website (domain, plus any path), so Wix itself refuses a second company with the same website. */
const companyIdFor = w => String(w || '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/\//g, '-').slice(0, 120);
const uniqueSlug = name => { const b = slug(name) || 'company'; let s = b, n = 2; while (BYID['co-' + s]) s = b + '-' + n++; return s; };

/* ---------- browser storage (best effort, for small per-visitor conveniences only) ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

/* ---------- published reviews, from the Wix CMS (collection "Reviews"; drafts are never returned to visitors) ---------- */
let REVIEWS = {}, EMP = {};
const reviewsFor = id => REVIEWS[id] || [];
const avgOf = list => { const r = list.filter(x => x.rating); return r.length ? r.reduce((s, x) => s + x.rating, 0) / r.length : 0; };
const empData = id => { const d = EMP[id] || {}; return { reviews: d.reviews || [], salaries: d.salaries || [], interviews: d.interviews || [] }; };
const empBucket = id => { const d = EMP[id] = EMP[id] || {}; d.reviews = d.reviews || []; d.salaries = d.salaries || []; d.interviews = d.interviews || []; return d; };
const recPct = list => list.length ? Math.round(list.filter(r => r.rec === 'yes').length / list.length * 100) : 0;
const EMP_ZERO = () => ({ overall: 0, pay: 0, culture: 0, mgmt: 0, growth: 0, wlb: 0 });
const monthOf = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }); };
function indexReviews(items) {
  REVIEWS = {}; EMP = {};
  /* A review's _owner is set by Wix from the signed-in account and can't be faked, and ownerMemberIds can
     only be set by the site admin. So any review written by an account that manages a company is left out
     of every page and rating, however it was posted, and an account that becomes a company account stops
     counting as a reviewer from that moment. */
  const owners = new Set(COS.flatMap(c => c.raw.ownerMemberIds || []));
  /* Reviews normally come from the site's server (/api/data), already cleaned: no member IDs, ratings 1 to 5,
     one review per person per company. The same rules run here too, for the fallback read and for the
     signed-in member's own reviews merged in by applyData. */
  items = mergeMine(items).sort((a, b) => String(b._createdDate || '').localeCompare(String(a._createdDate || '')));
  const seen = new Set();
  for (const r of items) {
    if (r._owner && owners.has(r._owner)) continue;
    if (r.type === 'interview') continue; /* interviews section removed */
    if (!validRating(r.rating)) continue;
    if (r._owner && r._owner !== ADMIN_ID) { const key = r._owner + '|' + (typeof r.company === 'object' && r.company ? r.company._id : r.company) + '|' + (r.type || 'customer'); if (seen.has(key)) continue; seen.add(key); }
    const team = adminTouched(r); /* labels and replies only count once the team has set them: see "trust" above */
    const c = BYWID[typeof r.company === 'object' && r.company ? r.company._id : r.company]; if (!c) continue;
    const imported = team && r.importedFrom ? { from: String(r.importedFrom), date: monthOf(r.originalDate || '') } : null; /* a past review a Plus company shared, confirmed with its writer by the team */
    const base = { wid: r._id, by: r._owner || (MINE.has(r._id) && S.user ? S.user.id : ''), type: r.type || 'customer', imported, date: imported && imported.date ? imported.date : monthOf(r._createdDate), ym: String((imported && r.originalDate) || r._createdDate || '').slice(0, 7), rating: Number(r.rating) || 0, reply: team ? r.reply || '' : '', replyFrom: c.name, verified: team && !!r.workEmailVerified };
    if (r.type === 'employee') empBucket(c.id).reviews.push({ ...base, status: r.employmentStatus || 'Employee', title: r.jobTitle || '', loc: r.location || '', years: r.tenure || '', sub: r.subRatings || {}, pros: r.pros || '', cons: r.cons || '', advice: r.advice || '', rec: r.recommend === 'yes' ? 'yes' : 'no', named: !r.anonymous && !!r.displayName, name: r.anonymous ? '' : (r.displayName || '') });
    else if (r.type === 'interview') empBucket(c.id).interviews.push({ ...base, role: r.jobTitle || '', outcome: r.interviewOutcome || '', diff: r.interviewDifficulty || '', exp: r.interviewExperience || '', process: r.body || '', questions: r.interviewQuestions || '' });
    else (REVIEWS[c.id] = REVIEWS[c.id] || []).push({ ...base, name: r.displayName || 'Reviewer', title: r.title || '', body: r.body || '', proof: team && !!r.proofChecked, invited: !!r.invited });
  }
}
async function fetchAll(collectionId, filters) {
  const out = []; let skip = 0;
  for (let i = 0; i < 20; i++) {
    const page = await queryItems(collectionId, filters ? { limit: 1000, skip, filters } : { limit: 1000, skip });
    out.push(...page.items);
    if (!page.hasNext || !page.items.length) break;
    skip += page.items.length;
  }
  return out;
}
let LOADED = false, LOAD_ERR = '';
/* Companies and reviews load together, up to 1000 a request. A copy of the last load is kept in this
   browser so a repeat visit draws straight away while fresh data loads behind it. */
const DATA_KEY = 'ktc_data_v1';
let DATA_SIG = '';
const sigOf = str => { let h = 5381; for (let i = 0; i < str.length; i++) h = (h * 33 + str.charCodeAt(i)) >>> 0; return h.toString(36) + ':' + str.length; };
function applyData(cos, rvs, own) { LAST = { cos, rvs, own: own || [] }; indexCompanies(cos); indexReviews(rvs.slice()); applyOwner(own || []); LOADED = true; LOAD_ERR = ''; }

/* ---------- owner-written content (collection "OwnerContent") ----------
   Verified owners write their own profile, employer page, photos, cover and replies as items in OwnerContent.
   Any member can add an item there, and only its author can change or remove it. An item counts only when its
   author is listed in the company's ownerMemberIds, which only the site admin can set, so nobody can edit a
   company they don't own, and ratings, plans and verification stay admin-only in Companies. */
const OWN_KEYS = { about: 'about', founded: 'founded', size: 'teamSize', hq: 'headquarters', web2: 'website2', services: 'services', hours: 'hours', phone: 'phone', email: 'publicEmail', address: 'address', socials: 'socials', updates: 'updates', logo: 'logo', employerPage: 'employerPage', locations: 'locations' };
const PROF = {}, MEDIA = {};
const ownsCo = (c, member) => !!(c && member && (c.raw.ownerMemberIds || []).includes(member));
/* Reviewer and company accounts are kept apart. A company account (one that owns or has claimed a company)
   can't post reviews, and an account that has posted reviews can't claim or manage a company until that
   reviewer account is deleted. */
const isCompanyAcct = () => !!S.user && (COS.some(c => ownsCo(c, S.user.id)) || (S.myClaims || []).some(cl => cl.status !== 'rejected'));
const myReviewCount = () => {
  if (!S.user) return 0;
  const id = S.user.id; let n = 0;
  Object.values(REVIEWS).forEach(l => l.forEach(r => { if (r.by === id) n++; }));
  Object.values(EMP).forEach(d => ['reviews', 'interviews'].forEach(k => (d[k] || []).forEach(r => { if (r.by === id) n++; })));
  return n + PENDING.filter(p => p.member === id).length;
};
const reviewBlock = () => isCompanyAcct() ? `<div class="box soft" style="gap:10px"><h2 style="font-size:20px">Company accounts can’t write reviews</h2><p>You’re signed in with a company account. To keep reviews independent, company accounts can only reply to them. To review a company as a customer or employee, log out and use a separate personal account.</p><div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn p" href="#dashboard">Open dashboard</a><button class="btn g" type="button" data-act="logout">Log out</button></div></div>` : '';
const claimBlock = () => (S.user && !isCompanyAcct() && myReviewCount()) ? `<div class="box soft" style="gap:10px"><h2 style="font-size:20px">This account has written reviews</h2><p>Reviewer and company accounts are kept separate, so nobody can review businesses and run a company page from the same account. To claim or manage a company, first delete this reviewer account from My reviews. Then create a new account with your work email and claim your company.</p><div><a class="btn p" href="#my-reviews">Go to My reviews</a></div></div>` : '';
const latest = list => list.sort((a, b) => String(b._updatedDate || '').localeCompare(String(a._updatedDate || '')))[0];
function applyOwner(items) {
  for (const k of Object.keys(PROF)) delete PROF[k];
  for (const k of Object.keys(MEDIA)) delete MEDIA[k];
  const prof = {};
  for (const it of items) {
    const c = BYWID[it.company]; if (!c || !ownsCo(c, it._owner)) continue;
    if (it.kind === 'profile') (prof[c.wid] = prof[c.wid] || []).push(it);
    else if (it.kind === 'reply' && it.text) {
      const pools = [REVIEWS[c.id] || [], empData(c.id).reviews];
      for (const pool of pools) { const r = pool.find(x => x.wid === it.review); if (r && !r.reply) { r.reply = it.text; r.replyWid = it._id; } }
    }
  }
  for (const [wid, list] of Object.entries(prof)) {
    const it = latest(list), c = BYWID[wid], d = it.data || {};
    PROF[wid] = { id: it._id, owner: it._owner };
    for (const [k, raw] of Object.entries(OWN_KEYS)) if (d[k] !== undefined) c.raw[raw] = d[k];
  }
}
/* ---------- researched company facts ----------
   Founding year, headquarters, founders, owner, size, products, markets and official links, gathered from
   public sources by the Know The Company team and kept in data/company-facts.json. The build writes one small
   file per company to /facts/<website>.json; the server also puts the company's facts into the first page it
   sends, so that page doesn't wait for them. */
const FACTS = {};
async function loadFacts(c) {
  if (!c || FACTS[c.wid] !== undefined) return;
  const pre = document.getElementById('co-facts');
  if (pre && pre.dataset.id === c.wid) { try { FACTS[c.wid] = JSON.parse(pre.textContent); return; } catch (e) {} }
  FACTS[c.wid] = null;
  try {
    const r = await fetch('/facts/' + encodeURIComponent(c.wid) + '.json');
    if (!r.ok) return;
    FACTS[c.wid] = await r.json();
    if (curRoute() === c.id) renderKeep();
  } catch (e) {}
}
const bandText = b => { const m = String(b || '').replace(/\s/g, '').match(/^([\d,]+)[-–]([\d,]+)$/); return m ? `between ${m[1]} and ${m[2]}` : /\+$/.test(b) ? `more than ${String(b).replace(/\+$/, '')}` : String(b || ''); };
const listAnd = a => a.length < 2 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
const FACT_LINKS = [['linkedin', 'LinkedIn'], ['x', 'X'], ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['youtube', 'YouTube'], ['appStore', 'App Store'], ['playStore', 'Google Play']];
const safeUrl = u => /^https:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? u : '';
/* Questions people ask about a company, answered from its facts and its reviews here. */
function factFaq(c, f, list, er) {
  const q = [], n = c.name;
  q.push([`What does ${n} do?`, `${(f.description || c.bio || '').split(/(?<=\.)\s/)[0]}${f.products && f.products.length ? ` Its main products and services include ${listAnd(f.products.slice(0, 4))}.` : ''}`]);
  if (f.founded) q.push([`When was ${n} founded?`, `${n} was founded in ${f.founded}${f.founders && f.founders.length ? ` by ${listAnd(f.founders)}` : ''}.`]);
  if (f.hq) q.push([`Where is ${n} based?`, `${n} is headquartered in ${f.hq}.${f.markets ? ` It operates in ${f.markets}.` : ''}`]);
  if (f.parent) q.push([`Who owns ${n}?`, `${n} is owned by ${f.parent}.`]);
  else if (/^Public/.test(f.ownership || '')) q.push([`Is ${n} a public company?`, `Yes. ${n} is publicly listed${(f.ownership.match(/\(([^)]+)\)/) || [])[1] ? ` (${f.ownership.match(/\(([^)]+)\)/)[1]})` : ''}.`]);
  else if (f.ownership === 'Private') q.push([`Is ${n} a public company?`, `No. ${n} is a privately held company.`]);
  if (f.employees) q.push([`How many people work at ${n}?`, `Public sources put ${n}'s team at ${bandText(f.employees)} people.`]);
  q.push([`What do customers and employees say about ${n}?`, list.length || er.length
    ? [list.length ? `Customers rate ${n} ${avgOf(list).toFixed(1)} out of 5 from ${list.length} review${list.length === 1 ? '' : 's'}.` : '', er.length ? `Employees rate it ${avgOf(er).toFixed(1)} out of 5 from ${er.length} review${er.length === 1 ? '' : 's'}.` : ''].filter(Boolean).join(' ')
    : `There are no reviews of ${n} on Know The Company yet. If you have used ${n} or worked there, you can write the first one.`]);
  return q;
}
function factsSection(c, list, er) {
  const f = FACTS[c.wid]; if (!f) return '';
  const rows = [['Founded', f.founded], ['Headquarters', f.hq], [f.founders && f.founders.length > 1 ? 'Founders' : 'Founder', (f.founders || []).join(', ')], ['Owned by', f.parent], ['Ownership', f.parent ? '' : f.ownership], ['Employees', f.employees], ['Operates in', f.markets], ['Legal name', f.legalName]].filter(r => r[1]);
  const links = [['Website', 'https://' + c.web]].concat(FACT_LINKS.map(([k, l]) => [l, safeUrl((f.links || {})[k])])).filter(l => l[1]);
  const srcs = [...new Map((f.sources || []).filter(x => safeUrl(x.url)).map(x => [x.url, x])).values()];
  const checked = f.checked ? new Date(f.checked + 'T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '';
  return `<section class="box cofacts" aria-labelledby="facts-h"><h2 id="facts-h" style="font-size:22px">About ${esc(c.name)}</h2>
    ${f.status && f.status !== 'Active' ? `<p class="factnote">${esc(f.status)}</p>` : ''}
    ${f.description ? `<p class="lead2">${esc(f.description)}</p>` : ''}
    ${f.products && f.products.length ? `<div><h3>Products and services</h3><ul class="factchips">${f.products.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>` : ''}
    ${rows.length ? `<div><h3>At a glance</h3><dl class="factgrid">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></div>` : ''}
    <div><h3>Official links</h3><p class="factlinks">${links.map(([l, u]) => `<a href="${esc(u)}" target="_blank" rel="nofollow noopener">${esc(l)}</a>`).join('')}</p></div>
    <div><h3>Questions about ${esc(c.name)}</h3><div class="faq">${factFaq(c, f, list, er).map(([qq, a]) => `<details><summary>${esc(qq)}</summary><p>${esc(a)}</p></details>`).join('')}</div></div>
    <p class="meta" style="font-size:13px">These facts come from public sources${checked ? ` and were checked in ${checked}` : ''}. They are not written or paid for by ${esc(c.name)}. <button class="link" type="button" data-act="suggest" data-id="${c.id}" style="font-size:13px">Suggest an edit</button></p>
    ${srcs.length ? `<details class="srcs"><summary>Sources (${srcs.length})</summary><ul>${srcs.map(x => `<li><a href="${esc(x.url)}" target="_blank" rel="nofollow noopener">${esc(x.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').slice(0, 70))}</a></li>`).join('')}</ul></details>` : ''}
  </section>`;
}
/* Photos and the cover banner are larger, so they load only when a company page or the dashboard needs them. */
async function loadMedia(c) {
  if (!c || MEDIA[c.wid] || !(c.raw.ownerMemberIds || []).length) return;
  MEDIA[c.wid] = { loading: true };
  try {
    const items = (await fetchAll('OwnerContent', [{ field: 'company', op: 'eq', value: c.wid }])).filter(it => ownsCo(c, it._owner));
    const photos = items.filter(it => it.kind === 'photo' && it.src).sort((a, b) => String(a._createdDate || '').localeCompare(String(b._createdDate || '')));
    const cover = latest(items.filter(it => it.kind === 'cover' && it.src));
    c.raw.photos = photos.map(it => ({ src: it.src, wid: it._id, by: it._owner }));
    c.raw.cover = cover ? cover.src : ''; c.raw._coverWid = cover ? cover._id : '';
    MEDIA[c.wid] = { loaded: true };
    renderKeep();
  } catch (e) { MEDIA[c.wid] = { error: true }; }
}
/* Saves an owner's changes: shows them straight away, then writes them to Wix. */
function saveProf(id, own) {
  const c = BYID[id]; if (!c || !S.user) return false;
  const before = { photos: (c.raw.photos || []).slice(), coverWid: c.raw._coverWid || '' };
  const profChanged = Object.keys(own).some(k => OWN_KEYS[k]);
  for (const [k, raw] of Object.entries(OWN_KEYS)) if (own[k] !== undefined) c.raw[raw] = own[k];
  if (own.photos !== undefined) c.raw.photos = own.photos;
  if (own.cover !== undefined) c.raw.cover = own.cover;
  persistOwn(c, own, before, profChanged).catch(e => { toast('Could not save to the site: ' + errMsg(e)); });
  return true;
}
async function persistOwn(c, own, before, profChanged) {
  const me = S.user.id;
  if (profChanged) {
    const data = {}; for (const [k, raw] of Object.entries(OWN_KEYS)) if (c.raw[raw] !== undefined && c.raw[raw] !== null) data[k] = c.raw[raw];
    const p = PROF[c.wid];
    if (p && p.owner === me) await updateItem('OwnerContent', { _id: p.id, company: c.wid, kind: 'profile', data });
    else { const it = await insertItem('OwnerContent', { company: c.wid, kind: 'profile', data }); PROF[c.wid] = { id: it._id, owner: me }; }
  }
  if (own.photos !== undefined) {
    const keep = new Set(own.photos.map(x => x.wid).filter(Boolean));
    for (const x of before.photos) if (x.wid && !keep.has(x.wid)) await removeItem('OwnerContent', x.wid);
    for (const x of own.photos) if (!x.wid && x.src) { const it = await insertItem('OwnerContent', { company: c.wid, kind: 'photo', src: x.src }); x.wid = it._id; x.by = me; }
  }
  if (own.cover !== undefined) {
    if (before.coverWid) await removeItem('OwnerContent', before.coverWid);
    c.raw._coverWid = '';
    if (own.cover) { const it = await insertItem('OwnerContent', { company: c.wid, kind: 'cover', src: own.cover }); c.raw._coverWid = it._id; }
  }
}
function loadCached() {
  const c = store.get(DATA_KEY, null);
  if (!c || !Array.isArray(c.cos) || !Array.isArray(c.rvs) || Date.now() - (c.t || 0) > 7 * 864e5) return false;
  try { applyData(c.cos, c.rvs, c.own); DATA_SIG = c.sig || ''; return true; } catch (e) { return false; }
}
/* Resolves to true when what is on screen should be redrawn. */
/* The signed-in member's own reviews, read straight from Wix (members can read only their own). They mark
   which reviews on screen are theirs, show a new review before the server's one-minute cache catches up,
   and stop a second review of the same company. */
let MINE = new Set(), MINE_ITEMS = [], MINE_FOR = '';
const mergeMine = items => { const have = new Set(items.map(r => r._id)); return items.concat(MINE_ITEMS.filter(r => !have.has(r._id)).map(r => ({ ...r, _owner: '', _team: false, proofChecked: false, workEmailVerified: false, reply: '', importedFrom: '' }))); };
async function loadMine() {
  const id = S.user ? S.user.id : '';
  if (id === MINE_FOR) return false;
  MINE_FOR = id;
  try { MINE_ITEMS = id ? (await fetchAll('Reviews')).filter(r => !r._owner || r._owner === id) : []; } catch (e) { MINE_ITEMS = []; }
  MINE = new Set(MINE_ITEMS.map(r => r._id));
  if (LAST) { indexCompanies(LAST.cos); indexReviews(LAST.rvs.slice()); applyOwner(LAST.own); }
  return true;
}
const alreadyReviewed = (c, type) => MINE_ITEMS.some(r => (typeof r.company === 'object' && r.company ? r.company._id : r.company) === c.wid && (r.type || 'customer') === type);
let LAST = null;
async function fetchData(fresh) {
  try {
    const res = await fetch('/api/data' + (fresh ? '?t=' + Date.now() : ''), { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('data ' + res.status);
    const d = await res.json();
    if (!Array.isArray(d.cos) || !Array.isArray(d.rvs)) throw new Error('data shape');
    const norm = l => (l || []).map(x => toItem(x, { imgSrc, imgRatio }));
    return { cos: norm(d.cos), rvs: norm(d.rvs), own: norm(d.own) };
  } catch (e) {
    /* Fallback: read Wix directly. Reviews then come back only if the collection lets visitors read them. */
    const ownQ = kind => fetchAll('OwnerContent', [{ field: 'kind', op: 'eq', value: kind }]).catch(() => []);
    const [cos, rvs, profs, replies] = await Promise.all([fetchAll('Companies'), fetchAll('Reviews').catch(() => []), ownQ('profile'), ownQ('reply')]);
    return { cos, rvs, own: profs.concat(replies) };
  }
}
async function loadData(fresh) {
  try {
    if (fresh) MINE_FOR = '__';
    await loadMine();
    const { cos, rvs, own } = await fetchData(fresh);
    const json = JSON.stringify({ cos, rvs, own }), sig = sigOf(json);
    const changed = sig !== DATA_SIG || !LOADED;
    if (changed) applyData(cos, rvs, own);
    DATA_SIG = sig;
    try { localStorage.setItem(DATA_KEY, '{"t":' + Date.now() + ',"sig":"' + sig + '",' + json.slice(1)); } catch (e) {}
    return changed;
  } catch (e) {
    if (!LOADED) { LOAD_ERR = e && e.message ? e.message : String(e); return true; }
    return false;
  }
}

/* ---------- page state ---------- */
const S = { heroTab: 'companies', jobFilter: { q: '', type: '', mode: '' }, jobPending: null, blogCat: 'All', pitchSent: false, contactSent: false, user: null, memberLoading: true, auth: { mode: 'signin', error: '' }, notice: '', returnTo: '', draft: null, q: '', catFilter: { country: '', text: '', sort: 'name' }, rating: 0, listStep: 0, listData: {}, claim: '', dashTab: 'overview', copied: false, coTab: '', returnTab: '', emp: EMP_ZERO(), formCache: {} };
/* A review draft survives a sign-in that leaves the site (Google, Facebook): it is kept in this tab's session
   storage until the review is posted. */
const setDraft = d => { S.draft = d; try { if (d) sessionStorage.setItem('ktc_draft', JSON.stringify(d)); else sessionStorage.removeItem('ktc_draft'); } catch (e) {} };
try { const d = JSON.parse(sessionStorage.getItem('ktc_draft') || 'null'); if (d && d.cid) S.draft = d; } catch (e) {}
function syncUser(s) {
  const m = s.member || {};
  S.memberLoading = !!s.loading;
  const prev = S.user ? S.user.id : '';
  S.user = s.loggedIn ? { type: 'reviewer', id: m.id || '', email: m.loginEmail || '', name: m.displayName || m.firstName || (m.loginEmail ? m.loginEmail.split('@')[0] : 'Member') } : null;
  if ((S.user ? S.user.id : '') !== prev) S.myClaims = undefined;
}

/* ---------- icons ---------- */
const STAR = (fill, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill ? 'var(--star)' : 'none'}" stroke="${fill ? 'var(--star-line)' : 'var(--soft)'}" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.8z"/></svg>`;
const starRow = (r, size) => `<span class="stars" role="img" aria-label="${r} out of 5 stars">${[1,2,3,4,5].map(n => STAR(n <= Math.round(r), size)).join('')}</span>`;
const TICK = (c = 'var(--accent)') => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

/* ---------- reusable bits ---------- */
const IC = {
  pin: '<path d="M12 21s-7-6.3-7-12a7 7 0 0 1 14 0c0 5.7-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  home: '<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/>',
  cash: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  bag: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 13h18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.8z"/>',
};
const ic = (k, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg>`;
const scoreOf = c => { const l = reviewsFor(c.id), er = empData(c.id).reviews; const all = l.length ? l : er; return all.length ? avgOf(all) : 0; };
const rBadge = c => { const s = scoreOf(c); return s ? `<span class="rbadge" aria-label="Rated ${s.toFixed(1)} out of 5">${s.toFixed(1)}<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${IC.star}</svg></span>` : '<span class="rbadge none">Not rated</span>'; };
const qStats = c => { const ed = empData(c.id); const items = [['customers', reviewsFor(c.id).length + ed.reviews.length, 'Reviews']].filter(x => x[1]); if (!items.length) return ''; return `<div class="qstats" style="grid-template-columns:repeat(${items.length},1fr)">${items.map(([k, n, l]) => `<a href="#${c.id}" data-act="cotab-link" data-tab="${k}"><b>${n}</b><span>${l}</span></a>`).join('')}</div>`; };
const toneOf = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 6 + 1; };
const avatar = (c, size = 48, fs = 16) => { const k = toneOf(c.name), L = logoOf(c); if (L) return `<span class="avatar logo" aria-hidden="true" style="width:${size}px;height:${size}px;border-radius:${Math.round(size * .28)}px"><img src="${esc(L)}" alt="" loading="lazy" decoding="async"></span>`; return `<span class="avatar" aria-hidden="true" style="width:${size}px;height:${size}px;font-size:${fs}px;border-radius:${Math.round(size * .28)}px;background:var(--t${k});color:var(--t${k}i)">${esc(initials(c.name))}</span>`; };
function ratingLine(c) {
  const list = reviewsFor(c.id), er = empData(c.id).reviews; const parts = [];
  if (list.length) parts.push(`Customers ${avgOf(list).toFixed(1)} ★ (${list.length})`);
  if (er.length) parts.push(`Employees ${avgOf(er).toFixed(1)} ★ (${er.length})`);
  return parts.join(' · ');
}
function coCard(c) {
  return `<article class="cocard">
    <div class="cohead">${avatar(c)}<div style="min-width:0"><a href="#${c.id}">${esc(c.name)}</a><div class="meta">${esc(c.web)} · ${esc(c.country)}</div></div>${scoreOf(c) ? rBadge(c) : ''}</div>
    <div class="tags"><a class="pill cat" href="#${c.catId}" style="text-decoration:none">${esc(c.cat)}</a></div>
    <p class="bio">${esc(c.bio)}</p>
    ${qStats(c)}
    <a class="btn o" href="#${c.id}">Write a review</a>
  </article>`;
}
function listRow(c) {
  return `<article class="listrow">
    ${avatar(c, 56, 18)}
    <div class="info"><div class="name"><a href="#${c.id}">${esc(c.name)}</a></div>
      <span class="meta" style="font-size:14px">${esc(c.web)} · ${esc(c.country)}</span>
      <p class="bio" style="margin-block:2px">${esc(c.bio)}</p>
      ${ratingLine(c) ? `<span class="meta" style="font-size:14px">${esc(ratingLine(c))}</span>` : ''}</div>
    ${(() => { const s = scoreOf(c), n = reviewsFor(c.id).length + empData(c.id).reviews.length; return s ? `<div class="lrscore" aria-label="Rated ${s.toFixed(1)} out of 5 from ${n} review${n === 1 ? '' : 's'}"><b>${s.toFixed(1)}</b>${starRow(+s.toFixed(1), 14)}<span>${n} review${n === 1 ? '' : 's'}</span></div>` : '<span class="lrnone">No reviews yet</span>'; })()}
  </article>`;
}
const ICONS = {"bank":"<path d=\"M3 10l9-6 9 6\"/><path d=\"M5 10v8M9.5 10v8M14.5 10v8M19 10v8\"/><path d=\"M3 20h18\"/>","code":"<path d=\"M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14\"/>","heart":"<path d=\"M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z\"/><path d=\"M8 12h2l1-2 2 4 1-2h2\"/>","shield":"<path d=\"M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z\"/><path d=\"M8.5 12l2.5 2.5 4.5-5\"/>","cup":"<path d=\"M5 9h12v4a6 6 0 0 1-12 0z\"/><path d=\"M17 10h1.5a2.5 2.5 0 0 1 0 5H17\"/><path d=\"M8 3.5v2.5M11 3.5v2.5M14 3.5v2.5\"/>","basket":"<path d=\"M3 10h18l-2 10H5z\"/><path d=\"M8 10l3-6M16 10l-3-6M9 14v3M15 14v3M12 14v3\"/>","car":"<path d=\"M4 15.5l1.7-5.1A2 2 0 0 1 7.6 9h8.8a2 2 0 0 1 1.9 1.4l1.7 5.1V19H4z\"/><path d=\"M4 15.5h16\"/><circle cx=\"8\" cy=\"17.2\" r=\".6\"/><circle cx=\"16\" cy=\"17.2\" r=\".6\"/>","house":"<path d=\"M4 11l8-7 8 7\"/><path d=\"M6 9.5V20h12V9.5\"/><path d=\"M10 20v-5h4v5\"/>","card":"<rect x=\"3\" y=\"6\" width=\"18\" height=\"12\" rx=\"2.5\"/><path d=\"M3 10h18M7 15h3\"/>","factory":"<path d=\"M3 20V11l5 3v-3l5 3V5h4v15\"/><path d=\"M2 20h20M17 9h3v11\"/>","layers":"<path d=\"M12 3l9 5-9 5-9-5z\"/><path d=\"M3 12.5l9 5 9-5\"/><path d=\"M3 16.5l9 5 9-5\"/>","cart":"<path d=\"M3 4h2l2.4 11h10.2L20 7.5H6.3\"/><circle cx=\"9\" cy=\"19.5\" r=\"1.3\"/><circle cx=\"17\" cy=\"19.5\" r=\"1.3\"/>","plane":"<path d=\"M21 15.5v-2l-7.5-4.5V4.5a1.5 1.5 0 0 0-3 0V9L3 13.5v2l7.5-2.3V18l-2 1.5V21l3.5-1 3.5 1v-1.5l-2-1.5v-4.8z\"/>","bolt":"<path d=\"M13 2.5L5 13.5h6l-1 8 8-11h-6z\"/>","bag":"<path d=\"M5.5 8h13l-1 12.5h-11z\"/><path d=\"M9 10V7a3 3 0 0 1 6 0v3\"/>","cap":"<path d=\"M2 9.5l10-5 10 5-10 5z\"/><path d=\"M6 11.5V16c3 2.2 9 2.2 12 0v-4.5M21 10v5\"/>","truck":"<path d=\"M2.5 6h11v10h-11zM13.5 9.5h4.5l3 3.5v3h-7.5\"/><circle cx=\"6.5\" cy=\"17.5\" r=\"1.7\"/><circle cx=\"17\" cy=\"17.5\" r=\"1.7\"/>","shirt":"<path d=\"M8 4L3 7l2 4.5 2-1V20h10v-9.5l2 1L21 7l-5-3a4 4 0 0 1-8 0z\"/>","sparkle":"<path d=\"M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z\"/><path d=\"M18.5 15v5M16 17.5h5\"/>","trend":"<path d=\"M4 20h16\"/><path d=\"M5 15.5l4.5-4.5 3 3L19 7.5\"/><path d=\"M14.5 7.5H19V12\"/>","chip":"<rect x=\"6\" y=\"6\" width=\"12\" height=\"12\" rx=\"2\"/><rect x=\"9.5\" y=\"9.5\" width=\"5\" height=\"5\" rx=\"1\"/><path d=\"M9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5\"/>","scale":"<path d=\"M12 4v16M7 20h10M5 7h14\"/><path d=\"M5 7l-2.5 6a2.5 2.5 0 0 0 5 0zM19 7l-2.5 6a2.5 2.5 0 0 0 5 0z\"/>","person":"<circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M4.5 20.5a7.5 7.5 0 0 1 15 0\"/>","signal":"<path d=\"M4 10a11.3 11.3 0 0 1 16 0M7 13.5a7 7 0 0 1 10 0M10 17a2.8 2.8 0 0 1 4 0\"/><circle cx=\"12\" cy=\"20\" r=\".8\"/>","play":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"3.5\"/><path d=\"M10 9.2l5 2.8-5 2.8z\"/>","phone":"<rect x=\"6.5\" y=\"2.5\" width=\"11\" height=\"19\" rx=\"2.5\"/><path d=\"M10.5 18.5h3\"/>","globe":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9S14.6 18.4 12 21c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z\"/>","bed":"<path d=\"M3 19V6M3 14h18v5M21 14a3.5 3.5 0 0 0-3.5-3.5H11V14\"/><circle cx=\"7\" cy=\"11\" r=\"1.6\"/>","news":"<path d=\"M4 5h13v14H6a2 2 0 0 1-2-2z\"/><path d=\"M17 9h3v8a2 2 0 0 1-2 2\"/><path d=\"M7.5 8.5h6M7.5 12h6M7.5 15.5h4\"/>","chat":"<path d=\"M4 5h16v11H9.5L5 20v-4H4z\"/><path d=\"M8 9.5h8M8 12.5h5\"/>","game":"<rect x=\"2.5\" y=\"7\" width=\"19\" height=\"11\" rx=\"5.5\"/><path d=\"M7.5 10.5v4M5.5 12.5h4\"/><circle cx=\"15.5\" cy=\"11.5\" r=\".6\"/><circle cx=\"17.5\" cy=\"13.8\" r=\".6\"/>","server":"<rect x=\"3\" y=\"4\" width=\"18\" height=\"7\" rx=\"2\"/><rect x=\"3\" y=\"13\" width=\"18\" height=\"7\" rx=\"2\"/><path d=\"M7 7.5h.01M7 16.5h.01M11 7.5h6M11 16.5h6\"/>","pin":"<path d=\"M12 21.5s-7-6.3-7-12a7 7 0 0 1 14 0c0 5.7-7 12-7 12z\"/><circle cx=\"12\" cy=\"9.5\" r=\"2.5\"/>","coin":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M9.5 7.5h3.8a2.2 2.2 0 0 1 0 4.5H9.5h4.3a2.25 2.25 0 0 1 0 4.5H9.5zM11 6v1.5M11 16.5V18\"/>","rocket":"<path d=\"M12 2.5c3 2.5 4.5 6 4.5 10L14 17h-4l-2.5-4.5C7.5 8.5 9 5 12 2.5z\"/><circle cx=\"12\" cy=\"10\" r=\"1.6\"/><path d=\"M10 17l-1.5 4M14 17l1.5 4M7.5 12.5L5 15v2.5l3-1M16.5 12.5L19 15v2.5l-3-1\"/>","pick":"<path d=\"M14.5 9.5L4 20\"/><path d=\"M6 6.5c4.5-3.5 9.5-3.5 13.5 0-1.5.2-3 .8-4.2 1.7L9.6 9.7C8.8 8.5 7.6 7.4 6 6.5z\"/>","sofa":"<path d=\"M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3\"/><path d=\"M3 12a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3z\"/><path d=\"M5.5 17v2.5M18.5 17v2.5\"/>"};
const CATICON = {"Fintech & Banking":"card","Travel & Hospitality":"globe","Mobility & Logistics":"truck","Social Media & Entertainment":"chat","Consumer Brands":"bag","Health & Wellness":"heart","Banking & Finance":"bank","Technology & Software":"code","Health & Pharmacy":"heart","Insurance":"shield","Food & Beverage Brands":"cup","Groceries & Retail":"basket","Automotive":"car","Real Estate":"house","Payments & Fintech":"card","Industrial & Manufacturing":"factory","IT Services & Consulting":"layers","E-commerce & Marketplaces":"cart","Airlines":"plane","Energy & Utilities":"bolt","Food & Delivery":"bag","Education & E-learning":"cap","Logistics & Delivery":"truck","Fashion & Apparel":"shirt","Beauty & Personal Care":"sparkle","Stock Brokers & Investing":"trend","Semiconductors & Hardware":"chip","Professional Services":"scale","Jobs & Freelancing":"person","Telecom & Internet":"signal","Streaming & Entertainment":"play","Consumer Electronics":"phone","Travel & Booking":"globe","Hotels & Hospitality":"bed","Media & News":"news","Social Media & Communication":"chat","Home & Furniture":"sofa","Mining & Metals":"pick","Gaming":"game","Web Hosting & Website Builders":"server","Ride-hailing & Mobility":"pin","Crypto Exchanges":"coin","Aerospace & Defense":"rocket","Accounting & Tax":"scale","Advertising & Marketing":"news","Architecture & Interior Design":"house","Construction & Engineering":"factory","Chemicals & Materials":"factory","Events & Weddings":"sparkle","Government & Public Services":"bank","Healthcare & Hospitals":"heart","Home Services & Repairs":"house","HR & Staffing":"person","Jewellery & Accessories":"sparkle","Legal Services":"scale","Pharmacy & Medicines":"heart","Printing & Packaging":"factory","Restaurants & Cafés":"cup","Security Services":"shield","Sports & Fitness":"heart","Textiles":"shirt"};
Object.assign(CATICON, {'Marketing & Creative Agencies':'trend','Digital & Development Agencies':'code','Design & Branding Studios':'sparkle','PR & Communications Agencies':'news','Recruitment & Staffing Agencies':'person','Consulting & Professional Services':'scale','SaaS & B2B Software':'layers','Online Stores & D2C Brands':'bag'});
const catIcon = (name, s = 24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[CATICON[name]] || ICONS.layers}</svg>`;
const catTile = k => `<a class="cattile" href="#${k.id}"><span class="ic" style="background:var(--t${k.tone});color:var(--t${k.tone}i)">${catIcon(k.name)}</span><span><b>${esc(k.name)}</b></span><svg class="arr" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>`;
const crumbs = items => `<nav class="crumbs" aria-label="Breadcrumb">${items.map((it, i) => i < items.length - 1 ? `<a href="${it[1]}">${esc(it[0])}</a><span aria-hidden="true">/</span>` : `<span>${esc(it[0])}</span>`).join('')}</nav>`;

/* ---------- views ---------- */
const FEATURED_PICK = ["Razorpay", "Notion", "Zepto", "CRED", "Deel", "Glossier", "Monzo", "Bolt"];
let FEATURED = [];
function computeFeatured() { FEATURED = (() => { const picked = FEATURED_PICK.map(n => COS.find(c => c.name === n)).filter(Boolean); const rest = CATS.slice().sort((a, b) => b.items.length - a.items.length).map(k => k.items[0]).filter(c => c && !picked.includes(c)); return picked.concat(rest).slice(0, 8); })(); }
const CHIPS = [['Edtech','Education & E-learning'],['Fintech','Fintech & Banking'],['HR and hiring','Jobs & Freelancing'],['Mobility','Mobility & Logistics'],['Crypto','Crypto Exchanges'],['E-commerce','E-commerce & Marketplaces']];

function heroCard() {
  const c = { name: 'Example Company', id: 'example' };
  return `<aside class="scard" aria-label="Example of a company page">
    <span class="back" aria-hidden="true"></span>
    <div class="card"><span class="tag">Example profile</span>
      <div class="top">${coLogo(c, 52)}
        <div style="flex:1;min-width:0"><b>${esc(c.name)}</b><span class="meta">Education &amp; E-learning · India</span></div><span class="pill ver">${TICK('#fff')}Verified</span></div>
      <div class="two">
        <div class="tile c"><small>Customers</small><b>4.0</b>${starRow(4, 14)}<span>4 reviews</span></div>
        <div class="tile e"><small>Employees</small><b>3.3</b>${starRow(3, 14)}<span>3 reviews · 67% recommend</span></div>
      </div>
      <div class="quote"><p>“Mock tests made the difference”</p><small>Customer · backed by an invoice</small></div>
      <div class="quote e"><p>“Students are motivated, and the team listens to teachers”</p><small>Employee · anonymous</small></div>
      <div class="foot"><span>Customers and employees, one page</span><a href="#categories">Browse companies →</a></div>
    </div></aside>`;
}
function heroForm() {
  if (S.heroTab === 'jobs') return `<form class="bigsearch" role="search" id="hero-jobs-form" autocomplete="off">
      <div class="split"><div class="hsearch"><label class="sr" for="hj-what">Job title or company</label><input id="hj-what" type="search" placeholder="Job title or company"></div>
      <div class="hsearch"><label class="sr" for="hj-where">City or remote</label><input id="hj-where" class="where" type="search" placeholder="City or “remote”"></div></div>
      <button class="btn gold lg" type="submit">Find jobs</button></form>`;
  const sal = S.heroTab === 'salaries';
  return `<form class="bigsearch" role="search" id="hero-search-form" autocomplete="off">
      <div class="hsearch"><label class="sr" for="hero-search">${sal ? 'Company to see salaries' : 'Search companies or websites'}</label>
      <input id="hero-search" type="search" placeholder="${sal ? 'Company name' : 'Search startups and growing companies'}" data-suggest="hero">
      <div class="sugg" id="sugg-hero" hidden></div></div>
      <button class="btn gold lg" type="submit">${sal ? 'See salaries' : 'Search'}</button></form>`;
}
const jobTile = j => `<a class="jtile" href="#jobs">
    <div class="top">${avatar({ name: j.biz }, 44, 15)}<div style="min-width:0"><b>${esc(j.title)}</b><span class="meta">${esc(j.biz)}${j.sample ? ' · Sample' : ''}</span></div></div>
    <div class="jtags"><span class="jtag">${ic('pin', 14)}${esc(j.loc)}</span><span class="jtag">${ic('clock', 14)}${esc(j.type)}</span>${j.pay ? `<span class="jtag pay">${ic('cash', 14)}${esc(j.pay)}</span>` : ''}</div></a>`;

/* ---------- 404 ----------
   Says what was missing in plain words, and offers a way on: a search, the categories, and for a company
   address, a one-tap way to add that company. */
function vNotFound() {
  const path = location.pathname;
  const m = path.match(/^\/(company|category)\/([^/]+)\/?$/);
  let guess = ''; try { guess = m ? decodeURIComponent(m[2]).replace(/[-_]+/g, ' ').replace(/\.html$/, '').trim() : ''; } catch (e) {}
  const nice = guess.replace(/\b[a-z]/g, ch => ch.toUpperCase()).slice(0, 60);
  let h1 = 'This page doesn’t exist', lead = 'The link may be old or mistyped. Search for a company, or pick up from one of the pages below.', cta = '';
  if (m && m[1] === 'company' && nice) {
    h1 = `We don’t have a page for “${esc(nice)}” yet`;
    lead = `It may be listed under a different name, so try a search first. If it’s not here, add it in under a minute and write the first review.`;
    cta = `<a class="btn p lg" href="#add" data-act="add-prefill" data-name="${esc(nice)}">Add ${esc(nice)}</a>`;
  } else if (m && m[1] === 'category') {
    h1 = 'We don’t have that category';
    lead = 'Here are the categories we do have. You can also search for a company by name or website.';
  }
  const cats = CATS.slice().sort((a, b) => b.items.length - a.items.length).slice(0, 10);
  const links = [['#categories', 'All categories', 'Browse every company by what it does'], ['#tools', 'Free tools', 'Offer comparison, salary hike, freelance rate and more'], ['#list', 'List your company', 'Claim your page and reply to reviews'], ['#guidelines', 'How reviews work', 'Who can review and what we take down'], ['#help', 'Help centre', 'Answers for reviewers and companies'], ['#contact', 'Contact us', 'Tell us about a broken link']];
  return `<section class="nf"><div class="wrap nfgrid">
      <div class="nftext">
        <p class="eyebrow">Error 404</p>
        <h1>${h1}</h1>
        <p class="nflead">${lead}</p>
        <form role="search" id="page-search-form" class="nfsearch" autocomplete="off"><label class="sr" for="page-search">Search companies</label><input id="page-search" type="search" value="${esc(guess)}" placeholder="Company name or website"><button class="btn p" type="submit">Search</button></form>
        <div class="nfbtns">${cta}<a class="btn ${cta ? 'o' : 'p'} lg" href="#home">Go to the homepage</a></div>
      </div>
      <div class="nfart" aria-hidden="true"><svg viewBox="0 -18 336 384" width="300" height="343" overflow="visible">
        <path d="M68 40H262A50 50 0 0 1 312 90V340A20 20 0 0 1 292 360H38A20 20 0 0 1 18 340V90A50 50 0 0 1 68 40Z" fill="#1B2738"/>
        <rect x="60" y="88" width="88" height="70" rx="18" fill="#364559"/><rect x="182" y="88" width="88" height="70" rx="18" fill="#364559"/>
        <rect x="60" y="180" width="88" height="70" rx="18" fill="#364559"/><rect x="182" y="180" width="88" height="70" rx="18" fill="#2A3749" stroke="#ADE436" stroke-width="3" stroke-dasharray="7 7"/>
        <rect x="60" y="272" width="88" height="70" rx="18" fill="#364559"/><rect x="182" y="272" width="88" height="70" rx="18" fill="#364559"/>
        <g class="nfbub"><rect x="210" y="0" width="112" height="84" rx="22" fill="#ADE436"/><path d="M250 82H282L262 108Z" fill="#ADE436"/><text x="266" y="58" text-anchor="middle" font-size="46" font-weight="800" fill="#1B2738" font-family="inherit">?</text></g>
      </svg></div>
    </div></section>
    <section class="wrap sec" style="padding-top:44px">
      <h2 style="font-size:22px;margin-bottom:14px">Browse by category</h2>
      <div class="chips nfcats">${cats.map(k => `<a class="chip" href="#${k.id}">${esc(k.name)}</a>`).join('')}<a class="chip" href="#categories" style="font-weight:800">All categories</a></div>
      <h2 style="font-size:22px;margin:34px 0 14px">Or try one of these</h2>
      <div class="nflinks">${links.map(([href, t, d]) => `<a href="${href}"><b>${t}</b><span>${d}</span></a>`).join('')}</div>
    </section>`;
}
function vAdd() {
  const p = S.addPrefill || '';
  const ctry = Object.entries(COUNTRY).sort((a, b) => a[0] === 'WW' ? -1 : b[0] === 'WW' ? 1 : a[1].localeCompare(b[1]));
  return `<div class="wrap">${crumbs([['Home','#home'],['Add a company']])}
    <div class="pagehead"><h1>Add a company or website</h1><p>Missing a company? Add it, then write the first review. The company can claim it later.</p></div>
    <div class="layout"><form class="formcard mainc" id="add-form" novalidate style="max-width:720px">
      <div class="field"><label class="l" for="a-name">Company or website name</label><input id="a-name" type="text" maxlength="80" value="${esc(p)}" placeholder="e.g. Blue Lotus Sarees" aria-describedby="err-a-name"><p class="err" id="err-a-name" hidden>Enter a name of at least 2 characters.</p></div>
      <div class="field"><label class="l" for="a-web">Website or social page</label><input id="a-web" type="text" maxlength="120" inputmode="url" placeholder="e.g. bluelotus.in or instagram.com/bluelotus" aria-describedby="hint-a-web err-a-web"><p class="meta" id="hint-a-web">This is how people tell similar names apart.</p><p class="err" id="err-a-web" hidden>Enter a website or social page, like company.com.</p></div>
      <div class="row"><div class="field"><label class="l" for="a-cat">Category</label><select id="a-cat">${FORM_CATS.map(n => `<option value="${esc(n)}" ${n === S.addCat ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
        <div class="field"><label class="l" for="a-cc">Country</label><select id="a-cc">${ctry.map(([cc, n]) => `<option value="${cc}" ${cc === 'WW' ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div></div>
      <div><button class="btn p lg" type="submit">Add and write a review</button></div>
      <p class="meta">Only add real companies you have dealt with. We check new profiles and remove duplicates and fakes.</p>
    </form>
    <aside class="side"><div class="box soft"><h2>What happens next</h2><p>The profile goes live as an unclaimed profile marked “Added by a reviewer”. When the owner claims it, they can add details and reply to reviews, but they can never remove reviews.</p></div></aside></div></div>`;
}

function recentReviews() {
  const items = Object.entries(REVIEWS).filter(([cid, l]) => BYID[cid] && l.some(r => !r.seed)).map(([cid, l]) => [BYID[cid], l.find(r => !r.seed)]).slice(0, 6);
  if (items.length < 3) return '';
  return `<section class="wrap sec"><div class="sechead"><div><p class="eyebrow">Fresh</p><h2>Recently reviewed</h2></div></div>
    <div class="jgrid">${items.map(([c, r]) => `<a class="jtile" href="#${c.id}"><div class="top">${avatar(c, 44, 15)}<div style="min-width:0"><b>${esc(c.name)}</b><span class="meta">${esc(c.cat)}</span></div></div>${starRow(r.rating, 16)}<div><b style="font-size:15px">${esc(r.title)}</b><p class="meta" style="margin-top:4px">${esc(r.body.length > 140 ? r.body.slice(0, 140) + '…' : r.body)}</p></div></a>`).join('')}</div></section>`;
}

const TOOL_IC = {
  compare: '<path d="M9 4v16M15 4v16"/><path d="M4 8h5M15 8h5M4 16h5M15 16h5"/>',
  hike: '<path d="M4 19h16"/><path d="M5 15.5l4.5-4.5 3 3L19 7.5"/><path d="M14.5 7.5H19V12"/>',
  offer: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h4"/>',
  rate: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  gratuity: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M7 9.5v5M17 9.5v5"/>',
  hra: '<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
  fair: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/>'
};
const TOOLS = [
  { id: 'offer', name: 'Compare job offers', d: 'Weigh two offers on pay, bonus, benefits and costs, and see which is worth more each year.', tone: 2 },
  { id: 'hike', name: 'Salary hike calculator', d: 'Work out your new salary from a hike, or the hike behind an offer. Any currency.', tone: 3 },
  { id: 'rate', name: 'Freelance rate calculator', d: 'Find the hourly and day rate a freelancer or small team needs to hit an income target.', tone: 4 },
  { id: 'gratuity', name: 'Gratuity calculator', d: 'Estimate gratuity on leaving a job in India, using the 15/26 formula.', tone: 5, region: 'India' },
  { id: 'hra', name: 'HRA exemption calculator', d: 'Estimate how much of your house rent allowance is tax-free in India (old tax regime).', tone: 6, region: 'India' },

];
const TOOLBYID = Object.fromEntries(TOOLS.map(x => ['tool-' + x.id, x]));
const toolIcon = (x, s = 22) => `<span class="ti" style="background:var(--t${x.tone});color:var(--t${x.tone}i)"><svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TOOL_IC[x.id]}</svg></span>`;
const toolCard = x => `<a class="toolcard${x.soon ? ' off' : ''}" href="${x.soon ? '#tools' : '#tool-' + x.id}" ${x.soon ? 'aria-disabled="true"' : ''}>${toolIcon(x)}<span><b>${esc(x.name)}</b><span class="d">${esc(x.d)}</span>${x.region ? `<span class="tag">${x.region}</span>` : ''}${x.soon ? '<span class="tag">Coming soon</span>' : ''}</span></a>`;
const CURS = ['₹','$','£','€','AED ','SGD ','A$','C$'];
const curSel = (id, v) => `<div class="field"><label class="l" for="${id}">Currency</label><select id="${id}" data-tool>${CURS.map(c => `<option value="${c}" ${c === (v || '₹') ? 'selected' : ''}>${c.trim()}</option>`).join('')}</select></div>`;
const numF = (id, label, v, hint) => `<div class="field"><label class="l" for="${id}">${label}</label><input id="${id}" type="number" inputmode="decimal" min="0" step="any" value="${v}" data-tool>${hint ? `<p class="meta">${hint}</p>` : ''}</div>`;
const money = (cur, n) => cur + Math.round(n).toLocaleString(cur === '₹' ? 'en-IN' : 'en');
const tv = id => { const el = document.getElementById(id); return el ? (el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' ? el.value : parseFloat(el.value) || 0) : 0; };

function toolForm(id) {
  if (id === 'hike') return `<form class="box" novalidate onsubmit="return false">
      <h2>Your new salary</h2><div class="two">${curSel('h-cur')}${numF('h-now', 'Current salary (yearly)', 600000)}</div>
      <div class="two">${numF('h-pct', 'Hike', 12, 'Percent')}${numF('h-offer', 'Or an offered salary (yearly)', 0, 'Leave at 0 to use the hike above')}</div></form>`;
  if (id === 'offer') return `<form class="box" novalidate onsubmit="return false"><h2>Two offers, side by side</h2>${curSel('o-cur')}
      <div class="offer">${['a', 'b'].map((k, i) => `<fieldset><legend>Offer ${k.toUpperCase()}</legend>
        <div class="field"><label class="l" for="o-${k}-co">Company (optional)</label><input id="o-${k}-co" type="text" data-tool placeholder="${i ? 'e.g. The company offering you a job' : 'e.g. Your current employer'}"></div>
        ${numF(`o-${k}-base`, 'Base salary (yearly)', i ? 900000 : 800000)}${numF(`o-${k}-bonus`, 'Expected bonus (yearly)', i ? 0 : 80000)}
        ${numF(`o-${k}-ben`, 'Benefits worth (yearly)', i ? 30000 : 50000, 'Insurance, meals, learning budget')}${numF(`o-${k}-join`, 'Joining bonus (one-off)', i ? 75000 : 0)}
        ${numF(`o-${k}-cost`, 'Costs to you (yearly)', i ? 20000 : 60000, 'Commute, relocation, equipment')}</fieldset>`).join('')}</div></form>`;
  if (id === 'rate') return `<form class="box" novalidate onsubmit="return false"><h2>Your target</h2><div class="two">${curSel('r-cur')}${numF('r-income', 'Income you want (yearly)', 1500000, 'Before tax, for you or your team')}</div>
      <div class="two">${numF('r-costs', 'Business costs (yearly)', 300000, 'Software, office, hardware, insurance')}${numF('r-margin', 'Profit margin', 15, 'Percent, for growth and slow months')}</div>
      <div class="two">${numF('r-weeks', 'Working weeks a year', 46, 'After holidays and sick days')}${numF('r-hours', 'Hours a week', 40)}</div>
      ${numF('r-bill', 'Billable share of your time', 60, 'Percent. Sales, admin and email are not billable.')}</form>`;
  if (id === 'gratuity') return `<form class="box" novalidate onsubmit="return false"><h2>Your service</h2>
      ${numF('g-sal', 'Last monthly basic salary plus dearness allowance (₹)', 50000, 'Not your full CTC. Leave out HRA, special allowance and bonus.')}
      <div class="two">${numF('g-years', 'Years of service', 7)}${numF('g-months', 'Extra months', 7)}</div>
      <label class="check"><input id="g-act" type="checkbox" checked data-tool><span>My employer is covered by gratuity law (usually 10 or more employees)</span></label></form>`;
  if (id === 'hra') return `<form class="box" novalidate onsubmit="return false"><h2>Your salary and rent (yearly, ₹)</h2>
      <div class="two">${numF('x-basic', 'Basic salary plus dearness allowance', 720000)}${numF('x-hra', 'HRA received', 300000)}</div>
      ${numF('x-rent', 'Rent paid', 300000)}
      <label class="check"><input id="x-metro" type="checkbox" checked data-tool><span>I live in a city that counts as metro under current tax rules (50% limit instead of 40%)</span></label></form>`;
  if (id === 'compare') { const opts = COS.slice().sort((a, b) => a.name.localeCompare(b.name)).map(c => `<option value="${esc(c.name)}"></option>`).join('');
    return `<form class="box" novalidate onsubmit="return false"><h2>Pick two companies</h2><datalist id="co-list">${opts}</datalist>
      <div class="two"><div class="field"><label class="l" for="c-a">First company</label><input id="c-a" list="co-list" type="text" value="${esc(S.cmpA || 'Revolut')}" data-tool></div>
      <div class="field"><label class="l" for="c-b">Second company</label><input id="c-b" list="co-list" type="text" value="${esc(S.cmpB || 'Monzo')}" data-tool></div></div>
      <div id="cmp-out"></div></form>`; }
  return '';
}

function toolResult(id) {
  if (id === 'hike') { const c = tv('h-cur'), now = tv('h-now'), pct = tv('h-pct'), offer = tv('h-offer');
    const nw = offer > 0 ? offer : now * (1 + pct / 100), p = now > 0 ? (nw / now - 1) * 100 : 0;
    return `<h2>Result</h2><div><span class="note">New yearly salary</span><div class="big">${money(c, nw)}</div></div>
      <div class="row2"><span>Hike</span><b>${p.toFixed(1)}%</b></div><div class="row2"><span>Extra a year</span><b>${money(c, nw - now)}</b></div><div class="row2"><span>Extra a month</span><b>${money(c, (nw - now) / 12)}</b></div>
      <p class="note">Before tax. A bigger hike is worth less if the company has poor reviews. <a href="#search" style="color:var(--gold)">Check the company</a>.</p>`; }
  if (id === 'offer') { const c = tv('o-cur'); const v = k => { const base = tv(`o-${k}-base`), bonus = tv(`o-${k}-bonus`), ben = tv(`o-${k}-ben`), join = tv(`o-${k}-join`), cost = tv(`o-${k}-cost`); return { yr: base + bonus + ben - cost, first: base + bonus + ben + join - cost, name: (document.getElementById(`o-${k}-co`) || {}).value || '' }; };
    const a = v('a'), b = v('b'), d = b.yr - a.yr, w = d === 0 ? 'Both offers are worth the same each year' : `${d > 0 ? 'Offer B' : 'Offer A'} is worth ${money(c, Math.abs(d))} more each year`;
    const link = x => x.name.trim() ? (() => { const m = COS.find(co => co.name.toLowerCase() === x.name.trim().toLowerCase()); return m ? `<a href="#${m.id}" style="color:var(--gold)">Read ${esc(m.name)} reviews</a>` : ''; })() : '';
    return `<h2>Result</h2><div class="big" style="font-size:28px">${w}</div>
      <div class="row2"><span>Offer A, yearly value</span><b>${money(c, a.yr)}</b></div><div class="row2"><span>Offer B, yearly value</span><b>${money(c, b.yr)}</b></div>
      <div class="row2"><span>Offer A, first year</span><b>${money(c, a.first)}</b></div><div class="row2"><span>Offer B, first year</span><b>${money(c, b.first)}</b></div>
      <p class="note">Yearly value = base + bonus + benefits − your costs. First year adds the joining bonus. Money isn't everything: compare the reviews too. ${[link(a), link(b)].filter(Boolean).join(' · ')}</p>`; }
  if (id === 'rate') { const c = tv('r-cur'), need = (tv('r-income') + tv('r-costs')) * (1 + tv('r-margin') / 100), hrs = tv('r-weeks') * tv('r-hours') * tv('r-bill') / 100;
    if (hrs <= 0) return `<h2>Result</h2><div class="warn">Enter working weeks, hours and a billable share above 0.</div>`;
    const hr = need / hrs;
    return `<h2>Result</h2><div><span class="note">Minimum hourly rate</span><div class="big">${money(c, hr)}</div></div>
      <div class="row2"><span>Day rate (8 hours)</span><b>${money(c, hr * 8)}</b></div><div class="row2"><span>Billable hours a year</span><b>${Math.round(hrs).toLocaleString('en')}</b></div><div class="row2"><span>Revenue needed a year</span><b>${money(c, need)}</b></div>
      <p class="note">Charge at least this to cover your income, costs and margin. Clients judge freelancers and small teams by reviews as much as price.</p>`; }
  if (id === 'gratuity') { const sal = tv('g-sal'), y = Math.floor(tv('g-years')), m = Math.floor(tv('g-months')), act = tv('g-act');
    const yrs = act ? y + (m >= 6 ? 1 : 0) : y, amt = act ? sal * 15 / 26 * yrs : sal * 15 / 30 * yrs, months = y * 12 + m;
    return `<h2>Estimate</h2><div><span class="note">Estimated gratuity</span><div class="big">${money('₹', amt)}</div></div>
      <div class="row2"><span>Years counted</span><b>${yrs}</b></div><div class="row2"><span>Formula</span><b>${act ? 'Salary × 15 ÷ 26 × years' : 'Salary × 15 ÷ 30 × years'}</b></div>
      ${months < 60 ? '<div class="warn">Permanent employees usually need 5 years of continuous service to get gratuity. Fixed-term employees, and cases of death or disability, have different rules.</div>' : ''}
      <p class="note">${act ? 'A final part-year of 6 months or more counts as a full year.' : 'Only completed years count.'} An estimate only: India's new labour codes change how wages are defined, and part of a large gratuity can be taxable. Check with your employer or a tax adviser.</p>`; }
  if (id === 'hra') { const basic = tv('x-basic'), hra = tv('x-hra'), rent = tv('x-rent'), metro = tv('x-metro');
    const l1 = hra, l2 = basic * (metro ? .5 : .4), l3 = Math.max(0, rent - basic * .1), ex = Math.max(0, Math.min(l1, l2, l3));
    return `<h2>Estimate</h2><div><span class="note">Tax-free HRA this year</span><div class="big">${money('₹', ex)}</div></div>
      <div class="row2"><span>Taxable HRA</span><b>${money('₹', Math.max(0, hra - ex))}</b></div>
      <div class="row2"><span>Limit 1: HRA received</span><b>${money('₹', l1)}</b></div><div class="row2"><span>Limit 2: ${metro ? '50%' : '40%'} of basic</span><b>${money('₹', l2)}</b></div><div class="row2"><span>Limit 3: rent minus 10% of basic</span><b>${money('₹', l3)}</b></div>
      <p class="note">The lowest of the three limits is tax-free. This applies only under the old tax regime; under the new regime HRA is fully taxable. Landlord PAN is usually needed when rent is above ₹1 lakh a year. Check current rules with a tax adviser.</p>`; }
  return '';
}

function cmpOut() {
  const pick = id => { const v = (document.getElementById(id) || {}).value || ''; return COS.find(c => c.name.toLowerCase() === v.trim().toLowerCase()); };
  const a = pick('c-a'), b = pick('c-b');
  if (!a || !b) return '<p class="meta">Choose two companies from the list to compare them.</p>';
  S.cmpA = a.name; S.cmpB = b.name;
  const row = (label, f) => `<tr><th scope="row">${label}</th><td>${f(a)}</td><td>${f(b)}</td></tr>`;
  const cr = c => { const l = reviewsFor(c.id); return l.length ? `<b>${avgOf(l).toFixed(1)}</b> ★ · ${l.length} reviews` : '<span class="meta">No reviews yet</span>'; };
  const er = c => { const l = empData(c.id).reviews; return l.length ? `<b>${avgOf(l).toFixed(1)}</b> ★ · ${l.length} reviews` : '<span class="meta">No reviews yet</span>'; };
  const rec = c => { const l = empData(c.id).reviews; return l.length ? `${recPct(l)}%` : '<span class="meta">—</span>'; };
  return `<div style="overflow-x:auto;margin-top:6px"><table class="cmp"><thead><tr><th></th><td><a href="#${a.id}"><b>${esc(a.name)}</b></a></td><td><a href="#${b.id}"><b>${esc(b.name)}</b></a></td></tr></thead><tbody>
    ${row('Category', c => esc(c.cat))}${row('Country', c => esc(c.country))}${row('Website', c => esc(c.web))}
    ${row('Customer rating', cr)}${row('Employee rating', er)}${row('Would recommend working here', rec)}
    ${row('Profile', c => c.added === 2 ? 'Listed by the owner' : 'Unclaimed')}</tbody></table></div>
    <p class="meta" style="margin-top:10px">Ratings come only from reviews. Know a company well? <a href="#${a.id}">Review ${esc(a.name)}</a> or <a href="#${b.id}">${esc(b.name)}</a>.</p>`;
}
function runTool() {
  const x = TOOLBYID[curRoute()]; if (!x) return;
  if (x.id === 'compare') { const o = document.getElementById('cmp-out'); if (o) o.innerHTML = cmpOut(); return; }
  const r = document.getElementById('tool-res'); if (r) r.innerHTML = toolResult(x.id);
}
function vTools() {
  return `<section class="band"><div class="wrap" style="padding-block:44px 32px;display:flex;flex-direction:column;gap:10px">${crumbs([['Home','#home'],['Tools']])}<h1 style="font-size:clamp(32px,4vw,44px)">Free career and company tools</h1><p style="font-size:18px;color:var(--muted);max-width:640px">Compare companies and offers, check a hike, price your freelance work, and estimate Indian gratuity and HRA. No sign-up needed.</p></div></section>
    <section class="wrap sec" style="padding-top:32px"><div class="toolgrid">${TOOLS.map(toolCard).join('')}</div></section>`;
}
function vTool(x) {
  const others = TOOLS.filter(o => o.id !== x.id && !o.soon).slice(0, 3);
  return `<section class="band"><div class="wrap" style="padding-block:40px 28px;display:flex;flex-direction:column;gap:10px">${crumbs([['Home','#home'],['Tools','#tools'],[x.name]])}
      <div style="display:flex;gap:14px;align-items:center" class="tooltitle">${toolIcon(x, 24)}<h1 style="font-size:clamp(28px,3.6vw,40px)">${esc(x.name)}</h1></div><p style="font-size:17px;color:var(--muted);max-width:680px">${esc(x.d)}</p></div></section>
    <section class="wrap sec" style="padding-top:28px">${x.id === 'compare' ? toolForm('compare') : `<div class="tool">${toolForm(x.id)}<aside class="res" id="tool-res" aria-live="polite"></aside></div>`}</section>
    <section class="wrap sec"><div class="sechead"><div><h2 style="font-size:24px">More tools</h2></div><a href="#tools" style="font-weight:700">All tools</a></div><div class="toolgrid">${others.map(toolCard).join('')}</div></section>`;
}

const REASONS = [
  ['A complete online presence', 'One verified page with what you do, your website, team, photos and contact details, kept accurate by you.', true],
  ['Visible in AI search (GEO)', 'When people ask ChatGPT, Gemini or Perplexity about a company, the answers lean heavily on independent sources like review sites. Real reviews give them accurate information about you.', true],
  ['Found when people search your name', 'A company page can show up when people search for your name plus “reviews”, with your replies right there.', false],
  ['More customers, through proof', 'Independent reviews persuade more than your own claims. Share your Know The Company page and review link wherever people find you.', false],
  ['Better hires', 'Your employer page sits next to what employees say. Job seekers see the real culture, and the right people apply.', false],
  ['Easier due diligence', 'Investors, partners and enterprise clients check a company before they sign. A verified page with honest reviews and replies answers their questions early.', false],
  ['Proof you are real', 'Your Verified badge shows we confirmed you control the company’s email or website, or checked official documents. That matters when fake job offers and copycat sites are everywhere.', false],
  ['Your side of every story', 'Reply publicly to customers and employees. Calm, factual replies build more trust than a perfect score.', false],
  ['Know what to fix', 'See ratings for pay, management, service and value, and get an email for every new review.', false],
  ['Stand out in your category', 'Most startups and growing companies have no independent reviews yet. The first ones to collect them stand out.', false],
  ['Proof you can reuse', 'Link to your Know The Company page from your website, careers page, LinkedIn, proposals, pitch decks and email signature.', false],
  ['Fair and low-cost', 'Basic is free for your first year. Paying never changes a rating, so your rating actually means something.', false]
];
const reasonCard = ([h, p, hot], i) => `<div class="reason${hot ? ' hot' : ''}"><span class="n">${String(i + 1).padStart(2, '0')}</span><h3>${h}</h3><p>${p}</p></div>`;
function vWhy() {
  const aud = [['user', 'Customers and clients'], ['invite', 'Job seekers'], ['plans', 'Investors'], ['claim', 'Partners and enterprise clients'], ['search', 'AI assistants and search engines']];
  return `<section class="lbhero"><div class="wrap"><div style="flex:1 1 560px;display:flex;flex-direction:column;gap:18px">${crumbs([['Home','#home'],['For employers','#list'],['Why list your company']]).replace('class="crumbs"', 'class="crumbs" style="color:var(--deep-muted)"')}
      <p class="eyebrow" style="color:var(--gold)">Why list your company</p>
      <h1>Be found, and trusted, everywhere people check you.</h1>
      <p class="lede">Customers, job seekers, investors and AI assistants all look at what others say about a company before they decide. A verified page with real reviews puts your true story in front of them.</p>
      <div style="display:flex;flex-wrap:wrap;gap:12px"><a class="btn gold lg" href="#list" data-act="to-form">${LAUNCH ? 'Claim your company page free' : 'List your company'}</a></div></div></div></section>

    <section class="wrap sec"><div class="sechead"><div><p class="eyebrow">Who checks you</p><h2>People look you up before they decide</h2></div></div>
      <div class="why-aud">${aud.map(([k, l]) => `<span>${nI(k, 18)}${l}</span>`).join('')}</div></section>

    <section class="wrap sec"><div class="geo">
      <div class="tx"><p class="eyebrow" style="color:var(--gold)">GEO · generative engine optimisation</p><h2>Show up when people ask AI about you</h2>
        <p>More people now ask AI assistants “Is this a good company to work with?” instead of searching. These tools rely heavily on independent sources, like review sites, rather than a company's own website.</p>
        <div class="stat"><b>72.7%</b><span>of sources cited by ChatGPT for US software queries were independent, third-party sites. Only 26.7% were the companies' own sites.</span></div>
        <p style="font-size:13px">Source: <a href="https://arxiv.org/abs/2509.08919" target="_blank" rel="noopener">Chen et al., “Generative Engine Optimization: How to Dominate AI Search”, University of Toronto, 2025</a>. No one can guarantee what an AI tool says; real reviews and a complete, verified page give it accurate information to work with.</p></div>
      <div class="aichat" aria-label="Example of an AI assistant answer"><span class="ex">Example</span>
        <div class="q">Is Example Company good for board exam coaching?</div>
        <div class="a">Parents describe Example Company's weekly mock tests and same-day doubt solving as helpful, rating it 4.0 out of 5. One reviewer said a refund took six weeks, and the company replied that refunds now go out within 7 working days.<br><span class="src">${nI('search', 13)} Source: Know The Company</span></div></div>
    </div></section>

    <section class="wrap sec"><div class="sechead"><div><p class="eyebrow">12 reasons</p><h2>What a company page does for you</h2></div></div>
      <div class="reasons">${REASONS.map(reasonCard).join('')}</div></section>

    <section class="wrap sec"><div class="sechead"><div><p class="eyebrow">Getting started</p><h2>Three steps, about ten minutes</h2></div></div><div class="steps">
      <div class="step"><span>1</span><h3>Claim your page</h3><p>Add your details and story. ${LAUNCH ? 'Free for your first year.' : 'Plans from [[PB]] a year.'}</p></div>
      <div class="step"><span>2</span><h3>Invite people</h3><p>Send your review links to customers and your team. Employee reviews can stay anonymous.</p></div>
      <div class="step"><span>3</span><h3>Share your page</h3><p>Link to your page from your website, careers page and LinkedIn.</p></div></div></section>

    <section class="wrap sec" style="max-width:900px"><div class="sechead"><div><p class="eyebrow">Straight answers</p><h2>Before you sign up</h2></div></div><div style="display:flex;flex-direction:column;gap:10px">${[
      ['Will this guarantee we appear in Google or AI answers?', 'No one can guarantee that, and you should be wary of anyone who does. What we do is give search engines and AI tools a complete, verified page with independent reviews, which is the kind of source they tend to rely on.'],
      ['Does the link on our page help our SEO?', 'Links from company pages follow Google’s rules for paid and user-generated links, so they don’t pass ranking. They do send real visitors to your site, and your page itself can show up for searches about your company.'],
      ['We have no reviews yet. Is it still worth it?', 'Yes. Your verified page, description and employer page work from day one, and your review links help you collect the first reviews quickly.'],
      ['Can we pay to improve our rating?', 'Never. Plans add tools, not stars. That rule is the reason customers, job seekers and AI tools can trust your rating.']
    ].map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div></section>

    <section class="wrap sec"><div class="cta"><div style="display:flex;flex-direction:column;gap:14px;max-width:640px"><p class="eyebrow" style="color:var(--gold)">Free first year</p><h2>${LAUNCH ? 'Claim your company page free for a year.' : 'Get your company page today.'}</h2><p style="color:var(--deep-muted)">Join before ${LAUNCH_END} and Basic is free for your first year.</p><a class="btn gold lg" href="#list" style="align-self:flex-start">${LAUNCH ? 'Claim your company page free' : 'List your company'}</a></div></div></section>`;
}

function vHome() {
  const mix = w => { let h = 7; for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
  const pool = COS.slice().sort((x, y) => mix(x.wid) - mix(y.wid));
  const rowA = pool.filter((_, i) => i % 2 === 0).slice(0, 40), rowB = pool.filter((_, i) => i % 2 === 1).slice(0, 40);
  const band = (list, cls) => `<div class="nb ${cls}"><div class="nbt">${list.concat(list).map(c => `<a href="#${c.id}" tabindex="-1">${esc(c.name)}</a>`).join('')}</div></div>`;
  return `<section class="hero3" aria-labelledby="hero-h">
      <div class="wrap">
        <h1 id="hero-h" class="sr">Know the company before you deal with it.</h1>
        <p class="hstars"><span class="stars" aria-hidden="true">${[1,2,3,4,5].map(() => STAR(true, 22)).join('')}</span><span>Honest reviews from customers and employees</span></p>
        <form class="hs3" role="search" id="hero-search-form" autocomplete="off">
          <div class="hl hl1"><span class="w" aria-hidden="true">Know</span><span class="blank"><label class="sr" for="hero-search">Search companies or websites</label><input id="hero-search" type="search" placeholder="the company" data-suggest="hero" spellcheck="false"><svg class="bi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg><div class="sugg" id="sugg-hero" hidden></div></span></div>
          <button class="go" type="submit">Search</button>
          <div class="hl hl2"><span class="w" aria-hidden="true">before you deal with&nbsp;it.</span></div>
        </form>
        <p class="hsub">Customers and employees review the same company, on one page.</p>
      </div>
      <div class="nbands" id="nbands" aria-hidden="true">${band(rowA, 'a')}${band(rowB, 'b')}</div>
      <div class="wrap hfoot"><p>Can’t find a company? <a href="#categories">Browse by category</a> or <a href="#add">add one that’s missing</a>.</p></div>
    </section>

    <section class="wrap promises" aria-label="Our promises">
      <div class="pcard"><span class="pi" style="background:var(--t1);color:var(--t1i)"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9.5L5 20v-4H4z"/><path d="M8 10.5h8"/></svg></span><div><b>Free for everyone</b><p>Reading and writing reviews costs nothing, and you never need a paid account.</p></div></div>
      <div class="pcard"><span class="pi" style="background:var(--gold-soft);color:var(--gold-ink)"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg></span><div><b>Zero ratings bought</b><p>Companies can pay for tools, never for stars. Paying never changes, hides or delays a review.</p></div></div>
      <div class="pcard"><span class="pi" style="background:var(--t3);color:var(--t3i)"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/></svg></span><div><b>Your call on your name</b><p>Post employee reviews anonymously or with your name. Your email is never shown.</p></div></div>
    </section>

    <section class="wrap sec" aria-labelledby="both-h"><div class="sechead"><div style="max-width:720px"><h2 id="both-h">What customers and employees say, together</h2></div></div>
      <div class="both">
        <div class="bside c"><div class="who2"><span class="pi"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h18v13H3z"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></span><div><h3>Customers and clients</h3><p class="sub">How the company delivers</p></div></div>
          <ul>${['Quality of the work, product or service','Communication and support','Value for money','Whether it kept its promises'].map(x => `<li>${TICK('#1E293B')}${x}</li>`).join('')}</ul>
          <button class="btn o" type="button" data-act="open-picker" data-as="customers">Review as a customer</button></div>
        <div class="bjoin" aria-hidden="true"><span>One<br>page</span></div>
        <div class="bside e"><div class="who2"><span class="pi"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/></svg></span><div><h3>Employees</h3><p class="sub">How the company treats its people</p></div></div>
          <ul>${['Culture and management','Pay and benefits','Career growth and work-life balance','Anonymous, or with your name if you prefer'].map(x => `<li>${TICK('var(--accent-soft-ink)')}${x}</li>`).join('')}</ul>
          <button class="btn o" type="button" data-act="open-picker" data-as="employees">Review as an employee</button></div>
      </div>
      <div class="whyboth">
        <div><b>Choosing a company to work with?</b><p>See whether its team is looked after, not just what past clients say. A team that's treated well is more likely to treat you well.</p></div>
        <div><b>Thinking of joining?</b><p>See how the company treats its customers, not only what it tells you in interviews.</p></div>
        <div><b>Running a company?</b><p>One page for your reputation with clients and candidates, and one place to reply to both.</p></div>
      </div></section>

    <section class="hb hb-grey"><div class="wrap sec"><div class="sechead"><div><h2>Browse by category</h2></div><a href="#categories" style="font-weight:700">All ${CATS.length} categories</a></div>
      <div class="grid mshort-4">${CATS.slice().sort((a, b) => b.items.length - a.items.length).slice(0, 8).map(catTile).join('')}</div></div></section>

    ${recentReviews()}

    <section class="hb hb-cream"><div class="wrap sec"><div class="sechead"><div><h2>Why companies list here</h2></div><a href="#why-list" style="font-weight:700">All 12 reasons</a></div>
      <div class="reasons mshort-3">${REASONS.slice(0, 6).map(reasonCard).join('')}</div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:20px"><a class="btn p lg" href="#why-list">See why it matters</a><a class="btn o lg" href="#list">${LAUNCH ? 'Claim your company page free' : 'List your company'}</a></div></div></section>

    <section class="wrap sec"><div class="sechead"><div><h2>Make better career and company decisions</h2></div><a href="#tools" style="font-weight:700">All tools</a></div><div class="toolgrid mshort-3">${TOOLS.filter(x => !x.soon).slice(0, 6).map(toolCard).join('')}</div></section>

    

    ${!JOBS_ON ? '' : (() => { const js = JOBS.filter(isLive).sort((a, b) => dayNum(b.posted) - dayNum(a.posted)).slice(0, 3); return js.length ? `<section class="wrap sec"><div class="sechead"><div><h2>Latest jobs at verified companies</h2></div><a href="#jobs" style="font-weight:700">All jobs</a></div>
      <div class="jgrid">${js.map(jobTile).join('')}</div></section>` : ''; })()}

    <section class="hb hb-lime"><div class="wrap sec"><div class="sechead"><div><h2>How it works</h2></div></div>
      <div class="steps">
        <div class="step"><span>1</span><h3>Search the company</h3><p>Type a name or website. Each page shows its reviews and whether the company is verified.</p></div>
        <div class="step"><span>2</span><h3>Read real experiences</h3><p>Customers share how they were treated. Employees share anonymous reviews.</p></div>
        <div class="step"><span>3</span><h3>Share your own</h3><p>Good or bad, every review is published the same way, and the company can reply.</p></div>
      </div></div></section>

${POSTS.length ? `    <section class="wrap sec"><div class="sechead"><div><h2>From our blog for companies</h2></div><a href="#blog" style="font-weight:700">All articles</a></div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">${POSTS.slice(0, 3).map(postCard).join('')}</div></section>` : ''}

    <section class="wrap sec"><div class="cta">
      <div style="flex:1 1 420px;display:flex;flex-direction:column;gap:14px">
        <h2>${LAUNCH ? 'List your company free for a year.' : 'Get a verified listing for [[PB]] a year.'}</h2>
        <p>Show up in your category, reply to clients and employees, and share proof of your reputation.${LAUNCH ? ` Businesses that join before ${LAUNCH_END} get their first year free.` : ''}</p></div>
      <div style="flex:1 1 280px;display:flex;flex-direction:column;gap:16px">
        <ul class="ticks">${['Verified company badge','Reply to every review','Employer branding page','Website link and photos'].map(t => `<li>${TICK('var(--deep-muted)')}${t}</li>`).join('')}</ul>
        <a class="btn gold lg" href="#list" style="align-self:flex-start">${LAUNCH ? 'List your company free' : 'List your company – [[PB]]'}</a></div>
    </div></section>

    <section class="wrap"><div class="promise">
      <div style="flex:1 1 300px;display:flex;flex-direction:column;gap:8px"><h2 style="font-size:24px">Our promise on reviews</h2><p style="color:var(--muted)">Paying for a listing buys tools and visibility, never stars.</p></div>
      <ul><li>Negative reviews are never hidden or delayed.</li><li>Companies can't edit or remove reviews.</li><li>Companies caught buying reviews get a public warning.</li></ul>
    </div></section>`;
}

function vCategories() {
  return `<div class="wrap">${crumbs([['Home','#home'],['Categories']])}
    <div class="pagehead"><h1>All categories</h1><p>Pick a category to compare companies.</p></div>
    <div class="grid">${CATS.map(catTile).join('')}</div></div>`;
}

function filteredCat(k) {
  const f = S.catFilter; const t = f.text.trim().toLowerCase();
  let list = k.items.filter(c => (!f.country || c.cc === f.country) && (!t || c.name.toLowerCase().includes(t) || c.web.includes(t)));
  if (f.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
  if (f.sort === 'za') list.sort((a, b) => b.name.localeCompare(a.name));
  if (f.sort === 'reviews') list.sort((a, b) => reviewsFor(b.id).length - reviewsFor(a.id).length || a.name.localeCompare(b.name));
  return list;
}
function catResults(k) {
  const list = filteredCat(k);
  return (list.length ? list.map(listRow).join('') : `<div class="empty"><b>No companies match</b><p>Clear the filters, or list a company in this category.</p><button class="btn g" type="button" data-act="clear-filters">Clear filters</button></div>`);
}
function vCategory(k) {
  const countries = [...new Set(k.items.map(c => c.cc))].sort((a, b) => (COUNTRY[a] || a).localeCompare(COUNTRY[b] || b));
  const f = S.catFilter;
  return `<div class="wrap">${crumbs([['Home','#home'],['Categories','#categories'],[k.name]])}
    <div class="pagehead"><h1>${esc(k.name)}</h1><p>${esc(catIntro(k.name))}</p></div>
    <div class="layout">
      <aside class="side" aria-label="Filters"><div class="box">
        <div class="field"><label class="l" for="f-country">Country</label><select id="f-country" data-filter="country"><option value="">All countries</option>${countries.map(cc => `<option value="${cc}" ${f.country === cc ? 'selected' : ''}>${esc(COUNTRY[cc] || cc)}</option>`).join('')}</select></div>
        <div class="field"><label class="l" for="f-text">Name or website</label><input id="f-text" type="text" data-filter="text" value="${esc(f.text)}" placeholder="Filter this list"></div>
        <div class="field"><label class="l" for="f-sort">Sort by</label><select id="f-sort" data-filter="sort"><option value="name" ${f.sort === 'name' ? 'selected' : ''}>Name A–Z</option><option value="za" ${f.sort === 'za' ? 'selected' : ''}>Name Z–A</option><option value="reviews" ${f.sort === 'reviews' ? 'selected' : ''}>Most reviewed</option></select></div>
      </div>
      <div class="box soft"><h2>Run a company in this category?</h2><p>Get a verified listing here, ${LAUNCH ? 'free for your first year' : 'for [[PB]] a year'}.</p><a class="btn p" href="#list">List your company</a></div></aside>
      <div class="mainc" id="cat-results">${catResults(k)}</div>
    </div></div>`;
}

const webs2 = () => Object.fromEntries(Object.keys(CLAIMS).filter(id => BYID[id]).map(id => [id, domOf(cprof(BYID[id]).web2 || '')]).filter(x => x[1]));
function searchCos(q) {
  const t = q.trim().toLowerCase(); if (!t) return [];
  const score = c => { const n = c.name.toLowerCase(), w2 = webs2()[c.id] || ''; if (n === t || c.web === t || w2 === t) return 0; if (n.startsWith(t)) return 1; if (n.includes(t) || c.web.includes(t) || (w2 && w2.includes(t))) return 2; if (c.cat.toLowerCase().includes(t)) return 3; if (t.length > 2 && (c.bio || '').toLowerCase().includes(t)) return 4; return 9; };
  return COS.map(c => [score(c), c]).filter(x => x[0] < 9).sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).map(x => x[1]);
}
function vSearch() {
  const res = searchCos(S.q);
  const cats = S.q.trim() ? CATS.filter(k => k.name.toLowerCase().includes(S.q.trim().toLowerCase())) : [];
  return `<div class="wrap">${crumbs([['Home','#home'],['Search']])}
    <div class="pagehead"><h1>${S.q.trim() ? `Results for “${esc(S.q.trim())}”` : 'Search companies'}</h1>
    <form role="search" id="page-search-form" style="display:flex;flex-wrap:wrap;gap:12px;max-width:640px;margin-top:6px" autocomplete="off"><label class="sr" for="page-search">Search</label><input id="page-search" type="search" value="${esc(S.q)}" placeholder="Company, website or category" style="flex:1 1 300px"><button class="btn p" type="submit">Search</button></form></div>
    ${cats.length ? `<div class="sechead" style="margin-bottom:12px"><h2 style="font-size:20px">Categories</h2></div><div class="grid" style="margin-bottom:28px">${cats.map(catTile).join('')}</div>` : ''}
    ${S.q.trim() ? (res.length ? `<div class="mainc" style="max-width:900px">${res.map(listRow).join('')}</div>`
      : `<div class="empty" style="max-width:900px"><b>No company called “${esc(S.q.trim())}” yet</b><p>Been a customer or worked there? Add it in under a minute and be the first to review. Or try another spelling.</p><div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center"><a class="btn p" href="#add" data-act="add-prefill" data-name="${esc(S.q.trim())}">Add it and write the first review</a><a class="btn o" href="#list" data-act="claim" data-name="${esc(S.q.trim())}">It's my company</a><a class="btn g" href="#categories">Browse categories</a></div></div>`)
      : `<p class="count">Type a name above, or <a href="#categories">browse all categories</a>.</p>`}
  </div>`;
}

function reviewCard(r, idx, cid) {
  const mine = cid && isMine(r);
  return `<article class="review">
    <div class="who"><span class="avatar" aria-hidden="true" style="width:40px;height:40px;font-size:14px;border-radius:999px">${esc(initials(r.name || 'You'))}</span>
      <div class="t"><b style="font-size:15px">${esc(r.name || 'You')}</b><span class="meta">${esc(r.date)}</span></div>
      ${r.invited ? '<span class="pill cat">Invited</span>' : ''}${r.imported ? '<span class="pill cat">Imported</span>' : ''}${mine ? '<span class="pill ok">Your review</span>' : ''}${r.proof ? '<span class="pill ok">Proof checked</span>' : ''}</div>
    ${starRow(r.rating, 18)}
    ${r.imported ? `<p class="meta" style="font-size:13px">Shared by ${esc(r.replyFrom || 'the company')} from its own records. First given via ${esc(r.imported.from)}${r.imported.date ? ' in ' + esc(r.imported.date) : ''}. We confirmed it with the reviewer before publishing.</p>` : ''}
    ${r.title ? `<h3>${esc(r.title)}</h3>` : ''}
    <p class="body">${esc(r.body)}</p>
    ${r.reply ? `<div class="reply"><b>Reply from ${esc(r.replyFrom || 'the company')}</b><span>${esc(r.reply)}</span></div>` : ''}
    ${mine ? `<div><button class="link" type="button" data-act="del-review" data-wid="${esc(r.wid)}">Remove my review</button></div>` : ''}
    ${cid && !mine ? rvActions(cid, 'c', idx, r) : ''}
  </article>`;
}
const CO_TABS = [['customers', 'Customer reviews'], ['employees', 'Employee reviews']]; /* salaries: off until there is traffic */
const SUBS = [['pay', 'Pay & benefits'], ['culture', 'Culture'], ['mgmt', 'Management'], ['growth', 'Career growth'], ['wlb', 'Work-life balance']];
const E_STATUS = ['Current employee', 'Former employee', 'Contractor or intern'];
const E_YEARS = ['Less than 1 year', '1–3 years', '3–5 years', 'More than 5 years'];
const S_CUR = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'];
const S_EXP = ['Less than 1 year', '1–3 years', '3–5 years', '5–10 years', 'More than 10 years'];
const I_OUTCOME = ['Got an offer', 'No offer', 'Still waiting', 'Declined'];
const I_DIFF = ['Easy', 'Medium', 'Hard'];
const I_EXP = ['Positive', 'Neutral', 'Negative'];
const PERSON = (size = 40) => `<span class="avatar" aria-hidden="true" style="width:${size}px;height:${size}px;border-radius:999px"><svg width="${Math.round(size * .55)}" height="${Math.round(size * .55)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.2-4.2 4.3-6.5 8-6.5s6.8 2.3 8 6.5"/></svg></span>`;
const CROSS = () => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--soft)" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
const opts = (list, cur) => list.map(o => `<option ${o === cur ? 'selected' : ''}>${esc(o)}</option>`).join('');
const monthNow = () => new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
const bareHost = s => String(s || '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/[\/:].*$/, '').replace(/^www\./, '');
function workVerified(c) {
  if (!S.user || !S.user.email || !c.web) return false;
  const d = bareHost(S.user.email.split('@')[1]), w = bareHost(c.web);
  return !!d && !!w && (d === w || w.endsWith('.' + d) || d.endsWith('.' + w));
}
const isMine = r => !!(S.user && S.user.id && r.by && r.by === S.user.id);
function fmtPay(s) {
  let amt; try { amt = new Intl.NumberFormat(s.cur === 'INR' ? 'en-IN' : 'en', { style: 'currency', currency: s.cur, maximumFractionDigits: 0 }).format(s.amount); } catch (e) { amt = s.cur + ' ' + s.amount; }
  return amt + (s.period === 'month' ? ' per month' : ' per year');
}
/* keep typed values when a form re-renders */
const CO_FORMS = ['review-form', 'emp-form', 'sal-form', 'int-form'];
function snapForm(id) { const f = document.getElementById(id); if (!f) return null; return [...f.querySelectorAll('input,select,textarea')].filter(el => el.id).map(el => [el.id, el.type === 'radio' || el.type === 'checkbox' ? el.checked : el.value]); }
function restoreForm(snap) { (snap || []).forEach(([id, v]) => { const el = document.getElementById(id); if (!el) return; if (el.type === 'radio' || el.type === 'checkbox') el.checked = v; else el.value = v; }); }
function renderKeep() { const snaps = CO_FORMS.map(snapForm); render(); snaps.forEach(restoreForm); }

function empGate(c, what) {
  if (S.user && S.user.type === 'reviewer') return '';
  if (S.user) return `<div class="box soft" id="emp-gate"><h2>Company accounts can't post here</h2><p>Employee reviews come from personal reviewer accounts. Log out and log in as a reviewer to share yours.</p></div>`;
  return `<div class="box soft" id="emp-gate"><h2>Log in to ${what} anonymously</h2><p>A quick login stops fake posts. Your name and email are never shown, and ${esc(c.name)} can't see who wrote it.</p><div><button class="btn p" type="button" id="gate-login" data-act="gate-login">Log in to continue</button></div></div>`;
}
function anonNote(c) {
  return `<div class="democode">You choose below whether to post anonymously or with your name. Your email is never shown. ${workVerified(c) ? `You're logged in with a work email at ${esc(c.web)}, so this will carry a “Work email verified” badge.` : `To get a “Work email verified” badge, log in with your work email at ${esc(c.web)}.`}</div>`;
}
function empSummary(list) {
  if (!list.length) return '';
  const avg = avgOf(list);
  const bars = SUBS.map(([k, l]) => { const rated = list.filter(r => r.sub && r.sub[k]); const v = rated.length ? rated.reduce((s, r) => s + r.sub[k], 0) / rated.length : 0;
    return `<div class="bar"><span style="flex:0 0 132px">${l}</span><span class="tr"><i style="width:${Math.round(v / 5 * 100)}%"></i></span><span style="width:28px;text-align:right">${v ? v.toFixed(1) : '–'}</span></div>`; }).join('');
  return `<section class="box" aria-labelledby="es-h"><div class="toolbar"><h2 id="es-h">What employees say</h2><span class="pill ok">${recPct(list)}% would recommend</span></div>
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">${starRow(+avg.toFixed(1), 22)}<b>${avg.toFixed(1)}</b><span class="meta" style="font-size:14px">overall from ${list.length} review${list.length > 1 ? 's' : ''}</span></div>
    <div class="bars">${bars}</div></section>`;
}
const displayName = () => S.user ? (S.user.name || S.user.email.split('@')[0]) : 'Your name';
function empForm(c) {
  const blk = reviewBlock(); if (blk) return blk;
  const e = S.emp; const words = ['Tap a star to rate', 'Very poor', 'Poor', 'OK', 'Good', 'Excellent'];
  return `<form class="box" id="emp-form" style="padding:24px;gap:18px" novalidate>
    <h2 style="font-size:22px">Review ${esc(c.name)} as an employee</h2>
    ${anonNote(c)}
    <div class="row"><div class="field"><label class="l" for="e-status">Employment status</label><select id="e-status">${opts(E_STATUS)}</select></div>
      <div class="field"><label class="l" for="e-years">Time at ${esc(c.name)}</label><select id="e-years">${opts(E_YEARS)}</select></div></div>
    <div class="row"><div class="field"><label class="l" for="e-title">Job title</label><input id="e-title" type="text" maxlength="80" placeholder="e.g. Customer support associate" aria-describedby="err-e-title"><p class="err" id="err-e-title" hidden>Enter your job title.</p></div>
      <div class="field"><label class="l" for="e-loc">Location <span class="meta">(optional)</span></label><input id="e-loc" type="text" maxlength="60" placeholder="City, or Remote"></div></div>
    <div class="field"><span class="l" id="e-overall-l">Overall rating</span>
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px"><div class="starbtns" role="group" aria-labelledby="e-overall-l">${[1, 2, 3, 4, 5].map(n => `<button type="button" id="e-overall-${n}" class="${n <= e.overall ? 'on' : ''}" data-act="erate" data-k="overall" data-n="${n}" aria-label="${n} star${n > 1 ? 's' : ''}" aria-pressed="${n <= e.overall}">${STAR(n <= e.overall, 26)}</button>`).join('')}</div>
        <span style="font-weight:700;color:var(--muted)">${words[e.overall]}</span></div>
      <p class="err" id="err-e-overall" hidden>Choose an overall star rating.</p></div>
    <fieldset class="subrates"><legend class="l">Rate each area <span class="meta">(optional, 1 is poor and 5 is excellent)</span></legend>
      ${SUBS.map(([k, l]) => `<div class="subrate"><span id="e-${k}-l">${l}</span><div class="scale" role="group" aria-labelledby="e-${k}-l">${[1, 2, 3, 4, 5].map(n => `<button type="button" id="e-${k}-${n}" class="${e[k] === n ? 'on' : ''}" data-act="erate" data-k="${k}" data-n="${n}" aria-label="${n} out of 5" aria-pressed="${e[k] === n}">${n}</button>`).join('')}</div></div>`).join('')}</fieldset>
    <div class="field"><label class="l" for="e-pros">Pros</label><textarea id="e-pros" rows="3" maxlength="1500" placeholder="What is good about working here?" aria-describedby="err-e-pros"></textarea><p class="err" id="err-e-pros" hidden>Write at least 20 characters about the pros.</p></div>
    <div class="field"><label class="l" for="e-cons">Cons</label><textarea id="e-cons" rows="3" maxlength="1500" placeholder="What could be better?" aria-describedby="err-e-cons"></textarea><p class="err" id="err-e-cons" hidden>Write at least 20 characters about the cons.</p></div>
    <div class="field"><label class="l" for="e-advice">Advice to management <span class="meta">(optional)</span></label><textarea id="e-advice" rows="2" maxlength="1000"></textarea></div>
    <fieldset class="radios" aria-describedby="err-e-rec"><legend class="l">Would you recommend working here to a friend?</legend>
      <div class="opts"><label class="radio" for="e-rec-yes"><input type="radio" id="e-rec-yes" name="e-rec" value="yes">Yes</label><label class="radio" for="e-rec-no"><input type="radio" id="e-rec-no" name="e-rec" value="no">No</label></div>
      <p class="err" id="err-e-rec" hidden>Choose yes or no.</p></fieldset>
    <fieldset class="radios"><legend class="l">How should your review appear?</legend>
      <div class="planpick">
        <label><input type="radio" name="e-show" value="anon" ${S.empShow !== 'named' ? 'checked' : ''}><span><b>Anonymous</b><small>Shown as “Anonymous employee”. ${esc(c.name)} can't see who wrote it. In a small team, your job title and dates can still hint at who you are, so share only what you're comfortable with.</small></span></label>
        <label><input type="radio" name="e-show" value="named" ${S.empShow === 'named' ? 'checked' : ''}><span><b>With my name</b><small>Shown as “${esc(displayName())}”. Named reviews often carry more weight with readers.</small></span></label></div></fieldset>
    <label class="check"><input id="e-first" type="checkbox"><span>I work or worked at this company, and this is my own experience.</span></label><p class="err" id="err-e-first" hidden>Tick the box to confirm.</p><p class="meta" style="font-size:13px">Don't name junior colleagues or share confidential company information. Your review is published as soon as you post it. Reviews that break the <a href="#guidelines">guidelines</a> are taken down.</p>
    <div><button class="btn p lg" type="submit">Post review</button></div>
  </form>`;
}
function empCard(r, idx, cid) {
  const mine = isMine(r);
  const subs = SUBS.filter(([k]) => r.sub && r.sub[k]).map(([k, l]) => `<span class="pill cat">${l} ${r.sub[k]}/5</span>`).join('');
  return `<article class="review">
    <div class="who">${PERSON(40)}<div class="t"><span style="font-size:13px;font-weight:700;color:var(--muted)">${r.named && r.name ? esc(r.name) : 'Anonymous employee'}</span><h3 style="font-size:16px">${esc(r.status)} · ${esc(r.title)}</h3><span class="meta">${esc(r.loc || 'Location not shared')} · ${esc(r.years)} · ${esc(r.date)}</span></div>
      ${r.verified ? `<span class="pill ok">${TICK('var(--accent-soft-ink)')}Work email verified</span>` : ''}${mine ? '<span class="pill cat">Your review</span>' : ''}</div>
    ${starRow(r.rating, 18)}
    ${subs ? `<div class="tags">${subs}</div>` : ''}
    <div class="ersec"><h4>Pros</h4><p>${esc(r.pros)}</p></div>
    <div class="ersec"><h4>Cons</h4><p>${esc(r.cons)}</p></div>
    ${r.advice ? `<div class="ersec"><h4>Advice to management</h4><p>${esc(r.advice)}</p></div>` : ''}
    <p class="recline">${r.rec === 'yes' ? TICK() + 'Would recommend working here' : CROSS() + 'Would not recommend working here'}</p>
    ${r.reply ? `<div class="reply"><b>Reply from ${esc(r.replyFrom || 'the company')}</b><span>${esc(r.reply)}</span></div>` : ''}
    ${cid && !mine && curRoute() !== 'dashboard' ? rvActions(cid, 'e', idx, r) : ''}
    ${mine ? `<div><button class="link" type="button" data-act="del-emp" data-wid="${esc(r.wid)}">Remove my review</button></div>` : ''}
  </article>`;
}
function empPanel(c, er) {
  return `${empSummary(er)}
    <section style="display:flex;flex-direction:column;gap:12px" aria-labelledby="er-h"><h2 id="er-h" style="font-size:22px">Employee reviews</h2>
      ${er.length ? `<div class="rvbar"><span class="meta">${er.length} review${er.length === 1 ? '' : 's'}</span>${sortSel('ersort', S.erSort || 'new')}</div>` + rvSorted(er, S.erSort || 'new').map(([r, i]) => empCard(r, i, c.id)).join('') : `<div class="empty">${PERSON(48)}<b>Be the first to review ${esc(c.name)} as an employee</b><p>Worked there? Share what it's like, anonymously.</p></div>`}</section>
    ${empGate(c, 'review') || empForm(c)}`;
}
function salForm(c) {
  return `<form class="box" id="sal-form" style="padding:24px;gap:18px" novalidate>
    <h2 style="font-size:22px">Share your salary at ${esc(c.name)}</h2>
    ${anonNote(c)}
    <div class="row"><div class="field"><label class="l" for="s-title">Job title</label><input id="s-title" type="text" maxlength="80" placeholder="e.g. Software engineer" aria-describedby="err-s-title"><p class="err" id="err-s-title" hidden>Enter your job title.</p></div>
      <div class="field"><label class="l" for="s-loc">Location <span class="meta">(optional)</span></label><input id="s-loc" type="text" maxlength="60" placeholder="City, or Remote"></div></div>
    <div class="row"><div class="field"><label class="l" for="s-amount">Base pay before tax</label><input id="s-amount" type="number" min="1" step="any" inputmode="decimal" placeholder="e.g. 850000" aria-describedby="err-s-amount"><p class="err" id="err-s-amount" hidden>Enter an amount greater than 0.</p></div>
      <div class="field" style="flex:0 1 150px"><label class="l" for="s-cur">Currency</label><select id="s-cur">${opts(S_CUR)}</select></div>
      <div class="field" style="flex:0 1 170px"><label class="l" for="s-period">Paid</label><select id="s-period"><option value="year">Per year</option><option value="month">Per month</option></select></div></div>
    <div class="row"><div class="field"><label class="l" for="s-exp">Years of experience</label><select id="s-exp">${opts(S_EXP)}</select></div></div>
    <div><button class="btn p lg" type="submit">Share salary anonymously</button></div>
  </form>`;
}
function salPanel(c, list) {
  const rows = list.map((s, i) => [s, i]).sort((a, b) => a[0].title.localeCompare(b[0].title));
  const anyMine = rows.some(([s]) => isMine(s));
  return `${empGate(c, 'share your salary') || salForm(c)}
    <section style="display:flex;flex-direction:column;gap:12px" aria-labelledby="sl-h"><h2 id="sl-h" style="font-size:22px">Salaries at ${esc(c.name)}</h2>
      <p class="meta" style="font-size:14px">Salaries are shared anonymously.</p>
      ${rows.length ? `<div class="tblwrap"><table class="tbl"><thead><tr><th scope="col">Job title</th><th scope="col">Location</th><th scope="col" class="num">Pay</th><th scope="col">Experience</th>${anyMine ? '<th scope="col"><span class="sr">Your entries</span></th>' : ''}</tr></thead><tbody>
        ${rows.map(([s, i]) => `<tr><td><b>${esc(s.title)}</b></td><td>${esc(s.loc || 'Not shared')}</td><td class="num">${esc(fmtPay(s))}</td><td>${esc(s.exp)}</td>${anyMine ? `<td>${isMine(s) ? `<button class="link" type="button" data-act="del-emp" data-kind="salaries" data-id="${c.id}" data-idx="${i}">Remove</button>` : ''}</td>` : ''}</tr>`).join('')}</tbody></table></div>`
        : `<div class="empty"><b>No salaries shared yet</b><p>Help others negotiate. Share what ${esc(c.name)} pays for your role.</p></div>`}</section>`;
}
function salCard(s, idx, cid) {
  return `<article class="review"><div class="who">${PERSON(40)}<div class="t"><h3 style="font-size:16px">${esc(s.title)}</h3><span class="meta">${esc(s.loc || 'Location not shared')} · ${esc(s.exp)} · ${esc(s.date)}</span></div><span class="pill cat">Your salary</span></div>
    <p style="font-size:18px;font-weight:800">${esc(fmtPay(s))}</p>
    <div><button class="link" type="button" data-act="del-emp" data-kind="salaries" data-id="${cid}" data-idx="${idx}">Remove my salary</button></div></article>`;
}
function intForm(c) {
  const blk = reviewBlock(); if (blk) return blk;
  return `<form class="box" id="int-form" style="padding:24px;gap:18px" novalidate>
    <h2 style="font-size:22px">Share your interview at ${esc(c.name)}</h2>
    ${anonNote(c)}
    <div class="row"><div class="field"><label class="l" for="i-role">Role you applied for</label><input id="i-role" type="text" maxlength="80" placeholder="e.g. Relationship manager" aria-describedby="err-i-role"><p class="err" id="err-i-role" hidden>Enter the role you applied for.</p></div>
      <div class="field"><label class="l" for="i-outcome">Outcome</label><select id="i-outcome">${opts(I_OUTCOME)}</select></div></div>
    <div class="row"><div class="field"><label class="l" for="i-diff">Difficulty</label><select id="i-diff">${opts(I_DIFF, 'Medium')}</select></div>
      <div class="field"><label class="l" for="i-exp">Overall experience</label><select id="i-exp">${opts(I_EXP, 'Neutral')}</select></div></div>
    <div class="field"><label class="l" for="i-process">How did the process go?</label><textarea id="i-process" rows="4" maxlength="2000" placeholder="Rounds, timeline, who you met, how they treated you" aria-describedby="err-i-process"></textarea><p class="err" id="err-i-process" hidden>Write at least 20 characters about the process.</p></div>
    <div class="field"><label class="l" for="i-questions">Questions they asked <span class="meta">(optional)</span></label><textarea id="i-questions" rows="3" maxlength="1500"></textarea></div>
    <label class="check"><input id="i-first" type="checkbox"><span>I interviewed at this company, and this is my own experience.</span></label><p class="err" id="err-i-first" hidden>Tick the box to confirm.</p><div><button class="btn p lg" type="submit">Share interview anonymously</button></div>
  </form>`;
}
function intCard(r, idx, cid) {
  const mine = isMine(r);
  return `<article class="review">
    <div class="who">${PERSON(40)}<div class="t"><h3 style="font-size:16px">Interview for ${esc(r.role)}</h3><span class="meta">Candidate · ${esc(r.date)}</span></div>${r.verified ? `<span class="pill ok">${TICK('var(--accent-soft-ink)')}Work email verified</span>` : ''}${mine ? '<span class="pill cat">Your interview</span>' : ''}</div>
    <div class="tags"><span class="pill ${r.outcome === 'Got an offer' ? 'ok' : 'cat'}">${esc(r.outcome)}</span><span class="pill cat">${esc(r.diff)} interview</span><span class="pill cat">${esc(r.exp)} experience</span></div>
    <div class="ersec"><h4>Process</h4><p>${esc(r.process)}</p></div>
    ${r.questions ? `<div class="ersec"><h4>Questions they asked</h4><p>${esc(r.questions)}</p></div>` : ''}
    ${mine ? `<div><button class="link" type="button" data-act="del-emp" data-wid="${esc(r.wid)}">Remove my interview</button></div>` : ''}
  </article>`;
}
function intPanel(c, list) {
  return `${empGate(c, 'share your interview') || intForm(c)}
    <section style="display:flex;flex-direction:column;gap:12px" aria-labelledby="in-h"><h2 id="in-h" style="font-size:22px">Interviews at ${esc(c.name)}</h2>
      ${list.length ? list.map((r, i) => intCard(r, i, c.id)).join('') : `<div class="empty"><b>No interviews shared yet</b><p>Interviewed at ${esc(c.name)}? Tell the next candidate what to expect.</p></div>`}</section>`;
}

function vCompany(c) {
  const list = reviewsFor(c.id); const k = CATBYID[c.catId];
  const others = k.items.filter(x => x.id !== c.id).slice(0, 5);
  const words = ['Tap a star to rate','Bad','Poor','Average','Good','Excellent'];
  const ed = empData(c.id); const er = ed.reviews;
  const tabsDef = isVerifiedCo(c) ? [['overview', 'Overview']].concat(CO_TABS) : CO_TABS;
  const tab = tabsDef.some(x => x[0] === S.coTab) ? S.coTab : (isVerifiedCo(c) ? 'overview' : 'customers');
  const counts = { customers: list.length, employees: er.length, salaries: ed.salaries.length, interviews: ed.interviews.length };
  const nRev = n => `${n} review${n === 1 ? '' : 's'}`;
  let panel;
  if (tab === 'overview') panel = overviewPanel(c, list, er);
  else if (tab === 'customers') panel = `
      <section style="display:flex;flex-direction:column;gap:12px" aria-labelledby="rv-h"><h2 id="rv-h" style="font-size:22px">Reviews</h2>
        ${list.length ? rvBreakdown(list) + rvList(list, c.id) : `<div class="empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--soft)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H8l-4 4z"/><path d="M8 10h8"/></svg><b>Be the first to review ${esc(c.name)}</b><p>Share how they treated you. Good or bad, every review is published the same way.</p></div>`}
      </section>
      ${reviewBlock() || `<form class="box" id="review-form" style="padding:24px;gap:18px" novalidate>
        <h2 style="font-size:22px">Rate your experience with ${esc(c.name)}</h2>
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px">
          <div class="starbtns" role="group" aria-label="Star rating">${[1,2,3,4,5].map(n => `<button type="button" class="${n <= S.rating ? 'on' : ''}" data-act="rate" data-n="${n}" aria-label="${n} star${n > 1 ? 's' : ''}" aria-pressed="${n <= S.rating}">${STAR(n <= S.rating, 26)}</button>`).join('')}</div>
          <span style="font-weight:700;color:var(--muted)" id="rate-word">${words[S.rating]}</span></div>
        <p class="err" id="err-rating" hidden>Choose a star rating.</p>
        <div class="field"><label class="l" for="r-title">Title</label><input id="r-title" type="text" maxlength="90" placeholder="Sum up your experience in a line"></div>
        <div class="field"><label class="l" for="r-body">Your review</label><textarea id="r-body" rows="5" maxlength="2000" placeholder="What happened? What went well or badly?"></textarea><p class="err" id="err-body" hidden>Write at least 20 characters so others understand what happened.</p></div>
        <div class="row"><div class="field"><label class="l" for="r-date">Date of experience</label><input id="r-date" type="month"></div>
          <div class="field" style="justify-content:flex-end"><p class="meta" style="font-size:14px;padding-bottom:12px">${S.user && S.user.type === 'reviewer' ? `Posting as <b style="color:var(--fg)">${esc(S.user.name)}</b>` : 'You’ll log in as a reviewer before posting.'}</p></div></div>
        <label class="check"><input id="r-first" type="checkbox"><span>This is my own experience. I don’t work for this company or a competitor, and nobody paid me or gave me anything to write it.</span></label><p class="err" id="err-r-first" hidden>Tick the box to confirm.</p><p class="meta" style="font-size:13px">Your review is published as soon as you post it. Reviews that break the <a href="#guidelines">guidelines</a> are taken down.</p>
        <div><button class="btn p lg" type="submit">Post review</button></div>
      </form>`}`;
  else if (tab === 'employees') panel = (isVerifiedCo(c) ? workBox(c) : '') + empPanel(c, er);
  else if (tab === 'salaries') panel = salPanel(c, ed.salaries);
  else panel = '';
  const P = cprof(c); const ver = isVerifiedCo(c), plus = ver && coPlan(c) === 'plus';
  const rTile = (cls, label, l, extra) => `<div class="r ${cls}"><small>${label}</small>${l.length ? `<b>${avgOf(l).toFixed(1)}</b>${starRow(+avgOf(l).toFixed(1), 15)}<span>${nRev(l.length)}${extra ? ' · ' + extra : ''}</span>` : `<b class="none">–</b><span>No reviews yet</span>`}</div>`;
  return `<section class="cohdr"><div class="wrap">${crumbs([['Home','#home'],[c.cat,'#' + c.catId],[c.name]])}
    ${c.pending ? `<div class="box soft" role="status" style="gap:8px;margin:12px 0"><b>Only you can see this page for now.</b><p class="meta">It goes live for everyone once you choose your plan, or once our team has checked your proof. <a href="#dashboard">Open your dashboard</a></p></div>` : ''}
    <div class="cocover${plus && P.cover ? '' : ' def'}"${plus && P.cover ? ` style="background-image:url('${P.cover}')"` : ''} aria-hidden="true"></div>
    <div class="cogrid">
      <div class="coid">${coLogo(c, 112)}
        <div class="coname"><h1>${esc(c.name)}</h1>${ownerPill(c)}</div>
        <div class="cometa"><span>${icn(CATICON[c.cat] || 'layers')}${esc(c.cat)}</span><span>${icn('pin')}${esc(ver && P.hq ? P.hq : c.country)}</span><span>${icn('globe')}${ver ? [c.web].concat(P.web2 ? [P.web2] : []).map(w => `<a href="https://${esc(w)}" target="_blank" rel="nofollow sponsored noopener">${esc(w)}</a>`).join('<span class="sep">·</span>') : esc(c.web)}</span>${ver && P.size ? `<span>${icn('person')}${esc(P.size)}</span>` : ''}</div>
        <p class="cobio">${esc(c.bio)}</p>
        ${coLinks(c)}
      </div>
      <aside class="corate" aria-label="Ratings for ${esc(c.name)}">
        <div class="rr">${rTile('c', 'Customers', list, '')}${rTile('e', 'Employees', er, er.length ? recPct(er) + '% recommend' : '')}</div>
        <a class="btn p lg" href="#${c.id}" data-act="jump-write">Write a customer review</a>
        <a class="btn o lg" href="#${c.id}" data-act="jump-emp">Review as an employee</a>
        ${ver && (list.length + er.length) ? (n => `<p class="rrate">${icn('chat')}<span>Replies to <b>${n}%</b> of reviews</span></p>`)(Math.round(list.concat(er).filter(r => r.reply).length / (list.length + er.length) * 100)) : ''}
        <button class="btn g" type="button" data-act="share-co" data-id="${c.id}">${svgI('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>', 16)}Share this page</button>
        <p class="meta" style="text-align:center">Ratings come only from reviews. Paying never changes them.</p>
      </aside>
    </div></div></section>
  ${WARNINGS[c.id] ? warnBan(c, WARNINGS[c.id]) : ''}
  <div class="cotabbar"><div class="wrap"><div class="cotabs" role="tablist" aria-label="Reviews of ${esc(c.name)}">${tabsDef.map(([key, label]) => `<button type="button" role="tab" id="tab-${key}" aria-controls="co-panel" aria-selected="${tab === key}" tabindex="${tab === key ? 0 : -1}" data-act="cotab" data-tab="${key}">${label}${counts[key] ? `<span class="n">${counts[key]}</span>` : ''}</button>`).join('')}</div></div></div>

  <div class="wrap" style="padding-top:32px"><div class="layout">
    <div class="mainc" style="gap:24px"><div role="tabpanel" id="co-panel" aria-labelledby="tab-${tab}" style="display:flex;flex-direction:column;gap:24px">${panel}</div>${factsSection(c, list, er)}</div>
    <aside class="side">
      ${tab === 'employees' ? `<div class="box soft"><h2>Your identity stays private</h2><p>Employees choose whether to post anonymously or with their name. Emails are never shown, and ${esc(c.name)} can't see who wrote an anonymous review. We share a reviewer's identity only when a valid court order requires it.</p></div>` : ''}
      ${coSide(c)}
      ${isVerifiedCo(c) ? '' : `<div class="box"><h2>Company details</h2><div class="kv"><span>Website</span><span>${esc(c.web)}</span></div><div class="kv"><span>Category</span><span>${esc(c.cat)}</span></div><div class="kv"><span>Country</span><span>${esc(c.country)}</span></div></div>`}
      ${isVerifiedCo(c) && coPlan(c) === 'plus' ? '' : `<div class="box"><h2>More in ${esc(c.cat)}</h2>${others.map(o => `<a href="#${o.id}" style="font-weight:600;text-decoration:none">${esc(o.name)}</a>`).join('')}<a href="#${c.catId}" style="font-size:14px">See all</a></div>`}
    </aside>
  </div></div>`;
}

const SAMPLE = {
  name: 'Brightline Studio', reviews: [
    { name: 'Sample reviewer A', date: 'Oct 2026', rating: 5, proof: true, title: 'Launched our app on time', body: 'Example review. They designed and built our booking app in ten weeks. Weekly demos, clear scope and no surprise invoices.', reply: 'Example reply. Thank you, it was a great project to work on.', replyFrom: 'Brightline Studio' },
    { name: 'Sample reviewer B', date: 'Sep 2026', rating: 5, proof: false, title: 'Clear communication', body: 'Example review. Weekly updates, quick answers on Slack, and the website went live on the agreed date.' },
    { name: 'Sample reviewer C', date: 'Aug 2026', rating: 4, proof: true, title: 'Great design, tight budget', body: 'Example review. The design work was excellent, though extra revisions pushed the final bill above the first estimate.', reply: 'Example reply. Thanks for the feedback. We now agree the number of revision rounds before every project.', replyFrom: 'Brightline Studio' }
  ],
  emp: [
    { status: 'Current employee', title: 'Product designer', loc: 'London', years: '1–3 years', date: 'Oct 2026', rating: 4, verified: true, headline: 'A real mentor from week one', sub: { pay: 3, culture: 5, mgmt: 4, growth: 4, wlb: 4 }, pros: 'Example review. Senior people take time to review your work, and every new hire gets a real mentor from week one.', cons: 'Example review. Pay is a little below larger companies, and client deadlines tend to bunch up at the end of a project.', advice: 'Example review. Publish a clear pay scale so people know how to move up.', rec: 'yes' },
    { status: 'Former employee', title: 'Frontend developer', loc: 'Remote', years: 'Less than 1 year', date: 'Sep 2026', rating: 4, verified: true, sub: { pay: 4, culture: 4, mgmt: 3, growth: 4, wlb: 5 }, pros: 'Example review. Remote-friendly, few meetings and modern tools. Focus time is protected.', cons: 'Example review. Priorities sometimes changed mid-sprint when a client pushed back.', advice: '', rec: 'yes' },
    { status: 'Current employee', title: 'Project manager', loc: 'London', years: '3–5 years', date: 'Aug 2026', rating: 3, verified: false, sub: { pay: 3, culture: 4, mgmt: 3, growth: 2, wlb: 3 }, pros: 'Example review. Friendly team and interesting clients from many industries.', cons: 'Example review. Few senior roles to grow into, and project estimates are often too optimistic.', advice: 'Example review. Plan time for revisions in every estimate.', rec: 'no' }
  ]
};
const EMP_BENEFITS = ['Health insurance','Paid time off','Flexible hours','Remote or hybrid work','Training and courses','Performance bonus','Retirement or provident fund','Parental leave','Travel allowance','Meals at work'];
const EMP_SIZES = ['1–10 people','11–50 people','51–200 people','201–1,000 people','More than 1,000 people'];
let EMPLOYER = store.get('tn_employer', { sample: true, why: 'Example text. We are a small, senior team that pairs every new hire with a mentor, keeps meetings light and protects focus time.', benefits: ['Health insurance','Paid time off','Training and courses','Remote or hybrid work'], size: '11–50 people', hiring: true, roles: 'Product designer, Frontend developer' });

/* ---------- jobs ---------- */
/* Launch switch: true = free listings and free extra job posts. Set to false to start charging ₹499 and ₹99. */
const LAUNCH = true, LAUNCH_END = '31 March 2027', PLAN_PRICE = '[[PB]] a year';
const PLUS_PRICE = 999, PLUS_TRIAL_DAYS = 30, BUSINESS_PRICE = 14999, INVITES_A_MONTH = 1000, TEAM_MAX = 5, LOCATIONS_MAX = 5;
const BASIC_PERKS = ['Verified company badge','Reply publicly to customer and employee reviews','Logo, description and opening hours','A clickable link to your website','Employer branding page','Review links for customers and employees'];
const PLUS_PERKS = ['Bring your past reviews: we confirm each one with the reviewer, then publish it', 'Call, WhatsApp and email buttons, plus social links','Photo gallery (up to 10) and a cover banner','No “similar companies” suggestions on your profile','Offers and updates: 2 posts a month','Website badge with your live rating','Priority support'];
const BUSINESS_PERKS = [`Review invitations: up to ${INVITES_A_MONTH.toLocaleString('en-IN')} emails a month, plus WhatsApp invite links`, 'Rating trends and a monthly report', `Up to ${LOCATIONS_MAX} locations or branches on your page`, `Up to ${TEAM_MAX} team logins`, 'Verification checked within 1 working day', 'Export your reviews as a spreadsheet'];
const planOf = () => (S.user && S.user.plan) || 'basic';
const JOBS_ON = false; /* job posts: coming soon. Set to true to switch the whole jobs feature back on. */
const FREE_JOBS = 5, EXTRA_JOB = 99, JOB_DAYS = 60;
const JOB_TYPES = ['Full-time','Part-time','Contract','Internship'];
const JOB_MODES = ['On-site','Hybrid','Remote'];
const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const dayNum = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5;
const addDays = (iso, n) => new Date((dayNum(iso) + n) * 864e5).toISOString().slice(0, 10);
const fmtDay = iso => new Date(dayNum(iso) * 864e5).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const monthLabel = () => new Date().toLocaleDateString('en-GB', { month: 'long' });
const daysLeft = j => j.closed ? 0 : Math.max(0, dayNum(j.posted) + JOB_DAYS - dayNum(todayISO()));
const isLive = j => !j.closed && daysLeft(j) > 0;
const oneYearOn = iso => (+iso.slice(0, 4) + 1) + iso.slice(4);
let JOBS = store.get('tn_jobs', [
  { id: 'js1', sample: true, biz: 'Brightline Studio', title: 'Junior product designer', loc: 'London, UK', type: 'Full-time', mode: 'Hybrid', pay: '£28,000–34,000 a year', desc: 'Example post. Design screens and prototypes for startup clients with a senior designer as your mentor. A portfolio matters more than a degree.', apply: 'jobs@brightline.example', posted: addDays(todayISO(), -3), closed: false, paid: false },
  { id: 'js2', sample: true, biz: 'Brightline Studio', title: 'Frontend developer', loc: 'Remote (UK)', type: 'Full-time', mode: 'Remote', pay: '£45,000–55,000 a year', desc: 'Example post. Build fast, accessible websites and web apps for startup clients. At least 2 years of experience with modern JavaScript frameworks.', apply: 'jobs@brightline.example', posted: addDays(todayISO(), -24), closed: false, paid: false },
  { id: 'js3', sample: true, biz: 'Brightline Studio', title: 'Project coordinator', loc: 'London, UK', type: 'Part-time', mode: 'Hybrid', pay: '', desc: 'Example post. Plan sprints, keep clients updated and make sure projects ship on time.', apply: 'jobs@brightline.example', posted: addDays(todayISO(), -75), closed: false, paid: false }
]);
const postsThisMonth = biz => JOBS.filter(j => j.biz === biz && j.posted.slice(0, 7) === todayISO().slice(0, 7)).length;
const liveJobsFor = biz => JOBS.filter(j => j.biz === biz && isLive(j)).sort((a, b) => dayNum(b.posted) - dayNum(a.posted));
function addJob(d, paid) {
  JOBS.unshift({ ...d, id: 'j' + Date.now().toString(36), biz: S.user.name, posted: todayISO(), closed: false, paid });
  store.set('tn_jobs', JOBS);
}
function jobCard(j) {
  const isEmail = j.apply.includes('@');
  const href = /^https?:\/\//i.test(j.apply) ? j.apply : 'https://' + j.apply;
  const apply = isEmail
    ? `<span class="meta" style="font-size:14px">Apply by email: <b style="color:var(--fg);user-select:all;overflow-wrap:anywhere">${esc(j.apply)}</b></span><button class="btn g" type="button" data-act="copy-text" data-text="${esc(j.apply)}" style="min-height:40px">Copy email</button>`
    : `<a class="btn p" href="${esc(href)}" target="_blank" rel="nofollow noopener">Apply on company site</a>`;
  const biz = j.biz === 'Brightline Studio' ? `<a href="#co-future-topper" style="text-decoration:none">${esc(j.biz)}</a>` : esc(j.biz);
  const age = dayNum(todayISO()) - dayNum(j.posted);
  return `<article class="review jobcard">
    <div class="jhead">${avatar({ name: j.biz }, 52, 17)}<div><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center"><h3>${esc(j.title)}</h3>${age <= 3 ? '<span class="newtag">New</span>' : ''}</div>
      <span style="font-weight:600;display:flex;flex-wrap:wrap;gap:8px;align-items:center">${biz}<span class="pill ver">${TICK('var(--accent-ink)')}Verified</span>${j.sample ? '<span class="pill cat">Sample</span>' : ''}</span></div>
      <span class="pill ok">${daysLeft(j)} days left</span></div>
    <div class="jtags"><span class="jtag">${ic('pin', 14)}${esc(j.loc)}</span><span class="jtag">${ic('clock', 14)}${esc(j.type)}</span><span class="jtag">${ic('home', 14)}${esc(j.mode)}</span>${j.pay ? `<span class="jtag pay">${ic('cash', 14)}${esc(j.pay)}</span>` : ''}</div>
    <details><summary>Job details</summary><p style="white-space:pre-wrap">${esc(j.desc)}</p></details>
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">${apply}</div>
    <p class="meta">Posted ${age <= 0 ? 'today' : age === 1 ? 'yesterday' : age + ' days ago'} · No fee to apply</p></article>`;
}
function filteredJobs() {
  const f = S.jobFilter; const q = f.q.trim().toLowerCase();
  return JOBS.filter(isLive).filter(j => (!q || q.split(/\s+/).every(w => (j.title + ' ' + j.biz + ' ' + j.loc + ' ' + j.type + ' ' + j.mode).toLowerCase().includes(w))) && (!f.type || j.type === f.type) && (!f.mode || j.mode === f.mode)).sort((a, b) => dayNum(b.posted) - dayNum(a.posted));
}
function jobResults() {
  const list = filteredJobs();
  return `<p class="count" aria-live="polite">${list.length} live job${list.length === 1 ? '' : 's'}</p>` + (list.length ? list.map(jobCard).join('') : `<div class="empty"><b>No jobs match</b><p>Try a different search, or clear the filters.</p></div>`);
}
function vJobsSoon() {
  return `<section class="band hero-band"><div class="wrap" style="padding-block:72px;display:flex;flex-direction:column;gap:16px;max-width:860px;margin:0 auto">
      <p class="eyebrow" style="color:var(--gold)">Jobs · coming soon</p>
      <h1 style="font-size:clamp(34px,5vw,54px);line-height:1.05">Jobs at companies you can check first</h1>
      <p style="color:var(--deep-muted);font-size:18px;line-height:1.6;max-width:640px">Know The Company focuses on customer and employee reviews for now. Once companies have enough reviews, verified businesses will post jobs here, right next to what their employees say.</p>
      <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:6px"><a class="btn gold lg" href="#search">Review a company you worked at</a><a class="btn w lg" href="#list">List your company</a></div></div></section>
    <section class="wrap sec"><h2 class="sr">How jobs will work</h2><div class="steps">
      <div class="step"><span>1</span><h3>Verified employers only</h3><p>Only verified companies will be able to post jobs.</p></div>
      <div class="step"><span>2</span><h3>Reviews beside every job</h3><p>See the company's employee reviews before you apply.</p></div>
      <div class="step"><span>3</span><h3>Never pay to apply</h3><p>Any post that asks applicants for money will be removed.</p></div></div></section>`;
}
function vJobs() {
  if (!JOBS_ON) return vJobsSoon();
  const f = S.jobFilter;
  return `<section class="band"><div class="wrap" style="padding-block:44px 36px;display:flex;flex-direction:column;gap:12px">
      <p class="eyebrow">Jobs</p><h1 style="font-size:clamp(32px,4.5vw,46px);font-weight:800">Jobs at verified companies</h1>
      <p style="color:var(--muted);font-size:18px;max-width:640px">Only verified companies can post jobs. Read a company's employee reviews before you apply.</p></div></section>
    <div class="wrap" style="padding-top:28px"><div class="layout">
      <aside class="side" aria-label="Job filters"><div class="box">
        <div class="field"><label class="l" for="jf-q">Job title, company or city</label><input id="jf-q" type="search" data-jfilter="q" value="${esc(f.q)}"></div>
        <div class="field"><label class="l" for="jf-type">Job type</label><select id="jf-type" data-jfilter="type"><option value="">Any type</option>${JOB_TYPES.map(x => `<option ${f.type === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
        <div class="field"><label class="l" for="jf-mode">Work mode</label><select id="jf-mode" data-jfilter="mode"><option value="">Any</option>${JOB_MODES.map(x => `<option ${f.mode === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>
        <div class="box soft"><h2>Stay safe</h2><p>Real employers never ask you to pay to apply, train or get an offer. Report any post that asks for money.</p><a href="#contact" style="font-weight:700;font-size:14px">Report a job post</a></div>
        <div class="box"><h2>Hiring?</h2><p>A verified listing includes ${FREE_JOBS} job posts every month, each live for ${JOB_DAYS} days.</p><a class="btn p" href="#list">List your company</a></div></aside>
      <div class="mainc" id="job-results">${jobResults()}</div></div></div>`;
}


const PERKS = ['Verified company badge','A link to your website on your profile','Employer branding page: why work here, benefits, team size and photos','Job posts (coming soon)','Your own page in your city and category','Reply publicly to customer and employee reviews','Review links for customers and employees','Logo, photos, hours and contact details','Profile view stats'];
const FAQS = [
  ['Can we see who wrote an employee review?', 'No, not when it is anonymous. Each employee chooses to post anonymously or with their name. We share an anonymous reviewer’s identity only when a valid court order requires it.'],
  ['Can we ask our employees to write reviews?', 'Yes. Share your employee review link with the whole team, not only people you expect to be positive. Don’t offer rewards for reviews or ask to see them first. Invited reviews are labelled.'],
  ['How do the Employees’ Choice awards work?', 'Winners are chosen only from employee ratings. You can’t apply or pay. A company needs at least 10 employee reviews in the year and no sign of review manipulation. The first awards are planned for 2027.'],
  ['We already have Google reviews. Why add this?', 'Keep both. Google is great for maps and directions. Know The Company adds employee reviews next to customer reviews, and a page you can link to from your website, Instagram and WhatsApp.'],
  ['What if someone posts a bad review?', 'Reply publicly with your side, calmly and with facts. If it breaks our guidelines, report it and we check it. We never remove reviews just because they are negative, and an honest reply often wins more trust than a perfect score.'],
  ['Does this help if the site is new?', 'Yes. Your page link and review link work wherever your customers already are: your website, careers page, LinkedIn, proposals and email signature. Visitors from our site come on top of that as it grows.'],

  ['What’s the difference between Basic, Plus and Business?', `Basic gives you a verified profile with a link to your website, replies to reviews and an employer page. Plus ([[PP]] a year) adds call, WhatsApp and email buttons, a photo gallery, offers and updates and no competitor suggestions on your profile. Business ([[PZ]] a year) adds review invitations by email and WhatsApp, rating trends, up to ${LOCATIONS_MAX} branches and up to ${TEAM_MAX} team logins. Every plan is reviewed and rated exactly the same way.`],
  LAUNCH ? ['Is it really free?', `Yes. Companies that join before ${LAUNCH_END} get Basic free for their first year. After that, the listing costs [[PB]] a year by yearly autopay, which you set up only if you want to continue. You can cancel autopay at any time.`] : ['How much does it cost?','[[PB]] a year, paid by yearly autopay. You can cancel at any time, and your listing stays active until the end of the year you paid for.'],
  ['Will a verified listing improve my rating?','No. Ratings come only from reviews. Verified and unverified companies are reviewed and moderated the same way.'],
  ['Can I remove a bad review?','No, but you can reply publicly, and report a review that breaks our guidelines so our team can check it.'],
  ['How does the website link help me?','Customers reading your reviews can visit your site in one click from your verified profile. Links on profiles are marked nofollow or sponsored, as search engines require, so the value is real visitors rather than search ranking.'],
  ['What is the employer branding page?','A “Work at” section on your profile where you show why people should join you: benefits, team size, open roles and photos. It sits beside your employee reviews and never changes your ratings.'],
  ['Can I post jobs?', 'Job posts are coming soon. For now, Know The Company focuses on customer and employee reviews. Verified businesses will be the first to post jobs when they launch.'],
  ['Can I switch plans?', `Yes. Upgrade to Plus at any time from your dashboard${LAUNCH ? `, with ${PLUS_TRIAL_DAYS} days free` : ''}. If you cancel Plus, your profile moves to Basic when the year you paid for ends, and keeps all its reviews.`],
  LAUNCH ? ['Can companies in any country join?','Yes. Companies anywhere can list, and Basic is free for the first year.'] : ['Can I pay from any country?','Yes. Cards from any country are accepted.']
];
const cprof = c => { const r = (c && c.raw) || {};
  return { logo: r.logo, cover: r.cover, about: r.about, founded: r.founded, size: r.teamSize, hq: r.headquarters, web2: r.website2, services: r.services || [], hours: r.hours, phone: r.phone, email: r.publicEmail, address: r.address, socials: r.socials || [],
    photos: (r.photos || []).map(x => typeof x === 'string' ? { src: x } : x).filter(x => x && x.src), updates: (r.updates || []).filter(u => u && u.text) }; };
const icn = (k, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k] || ICONS.layers}</svg>`;
const MAIL_I = '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/>';
function coLogo(c, size) { const L = logoOf(c); const k = toneOf(c.name);
  return L ? `<span class="cologo" style="width:${size}px;height:${size}px"><img src="${esc(L)}" alt="${esc(c.name)} logo" loading="lazy" decoding="async"></span>` : `<span class="cologo" aria-hidden="true" style="width:${size}px;height:${size}px;background:var(--t${k});color:var(--t${k}i)">${esc(initials(c.name))}</span>`; }
function overviewPanel(c, list, er) {
  const P = cprof(c); const plus = coPlan(c) === 'plus'; const nm = esc(c.name);
  const facts = [['Founded', P.founded], ['Team size', P.size], ['Headquarters', P.hq], ['Opening hours', P.hours]].filter(x => x[1]);
  const photos = plus ? P.photos : [];
  const E = coEmployer(c.id);
  const has = P.about || facts.length || P.services.length || photos.length || (plus && P.updates.length) || (E && E.why);
  if (!has) return `<section class="box soft"><h2>${nm} hasn't added details yet</h2><p>This tab shows only what the company writes about itself: its story, key facts, photos and updates. Reviews are on the other tabs.</p></section>`;
  return `${P.about || facts.length || P.services.length ? `<section class="box ovabout" style="gap:18px"><h2 style="font-size:22px">About ${nm}</h2>${P.about ? `<p class="abouttx">${esc(P.about)}</p>` : ''}
      ${facts.length ? `<div class="facts">${facts.map(([k, v]) => `<div><small>${k}</small><b>${esc(v)}</b></div>`).join('')}</div>` : ''}
      ${P.services.length ? `<div style="display:flex;flex-direction:column;gap:10px"><h3 style="font-size:16px">What ${nm} offers</h3><div class="offer-tags">${P.services.map(s => `<span>${esc(s)}</span>`).join('')}</div></div>` : ''}<p class="meta">Written by ${nm}.</p></section>` : ''}
    ${photos.length ? `<section class="box"><div class="toolbar"><h2 style="font-size:20px">Photos</h2><span class="meta">${photos.length} photo${photos.length === 1 ? '' : 's'} from ${nm}</span></div><div class="gallery">${photos.map(x => x.src ? `<figure><img src="${x.src}" alt="${esc(x.cap || 'Photo from ' + c.name)}" loading="lazy"></figure>` : `<div class="ph">${esc(x.cap || 'Photo')}<small>Photo placeholder</small></div>`).join('')}</div></section>` : ''}
    ${plus && P.updates.length ? `<section class="box" style="gap:16px"><h2 style="font-size:20px">Updates from ${nm}</h2>${P.updates.slice(0, 3).map(u => `<div class="upd"><span class="meta">${esc(u.date)}</span><p style="color:var(--fg)">${esc(u.text)}</p></div>`).join('')}<p class="meta">Posted by the company. Updates never change ratings.</p></section>` : ''}
    ${E && E.why ? `<section class="box"><div class="toolbar"><h2 style="font-size:20px">Work at ${nm}</h2>${E.hiring ? '<span class="pill ok">Hiring now</span>' : ''}</div><p style="color:var(--fg)">${esc(E.why)}</p><div><button class="btn o" type="button" data-act="cotab" data-tab="employees">See employee reviews and benefits</button></div></section>` : ''}`;
}
function companyPagePanel() {
  const id = S.user.coId, c = BYID[id], P = cprof(c), plus = planOf() === 'plus';
  const f = (fid, label, v, extra = '') => `<div class="field"><label class="l" for="${fid}">${label}</label><input id="${fid}" type="text" value="${esc(v || '')}" ${extra}></div>`;
  const real = P.photos.filter(x => x.src).length;
  const thisMonth = P.updates.filter(u => u.date === monthNow()).length;
  return `<form class="box" id="cprof-form" style="gap:18px" novalidate><div class="toolbar"><h2 style="font-size:19px">Company page</h2><a class="btn g" href="#${id}">View public page</a></div>
      <p>This is what customers and job seekers see on your Overview tab. Nothing here changes your ratings.</p>
      <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:center">${coLogo(c, 84)}<div style="display:flex;flex-direction:column;gap:8px"><b>Logo</b><div style="display:flex;gap:8px;flex-wrap:wrap"><label class="btn g upload">Upload logo<input type="file" accept="image/*" data-up="logo"></label>${P.logo ? '<button class="btn g" type="button" data-act="cp-del" data-k="logo">Remove</button>' : ''}</div><span class="meta">Square image, at least 200 × 200 pixels.</span></div></div>
      ${plus ? `<div style="display:flex;flex-direction:column;gap:8px"><b>Cover banner</b><div class="coverprev${P.cover ? '' : ' cocover def'}" ${P.cover ? `style="background-image:url('${P.cover}')"` : ''}></div><div style="display:flex;gap:8px;flex-wrap:wrap"><label class="btn g upload">Upload cover<input type="file" accept="image/*" data-up="cover"></label>${P.cover ? '<button class="btn g" type="button" data-act="cp-del" data-k="cover">Remove</button>' : ''}</div><span class="meta">Wide image, at least 1600 × 400 pixels.</span></div>` : ''}
      <div class="field"><label class="l" for="cp-about">About your company</label><textarea id="cp-about" rows="6" maxlength="1500" placeholder="What you do, who you help and what makes you different">${esc(P.about || '')}</textarea><p class="err" id="err-cp-about" hidden>Write at least 60 characters about your company.</p></div>
      <div class="row">${f('cp-founded', 'Founded (year)', P.founded, 'inputmode="numeric" maxlength="4" placeholder="2019"')}<div class="field"><label class="l" for="cp-size">Team size</label><select id="cp-size">${EMP_SIZES.map(s => `<option ${P.size === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>${f('cp-hq', 'Headquarters', P.hq, 'placeholder="City, country"')}</div>
      <p class="err" id="err-cp-founded" hidden>Enter a year between 1900 and this year, or leave it empty.</p>
      ${f('cp-services', 'What you offer <span class="meta">(separate with commas, up to 8)</span>', P.services.join(', '), 'placeholder="Web design, App development, SEO"')}
      <div class="field"><label class="l">Main website</label><p style="font-weight:600">${esc(c.web)} <span class="meta" style="font-weight:400">· verified, can't be changed here</span></p></div>
      <div class="field"><label class="l" for="cp-web2">Second website <span class="meta">(optional, only if your company runs another site, such as a country site)</span></label><input id="cp-web2" type="text" value="${esc(P.web2 || '')}" placeholder="yourcompany.in" autocapitalize="off" spellcheck="false"><p class="err" id="err-cp-web2" hidden></p><p class="meta">It must belong to ${esc(c.name)}. On the live site we check it the same way as your main website before it shows.</p></div>
      ${f('cp-hours', 'Opening hours', P.hours, 'placeholder="Mon–Fri, 9 am–6 pm"')}
      ${plus ? `<div class="row">${f('cp-phone', 'Phone', P.phone)}${f('cp-email', 'Public email', P.email)}</div>${f('cp-address', 'Address', P.address)}${f('cp-socials', 'Social profiles <span class="meta">(separate with commas)</span>', (P.socials || []).join(', '))}` : ''}
      <div><button class="btn p lg" type="submit">Save company page</button></div></form>
    ${plus ? `<section class="box" style="gap:14px"><div class="toolbar"><h2 style="font-size:19px">Photos</h2><span class="pill ${real >= 10 ? 'un' : 'ok'}">${real} of 10 uploaded</span></div>
      <p>Show your team, office, work and events. The first photo appears largest on your page.</p>
      ${P.photos.length ? `<div class="gallery edit">${P.photos.map((x, i) => `<figure>${x.src ? `<img src="${x.src}" alt="Photo ${i + 1}">` : `<div class="ph" style="height:100%">${esc(x.cap || 'Photo')}<small>Placeholder</small></div>`}<button class="del" type="button" data-act="cp-del-photo" data-i="${i}">Remove</button></figure>`).join('')}</div>` : ''}
      <div>${real < 10 ? '<label class="btn o upload">Add photos<input type="file" accept="image/*" multiple data-up="photos"></label>' : '<span class="meta">Remove a photo to add another.</span>'}</div>
      <p class="meta">JPG or PNG. Photos are resized automatically. They go live on your page as soon as you add them.</p></section>
    <form class="box" id="cp-upd-form" style="gap:14px" novalidate><div class="toolbar"><h2 style="font-size:19px">Post an update</h2><span class="pill ${thisMonth >= 2 ? 'un' : 'ok'}">${thisMonth} of 2 this month</span></div>
      <p>Share news, offers or new services. Your latest updates show on your Overview tab.</p>
      <div class="field"><label class="l" for="cp-upd">Update</label><textarea id="cp-upd" rows="3" maxlength="400" placeholder="A new batch starts on 1 December…"></textarea><p class="err" id="err-cp-upd" hidden></p></div>
      <div><button class="btn p" type="submit" ${thisMonth >= 2 ? 'disabled' : ''}>Post update</button></div>
      ${P.updates.length ? `<div style="display:flex;flex-direction:column;gap:12px">${P.updates.map((u, i) => `<div class="upd"><span class="meta">${esc(u.date)}</span><p style="color:var(--fg)">${esc(u.text)}</p><div><button class="link" type="button" data-act="cp-del-upd" data-i="${i}">Delete</button></div></div>`).join('')}</div>` : ''}</form>`
    : `<section class="box soft"><h2>Photos, cover banner, contact buttons and updates</h2><p>These come with Plus. Your logo, about text, key facts and opening hours are included in Basic.</p><div><a class="btn p" href="#pricing">See Plus</a></div></section>`}`;
}
function shrinkImg(file, max) {
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onerror = rej; fr.onload = () => { const im = new Image(); im.onerror = rej; im.onload = () => {
    const k = Math.min(1, max / Math.max(im.width, im.height)); const cv = document.createElement('canvas'); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
    const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(im, 0, 0, cv.width, cv.height); let q = 0.8, url = cv.toDataURL('image/jpeg', q); while (url.length > 420000 && q > 0.35) { q -= 0.1; url = cv.toDataURL('image/jpeg', q); } res(url); }; im.src = fr.result; }; fr.readAsDataURL(file); });
}
const isVerifiedCo = c => !!(c && c.raw && c.raw.claimStatus === 'verified');
const ICO_THUMB = '<path d="M7 11v9H4v-9z"/><path d="M7 11l4-7a2 2 0 0 1 3 2l-1 4h5.5a2 2 0 0 1 2 2.4l-1.3 6A2 2 0 0 1 17.2 20H7"/>';
const ICO_FLAG = '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>';
const svgI = (d, s = 15) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
function openModal(html) { closeModals(); const m = document.getElementById('gmodal'); m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true">${curText(html)}</div>`; m.hidden = false; document.body.style.overflow = 'hidden'; setTimeout(() => { const f = m.querySelector('input,select,textarea,button:not([data-act="close-modal"])'); if (f) f.focus(); }, 30); }
const mHead = title => `<div class="toolbar"><h2 style="font-size:20px">${title}</h2><button class="iconbtn" type="button" data-act="close-modal" aria-label="Close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`;
function rvActions(cid, kind, idx, r, owner) {
  if (owner || !r || !r.wid) return '';
  const R = store.get('ktc_reported', {});
  return `<div class="rvacts">${R[r.wid] ? '<span class="meta">Reported. Our team will review it.</span>' : `<button type="button" class="rvbtn" data-act="rv-report" data-key="${esc(r.wid)}">${svgI(ICO_FLAG)}Report</button>`}</div>`;
}
const RPT_REASONS = ['It isn’t a real experience, or looks fake', 'It’s hateful, abusive or threatening', 'It shares personal information', 'It’s by a competitor, owner or someone paid to write it', 'Something else'];
function rvBreakdown(list) {
  return `<section class="box" style="gap:12px"><div class="toolbar"><h2 style="font-size:18px">Rating breakdown</h2>${S.rvStar ? '<button class="link" type="button" data-act="rv-clear">Show all</button>' : '<span class="meta">Tap a row to filter</span>'}</div><div class="bdown">${[5, 4, 3, 2, 1].map(n => { const k = list.filter(r => r.rating === n).length; return `<button type="button" data-act="rv-star" data-n="${n}" aria-pressed="${S.rvStar === n}"><span>${n} star</span><span class="tr"><i style="width:${list.length ? Math.round(k / list.length * 100) : 0}%"></i></span><span style="text-align:right">${k}</span></button>`; }).join('')}</div></section>`;
}
function rvSorted(list, sort) { const items = list.map((r, i) => [r, i]); if (sort === 'high') items.sort((a, b) => b[0].rating - a[0].rating || a[1] - b[1]); else if (sort === 'low') items.sort((a, b) => a[0].rating - b[0].rating || a[1] - b[1]); return items; }
const sortSel = (attr, v) => `<label class="sr" for="${attr}">Sort reviews</label><select id="${attr}" data-${attr}><option value="new" ${v === 'new' ? 'selected' : ''}>Newest first</option><option value="high" ${v === 'high' ? 'selected' : ''}>Highest rated</option><option value="low" ${v === 'low' ? 'selected' : ''}>Lowest rated</option></select>`;
function rvList(list, cid) {
  const items = rvSorted(list, S.rvSort || 'new').filter(([r]) => (!S.rvStar || r.rating === S.rvStar) && (!S.rvProof || r.proof));
  const bar = `<div class="rvbar"><div class="grp"><button type="button" class="chip" data-act="rv-proof" aria-pressed="${!!S.rvProof}">${S.rvProof ? TICK('var(--accent-soft-ink)') : ''}Proof checked only</button>${S.rvStar ? `<button type="button" class="chip" data-act="rv-clear" aria-pressed="true">${S.rvStar} star ✕</button>` : ''}</div><div class="grp"><span class="meta">${items.length} of ${list.length}</span>${sortSel('rvsort', S.rvSort || 'new')}</div></div>`;
  return bar + (items.length ? items.map(([r, i]) => reviewCard(r, i, cid)).join('') : `<div class="empty"><b>No reviews match these filters</b><button class="btn g" type="button" data-act="rv-clear">Clear filters</button></div>`);
}
const WARNINGS = {};
const warnBan = (c, w) => `<div class="wrap"><div class="warnban" role="note">${svgI('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>', 22)}<div><b>Warning: review manipulation</b>On ${esc(w.date)}, we found evidence that ${esc(c.name)} ${esc(w.text)} We removed the affected reviews. <a href="#guidelines">How we handle this</a></div></div></div>`;
/* A teammate opens the link an owner made in Business tools: once logged in, the server adds them to the
   company's team (astro/src/pages/api/team). */
function vJoinTeam(token) {
  const J = S.join && S.join.token === token ? S.join : (S.join = { token, state: '' });
  if (!S.user) return `<div class="wrap" style="max-width:640px;padding-block:48px"><div class="box" style="gap:14px"><h1 style="font-size:26px">Join your company’s team</h1><p>You’ve been invited to help manage a company page on Know The Company. Log in or create an account with your work email to accept.</p><div><a class="btn p lg" href="#business-login" data-act="join-login" data-token="${esc(token)}">Log in to accept</a></div><p class="meta">Use an account you don’t write reviews with: reviewer and company accounts are kept apart.</p></div></div>`;
  if (!J.state) { J.state = 'busy'; bizApi('team/join', { token }).then(async d => { J.state = 'done'; J.company = d.company; await loadData(true); S.myClaims = undefined; if (curRoute().startsWith('join-team-')) render(); }).catch(e => { J.state = 'err'; J.err = e.message; if (curRoute().startsWith('join-team-')) render(); }); }
  const body = J.state === 'busy' ? '<p>Adding you to the team…</p>' : J.state === 'err' ? `<p class="err" role="alert">${esc(J.err)}</p>` : `<p>You’re on the team${BYWID[J.company] ? ' for ' + esc(BYWID[J.company].name) : ''}. You can now reply to reviews and update the company page.</p><div><a class="btn p lg" href="#dashboard">Open the dashboard</a></div>`;
  return `<div class="wrap" style="max-width:640px;padding-block:48px"><div class="box" style="gap:14px"><h1 style="font-size:26px">Join your company’s team</h1>${body}</div></div>`;
}
function vInvite(c, k) {
  const list = reviewsFor(c.id), er = empData(c.id).reviews; const team = k === 'e';
  return `<div class="wrap"><div class="invite">${coLogo(c, 84)}
    <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;align-items:center"><h1 style="font-size:28px">${esc(c.name)}</h1>${ownerPill(c)}</div>
    ${team ? `<h2 style="font-size:22px">What is it like to work at ${esc(c.name)}?</h2><p style="color:var(--muted)">${esc(c.name)} asked its team for honest reviews. You can post anonymously, and ${esc(c.name)} can't see who wrote an anonymous review.</p><a class="btn p lg" href="#${c.id}" data-act="inv-go" data-id="${c.id}" data-tab="employees">Write an employee review</a>`
      : `<h2 style="font-size:22px">How was your experience with ${esc(c.name)}?</h2><p style="color:var(--muted)">${esc(c.name)} invited you to share honest feedback. Tap a star to start.</p><div class="stars" role="group" aria-label="Star rating">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-act="inv-rate" data-id="${c.id}" data-n="${n}" aria-label="${n} star${n > 1 ? 's' : ''}">${STAR(true, 26)}</button>`).join('')}</div>`}
    <p class="meta" style="max-width:460px">Your review is published whether it's good or bad. ${esc(c.name)} can reply, but can't edit or hide it. Reviews from invitations are labelled “Invited”.</p>
    ${list.length || er.length ? `<a href="#${c.id}" style="font-size:14px;font-weight:700">Read what others say</a>` : ''}</div></div>`;
}
/* coTier: the plan itself (basic, plus or business). coPlan: 'plus' whenever the company has Plus features,
   which Business includes, so every Plus check also lets Business through. */
const coTier = c => (CLAIMS[c.id] && CLAIMS[c.id].plan) || 'basic';
const coPlan = c => coTier(c) === 'basic' ? 'basic' : 'plus';
const isBusiness = c => isVerifiedCo(c) && coTier(c) === 'business';
const TIER_NAME = { basic: 'Basic', plus: 'Plus', business: 'Business' };
const coEmployer = id => (BYID[id] && BYID[id].raw && BYID[id].raw.employerPage) || null;
const curEmp = () => S.user && S.user.coId ? (coEmployer(S.user.coId) || { why: '', benefits: [], size: EMP_SIZES[0], hiring: false }) : EMPLOYER;
function workBox(c) {
  const E = coEmployer(c.id); if (!E || !E.why) return '';
  return `<section class="box" style="gap:14px"><div class="toolbar"><h2 style="font-size:20px">Work at ${esc(c.name)}</h2>${E.hiring ? '<span class="pill ok">Hiring now</span>' : ''}</div>
    <p style="color:var(--fg);font-size:15px;line-height:1.6">${esc(E.why)}</p>
    ${E.benefits && E.benefits.length ? `<div style="display:flex;flex-direction:column;gap:8px"><h3 style="font-size:15px">Benefits</h3><ul class="benefits">${E.benefits.map(b => `<li>${TICK()}${esc(b)}</li>`).join('')}</ul></div>` : ''}
    <div class="kv"><span>Team size</span><span>${esc(E.size)}</span></div>
    <p class="meta">Written by ${esc(c.name)}. It never changes its ratings.</p></section>`;
}
function coLinks(c) {
  if (!isVerifiedCo(c) || coPlan(c) !== 'plus') return '';
  const P = cprof(c);
  if (!P.phone && !P.email) return '';
  const tel = String(P.phone || '').replace(/[^+\d]/g, ''), wa = tel.replace(/^\+/, '');
  return `<div class="colinks">${tel ? `<a href="tel:${tel}">${icn('phone')}Call</a><a href="https://wa.me/${wa}" target="_blank" rel="noopener">${icn('chat')}WhatsApp</a>` : ''}${P.email ? `<a href="mailto:${esc(P.email)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${MAIL_I}</svg>Email</a>` : ''}</div>`;
}
function coSide(c) {
  const cl = CLAIMS[c.id];
  if (!cl) return `<div class="box"><h2>Is this your company?</h2><p>Claim this profile to verify it, reply to reviews and set up an employer page.</p><a class="btn p" href="#claim" data-act="claim" data-id="${c.id}" data-name="${esc(c.name)}" data-web="${esc(c.web)}">${LAUNCH ? 'Claim free' : 'Claim for [[PB]] a year'}</a></div>
      <div class="box soft"><h2>About this listing</h2><p>This profile was created from public information so customers and employees can share reviews. ${esc(c.name)} has not claimed it and is not affiliated with Know The Company.</p><div style="display:flex;flex-wrap:wrap;gap:14px"><a href="#guidelines" style="font-size:14px;font-weight:700">How we list companies</a><button class="link" type="button" data-act="suggest" data-id="${c.id}" style="font-size:14px">Suggest an edit</button></div></div>`;
  if (!isVerifiedCo(c)) return `<div class="box soft"><h2>Claimed by the company</h2><p>${esc(c.name)} has claimed this profile. We're checking its documents, and the Verified badge appears once that's done. Verification never changes ratings.</p></div>`;
  const P = cprof(c); const plus = coPlan(c) === 'plus';
  return (plus && P.phone ? `<div class="box"><h2>Contact and location</h2>${P.address ? `<div class="kv"><span>Address</span><span>${esc(P.address)}</span></div>` : ''}<div class="kv"><span>Phone</span><span>${esc(P.phone)}</span></div>${P.email ? `<div class="kv"><span>Email</span><span>${esc(P.email)}</span></div>` : ''}${P.hours ? `<div class="kv"><span>Hours</span><span>${esc(P.hours)}</span></div>` : ''}${P.socials && P.socials.length ? `<div class="kv"><span>Social</span><span>${P.socials.map(esc).join(' · ')}</span></div>` : ''}</div>` : '')
    + (!plus && P.hours ? `<div class="box"><h2>Opening hours</h2><p>${esc(P.hours)}</p></div>` : '')
    + (isBusiness(c) && (c.raw.locations || []).some(l => l && l.name) ? `<div class="box"><h2>Branches</h2>${(c.raw.locations || []).filter(l => l && l.name).slice(0, LOCATIONS_MAX).map(l => `<div class="kv" style="flex-direction:column;align-items:flex-start;gap:2px"><b>${esc(l.name)}</b>${l.address ? `<span>${esc(l.address)}</span>` : ''}${l.phone ? `<span class="meta">${esc(l.phone)}</span>` : ''}</div>`).join('')}</div>` : '')
    + `<div class="box soft"><h2>What “Verified” means</h2><p>${cl.verified === 'documents' ? `We checked official documents for ${esc(c.name)}.` : `${esc(c.name)} proved it controls ${cl.verified === 'website' ? 'the website' : 'an email address on'} ${esc(c.web)}.`} Verification never changes its rating, and the company can't edit or hide reviews.</p></div>
      <div class="box"><h2>Do you manage ${esc(c.name)}?</h2><p>Log in to reply to reviews and keep this page up to date.</p><a class="btn o" href="#business-login" style="align-self:flex-start">Company login</a></div>`;
}
function ownReviews(co, rv, er) {
  const form = (k, i) => `<form class="oreply" data-kind="${k}" data-idx="${i}" novalidate style="display:flex;flex-direction:column;gap:8px"><label class="l" for="or-${k}-${i}">Reply publicly</label><textarea id="or-${k}-${i}" rows="2" maxlength="800" placeholder="Thank them, or respond to their point"></textarea><p class="err" hidden>Write a reply before posting.</p><div><button class="btn p" type="submit">Post reply</button></div></form>`;
  const wrap = (card, f) => `<div style="display:flex;flex-direction:column;gap:10px">${card}${f}</div>`;
  const ra = (k, i, r) => rvActions(co.id, k, i, r, true);
  const waiting = rv.filter(r => !r.reply).length + er.filter(r => !r.reply).length;
  return `<section class="box soft"><h2>${waiting ? `${waiting} review${waiting === 1 ? '' : 's'} waiting for your reply` : 'You have replied to every review'}</h2><p>Replies are public. You can't edit or remove reviews, and replying never changes your rating.</p></section>
    <h2 style="font-size:20px">Customer reviews (${rv.length})</h2>${rv.length ? rv.map((r, i) => wrap(reviewCard(r) + ra('c', i, r), r.reply ? '' : form('c', i))).join('') : '<p class="meta">No customer reviews yet.</p>'}
    <h2 style="font-size:20px">Employee reviews (${er.length})</h2>${er.length ? er.map((r, i) => wrap(empCard(r, i, co.id) + ra('e', i, r), r.reply ? '' : form('e', i))).join('') : '<p class="meta">No employee reviews yet.</p>'}`;
}
const domOf = w => (w || '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[\/?#]/)[0];
const emailDom = e => ((e || '').split('@')[1] || '').toLowerCase().trim();
const FREE_MAIL = ['gmail.com','googlemail.com','yahoo.com','yahoo.co.in','outlook.com','hotmail.com','live.com','msn.com','icloud.com','me.com','proton.me','protonmail.com','aol.com','rediffmail.com','zoho.com','yandex.com','gmx.com','mail.com'];
const domainMatch = (email, web) => { const e = emailDom(email), d = domOf(web); return !!e && !!d && !FREE_MAIL.includes(e) && (e === d || e.endsWith('.' + d)); };
const isClaimed = c => !!CLAIMS[c.id] || c.added === 2;
const listedByMe = c => !!(c && c.pending && S.user && c.raw._owner === S.user.id);
/* Each claim gets its own random token for the website check, so a record left by someone else can't be reused. */
const newCf = () => { let t = ''; try { t = [...crypto.getRandomValues(new Uint8Array(10))].map(b => b.toString(16).padStart(2, '0')).join(''); } catch (e) { t = Math.random().toString(36).slice(2) + Date.now().toString(36); } return { method: 'website', token: 'ktc-' + t }; };
const vToken = s => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return 'ktc-' + h.toString(36) + (h % 997).toString(36); };
const ownerPill = c => { const cl = CLAIMS[c.id]; if (cl || c.added === 2) { const v = isVerifiedCo(c); return v ? `<span class="pill ver" style="font-size:13px">${TICK('var(--accent-ink)')}Verified company</span>` : '<span class="pill cat" style="font-size:13px">Claimed · verification in progress</span>'; } return `<span class="pill un" style="font-size:13px">Unclaimed profile</span>${c.added ? '<span class="pill cat" style="font-size:13px">Added by a reviewer</span>' : ''}`; };
const ROLES = ['Founder or owner', 'HR or people team', 'Marketing or communications', 'Recruiting', 'Other role'];
function cfResults(q) {
  q = (q || '').trim().toLowerCase();
  const listing = S.flow === 'list';
  if (!q) return `<p class="meta">${listing ? 'Type your company’s name or website. We’ll check it isn’t already on Know The Company.' : 'Start typing your company’s name or website.'}</p>`;
  const dq = domOf(q);
  const list = COS.filter(c => c.name.toLowerCase().includes(q) || (dq && c.web.includes(dq))).slice(0, 6);
  const row = c => listedByMe(c) ? `<div class="cfrow">${avatar(c, 40, 14)}<div class="t"><b>${esc(c.name)}</b><small>${esc(c.web)} · listed by you, not live yet</small></div><a class="btn p" href="#dashboard">Finish in your dashboard</a></div>` : `<div class="cfrow">${avatar(c, 40, 14)}<div class="t"><b>${esc(c.name)}</b><small>${esc(c.web)} · ${esc(c.country)}${isClaimed(c) ? ' · already managed' : ''}</small></div>${isClaimed(c) ? `<button class="btn g" type="button" data-act="cf-request" data-id="${c.id}">Request access</button>` : listing ? `<a class="btn g" href="#claim" data-act="claim" data-id="${c.id}">Claim it instead</a>` : `<button class="btn p" type="button" data-act="cf-claim" data-id="${c.id}">Claim</button>`}</div>`;
  if (listing) return `<div class="cfres">${list.length ? `<p class="meta">${list.length === 1 ? 'This company is' : 'These companies are'} already on Know The Company. If one is yours, claim it instead and keep its reviews.</p>${list.map(row).join('')}` : '<p class="meta">Not on Know The Company yet. Add it below.</p>'}
    <div class="cfnew"><span><b>${list.length ? 'Yours isn’t here?' : 'Ready to add it?'}</b> <span class="meta">Add your company in a couple of minutes.</span></span><button class="btn p" type="button" data-act="cf-new">Add your company</button></div></div>`;
  return `<div class="cfres">${list.length ? list.map(row).join('') : `<p class="meta">No listed company matches “${esc(q)}”.</p>`}
    <div class="cfnew"><span><b>Not listed yet?</b> <span class="meta">Add your company instead.</span></span><a class="btn o" href="#list">List your company</a></div></div>`;
}
function cfRefresh(scroll = true) { const p = document.getElementById('claim-panel'); if (p) { p.innerHTML = curText(claimPanel()); if (scroll) document.getElementById('list-form-area').scrollIntoView({ block: 'start' }); } }
function claimPanel() {
  const blk = claimBlock(); if (blk) return blk;
  const d = S.listData, st = S.listStep, cf = S.cf || (S.cf = newCf());
  const labels = S.flow === 'list' ? ['Check it’s new', 'Company details', 'Verify and plan'] : ['Find your company', 'Your details', 'Verify and plan'];
  const steps = typeof st === 'number' && st < 4 ? `<div class="progress" aria-label="Progress">${labels.map((l, i) => `<span class="${st === i ? 'on' : ''}">${i + 1} · ${l}</span>`).join('')}</div>` : '';
  const co = d.coId ? BYID[d.coId] : null;
  if (!S.user) return `<div class="formcard"><h2>Log in to ${S.flow === 'list' ? 'list' : 'claim'} your company</h2><p style="color:var(--muted)">A free account keeps every company page in the right hands. Any email works, including Gmail.</p><div><button class="btn p lg" type="button" data-act="gate-list-login">Log in or create an account</button></div></div>`;
  if (st === 'req') { const c = BYID[S.reqCo]; return `<form class="formcard" id="req-form" novalidate><h2>Request access to ${esc(c.name)}</h2>
      <div class="cosum">${avatar(c, 44, 15)}<div style="flex:1"><b>${esc(c.name)}</b><span class="meta">${esc(c.web)} · already managed</span></div></div>
      <p style="color:var(--muted)">Someone at ${esc(c.name)} already manages this page. We’ll ask them to add you. If they don’t reply within 7 days, our team reviews your request and may ask for documents.</p>
      <div class="row"><div class="field"><label class="l" for="r-person">Your name</label><input id="r-person" type="text"><p class="err" id="err-r-person" hidden>Enter your name.</p></div>
        <div class="field"><label class="l" for="r-role">Your role</label><select id="r-role">${ROLES.map(r => `<option>${r}</option>`).join('')}</select></div></div>
      <div class="field"><label class="l" for="r-email">Email</label><input id="r-email" type="email" placeholder="you@${esc(c.web)}"><p class="err" id="err-r-email" hidden>Enter a valid email address.</p></div>
      <div class="field"><label class="l" for="r-msg">Message to the current admin <span class="meta">(optional)</span></label><textarea id="r-msg" rows="3" maxlength="500"></textarea></div>
      <div style="display:flex;flex-wrap:wrap;gap:12px"><button class="btn p lg" type="submit">Send request</button><button class="btn g lg" type="button" data-act="cf-restart">Back to search</button></div></form>`; }
  if (st === 'req-done') { const c = BYID[S.reqCo]; return `<div class="formcard"><div class="vstate ok">${TICK('var(--accent-soft-ink)')}<span>Request sent for ${esc(c.name)}.</span></div><p style="color:var(--muted)">We’ll contact the current admin and email you when they respond. If they don’t within 7 days, our team reviews your request.</p><div><button class="btn g lg" type="button" data-act="cf-restart">Back to search</button></div></div>`; }
  if (st === 0) return `<div class="formcard">${steps}<h2>${S.flow === 'list' ? 'Add your company' : 'Find your company'}</h2><p style="color:var(--muted)">${S.flow === 'list' ? 'First, check it isn’t already on Know The Company.' : 'Search for your company. Claim it to manage its page and keep its reviews.'}</p>
      <div class="field"><label class="l" for="cf-q">Company name or website</label><input id="cf-q" type="search" autocomplete="off" value="${esc(S.cfQ || '')}" placeholder="Your company name or website"></div>
      <div id="cf-res">${cfResults(S.cfQ || '')}</div></div>`;
  if (st === 1) { const claim = d.mode === 'claim' && co;
    return `<form class="formcard" id="list-form" novalidate>${steps}<h2>${claim ? `Claim ${esc(co.name)}` : 'Add your company'}</h2>
      ${claim ? `<div class="cosum">${avatar(co, 44, 15)}<div style="flex:1;min-width:0"><b>${esc(co.name)}</b><span class="meta">${esc(co.web)} · ${esc(co.cat)}</span></div><button class="link" type="button" data-act="cf-restart">Not your company?</button></div>`
      : `<div class="row"><div class="field"><label class="l" for="b-name">Company name</label><input id="b-name" type="text" value="${esc(d.name || '')}"><p class="err" id="err-b-name" hidden>Enter your company name.</p></div>
         <div class="field"><label class="l" for="b-web">Company website</label><input id="b-web" type="text" inputmode="url" value="${esc(d.web || '')}" placeholder="yourcompany.com"><p class="err" id="err-b-web" hidden>Enter your website, like yourcompany.com.</p></div></div>
       <div class="row"><div class="field"><label class="l" for="b-cat">Category</label><select id="b-cat"><option value="">Choose a category</option>${FORM_CATS.map(n => `<option ${d.cat === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select><p class="err" id="err-b-cat" hidden>Choose a category.</p></div>
         <div class="field"><label class="l" for="b-country">Country</label><select id="b-country">${['United States','United Kingdom','Canada','Australia','Germany','India','Singapore','United Arab Emirates','Other country'].map(n => `<option ${d.country === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>
       <div class="row"><div class="field"><label class="l" for="b-city">Head office city</label><input id="b-city" type="text" value="${esc(d.city || '')}"><p class="err" id="err-b-city" hidden>Enter your head office city.</p></div>
         <div class="field"><label class="l" for="b-type">Way of working</label><select id="b-type">${['Remote-first','Office-based','Hybrid'].map(n => `<option ${d.type === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>`}
      <h3 style="font-size:17px">About you</h3>
      <div class="row"><div class="field"><label class="l" for="b-person">Your name</label><input id="b-person" type="text" value="${esc(d.person || '')}"><p class="err" id="err-b-person" hidden>Enter your name.</p></div>
        <div class="field"><label class="l" for="b-role">Your role</label><select id="b-role">${ROLES.map(r => `<option ${d.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div></div>
      <div class="row"><div class="field"><label class="l" for="b-email">Email</label><input id="b-email" type="email" value="${esc(d.email || '')}" placeholder="you@${esc(domOf(d.web) || 'yourcompany.com')}" aria-describedby="hint-b-email"><p class="meta" id="hint-b-email">Any email works, including Gmail.</p><p class="err" id="err-b-email" hidden>Enter an email address like name@company.com.</p></div>
        <div class="field"><label class="l" for="b-phone">Phone</label><input id="b-phone" type="tel" value="${esc(d.phone || '')}"><p class="err" id="err-b-phone" hidden>Enter a phone number with at least 8 digits.</p></div></div>
      <label class="check"><input id="b-agree" type="checkbox" ${d.agree ? 'checked' : ''}><span>I work for this company and can manage its page. I understand paying never affects reviews or ratings.</span></label>
      <p class="err" id="err-b-agree" hidden>Tick the box to continue.</p>
      <div style="display:flex;flex-wrap:wrap;gap:12px"><button class="btn p lg" type="submit">Continue</button><button class="btn g lg" type="button" data-act="cf-restart">Back</button></div></form>`; }
  if (st === 2) { const m = ['website', 'docs', 'id'].includes(cf.method) ? cf.method : (cf.method = 'website'), dom = domOf(d.web), tok = cf.token || (cf.token = newCf().token);
    const opt = (k, title, desc, tag) => `<button type="button" class="vopt" data-act="cf-method" data-m="${k}" aria-pressed="${m === k}">${tag ? `<span class="rec">${tag}</span>` : ''}<b>${title}</b><small>${desc}</small></button>`;
    const fileField = (label, hint) => `<div class="field"><label class="l" for="cf-file">${label}</label><input id="cf-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" aria-describedby="hint-cf-file"><p class="meta" id="hint-cf-file">${hint} A photo or scan works: JPG, PNG or PDF. Only our team sees it.</p>${cf.fileName ? `<p class="meta">Attached: <b>${esc(cf.fileName)}</b></p>` : ''}<p class="err" id="err-cf-file" ${cf.fileErr ? '' : 'hidden'}>${esc(cf.fileErr || 'Attach the file to continue.')}</p></div>`;
    let body = '';
    if (m === 'website') body = `<p>Add <b>one</b> of these to ${esc(dom || 'your website')}, then send your claim and press <b>Check my website</b>. When we find it, you’re verified straight away. You can remove it afterwards.</p>
      <div class="field"><span class="l">Option 1 · DNS TXT record on ${esc(dom || 'your domain')}</span><div class="codebox">knowthecompany-verification=${tok}</div></div>
      <div class="field"><span class="l">Option 2 · Tag in your homepage’s &lt;head&gt;</span><div class="codebox">&lt;meta name="knowthecompany-verification" content="${tok}"&gt;</div></div>`;
    if (m === 'docs') body = `<p>Upload one official document that shows the company name, like a registration certificate, a tax or GST registration, or a recent invoice in the company’s name. You can choose your plan straight away, and your Verified badge goes live once our team has checked it.</p>
      <div class="field"><label class="l" for="cf-doctype">Document</label><select id="cf-doctype">${['Company registration certificate','Tax or GST registration','Recent invoice in the company’s name','Other official document'].map(x => `<option ${cf.docType === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      ${fileField('Upload the document', 'Up to 5 MB.')}`;
    if (m === 'id') body = `<p>Upload your company ID card, the one that shows your name, photo and the company’s name. You can choose your plan straight away, and your Verified badge goes live once our team has checked it.</p>
      ${fileField('Upload your ID card', 'Front side, up to 5 MB.')}`;
    const ready = true;
    return `<div class="formcard">${steps}<h2>Verify you work at ${esc(d.name)}</h2><p style="color:var(--muted)">Choose one way.</p>
      <div class="vopts">${opt('website', 'Website', 'Add a DNS record or a tag', 'Instant')}${opt('docs', 'Documents', 'Checked by our team')}${opt('id', 'ID card', 'Your company ID, checked by our team')}</div>
      <div class="vbody">${body}</div>
      <h3 style="font-size:17px">Choose a plan</h3>
      <div class="planpick"><label><input type="radio" name="plan" value="basic" ${!['plus', 'business'].includes(d.plan) ? 'checked' : ''}><span><b>Basic</b><small>${LAUNCH ? 'Free for your first year, then [[PB]] a year' : '[[PB]] a year'}</small></span></label>
        <label><input type="radio" name="plan" value="plus" ${d.plan === 'plus' ? 'checked' : ''}><span><b>Plus</b><small>${LAUNCH ? `${PLUS_TRIAL_DAYS} days free, then [[PP]] a year` : `[[PP]] a year`}. Contact buttons, photos, offers and updates</small></span></label>
        <label><input type="radio" name="plan" value="business" ${d.plan === 'business' ? 'checked' : ''}><span><b>Business</b><small>[[PZ]] a year. Everything in Plus, with review invitations, trends, branches and team logins</small></span></label></div>
      <p class="meta">${LAUNCH ? 'No payment now. Nothing is charged when a free period ends unless you set up autopay.' : 'Plans renew every year by autopay. You can cancel at any time.'}</p>
      <div style="display:flex;flex-wrap:wrap;gap:12px"><button class="btn p lg" type="button" data-act="cf-submit" ${ready ? '' : 'disabled'}>Send my claim</button><button class="btn g lg" type="button" data-act="cf-edit">Back to your details</button></div></div>`; }
  const pageId = d.coWid && BYWID[d.coWid] ? BYWID[d.coWid].id : '', claimCo = d.coWid ? BYWID[d.coWid] : null;
  const viaWeb = d.method === 'website';
  return `<div class="formcard"><div style="display:flex;align-items:center;gap:12px">${TICK()}<h2>${claimCo && claimCo.pending ? 'Listing received for' : 'Claim received for'} ${esc(d.name)}</h2></div>
    ${claimCo && claimCo.pending ? `<p class="meta">Your page is saved and only you can see it. It goes live for everyone once you choose your plan below, or once our team has checked your proof.</p>` : ''}
    ${viaWeb ? `<div class="vstate ok"><span>Once the record is on ${esc(domOf(d.web) || 'your website')}, press <b>Check my website</b>. When we find it, you’re verified straight away.</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center"><button class="btn p lg" type="button" data-act="claim-check" data-wid="${esc(d.coWid || '')}" ${S.checking ? 'disabled' : ''}>${S.checking ? 'Checking…' : 'Check my website'}</button>${S.checkMsg ? `<span class="meta" role="status">${esc(S.checkMsg)}</span>` : ''}</div>`
      : `<div class="vstate ok"><span>Our team checks your ${d.method === 'id' ? 'ID card' : 'document'}, usually within 2 working days. Your Verified badge goes live when the check passes, and you can follow it in your dashboard.</span></div>`}
    ${claimCo ? planPanel(claimCo, true) : ''}
    <div style="display:flex;flex-wrap:wrap;gap:12px"><a class="btn g lg" href="#dashboard">Go to your dashboard</a>${pageId ? `<a class="btn g lg" href="#${pageId}">View your page</a>` : ''}</div></div>`;
}

function calcOut(sale) {
  const n = p => Math.max(1, Math.ceil(p / Math.max(1, sale)));
  const c = p => `${n(p)} new ${n(p) === 1 ? 'customer' : 'customers'} a year`;
  return `<div><small>Basic, ₹499 a year</small><b>${n(499)}</b><em>${c(499)} covers it${LAUNCH ? ' (free in your first year)' : ''}</em></div>
    <div><small>Plus, ₹${PLUS_PRICE} a year</small><b>${n(PLUS_PRICE)}</b><em>${c(PLUS_PRICE)} covers it</em></div>`;
}
/* Claim: the company is already on the site. List (vList): the company isn't, so it is added first.
   Both use the same three-step form (claimPanel), with S.flow telling it which one it is. */
function vClaim() {
  const panel = `<div id="claim-panel">${claimPanel()}</div>`;
  return `<section class="lbhero"><div class="wrap">
      <div style="flex:1 1 560px;display:flex;flex-direction:column;gap:18px">${crumbs([['Home', '#home'], ['For employers', '#list'], ['Claim your company']])}
        <h1>Claim your company page</h1>
        <p class="lede">Your company is already on Know The Company. Claim its page to reply to reviews, tell job seekers what it’s like to work with you, and get the Verified badge. You keep every review it already has.</p>
        ${LAUNCH ? `<p style="color:var(--deep-muted);font-size:14px">Claim before ${LAUNCH_END} and Basic is free for your first year.</p>` : ''}</div>
    </div></section>
    <section class="wrap sec" id="list-form-area" style="padding-top:40px"><div class="layout">
      <div class="mainc">${panel}</div>
      <aside class="side"><div class="box soft"><h2>How verification works</h2><p>A record on your company’s website verifies you straight away. A company document or your company ID card is checked by our team, usually within 2 working days. Until then, your page shows no Verified badge.</p></div>
        <div class="box"><h2>Not listed yet?</h2><p>If your company isn’t on Know The Company, add it instead.</p><a class="btn o" href="#list">List your company</a></div>
        <div class="box"><h2>Our neutrality pledge</h2><p>A verified listing, free or paid, gives you verification, a profile and its tools. It never buys stars, hides bad reviews or moves you up in ratings.</p></div></aside>
    </div></section>
    <section class="wrap sec"><div class="sechead"><div><h2>How claiming works</h2></div></div><div class="steps">
      <div class="step"><span>1</span><h3>Find your company</h3><p>Search for it by name or website.</p></div>
      <div class="step"><span>2</span><h3>Show it’s yours</h3><p>Add a record to your website, or upload a company document or your company ID card.</p></div>
      <div class="step"><span>3</span><h3>Choose your plan</h3><p>Pick Basic or Plus straight away. Your Verified badge goes live when the check passes.</p></div></div></section>`;
}
function vList() {
  const d = S.listData;
  const panel = `<div id="claim-panel">${claimPanel()}</div>`;
  const ic2 = (path, tone) => `<span class="bi" style="background:var(--t${tone});color:var(--t${tone}i)"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg></span>`;
  return `<section class="lbhero"><div class="wrap">
      <div style="flex:1 1 460px;display:flex;flex-direction:column;gap:18px"><p class="eyebrow" style="color:var(--gold)">For employers</p>
        <h1>Be the company customers trust and people want to work for.</h1>
        <p class="lede">Put your company on Know The Company. Reply to employee and customer reviews, show job seekers what it’s like to work with you, and share proof of your reputation anywhere. It works from day one.</p>
        <div style="display:flex;flex-wrap:wrap;gap:12px"><a class="btn gold lg" href="#list" data-act="to-form">${LAUNCH ? 'List your company free' : 'List your company'}</a><a class="btn g lg" href="#claim">Already listed? Claim it</a></div>
        ${LAUNCH ? `<p style="color:var(--deep-muted);font-size:14px">Join before ${LAUNCH_END} and Basic is free for your first year.</p>` : ''}</div>
      <div class="lbvis" aria-label="Example of how reviews appear on Know The Company"><span class="tagex">Example</span>
        <div class="rc">${starRow(4, 18)}<p class="q">“Students are motivated, and the academic team listens to teachers about the syllabus.”</p><span class="by">Anonymous employee · Maths teacher · Example Company</span><span class="brand">${TICK('var(--accent)')}Reviewed on Know The Company</span></div>
        <div class="chipline"><span>${TICK('var(--accent)')}Verified company</span><span>${STAR(true, 16)} 4.0 from customers</span><span>67% of employees recommend</span></div></div>
    </div></section>
    <section class="wrap sec" id="list-form-area" style="padding-top:40px"><div class="layout">
      <div class="mainc">${panel}</div>
      <aside class="side"><div class="box soft"><h2>How verification works</h2><p>Add a record to your company’s website and you’re verified straight away. Or upload a company document or your company ID card, and our team checks it, usually within 2 working days. You can choose and pay for your plan in the meantime.</p></div>
        <div class="box"><h2>Our neutrality pledge</h2><p>A verified listing, free or paid, gives you verification, a profile and its tools. It never buys stars, hides bad reviews or moves you up in ratings.</p></div></aside>
    </div></section>

    <section class="wrap sec"><div class="sechead"><div><p class="eyebrow">Why it matters</p><h2>People check before they choose you, or join you</h2><p>Customers read reviews before choosing a company, and job seekers read them before applying. Both notice whether you reply.</p></div></div>
      <div class="statband"><div class="s"><b>88%</b><span>of consumers are likely to use a business that replies to all its reviews, good and bad.</span></div><div class="s"><b>42%</b><span>would still use a business that replies to none.</span></div></div>
      <p class="meta" style="margin-top:12px">Source: <a href="https://www.brightlocal.com/research/local-consumer-review-survey/" target="_blank" rel="noopener">BrightLocal Local Consumer Review Survey 2023</a>.</p></section>

    <section class="wrap sec"><div class="sechead"><div><p class="eyebrow">What you get</p><h2>Six ways your company page works for you</h2></div><a href="#why-list" style="font-weight:700">All 12 reasons</a></div>
      <div class="bens mshort-3">
        <div class="ben">${ic2('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>', 1)}<h3>Tell your story to job seekers</h3><p>Your employer page shows why people should work for you: your mission, benefits, team photos and company updates, right next to what employees say.</p>
          <div class="prev"><b style="font-size:14px">Work at your company</b><span class="meta">Why work here · benefits · photos · updates</span></div></div>
        <div class="ben">${ic2('<path d="M4 5h16v11H9.5L5 20v-4H4z"/>', 2)}<h3>Reply to employees and customers</h3><p>Answer every review publicly, from your team and your customers. Thank people, explain what changed, and show you listen.</p>
          <div class="prev"><span>${starRow(3, 13)} <b>Anonymous employee · Sales</b></span><span>“Good team, but no clear path to promotion.”</span><span class="rep"><b>Employer reply:</b> Thanks for this. We now run reviews every 6 months with a clear growth plan.</span></div></div>
        <div class="ben">${ic2('<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 3v12M7 8l5-5 5 5"/>', 3)}<h3>Ask for reviews, the fair way</h3><p>Share one link with your team and another with customers. Employee reviews stay anonymous unless the writer chooses otherwise, and invited reviews are labelled.</p>
          <div class="prev"><span class="mini">${TICK('var(--accent)')}Employee review link</span><span class="mini">${TICK('var(--accent)')}Customer review link</span></div></div>
        <div class="ben">${ic2('<path d="M4 19h16"/><path d="M7 15v-4M12 15V7M17 15v-7"/>', 4)}<h3>Workplace insights</h3><p>See how people rate pay, management, growth and work-life balance.</p>
          <div class="prev">${[['Work-life balance', '82%', '4.1'], ['Pay and benefits', '72%', '3.6'], ['Management', '64%', '3.2']].map(([l, w, v]) => `<div class="bar"><span>${l}</span><i style="--w:${w}"></i><b>${v}</b></div>`).join('')}<span class="meta">Example data</span></div></div>
        <div class="ben">${ic2('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>', 5)}<h3>Proof you can share anywhere</h3><p>Link to your page from your website and careers page, and send your review link on LinkedIn, Instagram and WhatsApp. Independent reviews persuade more than your own words.</p>
          <div class="prev"><span class="mini">${TICK('var(--accent)')}4.7 on Know The Company</span><span class="meta">Page link · review link</span></div></div>
        <div class="ben">${ic2('<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>', 6)}<h3>Proof you're a real company</h3><p>Your Verified badge tells job seekers and customers your company checked out. That matters when fake job offers and copycat shops are everywhere.</p>
          <div class="prev"><span class="mini">${TICK('var(--accent)')}Verified company</span><span class="meta">Website, documents or ID card checked</span></div></div>
      </div></section>

    <section class="wrap sec"><div class="sechead"><div><p class="eyebrow">Your first week</p><h2>Value from day one, not one day</h2></div></div>
      <ol class="week" style="padding:0;margin:0">
        <li><b>Day 1</b><span>Company page live</span><small>Claim or add your company and get your review links.</small></li>
        <li><b>Day 2</b><span>Tell your story</span><small>Add why people should work for you, your benefits and team photos.</small></li>
        <li><b>Day 3</b><span>Invite your team and customers</span><small>Share the links. Employee reviews stay anonymous unless the writer chooses otherwise.</small></li>
        <li><b>Day 5</b><span>Reply to your first reviews</span><small>Thank people and answer their questions.</small></li>
        <li><b>Day 7</b><span>Verified badge on</span><small>We usually finish checks within 2 working days.</small></li>
      </ol></section>

    <section class="wrap sec"><div class="sechead"><div><p class="eyebrow">Awards</p><h2>Employees’ Choice: Best Workplaces</h2><p>Every year we recognise the best places to work, chosen only from employee ratings. You can't apply, nominate yourself or pay to win.</p></div></div>
      <div class="bens awards" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">${[['Startups, up to 50 people', 'For young teams where every person shapes the culture.'], ['Growing companies, 51–250', 'For companies building their first managers and processes.'], ['Mid-sized companies, 251–1,000', 'For established employers that still move fast.'], ['Best startup to work for', 'For young companies of any size that look after their people.']].map(([h, p], k) => `<div class="ben">${ic2('<circle cx="12" cy="9" r="6"/><path d="M8.5 14l-1.5 7 5-3 5 3-1.5-7"/>', (k % 6) + 1)}<h3>${h}</h3><p>${p}</p></div>`).join('')}</div>
      <p class="meta" style="margin-top:14px">Winners are announced once a year; the next list comes out in 2027. To qualify, a company needs at least 10 employee reviews in the year and no sign of review manipulation. Winners get a badge for their website and careers page.</p></section>

    <section class="wrap sec"><div class="calc">
      <div class="in"><p class="eyebrow" style="color:var(--gold)">Is it worth it?</p><h2>See when it pays for itself</h2><p>Enter what one customer usually spends with you.</p>
        <label for="calc-sale">Average sale</label><div class="money"><span>₹</span><input id="calc-sale" type="number" inputmode="numeric" min="1" step="1" value="${S.calcSale || 1500}"></div></div>
      <div class="out" aria-live="polite">${calcOut(S.calcSale || 1500)}</div>
    </div></section>

    <section class="wrap sec"><div class="box soft" style="flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px"><div style="display:flex;flex-direction:column;gap:6px;flex:1 1 420px"><h2 style="font-size:22px">Plans from free</h2><p>${LAUNCH ? 'Basic is free for your first year.' : 'Basic is [[PB]] a year.'} Plus is [[PP]] a year, and Business, for teams and several branches, is [[PZ]] a year. Every plan is reviewed and rated exactly the same way.</p></div><a class="btn p lg" href="#pricing">See plans and pricing</a></div></section>
    <section class="wrap sec"><div class="fair"><h2>Paying never changes your rating. That's why people trust the badge.</h2><ul>${['Every review is published the same way, good or bad','You can reply, but you can never remove or hide a review','You never see who wrote an anonymous employee review','Plans add tools, never stars, ranking or awards'].map(x => `<li>${TICK('var(--accent)')}${x}</li>`).join('')}</ul></div></section>
    <section class="wrap sec" style="max-width:900px"><div class="sechead"><div><p class="eyebrow">Fair questions</p><h2>What employers ask us</h2></div></div><div style="display:flex;flex-direction:column;gap:10px">${FAQS.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div></section>`;
}

function employerPanel() {
  const E = curEmp();
  return `<form class="box" id="employer-form" style="gap:16px" novalidate><div class="toolbar"><h2 style="font-size:19px">Employer branding page</h2><span class="pill ok">Included in every plan</span></div>
    <p>Show job seekers why they should work for you. It appears as “Work at ${esc(S.user.name)}” on your profile, next to your employee reviews, and never changes your ratings.</p>
    <div class="field"><label class="l" for="ep-why">Why work here?</label><textarea id="ep-why" rows="4" maxlength="800" placeholder="e.g. We train every new hire on the job, pay overtime fairly and keep most weekends free.">${esc(E.sample && !S.user.sample ? '' : E.why)}</textarea><p class="err" id="err-ep-why" hidden>Write at least 40 characters about working with you.</p></div>
    <fieldset style="border:0;margin:0;padding:0;display:flex;flex-direction:column;gap:8px"><legend class="l" style="margin-bottom:8px">Benefits you offer</legend><div class="benefits">${EMP_BENEFITS.map((b, i) => `<label class="check" style="font-size:14px"><input type="checkbox" id="ep-b${i}" value="${esc(b)}" ${E.benefits.includes(b) ? 'checked' : ''}><span>${esc(b)}</span></label>`).join('')}</div></fieldset>
    <div class="row"><div class="field"><label class="l" for="ep-size">Team size</label><select id="ep-size">${EMP_SIZES.map(s => `<option ${E.size === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="field" style="justify-content:flex-end"><p class="meta" style="font-size:14px;padding-bottom:12px">${JOBS_ON ? 'Open jobs on your profile come from the <button class="link" type="button" data-act="tab" data-tab="jobs" style="font-size:14px">Jobs tab</button>.' : 'Job posts are coming soon.'}</p></div></div>
    <label class="check"><input id="ep-hiring" type="checkbox" ${E.hiring ? 'checked' : ''}><span>Show a “Hiring now” label on my profile.${JOBS_ON ? ' It also shows automatically while you have live jobs.' : ''}</span></label>
    <div class="photos">${[1, 2, 3].map(() => `<div class="ph">Add photo<small>Uploads on the live site</small></div>`).join('')}</div>
    <div style="display:flex;flex-wrap:wrap;gap:10px"><button class="btn p" type="submit">Save employer page</button><a class="btn g" href="${S.user.coId ? '#' + S.user.coId : '#sample'}">View on profile</a></div></form>`;
}

function jobsPanel() {
  const biz = S.user.name; const used = postsThisMonth(biz); const freeUsed = Math.min(used, FREE_JOBS); const freeLeft = FREE_JOBS - freeUsed;
  const mine = JOBS.filter(j => j.biz === biz).sort((a, b) => dayNum(b.posted) - dayNum(a.posted));
  const P = S.jobPending;
  const quota = `<section class="box" style="gap:10px"><div class="toolbar"><h2 style="font-size:19px">Job posts</h2><span class="pill ${freeLeft || LAUNCH ? 'ok' : 'un'}">${freeUsed} of ${FREE_JOBS} included posts used in ${monthLabel()}</span></div>
      <div class="bar"><span class="tr"><i style="width:${freeUsed / FREE_JOBS * 100}%"></i></span></div>
      <p>Your verified listing includes ${FREE_JOBS} job posts every month. ${LAUNCH ? `Extra posts are free in your first year (normally ₹${EXTRA_JOB} each).` : `After that, each extra post costs ₹${EXTRA_JOB}.`} Every post stays live for ${JOB_DAYS} days.</p>
      <p class="meta">Included posts reset on the 1st of each month. Unused posts don't carry over, and closing a post early doesn't give one back.</p></section>`;
  const form = P
    ? `<section class="box" style="gap:14px"><h2 style="font-size:19px">Confirm extra job post</h2><p>You've used all ${FREE_JOBS} free posts for ${monthLabel()}. This post costs ₹${EXTRA_JOB} and stays live for ${JOB_DAYS} days.</p>
      <div class="summary"><div class="kv"><span>Job</span><span style="text-align:right">${esc(P.title)}</span></div><div class="kv"><span>Location</span><span style="text-align:right">${esc(P.loc)}</span></div><div class="kv" style="border-top:1px solid var(--line);padding-top:10px"><span style="color:var(--fg);font-weight:700">Extra job post, ${JOB_DAYS} days</span><b>₹${EXTRA_JOB}</b></div></div>
      
      <div style="display:flex;flex-wrap:wrap;gap:10px"><button class="btn p" type="button" data-act="job-pay">Pay ₹${EXTRA_JOB} and post (demo)</button><button class="btn g" type="button" data-act="job-cancel">Cancel</button></div></section>`
    : `<form class="box" id="job-form" style="gap:14px" novalidate><h2 style="font-size:19px">Post a job</h2>
      <div class="row"><div class="field"><label class="l" for="j-title">Job title</label><input id="j-title" type="text" maxlength="80"><p class="err" id="err-j-title" hidden>Enter the job title.</p></div>
        <div class="field"><label class="l" for="j-loc">Location</label><input id="j-loc" type="text" maxlength="80" placeholder="e.g. London, or Remote"><p class="err" id="err-j-loc" hidden>Enter where the job is based.</p></div></div>
      <div class="row"><div class="field"><label class="l" for="j-type">Job type</label><select id="j-type">${JOB_TYPES.map(x => `<option>${x}</option>`).join('')}</select></div>
        <div class="field"><label class="l" for="j-mode">Work mode</label><select id="j-mode">${JOB_MODES.map(x => `<option>${x}</option>`).join('')}</select></div></div>
      <div class="field"><label class="l" for="j-pay">Salary <span class="meta">(optional)</span></label><input id="j-pay" type="text" maxlength="60" placeholder="e.g. ₹25,000–35,000 a month"></div>
      <div class="field"><label class="l" for="j-desc">Job description</label><textarea id="j-desc" rows="5" maxlength="3000" placeholder="What the job involves, who you're looking for and what you offer"></textarea><p class="err" id="err-j-desc" hidden>Write at least 50 characters so applicants understand the job.</p></div>
      <div class="field"><label class="l" for="j-apply">How to apply</label><input id="j-apply" type="text" maxlength="200" placeholder="Email address or link to your careers page"><p class="err" id="err-j-apply" hidden>Enter an email address or a website link.</p></div>
      <label class="check"><input id="j-agree" type="checkbox"><span>This is a real vacancy, and applicants won't be asked to pay any fee.</span></label><p class="err" id="err-j-agree" hidden>Tick the box to confirm.</p>
      <div><button class="btn p" type="submit">${freeLeft ? `Post job (free, ${freeLeft} left this month)` : LAUNCH ? 'Post job (free in your first year)' : `Continue to pay ₹${EXTRA_JOB}`}</button></div></form>`;
  const list = mine.length ? mine.map(j => {
      const live = isLive(j); const status = j.closed ? 'Closed' : live ? `Live · ${daysLeft(j)} days left` : 'Expired';
      const when = live ? `Expires ${fmtDay(addDays(j.posted, JOB_DAYS))}` : j.closed ? 'Closed early' : `Expired ${fmtDay(addDays(j.posted, JOB_DAYS))}`;
      return `<article class="review"><div class="toolbar"><div style="display:flex;flex-direction:column;gap:2px;min-width:0"><b style="font-size:16px">${esc(j.title)}</b><span class="meta">${esc(j.loc)} · ${esc(j.type)} · ${esc(j.mode)}</span></div><div style="display:flex;gap:6px;flex-wrap:wrap">${j.sample ? '<span class="pill cat">Sample</span>' : ''}<span class="pill cat">${j.paid ? '₹' + EXTRA_JOB : 'Free'}</span><span class="pill ${live ? 'ok' : 'un'}">${status}</span></div></div>
        <p class="meta">Posted ${fmtDay(j.posted)} · ${when}</p>
        ${live ? `<div><button class="btn g" type="button" data-act="job-close" data-id="${j.id}" style="min-height:40px">Close post</button></div>` : ''}</article>`; }).join('')
    : `<div class="empty"><b>No job posts yet</b><p>Post your first job with the form above.</p></div>`;
  return quota + form + `<div class="toolbar"><h2 style="font-size:20px">Your job posts</h2><a href="#jobs" style="font-weight:700;font-size:14px">See how applicants see them</a></div>` + list;
}

/* Trust card: customer and employee scores side by side, as an image drawn by the server from published
   reviews (/card/<slug>.svg, astro/src/lib/card.ts). Free on every plan: each copy links back here. */
const CARD_MIN = 5;
const SITE_ORIGIN = 'https://www.knowthecompany.com';
function trustCard(c) {
  const sl = c.id.slice(3), page = SITE_ORIGIN + '/company/' + sl, img = SITE_ORIGIN + '/card/' + sl + '.svg';
  const rv = reviewsFor(c.id), er = empData(c.id).reviews;
  const ready = rv.length >= CARD_MIN || er.length >= CARD_MIN;
  const code = `<a href="${page}" target="_blank" rel="noopener"><img src="${img}" width="600" height="315" alt="${esc(c.name)} customer and employee reviews on Know The Company"></a>`;
  return `<div class="box" style="gap:12px"><h3 style="font-size:17px">Trust card</h3>
    <p class="meta">Your customer score and employee score side by side. Put it in proposals, pitch decks, emails and your careers page. It updates itself as reviews come in, and it’s free on every plan.</p>
    <img src="/card/${esc(sl)}.svg" width="600" height="315" alt="Trust card for ${esc(c.name)}" style="width:100%;max-width:600px;height:auto;border:1px solid var(--line);border-radius:12px" loading="lazy">
    ${ready ? '' : `<p class="meta"><b>Scores show from ${CARD_MIN} reviews.</b> Customer and employee scores each appear once that side has ${CARD_MIN} published reviews. Send your review links below to everyone to get there.</p>`}
    <div style="display:flex;flex-wrap:wrap;gap:8px"><button class="btn o" type="button" data-act="card-png" data-slug="${esc(sl)}">Download image</button><button class="btn g" type="button" data-act="copy-text" data-text="${esc(img)}">Copy image link</button></div>
    <div class="field"><label class="l">Code for your website or careers page</label><div style="display:flex;gap:8px"><textarea readonly rows="3" class="mono" style="flex:1;min-width:0;background:var(--surface);font-size:12px">${esc(code)}</textarea><button class="btn g" type="button" data-act="copy-text" data-text="${esc(code)}">Copy</button></div></div></div>`;
}
async function cardPng(sl) {
  const im = new Image();
  im.src = '/card/' + sl + '.svg?t=' + Date.now();
  await im.decode();
  const cv = document.createElement('canvas'); cv.width = 2400; cv.height = 1260;
  const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(im, 0, 0, cv.width, cv.height);
  const blob = await new Promise(ok => cv.toBlob(ok, 'image/png'));
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = sl + '-trust-card.png';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
/* Website badge: an embed that shows a company's live rating on its own site (badge.html). Plus only. */
function badgePanel(c, base) {
  if (coPlan(c) !== 'plus') return `<div class="box soft" style="gap:8px"><h3 style="font-size:17px">Website badge</h3><p>Show your live rating on your own website and careers page. It comes with Plus.</p><a href="#pricing" style="font-weight:700;font-size:14px">See Plus</a></div>`;
  const dir = base.replace(/[^/]*$/, '');
  const snip = t => `<iframe src="${dir}badge.html?c=${encodeURIComponent(c.wid)}${t === 'employee' ? '&t=employee' : ''}" width="300" height="124" style="border:0;overflow:hidden" title="${esc(c.name)} ${t} reviews on Know The Company" loading="lazy"></iframe>`;
  const row = (label, t) => `<div class="field"><label class="l">${label}</label><div>${snip(t)}</div><div style="display:flex;gap:8px"><textarea readonly rows="3" class="mono" style="flex:1;min-width:0;background:var(--surface);font-size:12px">${esc(snip(t))}</textarea><button class="btn g" type="button" data-act="copy-text" data-text="${esc(snip(t))}">Copy</button></div></div>`;
  return `<div class="box" style="gap:12px"><h3 style="font-size:17px">Website badge</h3><p class="meta">Paste the code into your website. The badge shows your live rating from published reviews and links to your page here. You can't change the number it shows, which is why visitors trust it.</p>
    ${row('Customer rating badge', 'customer')}${row('Employee rating badge, for your careers page', 'employee')}</div>`;
}
function vDashboard() {
  if (!S.user) return vLogin('business', S.memberLoading ? '' : 'Log in to see your company pages and claims.');
  if (S.myClaims === undefined) loadMyClaims();
  const mine = COS.filter(c => (c.raw.ownerMemberIds || []).includes(S.user.id));
  const base = location.origin + '/';
  const linkRow = (label, id, url) => `<div class="field"><label class="l" for="${id}">${label}</label><div style="display:flex;gap:8px"><input id="${id}" type="text" readonly value="${esc(url)}" class="mono" style="flex:1;min-width:0;background:var(--surface)"><button class="btn g" type="button" data-act="copy-text" data-text="${esc(url)}">Copy</button></div></div>`;
  const coCard = c => { const rv = reviewsFor(c.id), er = empData(c.id).reviews, all = rv.concat(er);
    const stats = [[rv.length ? avgOf(rv).toFixed(1) : '–', 'Customer rating', rv.length + ' review' + (rv.length === 1 ? '' : 's')], [er.length ? avgOf(er).toFixed(1) : '–', 'Employee rating', er.length + ' review' + (er.length === 1 ? '' : 's')], [all.length ? all.filter(r => r.reply).length + ' of ' + all.length : '–', 'Replied', 'Reply to every review']];
    return `<section class="box" style="gap:16px"><div class="cohead">${coLogo(c, 56)}<div style="flex:1;min-width:0"><a href="#${c.id}" style="font-size:20px;font-weight:800;text-decoration:none;color:var(--fg)">${esc(c.name)}</a><div class="meta">${esc(c.web)} · ${TIER_NAME[coTier(c)]} plan</div></div>${ownerPill(c)}</div>
      <div class="stats">${stats.map(([v, l, n]) => `<div class="stat"><span>${l}</span><b>${v}</b><small>${n}</small></div>`).join('')}</div>
      ${linkRow('Customer review link', 'cl-' + c.id, base + '#invite-' + c.id)}
      ${linkRow('Employee review link', 'el-' + c.id, base + '#invite-team-' + c.id)}
      ${trustCard(c)}
      ${badgePanel(c, base)}
      <p class="meta">Send each link to everyone, not only happy customers or staff. Edit your page, photos and employer page, and reply to reviews, from the tabs above. Changes go live straight away.</p></section>`; };
  const KIND = { claim: 'Claim', new: 'New company and claim', access: 'Access request' };
  const STATUS = { pending: ['un', 'Being checked'], verified: ['ok', 'Verified'], rejected: ['cat', 'Not approved'] };
  const claims = S.myClaims;
  const claimList = claims === null || claims === undefined ? '<p class="meta">Loading your claims…</p>'
    : claims.length ? claims.map(cl => { const c = BYWID[cl.company]; const [k, t] = STATUS[cl.status] || STATUS.pending;
        return `<div class="cfrow">${c ? avatar(c, 40, 14) : ''}<div class="t"><b>${esc(c ? c.name : 'Company')}</b><small>${esc(KIND[cl.kind] || 'Claim')}${cl.method ? ' · ' + esc(cl.method === 'documents' ? 'documents' : cl.method === 'website' ? 'website check' : cl.method === 'id' ? 'ID card' : 'email') : ''}${cl._createdDate ? ' · sent ' + esc(fmtDay(String(cl._createdDate).slice(0, 10))) : ''}</small></div><span class="pill ${k}">${t}</span></div>
          ${cl.status === 'pending' && c && cl.kind !== 'access' ? `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:-4px 0 6px 52px">${cl.method === 'website' ? `<button class="btn p" type="button" data-act="claim-check" data-wid="${esc(c.wid)}" ${S.checking ? 'disabled' : ''}>${S.checking ? 'Checking…' : 'Check my website'}</button>` : ''}<button class="btn g" type="button" data-act="claim-plan" data-wid="${esc(c.wid)}">${S.dashPlanWid === c.wid ? 'Hide plan' : 'Choose your plan'}</button></div>
            ${S.dashPlanWid === c.wid ? planPanel(c, true) : ''}` : ''}`; }).join('') + (S.checkMsg ? `<p class="meta" role="status">${esc(S.checkMsg)}</p>` : '')
    : '';
  const empty = !mine.length && claims && !claims.length;
  const sel = mine.find(c => c.id === S.dashCo) || mine[0];
  if (sel) { S.user.coId = sel.id; S.user.plan = coPlan(sel); loadMedia(sel); }
  const TABS = [['overview', 'Overview'], ['page', 'Company page'], ['employer', 'Employer page'], ['reviews', 'Reviews and replies'], ['import', 'Past reviews'], ...(sel && isBusiness(sel) ? [['business', 'Business tools']] : []), ['plan', 'Plan and payments']];
  const tab = TABS.some(t => t[0] === S.dashTab) ? S.dashTab : 'overview';
  const pick = mine.length > 1 ? `<div class="field" style="max-width:360px"><label class="l" for="dash-co">Company</label><select id="dash-co" data-dashco>${mine.map(c => `<option value="${c.id}" ${c === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>` : '';
  const tabs = sel ? `<nav style="display:flex;flex-wrap:wrap;gap:8px" aria-label="Dashboard sections">${TABS.map(([k, l]) => `<a class="btn ${k === tab ? 'p' : 'g'}" href="#dashboard" data-act="dash-tab" data-tab="${k}" ${k === tab ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</nav>` : '';
  const body = !sel ? '' : tab === 'business' ? businessPanel(sel) : tab === 'plan' ? planPanel(sel) : tab === 'import' ? importPanel(sel) : tab === 'page' ? companyPagePanel() : tab === 'employer' ? employerPanel() : tab === 'reviews' ? ownReviews(sel, reviewsFor(sel.id), empData(sel.id).reviews) : coCard(sel);
  return `<div class="dash"><div class="wrap" style="padding-block:28px 8px"><div class="mainc" style="gap:18px;max-width:920px;margin:0 auto">
    <div class="toolbar"><div><h1 style="font-size:28px">Company dashboard</h1><p style="color:var(--muted)">${esc(S.user.name)}${S.user.email ? ' · ' + esc(S.user.email) : ''}</p></div><div style="display:flex;flex-wrap:wrap;gap:8px"><a class="btn o" href="#claim">Claim a company</a><a class="btn g" href="#list">List a new company</a></div></div>
    ${pick}${tabs}${body}
    ${empty ? `<div class="empty"><b>You haven’t claimed a company yet</b><p>Claim your company page free, verify it, and get links to collect reviews from customers and your team.</p><a class="btn p" href="#claim">Claim your company page</a></div>`
      : `<section class="box" style="gap:10px"><h2>Your claims and requests</h2>${claimList || '<p class="meta">None yet.</p>'}${S.claimsErr ? `<p class="err">${esc(S.claimsErr)}</p>` : ''}</section>`}
  </div></div></div>`;
}

function vGuidelines() {
  return `<div class="wrap" style="max-width:860px">${crumbs([['Home','#home'],['Guidelines']])}
    <div class="pagehead"><h1>How Know The Company works</h1><p>The rules that keep reviews useful for everyone.</p></div>
    <div style="display:flex;flex-direction:column;gap:22px;line-height:1.65">
      <section class="box"><h2>How we list companies</h2><p>Well-known startups are added from public information (name, website, category, country) so people can review them. Other companies are added by their owners, or by reviewers who have worked with them. These profiles are marked “Unclaimed” and show no rating until real customers review them. A listed company is never presented as a partner or customer of Know The Company.</p></section>
      <section class="box"><h2>Writing a review</h2><p>Write about your own experience in the last 12 months. No hate speech, personal data about staff, or claims of crime without evidence. Reviews in exchange for money, discounts or gifts are not allowed.</p></section>
      <section class="box"><h2>Reviews companies bring with them</h2><p>Companies on the Plus plan can send us reviews they collected before joining, from their own website, emails, surveys or other review sites. We contact every reviewer to confirm they wrote the review and agree to it appearing here, and we publish nothing we can't confirm. Companies must send all the reviews they have, not only the good ones. Imported reviews are labelled "Imported" and show where and when they were first given.</p></section>
      <section class="box"><h2>When a review goes live</h2><p>Reviews are published as soon as they are posted. Our team reads new reviews and reports, and takes down any review that breaks these guidelines. Anyone can report a review they think breaks them.</p></section>
      <section class="box"><h2>Employee reviews</h2><p>Write only about your own time at the company as an employee, contractor or intern. Don't name junior colleagues or identify anyone other than senior leaders. Don't share confidential company information or trade secrets, and don't make accusations you can't back up. Employers can't remove employee reviews. You choose whether each employee review is anonymous or shows your name. We never show your email, and we share an anonymous reviewer's identity only when a valid court order requires it.</p></section>
      <section class="box"><h2>What companies can and can't do</h2><p>Companies can reply publicly, invite customers to review, and report reviews that break these rules. When they invite reviews, they must invite all their customers, not only the happy ones. They can't edit, hide or delay reviews, and paying for a listing never changes ratings.</p></section>
      <section class="box"><h2>When we remove a review</h2><p>Only when it breaks these guidelines or we receive a valid legal order.</p></section>
    </div></div>`;
}

/* ---------- sign in with Google or Facebook ----------
   Wix runs the provider sign-in. We send the visitor to Wix with a PKCE challenge, Wix sends them back to
   auth-callback.html with a one-time code, and that page swaps the code for member tokens. */
const IDPS = { google: { id: '0e6a50f5-b523-4e29-990d-f37fa2ffdd69', name: 'Google' }, facebook: { id: '3ecad13f-52c3-483d-911f-31dbcf2a6d23', name: 'Facebook' } };
const IDP_ICON = {
  google: '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>',
  facebook: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#1877F2" d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v2.9h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z"/></svg>'
};
const socialBtns = (biz, verb) => `<div style="display:flex;flex-direction:column;gap:10px">${Object.entries(IDPS).map(([k, v]) => `<button class="btn g lg" type="button" data-act="idp" data-idp="${k}" data-biz="${biz ? 1 : ''}" style="justify-content:center;gap:10px">${IDP_ICON[k]}${verb} with ${v.name}</button>`).join('')}</div>
  <div style="display:flex;align-items:center;gap:12px;color:var(--muted);font-size:13px"><span style="flex:1;height:1px;background:var(--line)"></span>or use your email<span style="flex:1;height:1px;background:var(--line)"></span></div>`;
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function startIdp(key, biz) {
  const idp = IDPS[key]; if (!idp) return;
  const rand = n => b64url(crypto.getRandomValues(new Uint8Array(n)));
  const verifier = rand(48), state = rand(24);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const redirectUri = location.origin + '/auth-callback.html';
  const returnTo = S.returnTo && S.returnTo.startsWith('join-team-') ? S.returnTo : biz ? 'dashboard' : (S.returnTo || 'my-reviews');
  try { sessionStorage.setItem('ktc_oauth', JSON.stringify({ verifier, state, redirectUri, returnTo, back: biz ? 'business-login' : 'login' })); } catch (e) { toast('Your browser blocked sign-in storage. Use email instead.'); return; }
  const authRequest = { redirectUri, clientId: WIX_CLIENT_ID, codeChallenge: challenge, codeChallengeMethod: 'S256', responseMode: 'fragment', responseType: 'code', scope: 'offline_access', state, idp: idp.id };
  const res = await wixRequest('/_api/redirects-api/v1/redirect-session', { body: { auth: { authRequest } } });
  const url = res && res.redirectSession && res.redirectSession.fullUrl;
  if (!url) throw new Error('Wix did not return a sign-in link.');
  location.assign(url);
}
function vLogin(type, why) {
  const biz = type === 'business'; const a = S.auth || { mode: 'signin' }; const note = why || S.notice;
  const seg = `<div class="seg" aria-label="Account type"><a href="#login" class="${biz ? '' : 'on'}" ${biz ? '' : 'aria-current="page"'}>I write reviews</a><a href="#business-login" class="${biz ? 'on' : ''}" ${biz ? 'aria-current="page"' : ''}>I manage a company</a></div>`;
  const err = a.error ? `<p class="err" role="alert">${esc(a.error)}</p>` : '';
  const emailF = `<div class="field"><label class="l" for="l-email">${biz ? 'Work email' : 'Email'}</label><input id="l-email" type="email" autocomplete="email" value="${esc(a.email || '')}" placeholder="${biz ? 'you@yourcompany.com' : 'you@example.com'}"><p class="err" id="err-l-email" hidden>Enter an email address like name@example.com.</p></div>`;
  let card;
  if (S.memberLoading) card = `<div class="authcard" aria-busy="true"><p class="meta">Checking your session…</p></div>`;
  else if (S.user) card = `<div class="authcard"><h1 style="font-size:26px">You're logged in</h1><p style="color:var(--muted)">${esc(S.user.name)}${S.user.email ? ' · ' + esc(S.user.email) : ''}</p>
      <div style="display:flex;flex-wrap:wrap;gap:10px"><a class="btn p" href="#${biz ? 'dashboard' : 'my-reviews'}">${biz ? 'Open dashboard' : 'My reviews'}</a><button class="btn g" type="button" data-act="logout">Log out</button></div></div>`;
  else if (a.mode === 'verify') card = `<form class="authcard" id="verify-form" novalidate>
      <h1 style="font-size:26px">Confirm your email</h1>
      <p style="color:var(--muted)">We sent a code to <b style="color:var(--fg)">${esc(a.email || 'your email')}</b>. Enter it to finish creating your account.</p>
      <div class="field"><label class="l" for="l-code">Code</label><input id="l-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8" class="mono" style="font-size:20px;letter-spacing:.3em"><p class="err" id="err-l-code" hidden>Enter the code from the email.</p></div>
      ${err}<button class="btn p lg" type="submit">Confirm</button>
      <button class="link" type="button" data-act="auth-mode" data-mode="signin" style="align-self:flex-start">Back to log in</button></form>`;
  else if (a.mode === 'forgot') card = `<form class="authcard" id="forgot-form" novalidate>
      <h1 style="font-size:26px">Reset your password</h1>
      <p style="color:var(--muted)">Enter the email you signed up with. We'll send you a link to choose a new password.</p>
      ${emailF}
      ${err}<button class="btn p lg" type="submit">Send reset link</button>
      <button class="link" type="button" data-act="auth-mode" data-mode="signin" style="align-self:flex-start">Back to log in</button></form>`;
  else if (a.mode === 'forgot-sent') card = `<div class="authcard"><h1 style="font-size:26px">Check your email</h1>
      <p style="color:var(--muted)">If there's an account for <b style="color:var(--fg)">${esc(a.email || 'that email')}</b>, a link to reset your password is on its way. It can take a few minutes, so check your spam folder too. Once you've chosen a new password, you'll come back here to log in.</p>
      <button class="link" type="button" data-act="auth-mode" data-mode="signin" style="align-self:flex-start">Back to log in</button></div>`;
  else if (a.mode === 'approval') card = `<div class="authcard"><h1 style="font-size:26px">Thanks, you're signed up</h1><p style="color:var(--muted)">Your account is waiting for approval. We'll email you when it's ready, and then you can log in.</p><button class="link" type="button" data-act="auth-mode" data-mode="signin" style="align-self:flex-start">Back to log in</button></div>`;
  else if (a.mode === 'signup') card = `<form class="authcard" id="signup-form" novalidate>
      <h1 style="font-size:26px">Create your account</h1>
      <p style="color:var(--muted)">${biz ? 'Claim your company page, collect reviews and keep your details up to date.' : 'Post reviews and see everything you have written in one place.'}</p>
      ${socialBtns(biz, 'Sign up')}
      <div class="row"><div class="field"><label class="l" for="l-first">First name</label><input id="l-first" type="text" autocomplete="given-name" maxlength="40"><p class="err" id="err-l-first" hidden>Enter your first name.</p></div>
        <div class="field"><label class="l" for="l-last">Last name <span class="meta">(optional)</span></label><input id="l-last" type="text" autocomplete="family-name" maxlength="40"></div></div>
      ${emailF}
      <div class="field"><label class="l" for="l-pass">Password</label><input id="l-pass" type="password" autocomplete="new-password" minlength="8"><p class="err" id="err-l-pass" hidden>Use at least 8 characters.</p></div>
      <label class="check"><input id="l-adult" type="checkbox"><span>I am 18 or older and I agree to the <a href="#terms">terms of use</a> and <a href="#privacy">privacy policy</a>.</span></label>
      <p class="err" id="err-l-adult" hidden>You need to be 18 or older and accept the terms to create an account.</p>
      ${err}<button class="btn p lg" type="submit">Create account</button>
      <p class="meta" style="font-size:13px">On customer reviews we show your first name and last initial, never your email. Employee reviews can be anonymous.</p>
      <p style="font-size:14px">Already have an account? <button class="link" type="button" data-act="auth-mode" data-mode="signin">Log in</button></p></form>`;
  else card = `<form class="authcard" id="login-form" novalidate>
      <h1 style="font-size:26px">${biz ? 'Company login' : 'Log in to write reviews'}</h1>
      <p style="color:var(--muted)">${biz ? 'See your company pages, review links and claims.' : 'Post reviews and see everything you have written in one place.'}</p>
      ${socialBtns(biz, 'Continue')}
      ${emailF}
      <div class="field"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px"><label class="l" for="l-pass">Password</label><button class="link" type="button" data-act="auth-mode" data-mode="forgot" style="font-size:13px">Forgot password?</button></div><input id="l-pass" type="password" autocomplete="current-password" minlength="8"><p class="err" id="err-l-pass" hidden>Enter your password (at least 8 characters).</p></div>
      ${err}<button class="btn p lg" type="submit">Log in</button>
      <p style="font-size:14px">New here? <button class="link" type="button" data-act="auth-mode" data-mode="signup">Create an account</button></p>
      <p style="font-size:14px"><button class="link" type="button" data-act="auth-mode" data-mode="forgot">Forgot your password?</button></p></form>`;
  return `<div class="wrap"><div class="authwrap">${seg}${note ? `<p class="notice">${esc(note)}</p>` : ''}${card}
    <p class="meta" style="text-align:center;font-size:14px">${biz ? 'Not listed yet? <a href="#list">' + (LAUNCH ? 'List your company free' : 'List your company for [[PB]]') + '</a>' : 'Manage a company? <a href="#business-login">Use company login</a>'}</p></div></div>`;
}

function vMyReviews() {
  if (!S.user) return vLogin('reviewer', S.memberLoading ? '' : 'Log in to see the reviews you have written.');
  const uid = S.user.id;
  const mine = [];
  Object.entries(REVIEWS).forEach(([cid, list]) => list.forEach((r, i) => { if (r.by === uid && BYID[cid]) mine.push([cid, r, i]); }));
  const emp = { reviews: [], interviews: [] };
  Object.entries(EMP).forEach(([cid, d]) => { if (!BYID[cid]) return; Object.keys(emp).forEach(kind => (d[kind] || []).forEach((r, i) => { if (r.by === uid) emp[kind].push([cid, r, i]); })); });
  const publishedTypes = new Set(mine.map(([cid]) => cid + '|customer').concat(emp.reviews.map(([cid]) => cid + '|employee'), emp.interviews.map(([cid]) => cid + '|interview')));
  const pend = PENDING.filter(p => p.member === uid && BYID[p.cid] && !publishedTypes.has(p.cid + '|' + p.type));
  const LABEL = { customer: 'Customer review', employee: 'Employee review', interview: 'Interview' };
  const total = mine.length + emp.reviews.length + emp.interviews.length + pend.length;
  const item = (cid, card) => `<div style="display:flex;flex-direction:column;gap:8px"><a href="#${cid}" style="font-weight:700;text-decoration:none">${esc(BYID[cid].name)}</a>${card}</div>`;
  const group = (title, items) => items.length ? `<section style="display:flex;flex-direction:column;gap:14px"><h2 style="font-size:22px">${title} <span class="count">(${items.length})</span></h2>${items.join('')}</section>` : '';
  const pendCard = p => `<article class="review"><div class="toolbar"><a href="#${p.cid}" style="font-weight:700;text-decoration:none">${esc(BYID[p.cid].name)}</a><span class="pill un">Just posted</span></div><p class="meta">${esc(LABEL[p.type] || 'Review')} · sent ${esc(fmtDay(p.at))}</p>${p.title ? `<p>${esc(p.title)}</p>` : ''}</article>`;
  return `<div class="wrap">${crumbs([['Home','#home'],['My reviews']])}
    <div class="pagehead"><h1>My reviews</h1><p>${esc(S.user.name)}${S.user.email ? ' · ' + esc(S.user.email) : ''}</p></div>
    <div class="mainc" style="max-width:860px;gap:30px">${total ? group('Just posted', pend.map(pendCard))
        + group('Customer reviews', mine.map(([cid, r, i]) => item(cid, reviewCard(r, i, cid))))
        + group('Employee reviews', emp.reviews.map(([cid, r, i]) => item(cid, empCard(r, i, cid))))
        + group('Interviews', emp.interviews.map(([cid, r, i]) => item(cid, intCard(r, i, cid))))
        + (pend.length ? '<p class="meta">Reviews you just posted show here until the page refreshes.</p>' : '')
      : `<div class="empty"><b>You haven't written any reviews yet</b><p>Search for a company you've used or worked for and share how it went.</p><a class="btn p" href="#search">Find a company</a></div>`}
      <section class="box" style="margin-top:12px"><h2>Delete your account</h2><p>We remove your account and everything you have posted, then confirm by email.</p><button class="btn g" type="button" data-act="del-account" style="align-self:flex-start">Ask us to delete my account</button></section></div></div>`;
}

const NAVI = {
  claim: '<path d="M4 20V8l8-4 8 4v12"/><path d="M9 20v-5h6v5"/><path d="M17 3v4M15 5h4"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  reply: '<path d="M4 5h16v11H9.5L5 20v-4H4z"/><path d="M8 10.5h8"/>',
  invite: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M19 8v6M16 11h6"/>',
  plans: '<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  sample: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  login: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5M15 12H3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  home: '<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  pen: '<path d="M12 5v14M5 12h14"/>',
  tools: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.8z"/>'
};
const nI = (k, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${NAVI[k]}</svg>`;
function empLinks() {
  return [['star', 'Why list your company', 'Online presence, AI search and more', '#why-list', ''],
    ['claim', 'Claim your company page', 'Your company is already listed', '#claim', ''],
    ['pen', 'List your company', 'Your company isn’t on the site yet', '#list', ''],
    ['grid', 'Company dashboard', 'Your pages, review links and claims', S.user ? '#dashboard' : '#business-login', ''],
    ['plans', 'Plans and pricing', 'Basic, Plus and Business', '#pricing', '']];
}
function notifs() {
  const u = S.user; if (!u) return [];
  const out = [];
  Object.entries(REVIEWS).forEach(([cid, l]) => l.forEach(r => { if (r.by === u.id && r.reply && BYID[cid]) out.push([`#${cid}`, `${BYID[cid].name} replied to your review`, esc(r.title)]); }));
  Object.entries(EMP).forEach(([cid, d]) => (d.reviews || []).forEach(r => { if (r.by === u.id && r.reply && BYID[cid]) out.push([`#${cid}`, `${BYID[cid].name} replied to your review`, esc(r.title)]); }));
  return out;
}
function renderNav(active) {
  const u = S.user; const nav = document.getElementById('nav-links'), right = document.getElementById('nav-right'), bbar = document.getElementById('bbar');
  const toolsMenu = TOOLS.filter(x => !x.soon).map(x => `<a href="#tool-${x.id}">${toolIcon(x, 18)}<span><b>${esc(x.name)}</b><small>${esc(x.d)}</small></span></a>`).join('') + '<a href="#tools" class="all">All tools</a>';
  const empMenu = empLinks().map(([k, l, d, href, extra]) => `<a href="${href}" ${extra}><span class="mi">${nI(k, 18)}</span><span><b>${l}</b><small>${d}</small></span></a>`).join('');
  nav.innerHTML = `<a href="#categories" data-nav="categories">Companies</a>
    <details class="dd${active === 'tools' ? ' on' : ''}"><summary class="car">Tools</summary><div class="ddmenu wide">${toolsMenu}</div></details>
    <details class="dd${active === 'list' || active === 'dashboard' ? ' on' : ''}"><summary class="car">For employers</summary><div class="ddmenu">${empMenu}</div></details>`;
  nav.querySelectorAll('[data-nav]').forEach(a => { if (a.dataset.nav === active) a.setAttribute('aria-current', 'page'); });
  const ns = notifs(), unseen = Math.max(0, ns.length - (store.get('tn_seen', 0) || 0));
  const bell = u ? `<details class="dd bell"><summary class="iconbtn" aria-label="Notifications${unseen ? `, ${unseen} new` : ''}">${nI('bell')}${unseen ? `<span class="badge">${unseen}</span>` : ''}</summary><div class="ddmenu right" style="min-width:320px"><div class="mh">Notifications</div>${ns.length ? ns.map(([href, h, d]) => `<a class="notif" href="${href}"><span class="dot"></span><span><b>${esc(h)}</b><small>${d}</small></span></a>`).join('') : '<p class="meta" style="padding:10px">Nothing new yet. Replies to your reviews and updates about your company page appear here.</p>'}</div></details>` : '';
  const acct = S.memberLoading ? '<span class="loginlink" aria-hidden="true" style="min-width:64px"></span>' : u ? `<details class="dd um"><summary class="usum"><span class="avatar" aria-hidden="true" style="width:32px;height:32px;font-size:12px;border-radius:999px">${esc(initials(u.name))}</span>${esc(u.name.split(' ')[0])}</summary><div class="ddmenu right" style="min-width:240px"><div class="mh">Your account</div><a href="#my-reviews"><span class="mi">${nI('reply', 18)}</span><b>My reviews</b></a><a href="#dashboard"><span class="mi">${nI('grid', 18)}</span><b>Company dashboard</b></a><button class="mrow" type="button" data-act="logout"><span class="mi">${nI('login', 18)}</span><b>Log out</b></button></div></details>` : '<a class="loginlink" href="#login" data-nav="login">Log in</a>';
  right.innerHTML = `<button class="iconbtn" type="button" data-act="open-search" aria-label="Search companies">${nI('search')}</button>${bell}${acct}<a class="btn g wr wr2" href="#list">List your company</a><button class="btn p wr" type="button" data-act="open-picker">Write a review</button><button class="iconbtn burger" type="button" data-act="open-menu" aria-label="Menu">${nI('menu')}</button>`;
  const acctHref = !u ? '#login' : u.type === 'reviewer' ? '#my-reviews' : '#dashboard';
  bbar.innerHTML = `<a href="#home" ${curRoute() === 'home' ? 'aria-current="page"' : ''}>${nI('home', 22)}Home</a><a href="#categories" ${active === 'categories' ? 'aria-current="page"' : ''}>${nI('grid', 22)}Companies</a><button type="button" class="bb-rev" data-act="open-picker"><span class="c">${nI('pen', 24)}</span>Review</button><a href="#list" ${active === 'list' ? 'aria-current="page"' : ''} aria-label="List your company">${nI('claim', 22)}List company</a><a href="${acctHref}" ${['login', 'my-reviews', 'dashboard'].includes(active) ? 'aria-current="page"' : ''}>${nI('user', 22)}${u ? 'Account' : 'Log in'}</a>`;
}
function pickList(q) {
  q = (q || '').trim().toLowerCase();
  const list = q ? COS.filter(c => c.name.toLowerCase().includes(q) || c.web.includes(q)).sort((a, b) => a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q)).slice(0, 7) : FEATURED.slice(0, 5);
  return list.length ? list.map(c => `<button type="button" data-act="pick-co" data-id="${c.id}">${avatar(c, 40, 14)}<span><b>${esc(c.name)}</b><small>${esc(c.cat)} · ${esc(c.country)}</small></span></button>`).join('')
    : `<p class="meta" style="padding:10px">No company called “${esc(q)}” yet.</p>`;
}
function openPicker(as) {
  const m = document.getElementById('picker');
  m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true" aria-labelledby="pk-h"><div class="toolbar"><h2 id="pk-h">Write a review</h2><button class="iconbtn" type="button" data-act="close-modal" aria-label="Close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <fieldset style="border:0;padding:0;margin:0"><legend class="l" style="margin-bottom:8px">I'm reviewing it as</legend><div class="planpick">
      <label><input type="radio" name="pk-as" value="customers" ${as !== 'employees' ? 'checked' : ''}><span><b>A customer or client</b><small>You used its product or service</small></span></label>
      <label><input type="radio" name="pk-as" value="employees" ${as === 'employees' ? 'checked' : ''}><span><b>An employee</b><small>You work or worked there</small></span></label></div></fieldset>
    <div class="field"><label class="l" for="pk-q">Company</label><input id="pk-q" type="search" autocomplete="off" placeholder="Search a company"></div>
    <div class="pklist" id="pk-list">${pickList('')}</div>
    <p class="meta">Can't find it? <a href="#add" data-act="close-modal-go">Add the company</a> and be the first to review it.</p></div>`;
  m.hidden = false; document.body.style.overflow = 'hidden'; setTimeout(() => { const i = document.getElementById('pk-q'); if (i) i.focus(); }, 30);
}
function openMenu() {
  const u = S.user, m = document.getElementById('msheet');
  m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true" aria-label="Menu"><div class="toolbar"><b style="font-size:18px">Menu</b><button class="iconbtn" type="button" data-act="close-modal" aria-label="Close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="mlinks"><a href="#categories" data-act="close-modal-go">${nI('grid')}Companies</a><a href="#tools" data-act="close-modal-go">${nI('tools')}Tools</a><a href="#jobs" data-act="close-modal-go">${nI('claim')}Jobs <span class="soon">Soon</span></a><a href="#blog" data-act="close-modal-go">${nI('edit')}Blog</a>
      <div class="mh">For employers</div>${empLinks().map(([k, l, d, href, extra]) => `<a href="${href}" ${extra ? extra.replace('data-act="', 'data-sheet="') : ''} data-act="close-modal-go">${nI(k)}${l}</a>`).join('')}
      <div class="mh">Account</div>${u ? `<a href="#my-reviews" data-act="close-modal-go">${nI('reply')}My reviews</a><a href="#dashboard" data-act="close-modal-go">${nI('grid')}Company dashboard</a><button type="button" data-act="logout">${nI('login')}Log out</button>` : `<a href="#login" data-act="close-modal-go">${nI('login')}Log in or create an account</a>`}</div></div>`;
  m.hidden = false; document.body.style.overflow = 'hidden';
}
function closeModals() { document.querySelectorAll('.modal').forEach(m => { m.hidden = true; m.innerHTML = ''; }); document.body.style.overflow = ''; }
function go(h) { if (curRoute() === h) render(); else navigate(h); }

const BLOG_CATS = ['Reviews & reputation', 'Customer experience', 'Startup growth', 'Rules & compliance'];
/* Blog posts. Empty until new articles are added; while it is empty the blog pages, links and home
   section stay hidden and /blog is a 404. Each post looks like:
   { slug: 'url-slug', cat: 'One of BLOG_CATS', date: 'YYYY-MM-DD', title: '...', tone: 1-6,
     excerpt: 'One or two sentences.',
     body: [['p', 'Paragraph'], ['h', 'Subheading'], ['ul', ['Point', 'Point']]] },
   The server reads this list at build time and writes the article into the page for search engines. */
const POSTS = [
 {
  "slug": "check-your-company-in-chatgpt-perplexity-gemini",
  "cat": "Startup growth",
  "date": "2026-11-12",
  "tone": 1,
  "title": "How to check what ChatGPT, Perplexity and Gemini say about your company",
  "seo": "Check what ChatGPT and Perplexity say about your company",
  "desc": "A five-minute check for Indian businesses: what to ask ChatGPT, Perplexity and Gemini about your company, what to note down and how to fix wrong answers.",
  "excerpt": "Customers and job seekers now ask AI tools about a company before they buy or apply. Here is the five-minute check we use to see what those tools say, and how to fix what they get wrong.",
  "body": [
   [
    "p",
    "Before someone calls you, places an order or applies for a job with you, there is a fair chance they have already asked an AI tool about your company. In What Talent Wants 2026, a survey of 2,000 tech, product and data professionals in India [reported by HRKatha in October 2026](https://www.hrkatha.com/features/research/indias-tech-professionals-have-already-decided-before-you-call-them/), 31% said they use AI tools to research an employer before applying. Customers do the same before they spend money."
   ],
   [
    "p",
    "The answer they get is written without you. It may be accurate, out of date, mixed up with another company of the same name, or missing you altogether. The only way to know is to ask the same questions yourself. This is the check we run, and it takes about five minutes per tool."
   ],
   [
    "h",
    "Before you start"
   ],
   [
    "ul",
    [
     "Use a private or incognito window, or log out. ChatGPT and Gemini can remember things about you, and you want the answer a stranger would see.",
     "In ChatGPT, make sure web search is on, so the answer is built from pages it reads now rather than only from what the model learnt in training.",
     "Keep a simple sheet with four columns: the question, the tool, a summary of the answer and the links it cited. Add the date. You will repeat this next month.",
     "Ask the way a customer would, in plain words. Nobody types \"provide an overview of the organisation\"."
    ]
   ],
   [
    "h",
    "The seven questions to ask"
   ],
   [
    "p",
    "Replace the words in brackets with your own details. Ask each question in a new chat, so one answer does not colour the next."
   ],
   [
    "ol",
    [
     "**What is [company name] and what does it do?** Checks whether the tool knows you at all, and whether it has your products and city right.",
     "**Is [company name] genuine? What do customers say about it?** This is the question people ask before paying an unfamiliar business.",
     "**What is it like to work at [company name]?** Candidates ask this, and the answer usually leans on employee reviews.",
     "**[company name] reviews.** Short, like a search. Note which review sites are quoted.",
     "**Best [what you sell] in [your city].** Do you appear? Who appears instead?",
     "**[company name] vs [your main competitor].** Shows how the tool frames the two of you, and which facts it uses to decide.",
     "**[company name] phone number and address.** Wrong contact details send customers elsewhere, sometimes to scammers."
    ]
   ],
   [
    "h",
    "Ask in three places, because each one reads different sources"
   ],
   [
    "h3",
    "ChatGPT"
   ],
   [
    "p",
    "ChatGPT search finds pages with OpenAI's crawler, OAI-SearchBot. [OpenAI's documentation](https://developers.openai.com/api/docs/bots) says sites that block OAI-SearchBot will not appear in ChatGPT's search answers, apart from plain navigational links. A separate crawler, GPTBot, collects pages for training models. Blocking GPTBot does not remove you from ChatGPT search."
   ],
   [
    "h3",
    "Perplexity"
   ],
   [
    "p",
    "Perplexity uses PerplexityBot to find pages for its answers, and Perplexity-User to fetch a page when someone asks about it directly. According to [Perplexity's own documentation](https://docs.perplexity.ai/guides/bots), Perplexity-User generally ignores robots.txt because a person asked for the page. Perplexity shows its sources clearly, which makes it the easiest of the three to learn from."
   ],
   [
    "h3",
    "Google AI Overviews, AI Mode and Gemini"
   ],
   [
    "p",
    "Google's AI answers in Search are built on the normal Google Search index. The Google-Extended setting in robots.txt controls training and grounding for Gemini apps, but it does not decide whether you appear in AI Overviews or AI Mode, as [PPC Land explains in its report on Google's new Search Console control](https://ppc.land/google-gives-site-owners-a-toggle-to-exit-ai-overviews-and-ai-mode/). If you rank well on Google and your Google Business Profile is complete, you start with an advantage here."
   ],
   [
    "h",
    "What to note for every answer"
   ],
   [
    "ul",
    [
     "**Wrong facts.** Founding year, city, products, prices, the founder's name.",
     "**Old facts.** An address you left two years ago, a product you stopped selling, a former director.",
     "**Mix-ups.** Another company with a similar name, often in another state or country.",
     "**Themes from reviews.** Words like delay, refund, rude or excellent support that the tool repeats.",
     "**Competitors named instead of you,** especially in the \"best in your city\" question.",
     "**The cited links.** Open every one. They tell you where the answer came from, which is where the fix will be."
    ]
   ],
   [
    "h",
    "The links matter more than the answer"
   ],
   [
    "p",
    "AI tools assemble answers from a few kinds of pages: your own website, review sites, news and blog articles, directories and forums. Two recent studies give a sense of the mix."
   ],
   [
    "ul",
    [
     "Trustpilot and SEER Interactive analysed more than 800,000 AI answers across ChatGPT, Gemini, Perplexity and Google AI Mode. Review and trust sites were the second most cited type of source, and 59% of AI recommendations included a star rating as evidence. Brands with no claimed profile on Trustpilot were almost never cited. Trustpilot sells review services, so read [the study](https://business.trustpilot.com/marketing/what-ai-says-about-your-brand) with that in mind.",
     "Growfusely checked 1,739 citations for business software questions in July 2026. Review platforms made up about 7%, companies' own pages roughly 12% to 24% and independent articles most of the rest. Their [write-up](https://growfusely.com/blog/ai-citation-analysis-b2b-software/) is worth reading if you sell software."
    ]
   ],
   [
    "p",
    "The pattern is the same in both. What other people write about you carries a lot of weight, and your own website still matters because it is where the basic facts come from."
   ],
   [
    "h",
    "Common problems and what to do about them"
   ],
   [
    "h3",
    "The tool does not know you, or confuses you with someone else"
   ],
   [
    "p",
    "Write a plain About page that states what you do, where you are based, when you started and who runs the company, in full sentences. Use exactly the same company name, address and phone number on your website, Google Business Profile, social profiles and any directory listing. If you share a name with another business, add your city or your website to every profile so the difference is obvious."
   ],
   [
    "h3",
    "The answer repeats old information"
   ],
   [
    "p",
    "Find the page it came from. If it is your own site, update it. If it is a directory or review profile, claim the profile and correct it. Old press articles cannot be changed, but a current page with the right facts gives the tools something newer to use."
   ],
   [
    "h3",
    "The answer repeats a complaint"
   ],
   [
    "p",
    "This is the hardest one, and the honest fix is slow. If customers keep mentioning late refunds, fix the refund process first. Then reply to those reviews and say what changed. New reviews that describe the better experience are what change the summary over time. Our guide on [how to reply to a bad review](/blog/how-to-reply-to-a-bad-review) has worked examples."
   ],
   [
    "h3",
    "A competitor appears and you do not"
   ],
   [
    "p",
    "For \"best in my city\" questions, the tools lean on review sites and local listings they can read. Make sure your reviews live somewhere AI tools are allowed to read. Not every review site allows that, as we found when we [checked which review sites ChatGPT and Perplexity can read](/blog/which-review-sites-can-ai-read)."
   ],
   [
    "h3",
    "Wrong phone number or address"
   ],
   [
    "p",
    "Fix this the same day. Correct it on every profile you control, and report wrong details on directories you do not control. A wrong number in an AI answer is an easy opening for fraudsters posing as your business."
   ],
   [
    "h",
    "Make your own website easy to read"
   ],
   [
    "ul",
    [
     "Open yourdomain.com/robots.txt and check you are not blocking OAI-SearchBot, PerplexityBot, Bingbot or Googlebot by accident. Some website security settings add these blocks without telling you.",
     "Put the important facts in normal text, not only inside images or PDFs.",
     "Add Organization and LocalBusiness structured data, which your web developer can do in an hour.",
     "An llms.txt file, a short plain-text summary of your site for AI tools, is cheap to add. No AI company has said it uses llms.txt for ranking, so treat it as a small extra."
    ]
   ],
   [
    "h",
    "Repeat it every month"
   ],
   [
    "p",
    "AI answers change from one day to the next, and the same question can get a different answer twice in a row. Ask each question twice, keep the sheet and compare month by month. One wrong answer is noise. The same wrong fact three months running points to a source you need to fix."
   ],
   [
    "note",
    "Know The Company lets AI search tools read every company page, and each page shows reviews from both customers and employees. You can [claim your company page](/claim) to correct your details and reply to reviews, or [list your company](/list) if it is not here yet."
   ],
   [
    "faq",
    [
     [
      "Can I pay ChatGPT or Perplexity to appear in their answers?",
      "No. The answers themselves cannot be bought. Some AI tools show adverts, and OpenAI's crawler documentation describes a bot that checks pages submitted as adverts, but adverts appear separately from the answer and are labelled."
     ],
     [
      "Why do I get a different answer each time I ask?",
      "AI tools generate each answer fresh and may read different pages each time. Ask the same question twice and look at what stays the same across answers."
     ],
     [
      "Should I block AI crawlers from my website?",
      "If you want to appear in AI answers, do not block the search crawlers: OAI-SearchBot, PerplexityBot, Googlebot and Bingbot. You can block training crawlers such as GPTBot separately if you prefer, without leaving ChatGPT search."
     ],
     [
      "How long does it take for a fix to show up?",
      "Changes on your own site can be picked up within days once the crawlers revisit. Changes that depend on new reviews or new articles take months. Recheck monthly rather than daily."
     ]
    ]
   ],
   [
    "src",
    [
     [
      "HRKatha: India's tech professionals have already decided before you call them (What Talent Wants 2026), October 2026",
      "https://www.hrkatha.com/features/research/indias-tech-professionals-have-already-decided-before-you-call-them/"
     ],
     [
      "OpenAI: Overview of OpenAI crawlers",
      "https://developers.openai.com/api/docs/bots"
     ],
     [
      "Perplexity: Perplexity crawlers",
      "https://docs.perplexity.ai/guides/bots"
     ],
     [
      "PPC Land: Google gives site owners a toggle to exit AI Overviews and AI Mode",
      "https://ppc.land/google-gives-site-owners-a-toggle-to-exit-ai-overviews-and-ai-mode/"
     ],
     [
      "Trustpilot and SEER Interactive: What AI says about your brand (2026)",
      "https://business.trustpilot.com/marketing/what-ai-says-about-your-brand"
     ],
     [
      "Growfusely: AI citation analysis for B2B software, July 2026",
      "https://growfusely.com/blog/ai-citation-analysis-b2b-software/"
     ]
    ]
   ]
  ]
 },
 {
  "slug": "which-review-sites-can-ai-read",
  "cat": "Reviews & reputation",
  "date": "2026-11-12",
  "tone": 2,
  "title": "Which review sites can ChatGPT and Perplexity actually read? We checked",
  "seo": "Which review sites can ChatGPT and Perplexity read?",
  "desc": "We read the robots.txt files of Trustpilot, Glassdoor, AmbitionBox, Justdial and MouthShut on 12 November 2026. Here is which AI tools each one lets in.",
  "excerpt": "A review site can tell AI tools to stay away. If it does, your reviews there may never reach a ChatGPT or Perplexity answer. We read the rules of five review sites popular in India.",
  "body": [
   [
    "p",
    "When someone asks ChatGPT or Perplexity whether a company is any good, the tool goes looking for reviews. But every website can publish a file called robots.txt that tells crawlers which pages they may visit. Some review sites use it to keep AI tools out. If yours does, the reviews your customers wrote there may never make it into an AI answer."
   ],
   [
    "p",
    "On 12 November 2026 we read the robots.txt files of five review sites that Indian businesses and job seekers use, plus our own. We run a review site, so we have an interest here. That is why every finding below links to the file itself, so you can check it."
   ],
   [
    "h",
    "A two-minute guide to the crawlers"
   ],
   [
    "p",
    "AI companies run separate crawlers for separate jobs, and a site can treat each one differently. The ones that matter for whether reviews appear in answers are the search crawlers."
   ],
   [
    "ul",
    [
     "**OAI-SearchBot** finds pages for ChatGPT search. [OpenAI says](https://developers.openai.com/api/docs/bots) sites that block it will not appear in ChatGPT's search answers.",
     "**GPTBot** collects pages that may be used to train OpenAI's models. Blocking it does not remove a site from ChatGPT search.",
     "**ChatGPT-User** visits a page when a user's request needs it. OpenAI notes that robots.txt rules may not apply to it.",
     "**PerplexityBot** finds pages for Perplexity's answers. **Perplexity-User** fetches a page a user asked about and, [according to Perplexity](https://docs.perplexity.ai/guides/bots), generally ignores robots.txt.",
     "**Google-Extended** controls Gemini training and grounding in Gemini apps. It does not affect Google's AI Overviews or AI Mode, which follow normal Googlebot rules.",
     "**Bingbot** crawls for Bing, whose index also feeds Microsoft's Copilot."
    ]
   ],
   [
    "h",
    "What we found"
   ],
   [
    "h3",
    "Trustpilot"
   ],
   [
    "p",
    "[Trustpilot's robots.txt](https://www.trustpilot.com/robots.txt) names GPTBot, OAI-SearchBot, ChatGPT-User, PerplexityBot, Google-Extended, ClaudeBot, CCBot and Bingbot, and gives them all the same rules. Company pages, the ones at trustpilot.com/review/ followed by a website address, are open to them. Individual review pages under /reviews/, search pages and filtered views are closed. Any crawler not named in the file is blocked from the whole site."
   ],
   [
    "p",
    "This has changed. [A study by Hall](https://usehall.com/guides/review-platform-ai-citation-analysis) of AI citations from mid-2025 listed Trustpilot as blocking AI crawlers entirely. Today the company pages are open to the main AI search tools, and Trustpilot's own 2026 research with SEER Interactive found it was the review site AI tools cited most often."
   ],
   [
    "h3",
    "Glassdoor"
   ],
   [
    "p",
    "[Glassdoor India's robots.txt](https://www.glassdoor.co.in/robots.txt) groups GPTBot, Google-Extended and ClaudeBot under a heading about partly blocking AI bots. They are kept out of everything except the About and employers sections. CCBot is blocked completely. OAI-SearchBot and PerplexityBot are not named, so they follow the general rules, which leave many review and salary pages open. In short, ChatGPT search and Perplexity may read Glassdoor reviews, while the training crawlers named in the file may not."
   ],
   [
    "h3",
    "AmbitionBox"
   ],
   [
    "p",
    "[AmbitionBox's robots.txt](https://www.ambitionbox.com/robots.txt) puts GPTBot, OAI-SearchBot, ChatGPT-User, PerplexityBot, Perplexity-User, Google-Extended, ClaudeBot, CCBot and Bingbot in one group and disallows the whole site to them. The only exceptions are its blog, FAQ, awards pages and community guidelines. Googlebot is allowed."
   ],
   [
    "p",
    "So AmbitionBox reviews can appear in Google Search, and possibly in Google's AI Overviews, which are built on the same index. ChatGPT search, Perplexity's crawler and Bing are asked to stay away from the review pages. Perplexity-User may still fetch a page if someone pastes the link, since it generally ignores robots.txt."
   ],
   [
    "h3",
    "Justdial"
   ],
   [
    "p",
    "[Justdial's robots.txt](https://www.justdial.com/robots.txt) blocks OAI-SearchBot, ChatGPT-User and GPTBot from the entire site. PerplexityBot and Bingbot are not named, so the general rules apply and most listing pages stay open to them. Justdial ratings are therefore unlikely to feed ChatGPT search answers directly, but can feed Perplexity and Bing."
   ],
   [
    "h3",
    "MouthShut"
   ],
   [
    "p",
    "[MouthShut's robots.txt](https://www.mouthshut.com/robots.txt) contains two sections managed through Cloudflare that contradict each other for GPTBot, CCBot and Google-Extended: one allows them and one blocks them. ClaudeBot is blocked in both. The search crawlers are not named, and the general section declares \"search=yes, ai-train=no\". Search tools are welcome, training is not, and which rule a training crawler follows depends on how it reads the file."
   ],
   [
    "h3",
    "Know The Company"
   ],
   [
    "p",
    "[Our robots.txt](https://www.knowthecompany.com/robots.txt) allows every crawler, AI search and training crawlers included. We block one bot, PetalBot, and ask two SEO crawlers to slow down. We also publish an [llms.txt summary](https://www.knowthecompany.com/llms.txt) of the site for AI tools. We made that choice because reviews are only useful if people can find them, wherever they search."
   ],
   [
    "h",
    "What this means for your company"
   ],
   [
    "ul",
    [
     "Reviews on a site that blocks a tool's search crawler are unlikely to appear in that tool's answers, however many you have there.",
     "AmbitionBox employee reviews help you in Google but are unlikely to reach ChatGPT search, Perplexity's crawler or Copilot.",
     "Justdial ratings are unlikely to reach ChatGPT search.",
     "Trustpilot company pages, Glassdoor reviews and Know The Company pages are open to the main AI search crawlers.",
     "AI tools can still mention a blocked site if another page quotes it, or show it as a plain link."
    ]
   ],
   [
    "p",
    "We are not suggesting you abandon any site. Google Business Profile still matters most for local searches, and a candidate checking AmbitionBox directly will still see your reviews there. The point is coverage. If all your reviews sit on sites that keep AI tools out, AI answers about you will be built from whatever else they can find, which may be one angry forum post."
   ],
   [
    "p",
    "A sensible spread for most Indian businesses is Google Business Profile, the review site most used in your industry and at least one site that AI search tools can read. Do not ask the same customer to review you on five sites. Ask once, and rotate which link you send."
   ],
   [
    "h",
    "How to check any site yourself"
   ],
   [
    "ol",
    [
     "Open the site's address followed by /robots.txt, for example example.com/robots.txt.",
     "Search the page for the crawler names above, such as OAI-SearchBot or PerplexityBot.",
     "Read the lines under each name. \"Disallow: /\" means the whole site is closed to that crawler. \"Allow\" lines open specific sections again.",
     "If a crawler is not named, the rules under \"User-agent: *\" apply to it."
    ]
   ],
   [
    "p",
    "These files change without notice, and both Trustpilot's and MouthShut's show signs of recent edits. We will recheck these five sites and update this article when they change."
   ],
   [
    "faq",
    [
     [
      "If a site blocks GPTBot, can ChatGPT still read it?",
      "Yes, for search. GPTBot collects training data. ChatGPT search uses OAI-SearchBot, which is a separate setting."
     ],
     [
      "Does robots.txt actually stop AI tools?",
      "It is a request, not a lock. The large AI companies say their search crawlers follow it. User-triggered fetchers such as ChatGPT-User and Perplexity-User may not, because a person asked for the page."
     ],
     [
      "Do Google's AI Overviews use AmbitionBox reviews?",
      "AI Overviews draw on Google's normal search index, and AmbitionBox allows Googlebot. Whether a given answer quotes AmbitionBox depends on the question."
     ],
     [
      "Which review site is best for appearing in ChatGPT?",
      "There is no single answer. Hall's study found AI tools favour whichever site leads each industry, such as Clutch for agencies and TripAdvisor for travel. Check that the leading site in your industry lets AI search crawlers in."
     ]
    ]
   ],
   [
    "src",
    [
     [
      "Trustpilot robots.txt (read 12 November 2026)",
      "https://www.trustpilot.com/robots.txt"
     ],
     [
      "Glassdoor India robots.txt (read 12 November 2026)",
      "https://www.glassdoor.co.in/robots.txt"
     ],
     [
      "AmbitionBox robots.txt (read 12 November 2026)",
      "https://www.ambitionbox.com/robots.txt"
     ],
     [
      "Justdial robots.txt (read 12 November 2026)",
      "https://www.justdial.com/robots.txt"
     ],
     [
      "MouthShut robots.txt (read 12 November 2026)",
      "https://www.mouthshut.com/robots.txt"
     ],
     [
      "OpenAI: Overview of OpenAI crawlers",
      "https://developers.openai.com/api/docs/bots"
     ],
     [
      "Perplexity: Perplexity crawlers",
      "https://docs.perplexity.ai/guides/bots"
     ],
     [
      "Hall: Review platform citation analysis across ChatGPT, Perplexity, AI Overviews and Copilot",
      "https://usehall.com/guides/review-platform-ai-citation-analysis"
     ],
     [
      "Trustpilot and SEER Interactive: What AI says about your brand (2026)",
      "https://business.trustpilot.com/marketing/what-ai-says-about-your-brand"
     ]
    ]
   ]
  ]
 },
 {
  "slug": "how-to-reply-to-a-bad-review",
  "cat": "Customer experience",
  "date": "2026-11-12",
  "tone": 3,
  "title": "How to reply to a bad review: examples for Indian businesses",
  "seo": "How to reply to a bad review, with examples",
  "desc": "How to reply to a negative review, with four example replies for Indian businesses: a late delivery, a coaching refund, rude staff and a review that looks fake.",
  "excerpt": "Your reply to a bad review is read by everyone who reads the review after it. Here is a simple way to write one, what never to do and four replies you can adapt.",
  "body": [
   [
    "p",
    "A one-star review stings, and the first instinct is to defend yourself. Before you type, remember who reads the reply. The unhappy customer reads it once. Every future customer who scrolls past that review reads it too, and they are deciding whether to trust you."
   ],
   [
    "p",
    "A good reply will not always win back the reviewer. Its job is to show everyone else how you behave when something goes wrong."
   ],
   [
    "h",
    "Before you reply"
   ],
   [
    "ul",
    [
     "**Check your records.** Find the order, booking or visit. [Google's own advice](https://support.google.com/business/answer/3474122?hl=en-GB) to businesses starts here, and it stops you replying to the wrong problem.",
     "**Wait an hour if you are angry.** A reply written in temper stays online for years.",
     "**Decide who replies.** The owner or a named manager is better than an anonymous \"Team\". Google recommends signing with your name or initials.",
     "**Reply within a day or two.** A quick reply shows the problem was noticed. A reply three months later looks like an afterthought."
    ]
   ],
   [
    "h",
    "A reply in five parts"
   ],
   [
    "ol",
    [
     "**Name the problem in their words.** \"Your order arrived six days late\" shows you read the review. \"We value your feedback\" shows you did not.",
     "**Own what was yours.** If you got it wrong, say so plainly. If part of it was outside your control, explain that briefly without making excuses.",
     "**Say what you have done or changed.** A refund issued, a staff member spoken to, a process fixed. This is the part future customers care about most.",
     "**Offer a direct route.** A named person and a phone number or email for the rest of the conversation. Do not ask them to post order details publicly.",
     "**Sign it.** Your name and role."
    ]
   ],
   [
    "p",
    "Most good replies are under 100 words. Long replies read as arguments."
   ],
   [
    "h",
    "What never to do"
   ],
   [
    "ul",
    [
     "**Do not call the reviewer a liar,** even if you suspect it. Say you cannot find the order and invite them to contact you. Readers can draw their own conclusions.",
     "**Do not share personal details.** No order numbers, phone numbers, addresses or anything about their purchase they did not mention. It breaks their trust, and under India's data protection law it is personal data you hold for a specific purpose.",
     "**Do not offer money or discounts in exchange for changing or deleting the review.** Google tells businesses not to offer deals in replies, and paying to change reviews is against the rules of every serious review site.",
     "**Do not paste the same reply under every complaint.** Copied replies show you did not read any of them.",
     "**Do not threaten legal action over an honest opinion.** It rarely works, and the threat often becomes a bigger story than the review."
    ]
   ],
   [
    "h",
    "Four example replies you can adapt"
   ],
   [
    "h3",
    "1. A late delivery from an online store"
   ],
   [
    "quote",
    "Review: \"Ordered a kurta set for Diwali. Came six days late, after the festival. No updates, nobody answered on WhatsApp. Waste of money.\""
   ],
   [
    "quote",
    "Reply: \"I'm sorry, Priya. Missing Diwali is exactly what you ordered early to avoid, and we didn't tell you it was delayed. Our courier partner held parcels in Delhi for four days, and we should have messaged every affected customer. We've refunded your delivery charge and now send an update whenever a parcel is held. If you'd like to return the set, please email me at the address on our website and I'll arrange a pickup. Rohan, founder\""
   ],
   [
    "p",
    "Why it works: it names the real cost to the customer, explains the cause in one sentence, admits the part that was theirs and gives a fix that helps future buyers."
   ],
   [
    "h3",
    "2. A refund dispute with a coaching institute"
   ],
   [
    "quote",
    "Review: \"Paid full fees for the NEET crash course. Batch timings changed twice in the first week. Asked for a refund, they said no refunds. Cheaters.\""
   ],
   [
    "quote",
    "Reply: \"Thank you for raising this, and I'm sorry the timings changed twice. That was our scheduling error, not something you agreed to. Our refund policy allows refunds within seven days of joining. Your request came on day nine, but because the change was ours, we'll make an exception. Please call our office and ask for me, and we'll process it this week. Anita Sharma, centre head\""
   ],
   [
    "p",
    "Why it works: it does not hide behind the policy, it explains the policy in one line and it fixes the specific case. Notice that the reply never mentions the student's name, phone number or fees paid."
   ],
   [
    "h3",
    "3. Rude staff at a clinic or restaurant"
   ],
   [
    "quote",
    "Review: \"The receptionist was rude and made my elderly father wait 50 minutes without a word.\""
   ],
   [
    "quote",
    "Reply: \"I'm sorry your father was kept waiting without an explanation. That's not how we want anyone treated, least of all an older patient. The doctor was delayed by an emergency that morning, but the front desk should have told every patient waiting. I've spoken to the team, and we now announce delays as soon as we know about them. I'd like to hear more about your visit. Please call me on the clinic number. Dr Mehta\""
   ],
   [
    "p",
    "Why it works: it accepts the complaint without blaming an individual by name in public, and it gives a change any reader can check on their next visit."
   ],
   [
    "h3",
    "4. A review that looks fake"
   ],
   [
    "quote",
    "Review: \"Worst service ever. Avoid.\" (No name you recognise, no details, no record of the person.)"
   ],
   [
    "quote",
    "Reply: \"We're sorry to read this. We can't find a booking under this name, so we can't see what went wrong. Please call or email us with your booking details so we can look into it properly. Kiran, operations manager\""
   ],
   [
    "p",
    "Why it works: it stays calm, tells readers you checked and leaves the door open. Separately, report the review to the site if it breaks their rules, for example if it was written by a competitor or by someone who was never a customer."
   ],
   [
    "h",
    "When the reviewer has a point you cannot fix"
   ],
   [
    "p",
    "Some complaints are about choices you made on purpose, such as a price, a location or a policy. Do not pretend to change them. Explain the reason once, honestly. \"Our prices are higher than nearby shops because every piece is made to order in our workshop\" is a perfectly good reply. Some readers will agree with the reviewer, and some will now choose you for the same reason."
   ],
   [
    "h",
    "What about good reviews?"
   ],
   [
    "p",
    "You do not have to thank every five-star review, and Google's advice says the same. Reply when you have something to add, such as a tip, an answer to a question in the review or a genuine thank-you to a regular customer. A wall of identical \"Thank you so much!\" replies adds nothing."
   ],
   [
    "h",
    "After you reply, fix the cause"
   ],
   [
    "p",
    "Once a month, read your reviews in one sitting and list the complaints that repeat. Two mentions of slow refunds is a coincidence. Six is a process problem. Fixing it does more for your rating than any reply."
   ],
   [
    "p",
    "It also changes what AI tools say about you. When ChatGPT, Perplexity or Gemini summarise a company, they often repeat the themes customers mention most, such as refunds, delivery or staff behaviour. Our guide to [checking what AI tools say about your company](/blog/check-your-company-in-chatgpt-perplexity-gemini) shows how to see this for yourself."
   ],
   [
    "note",
    "On Know The Company, verified companies can reply publicly to both customer and employee reviews. We never remove a review because a company asks, but you can report any review that breaks our guidelines. [Claim your company page](/claim) to start replying."
   ],
   [
    "faq",
    [
     [
      "Should I reply to every bad review?",
      "Reply to every review that describes a real problem, especially recent ones. You can skip reviews with no content at all, but a short, calm reply like example four does no harm."
     ],
     [
      "How quickly should I reply?",
      "Within one or two days. A fast reply shows you are paying attention, and the problem is still fresh enough to fix."
     ],
     [
      "Can I ask a customer to delete or change a review?",
      "You can tell a customer you have fixed the problem and that they are welcome to update their review if they wish. Never make a refund or discount depend on it."
     ],
     [
      "What if a review is fake?",
      "Reply calmly, say you cannot find a record and invite them to contact you. Then report it to the review site with whatever evidence you have."
     ]
    ]
   ],
   [
    "src",
    [
     [
      "Google Business Profile Help: Tips to reply to reviews",
      "https://support.google.com/business/answer/3474122?hl=en-GB"
     ],
     [
      "Trustpilot and SEER Interactive: What AI says about your brand (2026)",
      "https://business.trustpilot.com/marketing/what-ai-says-about-your-brand"
     ]
    ]
   ]
  ]
 },
 {
  "slug": "what-candidates-read-in-employee-reviews",
  "cat": "Startup growth",
  "date": "2026-11-12",
  "tone": 4,
  "title": "What candidates read in your employee reviews before they apply",
  "seo": "What job candidates read in your employee reviews",
  "desc": "Nearly half of Indian tech professionals check Glassdoor or AmbitionBox before applying. What they look for in employee reviews, and how to reply.",
  "excerpt": "Nearly half of India's tech professionals check employee reviews before they apply, and former employees are the source they trust most. Here is what candidates look for, and how to respond.",
  "body": [
   [
    "p",
    "Your careers page tells candidates what you want them to know. Employee reviews tell them what former colleagues think they should know. Candidates read both, and they trust the second more."
   ],
   [
    "p",
    "In What Talent Wants 2026, a survey of 2,000 tech, product and data professionals across India [reported by HRKatha in October 2026](https://www.hrkatha.com/features/research/indias-tech-professionals-have-already-decided-before-you-call-them/), 92% said they research employers on LinkedIn before applying, 81% visit the company website and careers page and nearly half check Glassdoor or AmbitionBox. Asked whom they trust most, 48% picked former employees, ahead of current employees' LinkedIn posts at 44% and company websites at 39%. Only 23% picked posts by leadership."
   ],
   [
    "p",
    "An employee review is the closest a candidate gets to asking a former employee over coffee. Here is what they look for when they read yours."
   ],
   [
    "h",
    "What candidates look for"
   ],
   [
    "h3",
    "Their likely manager"
   ],
   [
    "p",
    "Comments about managers come up more than almost anything else. Candidates look for words like micromanage, supportive or takes credit, and whether they are tied to a team or function. The same survey found 56% of respondents rate a prospective manager's profile as very important before accepting an offer."
   ],
   [
    "h3",
    "Salary on time and honest appraisals"
   ],
   [
    "p",
    "\"Salary credited late\" in one review is a warning. In three reviews it is a decision. Candidates also look at what reviewers say about appraisal cycles: whether increments matched what was promised, whether ratings felt fixed in advance and whether promotions happened on time."
   ],
   [
    "h3",
    "Working hours and weekends"
   ],
   [
    "p",
    "Reviews are where candidates find out whether \"flexible hours\" means flexible or always available. Mentions of weekend calls, late-night client meetings or unpaid overtime get noticed, especially by people with families."
   ],
   [
    "h3",
    "How people leave"
   ],
   [
    "p",
    "This one is particular to India and it matters a lot. Candidates read what reviewers say about notice periods, buyouts, full and final settlement and relieving letters. A company that delays a relieving letter by two months will hear about it in reviews, and candidates read that as a sign of how they will be treated on the way out."
   ],
   [
    "h3",
    "Job security"
   ],
   [
    "p",
    "After a round of layoffs, the newest reviews carry most of the weight. Candidates want to know whether cuts were handled with notice and severance, or by a calendar invite at 9 in the morning."
   ],
   [
    "h",
    "Patterns candidates notice"
   ],
   [
    "ul",
    [
     "**Dates.** A complaint from 2021 matters less than one from last month. Candidates scroll to the newest reviews first.",
     "**Repetition.** One reviewer complaining about a manager is a personality clash. Five is a pattern.",
     "**Your replies.** Whether the company replies at all, and whether the reply sounds like a person or a policy document.",
     "**Sudden bursts of praise.** Twenty five-star reviews in one week, all short and similar, look organised. Candidates trust the whole page less afterwards."
    ]
   ],
   [
    "h",
    "How to reply to employee reviews"
   ],
   [
    "p",
    "Replying to employee reviews is different from replying to customers. The reviewer may still work for you, and anonymity is what makes the review honest. A few rules:"
   ],
   [
    "ul",
    [
     "**Never try to identify the writer,** in the reply or inside the company. If staff believe reviews are traced, the honest ones stop and the page fills with polite ones nobody believes.",
     "**Answer the substance.** If the review says appraisals were delayed, say when the cycle will close this year.",
     "**Be specific about changes.** \"We've moved to monthly salary credit on the 1st, without exception\" beats \"We take employee feedback seriously\".",
     "**Write like a person.** Sign with a name and role, such as the head of people or a co-founder.",
     "**Do not argue with a former employee in public,** even if you remember things differently."
    ]
   ],
   [
    "p",
    "Here is an example for a common complaint:"
   ],
   [
    "quote",
    "Review: \"Good learning, but my full and final settlement took three months and nobody answered my emails.\""
   ],
   [
    "quote",
    "Reply: \"Thank you for writing this, and I'm sorry. Three months is far too long, and not replying to your emails was worse. Since September, settlements are paid within 30 days of the last working day, and every leaver has one named contact in HR. If anything from your own settlement is still pending, please write to me directly. Neha, head of people\""
   ],
   [
    "h",
    "Getting more honest reviews"
   ],
   [
    "ul",
    [
     "Ask everyone, including people who are leaving. Reviews collected only from top performers read as hand-picked, and candidates can tell.",
     "Share the review link in the exit process, as part of the paperwork.",
     "Do not ask in team meetings or with a manager standing nearby. People write differently when they feel watched.",
     "Never reward reviews with gifts, leave or points. Rewards produce glowing reviews that candidates discount, and review sites can remove them."
    ]
   ],
   [
    "h",
    "Candidates are asking AI tools too"
   ],
   [
    "p",
    "The same survey found 31% of Indian tech professionals use AI tools to research employers. When a candidate asks ChatGPT what it is like to work for you, the answer can only draw on reviews the tool can read. When we read the rules review sites publish for AI crawlers, we found that some keep ChatGPT search and Perplexity's crawler away from their employee review pages. The details are in our article on [which review sites AI tools can read](/blog/which-review-sites-can-ai-read)."
   ],
   [
    "note",
    "On Know The Company, employee reviews are anonymous, and companies can reply to them once verified. Every company page shows customer and employee reviews side by side, and AI search tools can read them. [List your company](/list) or [claim your page](/claim) to reply to your employees."
   ],
   [
    "faq",
    [
     [
      "Do candidates really read employee reviews?",
      "Yes. In What Talent Wants 2026, nearly half of 2,000 Indian tech professionals said they check Glassdoor or AmbitionBox before applying, and former employees were the source they trusted most."
     ],
     [
      "Should we reply to every employee review?",
      "Reply to reviews that raise a specific issue, especially recent ones. Thank people for detailed positive reviews when you have something to add."
     ],
     [
      "Can we find out who wrote a review?",
      "On any reputable site, no, and you should not try. Anonymity is what makes the reviews believable to candidates."
     ],
     [
      "Can we ask employees to write reviews?",
      "Yes, as long as you ask everyone, do not pressure anyone and offer no reward. Asking only your happiest employees produces reviews candidates do not trust."
     ]
    ]
   ],
   [
    "src",
    [
     [
      "HRKatha: India's tech professionals have already decided before you call them (What Talent Wants 2026), October 2026",
      "https://www.hrkatha.com/features/research/indias-tech-professionals-have-already-decided-before-you-call-them/"
     ]
    ]
   ]
  ]
 },
 {
  "slug": "dpdp-rules-review-requests",
  "cat": "Rules & compliance",
  "date": "2026-11-12",
  "tone": 5,
  "title": "Asking customers for reviews? What India's DPDP Rules mean for you",
  "seo": "DPDP Rules and review requests: what businesses must do",
  "desc": "India's DPDP Rules take full effect in May 2027. What they mean for businesses that email, SMS or WhatsApp customers for reviews, with a checklist.",
  "excerpt": "Most of India's data protection duties for businesses apply from May 2027, and review requests are covered. Here is what changes when you email, SMS or WhatsApp customers for a review.",
  "body": [
   [
    "p",
    "If you send customers a message after an order asking them to leave a review, you are using their personal data: a name, a phone number or email address and the fact that they bought from you. In India that is governed by the Digital Personal Data Protection Act, 2023 and the rules made under it, which the government notified in November 2025."
   ],
   [
    "p",
    "The rules are being phased in. The Data Protection Board was set up straight away. Provisions for registering consent managers started in November 2026. Most duties for ordinary businesses, including notices, security safeguards, breach reporting, deletion and parental consent, apply from May 2027, according to [an analysis by Saga Legal](https://www.legal500.com/firms/237811-saga-legal/c-india/news-and-developments/the-privacy-timer-starts-now-analysing-the-dpdp-rules-and-its-18-month-countdown). That leaves about six months to get review requests right."
   ],
   [
    "note",
    "This article explains the rules in plain language. It is not legal advice. For your own situation, speak to a lawyer who works on data protection."
   ],
   [
    "h",
    "Who is responsible"
   ],
   [
    "p",
    "Under the Act, the business that decides why and how personal data is used is the Data Fiduciary. If you collect a customer's number at checkout and decide to ask them for a review, that is you. If a software tool or review platform sends the messages for you, it acts as your Data Processor. The responsibility stays with you, so choose tools that let you meet the rules below."
   ],
   [
    "h",
    "Tell customers clearly, before you ask"
   ],
   [
    "p",
    "The rules require a notice that can be understood on its own, in clear and plain language. It should list the personal data you will use, the specific purpose and how the person can withdraw consent, exercise their rights and complain to the Data Protection Board. A line hidden in your terms and conditions does not meet that standard."
   ],
   [
    "p",
    "For review requests, the simplest approach is a short, separate line at the point of sale:"
   ],
   [
    "quote",
    "\"We may send you one message on WhatsApp or email after your order to ask for a review. You can say no now, or reply STOP at any time.\""
   ],
   [
    "p",
    "Put it on your checkout page, your invoice or the form at your counter, wherever you collect the number."
   ],
   [
    "h",
    "Consent, or a legitimate use?"
   ],
   [
    "p",
    "The Act allows some processing without separate consent. One of these \"legitimate uses\" covers data a person gave you voluntarily for a specified purpose, as long as they have not said they do not want it used. Whether a review request falls inside the purpose of a purchase has not been tested yet. The safer course is to name review requests in your notice, so the purpose is clearly stated from the start."
   ],
   [
    "h",
    "Children need a parent's consent"
   ],
   [
    "p",
    "This affects coaching institutes, schools, edtech companies, toy stores and anyone else whose customers include people under 18. Under the rules, processing a child's data needs verifiable consent from a parent or guardian, with limited exceptions. For review requests, the simple rule is to ask the parent who paid, never the student, and only once the parent has agreed to be contacted."
   ],
   [
    "h",
    "Make stopping as easy as starting"
   ],
   [
    "ul",
    [
     "Withdrawing consent must be as easy as giving it. Every review request should say how to stop further messages.",
     "Keep a list of people who said no, and check it before every send. Sending again after someone opted out is the fastest way to a complaint.",
     "Do not quietly move review-request contacts into your marketing list. They gave you their number for an order and a review request, not for offers."
    ]
   ],
   [
    "h",
    "Keep the data safe, and delete it when you are done"
   ],
   [
    "p",
    "From May 2027 businesses must keep reasonable security safeguards, tell affected people about a data breach without delay in plain language, and respond to requests to access, correct or erase their data within 90 days, as the [government's explainer](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf) sets out. For review requests that means:"
   ],
   [
    "ul",
    [
     "Do not keep spreadsheets of customer numbers on personal phones or shared drives open to everyone.",
     "Limit who in your team can export customer lists.",
     "Once a customer has been asked for a review, you do not need their number for that purpose any more. Decide how long you keep it, write it down and stick to it."
    ]
   ],
   [
    "h",
    "What the penalties are"
   ],
   [
    "p",
    "The Act sets maximum penalties of up to ₹250 crore for failing to keep reasonable security safeguards, up to ₹200 crore for failing to report a breach or for breaking the rules on children's data, and up to ₹50 crore for other breaches. These are ceilings, and the Board decides the actual amount case by case. For a small business, the more likely cost of a careless review campaign is a complaint, a lost customer and a worse review than the one you asked for."
   ],
   [
    "h",
    "A checklist for review requests"
   ],
   [
    "ol",
    [
     "Add a short, separate notice wherever you collect phone numbers or email addresses, naming review requests as a purpose.",
     "Send one request per order, not a series of reminders.",
     "Include a simple way to stop in every message.",
     "Keep and check a list of people who opted out.",
     "For customers under 18, contact the parent, and only with their agreement.",
     "Keep review-request contacts out of your marketing lists unless people agreed to both.",
     "Restrict who can download customer lists, and decide how long you keep them.",
     "If a tool sends requests for you, check it supports opt-outs and does not reuse your customers' data for its own marketing."
    ]
   ],
   [
    "h",
    "How we handle review invitations"
   ],
   [
    "p",
    "Companies on our Business plan can send review invitations by email. Before sending, the company confirms it has permission to contact everyone on its list. We keep only a scrambled code of each address, never the address itself, so we can stop anyone being invited twice within 90 days. Every invitation has a link to stop all future invitations, from any company, and we honour it permanently. You can see the [plans and pricing](/pricing) for details."
   ],
   [
    "faq",
    [
     [
      "Does the DPDP Act apply to small businesses?",
      "Yes. The Act has no general exemption for small businesses, though the government can exempt some categories, including startups, from certain provisions by notification. Check the current notifications before relying on an exemption."
     ],
     [
      "When do the DPDP Rules apply to review requests?",
      "Most duties for businesses, including notices and security safeguards, apply from May 2027, 18 months after the rules were notified in November 2025."
     ],
     [
      "Is WhatsApp treated differently from email or SMS?",
      "No. The rules apply to personal data whatever channel you use. WhatsApp also has its own business messaging policies, which you need to follow separately."
     ],
     [
      "Can I ask for a review on the invoice instead?",
      "Yes, and it is the lightest option. A review link printed on the invoice does not send the customer any extra message."
     ]
    ]
   ],
   [
    "src",
    [
     [
      "Press Information Bureau: explainer on the Digital Personal Data Protection Rules, 2025 (November 2025)",
      "https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf"
     ],
     [
      "Saga Legal via Legal500: The privacy timer starts now, analysing the DPDP Rules and its 18-month countdown",
      "https://www.legal500.com/firms/237811-saga-legal/c-india/news-and-developments/the-privacy-timer-starts-now-analysing-the-dpdp-rules-and-its-18-month-countdown"
     ],
     [
      "YourStory: Govt notifies Digital Personal Data Protection Rules 2025, rollout stretched over 18 months",
      "https://yourstory.com/2025/11/digital-personal-data-protection-dpdp-rules-2025-rollout-over-18-months"
     ]
    ]
   ]
  ]
 }
];
POSTS.forEach(p => { const words = p.body.map(b => Array.isArray(b[1]) ? b[1].flat().join(' ') : b[1]).join(' ').split(/\s+/).length; p.read = Math.max(2, Math.round(words / 200)); p.id = 'blog-' + p.slug; });
const POSTBYID = Object.fromEntries(POSTS.map(p => [p.id, p]));
if (!POSTS.length) PAGE_ROUTES.splice(PAGE_ROUTES.indexOf('blog'), 1);
const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
/* Article text: [words](link) becomes a link (site links stay in the tab, others open a new one) and
   **words** becomes bold. Everything else is escaped. Same rules as articleHtml in astro/src/lib/page.ts. */
const inl = t => esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]\(((?:https:\/\/|\/|#)[^\s)]+)\)/g, (m, x, u) => /^https:\/\/(?!www\.knowthecompany\.com)/.test(u) ? `<a href="${u}" target="_blank" rel="noopener">${x}</a>` : `<a href="${u}">${x}</a>`);
const postBlock = ([k, v]) => k === 'h' ? `<h2>${esc(v)}</h2>` : k === 'h3' ? `<h3>${esc(v)}</h3>` : k === 'ul' ? `<ul>${v.map(i => `<li>${inl(i)}</li>`).join('')}</ul>` : k === 'ol' ? `<ol>${v.map(i => `<li>${inl(i)}</li>`).join('')}</ol>`
  : k === 'note' ? `<div class="box soft" style="margin:22px 0"><p>${inl(v)}</p></div>` : k === 'quote' ? `<blockquote>${v.split('\n').map(x => `<p>${inl(x)}</p>`).join('')}</blockquote>`
  : k === 'faq' ? `<h2>Frequently asked questions</h2>${v.map(([q, a]) => `<h3>${esc(q)}</h3><p>${inl(a)}</p>`).join('')}`
  : k === 'src' ? `<h2>Sources</h2><ul class="sources">${v.map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a></li>`).join('')}</ul>` : `<p>${inl(v)}</p>`;
const postCard = p => `<a class="postcard" href="#${p.id}">${p.image ? `<img class="cover" src="${esc(p.image)}" alt="" loading="lazy" style="object-fit:cover;width:100%;aspect-ratio:16/9;height:auto">` : `<span class="cover" aria-hidden="true" style="background:var(--t${p.tone});color:var(--t${p.tone}i)">${esc(p.cat)}</span>`}
  <div class="postmeta"><span>${fmtDate(p.date)}</span><span>${p.read} min read</span></div><h3>${esc(p.title)}</h3><p>${esc(p.excerpt)}</p></a>`;

function vBlog() {
  const list = POSTS.filter(p => S.blogCat === 'All' || p.cat === S.blogCat);
  return `<section class="band"><div class="wrap" style="padding-block:44px 40px;display:flex;flex-direction:column;gap:14px">
      <p class="eyebrow">Blog for companies</p><h1 style="font-size:clamp(32px,4.5vw,48px);font-weight:800">Practical advice on reviews, reputation and growing a business</h1>
      <p style="color:var(--muted);font-size:18px;max-width:640px">Articles for business owners and teams. Every post is about running and growing a business.</p>
      <div class="chips" style="margin-top:6px">${['All', ...BLOG_CATS].map(c => `<button type="button" class="chip" data-act="blogcat" data-cat="${esc(c)}" aria-pressed="${S.blogCat === c}" style="${S.blogCat === c ? 'background:var(--accent);color:var(--accent-ink);border-color:var(--accent)' : ''}">${esc(c)}</button>`).join('')}</div>
    </div></section>
    <section class="wrap sec"><h2 class="sr">Latest articles</h2><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">${list.map(postCard).join('')}</div>
      <div class="box soft" style="margin-top:28px;flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:space-between"><div style="display:flex;flex-direction:column;gap:4px"><h2 style="font-size:19px">Have business expertise to share?</h2><p>We publish guest articles from founders, marketers and operators.</p></div><a class="btn p" href="#write-for-us">Write for us</a></div></section>`;
}
function vPost(p) {
  const body = p.body.map(postBlock).join('');
  const more = POSTS.filter(x => x.id !== p.id).slice(0, 3);
  return `<div class="wrap">${crumbs([['Home','#home'],['Blog','#blog'],[p.title]])}
    <article class="article" style="padding-top:22px">
      <p class="eyebrow">${esc(p.cat)}</p>
      <h1 style="font-size:clamp(30px,4.2vw,44px);font-weight:800;line-height:1.12;margin-top:10px">${esc(p.title)}</h1>
      <div class="postmeta" style="margin-top:14px"><span class="avatar" aria-hidden="true" style="width:32px;height:32px;font-size:12px;border-radius:999px">KC</span><span>Know The Company Editorial</span><span>·</span><span>${fmtDate(p.date)}</span><span>·</span><span>${p.read} min read</span>${p.updated && p.updated !== p.date ? `<span>·</span><span>Updated ${fmtDate(p.updated)}</span>` : ''}</div>
      ${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.imageAlt || '')}" width="1200" height="675" style="width:100%;height:auto;border-radius:16px;margin-top:22px;aspect-ratio:16/9;object-fit:cover">` : ''}
      <p class="lead" style="margin-top:22px">${esc(p.excerpt)}</p>
      ${body}
      <div class="box soft" style="margin-top:36px"><h2>Get listed on Know The Company</h2><p>A verified profile with a website link and replies to reviews, plus contact buttons and photos on Plus. ${LAUNCH ? 'Basic is free for your first year.' : 'From [[PB]] a year.'}</p><a class="btn p" href="#list" style="align-self:flex-start">List your company</a></div>
    </article>
    <section class="sec"><div class="sechead"><h2 style="font-size:24px">More from the blog</h2><a href="#blog" style="font-weight:700">All articles</a></div><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">${more.map(postCard).join('')}</div></section></div>`;
}

const WFU_TOPICS = ['Reviews & reputation', 'Customer experience', 'Startup growth', 'E-commerce', 'Marketing for businesses', 'Hiring & teams', 'Business finance & payments', 'Rules & compliance'];
function vWriteForUs() {
  const form = S.pitchSent ? `<div class="formcard"><div style="display:flex;gap:12px;align-items:center">${TICK()}<h2>Pitch received</h2></div>
      <p style="color:var(--muted);line-height:1.6">Thanks. Our editors reply to pitches within 7 working days if the topic is a fit. You can send another pitch any time.</p>
      <p class="meta">We opened your email app with your pitch. Press send there to reach our editors.</p><button class="btn g" type="button" data-act="pitch-again" style="align-self:flex-start">Send another pitch</button></div>`
    : `<form class="formcard" id="pitch-form" novalidate><h2>Pitch an article</h2>
      <div class="row"><div class="field"><label class="l" for="w-name">Your name</label><input id="w-name" type="text" autocomplete="name"><p class="err" id="err-w-name" hidden>Enter your name.</p></div>
        <div class="field"><label class="l" for="w-email">Email</label><input id="w-email" type="email" autocomplete="email"><p class="err" id="err-w-email" hidden>Enter an email address like name@example.com.</p></div></div>
      <div class="row"><div class="field"><label class="l" for="w-company">Company and your role</label><input id="w-company" type="text" placeholder="e.g. Founder, Acme Labs"><p class="err" id="err-w-company" hidden>Tell us where you work and your role.</p></div>
        <div class="field"><label class="l" for="w-topic">Topic area</label><select id="w-topic"><option value="">Choose a business topic</option>${WFU_TOPICS.map(x => `<option>${esc(x)}</option>`).join('')}</select><p class="err" id="err-w-topic" hidden>Choose the business topic your article fits.</p></div></div>
      <div class="field"><label class="l" for="w-title">Proposed title</label><input id="w-title" type="text" maxlength="120"><p class="err" id="err-w-title" hidden>Add a working title.</p></div>
      <div class="field"><label class="l" for="w-outline">Outline</label><textarea id="w-outline" rows="5" maxlength="2000" placeholder="Main points, who it is for, and what readers will be able to do after reading"></textarea><p class="err" id="err-w-outline" hidden>Write at least 80 characters so we understand your idea.</p></div>
      <div class="field"><label class="l" for="w-sample">Link to something you've written <span class="meta">(optional)</span></label><input id="w-sample" type="text" inputmode="url" placeholder="yourblog.com/article"></div>
      <label class="check"><input id="w-agree" type="checkbox"><span>The article will be original, unpublished elsewhere, and about business. I won't include paid or affiliate links.</span></label>
      <p class="err" id="err-w-agree" hidden>Tick the box to confirm.</p>
      <button class="btn p lg" type="submit">Send pitch</button></form>`;
  return `<section class="band"><div class="wrap" style="padding-block:44px 40px;display:flex;flex-direction:column;gap:14px;max-width:1200px">
      <p class="eyebrow">Write for us</p><h1 style="font-size:clamp(32px,4.5vw,48px);font-weight:800;max-width:820px">Share what you've learned running a business</h1>
      <p style="color:var(--muted);font-size:18px;max-width:680px">We publish practical guest articles for business owners and teams. We only accept business and company topics.</p></div></section>
    <section class="wrap sec"><div class="layout">
      <div class="mainc">${form}</div>
      <aside class="side">
        <div class="box"><h2>Topics we accept</h2><ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;font-size:14px;color:var(--muted)">${WFU_TOPICS.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
        <div class="box"><h2>We don't accept</h2><ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;font-size:14px;color:var(--muted)"><li>Personal, lifestyle, travel or health topics</li><li>Gambling, betting, adult or CBD content</li><li>Crypto or investment tips and promotions</li><li>Product ads, press releases or link-only posts</li><li>AI-generated articles without real experience</li></ul></div>
        <div class="box soft"><h2>Guidelines</h2><ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;font-size:14px;color:var(--muted)"><li>1,000–2,000 words, written from your own experience</li><li>Original and not published anywhere else</li><li>One author bio with a link to your company; links in guest posts are marked nofollow</li><li>Our editors may edit for clarity and length</li><li>We don't charge for, or pay for, guest posts</li></ul></div>
      </aside></div></section>`;
}

function vAbout() {
  return `<section class="band"><div class="wrap" style="padding-block:48px 44px;display:flex;flex-direction:column;gap:14px">
      <p class="eyebrow">About Know The Company</p><h1 style="font-size:clamp(32px,4.8vw,52px);font-weight:800;max-width:820px">Helping people choose companies they can trust</h1>
      <p style="color:var(--muted);font-size:18px;max-width:680px">Know The Company is an open review platform for startups and growing companies, everywhere. Big brands already have thousands of reviews; the companies people actually hire, work with and work for often have none. Anyone can read and write reviews for free. We show how a company treats both its customers and its employees.</p></div></section>
    <section class="wrap sec"><h2 class="sr">Our mission and how we work</h2><div class="steps">
      <div class="step"><p class="lbl">Our mission</p><h3>Honest information before you pay</h3><p>Customers deserve to know how a company treats people before they hand over money or personal data.</p></div>
      <div class="step"><p class="lbl">How we earn</p><h3>Companies pay for tools, not stars</h3><p>${LAUNCH ? `Basic listings are free for the first year for companies that join before ${LAUNCH_END}, then [[PB]] a year. Plus costs [[PP]] a year, and Business [[PZ]] a year.` : `Businesses can buy a Basic listing for [[PB]] a year, Plus for [[PP]] a year or Business for [[PZ]] a year.`} A listing gives a business tools, and never changes its rating.</p></div>
      <div class="step"><p class="lbl">Who we serve</p><h3>Startups and growing companies worldwide</h3><p>From a two-person studio to a 500-person scale-up, every company can be listed and reviewed.</p></div></div></section>
    <section class="wrap sec" style="max-width:900px"><div class="sechead"><h2>What we stand for</h2></div>
      <div style="display:flex;flex-direction:column;gap:12px">${[['Neutral','Paid and unpaid companies are reviewed and moderated the same way.'],['Transparent','We publish how many reviews we remove and why.'],['Real people','Reviewers confirm their email before they can post.'],['Fair to companies','Every company can reply publicly and report reviews that break our rules.']].map(([a, b]) => `<div class="box" style="flex-direction:row;gap:16px;align-items:baseline;flex-wrap:wrap"><b style="min-width:150px">${a}</b><span style="color:var(--muted);flex:1 1 300px">${b}</span></div>`).join('')}</div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:28px"><a class="btn p" href="#search">Find a company</a><a class="btn g" href="#contact">Contact us</a></div></section>`;
}

function vContact() {
  const form = S.contactSent ? `<div class="formcard"><div style="display:flex;gap:12px;align-items:center">${TICK()}<h2>Your email is ready to send</h2></div><p style="color:var(--muted)">We opened your email app with your message. Press send there, and we usually reply within 2 working days.</p><button class="btn g" type="button" data-act="contact-again" style="align-self:flex-start">Send another message</button></div>`
    : `<form class="formcard" id="contact-form" novalidate><h2>Send us a message</h2>
      <div class="row"><div class="field"><label class="l" for="c-name">Name</label><input id="c-name" type="text" autocomplete="name"><p class="err" id="err-c-name" hidden>Enter your name.</p></div>
        <div class="field"><label class="l" for="c-email">Email</label><input id="c-email" type="email" autocomplete="email"><p class="err" id="err-c-email" hidden>Enter an email address like name@example.com.</p></div></div>
      <div class="field"><label class="l" for="c-topic">What is it about?</label><select id="c-topic"><option>A review I wrote</option><option>My company listing or payment</option><option>Reporting a fake review</option><option>Press and partnerships</option><option>Legal notice or takedown request</option><option>Something else</option></select></div>
      <div class="field"><label class="l" for="c-msg">Message</label><textarea id="c-msg" rows="6" maxlength="3000"></textarea><p class="err" id="err-c-msg" hidden>Write a message of at least 20 characters.</p></div>
      <button class="btn p lg" type="submit" style="align-self:flex-start">Write the email</button><p class="meta">This opens your email app with your message filled in.</p></form>`;
  return `<div class="wrap">${crumbs([['Home','#home'],['Contact']])}
    <div class="pagehead"><h1>Contact us</h1><p>Questions about reviews, listings or anything else. We usually reply within 2 working days.</p></div>
    <div class="layout"><div class="mainc">${form}</div>
      <aside class="side">
        <div class="box"><h2>Email</h2><p>For reviews, listings, payments, refunds, legal notices and takedowns: <span style="user-select:all;color:var(--fg)">knowthecompanysupport@gmail.com</span></p></div>
        <div class="box"><h2>Grievance officer</h2><p>Nimish Chhabra, Grievance Officer<br><span style="user-select:all;color:var(--fg)">knowthecompanysupport@gmail.com</span><br>We acknowledge complaints within 24 hours and resolve them within 7 days.</p></div>
        ${opBox()}
        <div class="box soft"><h2>Quick answers</h2><p>Many questions are answered in our help centre.</p><a href="#help" style="font-weight:700;font-size:14px">Open help centre</a></div>
      </aside></div></div>`;
}

const HELP = [
  ['For reviewers', [
    ['Is Know The Company free for reviewers?', 'Yes. Reading and writing reviews is always free.'],
    ['Why do I need to log in to post?', 'Logging in with a one-time code confirms you are a real person and lets you see and manage your reviews.'],
    ['Can I edit or remove my review?', 'Yes. Open My reviews after logging in and remove a review you wrote.'],
    ['Why was my review removed?', 'Only reviews that break our review guidelines, or that we must remove by law, are taken down. We email you the reason.']]],
  ['For employees', [
    ['Can I post an employee review anonymously?', 'Yes. You choose for each review: anonymous, or with your name. Your email is never shown, and your employer can\'t see who wrote an anonymous review.'],
    ['How do you verify employees?', 'Log in with your work email at the company\'s website domain to get a “Work email verified” badge.'],
    ['Can my employer remove my review?', 'No. We remove a review only when it breaks our guidelines or we receive a valid legal order.'],
    ['What should I not include?', 'Names of junior colleagues, confidential company information or trade secrets, and accusations you can\'t back up with evidence.']]],
  ['For employers', [
    ['What does a verified listing include?', 'Basic includes a verified badge, an employer branding page, city and category pages, replies to reviews and a review link. ' + (LAUNCH ? `It is free for your first year if you join before ${LAUNCH_END}, then [[PB]] a year. ` : 'It costs [[PB]] a year. ') + `Plus ([[PP]] a year) adds call, WhatsApp and email buttons, photos, and offers and updates. Business ([[PZ]] a year) adds review invitations, rating trends, branches and team logins.`],
    LAUNCH ? ['Do I need to pay?', `Not in your first year. Companies that join before ${LAUNCH_END} get Basic free for their first year. After that, listings cost [[PB]] a year by yearly autopay, which you set up only if you want to continue. You can cancel autopay at any time.`] : ['How much does it cost?', '[[PB]] a year, paid by yearly autopay. You can cancel at any time, and your listing stays active until the end of the year you paid for.'],
    ['Can I post jobs?', 'Job posts are coming soon. For now, Know The Company focuses on customer and employee reviews. Verified businesses will be the first to post jobs when they launch.'],
    ['Can I get a refund?', 'Yes. If you pay for a plan and change your mind within 14 days, write to knowthecompanysupport@gmail.com for a full refund. If we can’t verify your company, we refund you in full. See our <a href="#refunds">refunds and cancellations policy</a>.'],
    ['Can paying remove bad reviews?', 'No. Payment never changes ratings or hides reviews. You can reply publicly or report reviews that break the rules.'],
    ['My company is already listed. What now?', 'Open your profile and press Claim. You keep the existing reviews.'],
    ['How do I verify my company?', 'Choose one way when you claim. Add a DNS record or a tag to your website and you’re verified straight away. Or upload a company document or your company ID card, and our team checks it, usually within 2 working days. You can choose and pay for your plan while the check is going on.']]],
  ['Trust and safety', [
    ['How do you stop fake reviews?', 'We confirm reviewers by email, check for patterns such as many reviews from one device, and review flagged content by hand.'],
    ['How do I report a review?', 'Use Report on the review, or contact us with a link to it. Companies can also report from their dashboard.']]]
];
function vHelp() {
  return `<div class="wrap" style="max-width:900px">${crumbs([['Home','#home'],['Help centre']])}
    <div class="pagehead"><h1>Help centre</h1><p>Answers for reviewers, employees and companies.</p></div>
    <div style="display:flex;flex-direction:column;gap:30px">${HELP.map(([g, qs]) => `<section style="display:flex;flex-direction:column;gap:10px"><h2 style="font-size:22px">${g}</h2>${qs.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</section>`).join('')}
    <div class="box soft" style="flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:space-between"><p style="color:var(--fg)">Still need help?</p><a class="btn p" href="#contact">Contact us</a></div></div></div>`;
}

/* ---------- who runs the site ----------
   Razorpay checks that the business named here matches the KYC documents.
   Fill these in before applying. Empty fields are simply not shown. */
const OPERATOR = { legalName: 'Kautilya Upadhyay', address: 'Agra, Uttar Pradesh, India', phone: '', taxNote: '' };
const opName = () => OPERATOR.legalName || 'Know The Company';
const opBox = () => OPERATOR.legalName ? `<div class="box"><h2>Who runs this site</h2><p>Know The Company is run by <b style="color:var(--fg)">${esc(OPERATOR.legalName)}</b>.${OPERATOR.address ? `<br>Address: ${esc(OPERATOR.address)}` : ''}${OPERATOR.phone ? `<br>Phone: <span style="user-select:all;color:var(--fg)">${esc(OPERATOR.phone)}</span>` : ''}</p></div>` : '';

/* ---------- currency switch ----------
   Plan prices show in rupees or US dollars. Visitors outside India's time zone start in dollars, and the
   choice is remembered in this browser. Legal pages always state both. */
const CUR_PRICES = { INR: { PB: '₹499', PP: '₹' + PLUS_PRICE.toLocaleString('en-IN'), PZ: '₹' + BUSINESS_PRICE.toLocaleString('en-IN'), DB: 'About ₹1.4 a day', DP: 'About ₹2.7 a day', DZ: 'About ₹41 a day' }, USD: { PB: '$9', PP: '$19', PZ: '$179', DB: 'About 2 cents a day', DP: 'About 5 cents a day', DZ: 'About 49 cents a day' } };
const curDefault = () => { try { const z = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; return /Asia\/(Kolkata|Calcutta)/.test(z) || !z ? 'INR' : 'USD'; } catch (e) { return 'INR'; } };
const curNow = () => { const v = store.get('ktc_cur', ''); return v === 'USD' || v === 'INR' ? v : curDefault(); };
const curText = html => { const P = CUR_PRICES[curNow()]; return String(html).replace(/\[\[(PB|PP|PZ|DB|DP|DZ)\]\]/g, (m, k) => P[k]); };
const curSwitch = () => { const c = curNow(); return `<div class="curswitch" role="group" aria-label="Show prices in">${[['INR', '₹ INR'], ['USD', '$ USD']].map(([k, l]) => `<button type="button" data-act="cur" data-cur="${k}" aria-pressed="${c === k}">${l}</button>`).join('')}</div>`; };

const legalPage = (title, crumb, intro, sections) => `<div class="wrap" style="max-width:860px">${crumbs([['Home','#home'],[crumb]])}
  <div class="pagehead"><h1>${title}</h1><p>Last updated: 10 November 2026</p></div>
  <div class="legal"><p>${intro}</p>${sections.map(([h, items]) => `<h2>${h}</h2>${Array.isArray(items) ? `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>` : `<p>${items}</p>`}`).join('')}</div></div>`;
function vTerms() {
  return legalPage('Terms of use', 'Terms of use', `These terms apply to everyone who uses Know The Company, operated by ${esc(opName())}. By using the site you agree to them.`, [
    ['1. Accounts', ['You must be at least 18 to create an account.', 'Keep your login email secure. You are responsible for activity on your account.', 'Reviewer and company accounts are separate. Company accounts cannot post reviews.', 'An account that has written reviews cannot claim or manage a company. To manage a company, delete your reviewer account first and use a separate account.', 'Reviews written by an account that manages a company are not shown and do not count towards any rating, including reviews written before the account became a company account.']],
    ['2. Writing reviews', ['Reviews must describe your own genuine experience in the last 12 months.', 'Do not post reviews in exchange for money, discounts or gifts, or reviews about your own business or a competitor.', 'Do not include personal data about others, hate speech, threats, or claims of crime without evidence.', 'You keep ownership of your review and give Know The Company a licence to display and distribute it.']],
    ['3. Employee reviews', ['Post only your own experience as an employee, contractor or intern.', 'Do not share confidential information or trade secrets.', 'Do not name or identify individual people, other than senior leaders such as directors and executives.', 'Employers cannot remove employee reviews. We remove them only when they break these terms or the law requires it.', 'We keep your identity private and disclose it only when a valid court order requires us to.']],
    ['4. Business listings', [LAUNCH ? `Companies that join before ${LAUNCH_END} get their verified Basic listing free for 12 months from the day it is created. After that, and for companies that join later, Basic costs ₹499 a year in India, or $9 a year outside India.` : 'Basic costs ₹499 a year in India, or $9 a year outside India.', `Plus costs ₹${PLUS_PRICE} a year in India, or $19 a year outside India${LAUNCH ? `, with a ${PLUS_TRIAL_DAYS}-day free trial` : ''}. It adds profile features only. Business costs ₹${BUSINESS_PRICE.toLocaleString('en-IN')} a year in India, or $179 a year outside India, with no free period. It adds review invitations, reports, branches and team logins. If Plus or Business is cancelled, the profile moves to Basic when the year you paid for ends. Moving up to a higher plan stops the lower plan's autopay, so you never pay for two plans at once.`, `Review invitations: you may only invite people who bought from you or worked with you, and you must invite all of them, not only those you expect to be happy. Invitations ask for an honest review, good or bad. You are responsible for having permission to contact the people you invite.`, 'Paid plans renew every year by autopay on the card, UPI or bank mandate you used, until you cancel. For Indian cards, UPI and bank mandates, your bank or payment app notifies you at least 24 hours before each renewal charge.', 'You can cancel autopay at any time. No further charges are made, and your plan stays active until the end of the year you paid for.', 'A free period never turns into a charge unless you set up autopay. If a plan ends, your profile stays on the site as an unclaimed profile and keeps its reviews.', 'A verified listing, free or paid, gives verification, a profile and tools. It never affects ratings, review order or moderation.', (JOBS_ON ? 'Job posts: 5 posts each calendar month are included. ' + (LAUNCH ? 'Extra posts are free in the first year and cost ₹99 each afterwards.' : 'Extra posts cost ₹99 each.') + ' Each post stays live for 60 days. Posts must be for real vacancies, and employers must never charge applicants a fee.' : 'Job posts are not available yet. When they launch, these terms will be updated before any business can post.'), 'We may suspend a listing that gives false information or tries to manipulate reviews.', 'Payments are processed by our payment partner. We never see or store your full card or bank details.', 'Refunds: if you pay for a plan and change your mind within 14 days, write to us for a full refund. After that, fees for the current year are not refundable, except where the law requires. Our <a href="#refunds">refunds and cancellations policy</a> has the full details.']],
    ['5. Moderation', 'We remove content that breaks these terms or our review guidelines, or when required by law.'],
    ['6. Liability', 'Reviews are the opinions of their authors, not of Know The Company. To the extent the law allows, Know The Company is not liable for decisions you make based on reviews.'],
    ['7. Governing law', 'These terms are governed by the laws of India, and Indian courts have jurisdiction, unless your local consumer law gives you other rights.'],
    ['8. Contact', [...(OPERATOR.legalName ? [`Know The Company is run by ${esc(OPERATOR.legalName)}${OPERATOR.address ? `, ${esc(OPERATOR.address)}` : ''}.`] : []), 'Questions about these terms: knowthecompanysupport@gmail.com.', 'Complaints about content on the site go to our grievance officer, Nimish Chhabra, at knowthecompanysupport@gmail.com. We acknowledge complaints within 24 hours and resolve them within 7 days.']]]);
}
function vPrivacy() {
  return legalPage('Privacy policy', 'Privacy policy', 'This policy explains what personal data Know The Company collects when you use Know The Company, why, and your choices.', [
    ['What we collect', ['Account details: your name and email address.', 'Content you post: reviews, replies, reports and messages.', 'Proof files you upload to verify a review. We delete these after checking them.', 'Documents and ID cards you upload to claim a company. Only our team can see them, and we use them only to check the claim.', 'Work email addresses used to verify employee reviews. We never show them to employers or the public.', 'Business listing details and payment confirmations. Payment details are handled by our payment provider, not stored by us.', 'Basic technical data such as device type and pages visited, to keep the site secure.']],
    ['How we use it', ['To run your account and show your reviews with your chosen name.', 'To detect fake reviews and abuse.', 'To verify businesses and process listing payments.', 'To reply to your messages and send login codes.']],
    ['What we never do', 'We never sell your personal data or show reviewers\' email addresses to businesses.'],
    ['Sharing', 'We share data only with service providers who help us run Know The Company (hosting, email, payments), and when required by law, such as a valid court order.'],
    ['Your rights', 'Depending on where you live, you can ask to access, correct or delete your data, and withdraw consent. Write to knowthecompanysupport@gmail.com and we will reply within the time the law requires. You can also ask us to delete your account from the My reviews page.'],
    ['Cookies and storage', 'We use essential storage to keep you logged in and remember preferences. We use privacy-friendly analytics that count visits without following you across other sites.'],
    ['Contact', 'Privacy questions: knowthecompanysupport@gmail.com. Grievance officer: Nimish Chhabra, knowthecompanysupport@gmail.com.']]);
}

/* The three listing plans as cards. Choosing one opens the listing form with that plan picked. */
function planCards() {
  return `<div class="plans">
        <div class="price"><span class="eyebrow">Basic</span>${LAUNCH ? '<span class="pill un" style="align-self:flex-start">First year free</span>' : ''}<div class="amt">${LAUNCH ? '<b>Free</b><span style="color:var(--muted)">for your first year</span>' : '<b>[[PB]]</b><span style="color:var(--muted)">a year</span>'}</div>
          <p class="meta" style="font-size:14px">${LAUNCH ? `Then [[PB]] a year by autopay. For companies that join before ${LAUNCH_END}.` : 'Renews yearly by autopay. Cancel any time.'}</p><span class="daily">[[DB]]</span>
          <ul>${BASIC_PERKS.map(p => `<li>${TICK()}<span>${p}</span></li>`).join('')}</ul>
          <a class="btn o lg" href="#list" data-act="pick-plan" data-plan="basic">${LAUNCH ? 'Start free' : 'Choose Basic'}</a></div>
        <div class="price plus"><span class="eyebrow">Plus</span><span class="pill ok" style="align-self:flex-start">Best for getting customers to your website</span><div class="amt"><b>[[PP]]</b><span style="color:var(--muted)">a year</span></div>
          <p class="meta" style="font-size:14px">${LAUNCH ? `First ${PLUS_TRIAL_DAYS} days free, then [[PP]] a year by autopay. Or stay on Basic.` : 'Renews yearly by autopay. Cancel any time.'}</p><span class="daily">[[DP]]</span>
          <p class="sub">Everything in Basic, plus:</p>
          <ul>${PLUS_PERKS.map(p => `<li>${TICK()}<span>${p}</span></li>`).join('')}</ul>
          <a class="btn p lg" href="#list" data-act="pick-plan" data-plan="plus">${LAUNCH ? `Try Plus free for ${PLUS_TRIAL_DAYS} days` : 'Choose Plus'}</a></div>
        <div class="price"><span class="eyebrow">Business</span><span class="pill un" style="align-self:flex-start">For growing teams and several branches</span><div class="amt"><b>[[PZ]]</b><span style="color:var(--muted)">a year</span></div>
          <p class="meta" style="font-size:14px">Renews yearly by autopay. Cancel any time.</p><span class="daily">[[DZ]]</span>
          <p class="sub">Everything in Plus, plus:</p>
          <ul>${BUSINESS_PERKS.map(p => `<li>${TICK()}<span>${p}</span></li>`).join('')}</ul>
          <a class="btn o lg" href="#list" data-act="pick-plan" data-plan="business">Choose Business</a></div>
      </div>`;
}
const PLAN_FAQS = [
  ['Which plan should I choose?', `Start with Basic if you want a verified page and to reply to reviews. Choose Plus if you want customers to call, WhatsApp or visit your website straight from your page. Choose Business if you want to invite every customer to review you, follow your ratings month by month, show several branches or give your team their own logins.`],
  ['Is there a free period?', LAUNCH ? `Yes. Companies that join before ${LAUNCH_END} get Basic free for their first year, and Plus is free for its first ${PLUS_TRIAL_DAYS} days. Business is charged from the day you choose it.` : 'Some offers include a free period. Business is charged from the day you choose it.'],
  ['How do I pay, and can I cancel?', 'Plans renew once a year by autopay through Razorpay, using a card, UPI or netbanking. You can cancel any time from your dashboard, and a year you have paid for runs to its end.'],
  ['Can I move between plans?', 'Yes. Move up from your dashboard whenever you like. Moving up stops the lower plan’s autopay, so you never pay for two plans at once.'],
  ['Does paying change my rating?', 'No. Paying never changes your rating, the order of reviews or how reviews are checked, and no plan lets you hide or remove a review.'],
  ['Can I get a refund?', 'Yes, within 14 days of paying, for any reason. Our refunds and cancellations policy has the details.'],
];
function vPricing() {
  return `<div class="wrap">${crumbs([['Home','#home'],['For employers','#list'],['Plans and pricing']])}
    <div class="pagehead" style="text-align:center;align-items:center"><h1>Plans and pricing</h1><p>Reading and writing reviews is free for everyone. Companies pay only for listing tools, and paying never changes a rating.</p><div style="margin-top:6px;display:flex;justify-content:center">${curSwitch()}</div></div>
    <section class="sec" style="padding-top:8px">${planCards()}
      <p class="meta" style="text-align:center;margin-top:16px">Companies in India pay in rupees, and companies outside India pay in US dollars.${OPERATOR.taxNote ? ' ' + esc(OPERATOR.taxNote) : ''} A listing is a digital service that starts once your company is verified.</p></section>
    <section class="sec"><div class="box soft" style="flex-direction:row;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between"><div style="flex:1 1 420px;display:flex;flex-direction:column;gap:6px"><h2 style="font-size:22px">For reviewers, always free</h2><p>Read every review, write customer and employee reviews, and use all the free career and company tools. Nobody is ever asked to pay.</p></div><a class="btn g lg" href="#add">Write a review</a></div></section>
    <section class="sec"><div class="fair"><h2>Paying never changes your rating. That's why people trust the badge.</h2><ul>${['Every review is published the same way, good or bad','You can reply, but you can never remove or hide a review','You never see who wrote an anonymous employee review','Plans add tools, never stars, ranking or awards'].map(x => `<li>${TICK('var(--accent)')}${x}</li>`).join('')}</ul></div></section>
    <section class="sec" style="max-width:900px;margin:0 auto"><div class="sechead"><div><p class="eyebrow">Questions</p><h2>About plans and payments</h2></div></div><div style="display:flex;flex-direction:column;gap:10px">${PLAN_FAQS.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>
      <p class="meta" style="margin-top:14px">Read our <a href="#refunds">refunds and cancellations policy</a> and <a href="#terms">terms</a>, or <a href="#contact">ask us a question</a>.</p></section>
  </div>`;
}
function vRefunds() {
  return legalPage('Refunds and cancellations', 'Refunds and cancellations', `This policy covers the paid listing plans on Know The Company${OPERATOR.legalName ? `, run by ${esc(OPERATOR.legalName)}` : ''}. Reading and writing reviews is free, so none of this applies to reviewers.`, [
    ['1. What you pay for', [`Basic listing: ₹499 a year in India, or $9 a year outside India. Plus listing: ₹${PLUS_PRICE} a year in India, or $19 a year outside India. Business listing: ₹${BUSINESS_PRICE.toLocaleString('en-IN')} a year in India, or $179 a year outside India.${JOBS_ON ? ` Extra job posts: ₹${EXTRA_JOB} each.` : ''}`, 'Each plan runs for one year from the day it starts and renews every year by autopay until you cancel. Current prices are always on our <a href="#pricing">pricing page</a>.', 'A listing is a digital service. Nothing is shipped to you.']],
    ['2. How the service is delivered', ['You can choose and pay for a plan as soon as you send your claim. A website check verifies you straight away; documents and ID cards are checked by our team, usually within 2 working days, and your Verified badge and listing tools switch on when the check passes.', 'If we can’t verify your company, we cancel the order and refund the full amount.']],
    ['3. Free periods', [LAUNCH ? `Companies that join before ${LAUNCH_END} get Basic free for their first year, and Plus starts with ${PLUS_TRIAL_DAYS} days free. Business has no free period.` : 'Some offers include a free period before payment.', 'You are never charged at the end of a free period unless you set up autopay. We email you before it ends.']],
    ['4. Autopay and cancelling', ['Paid plans renew every year by autopay on the card, UPI or bank mandate you used. For Indian cards, UPI and bank mandates, your bank or payment app notifies you at least 24 hours before each renewal charge.', 'You can cancel autopay at any time, by writing to knowthecompanysupport@gmail.com from the email address on your listing, or by cancelling the mandate in your UPI app or with your bank.', 'When you cancel, no further charges are made and your tools stay active until the end of the year you paid for.', 'If a plan ends, your profile stays on the site as an unclaimed profile and keeps its reviews.']],
    ['5. Refunds', ['Change your mind within 14 days of paying, and we refund the full amount. No reason is needed.', 'After 14 days, fees for the current year are not refundable, except where the law requires a refund.', 'If you were charged twice, or charged for an order that failed, we refund the extra amount in full.', 'If we suspend a listing because it broke our terms, for example by trying to manipulate reviews, the fee is not refunded.']],
    ['6. How refunds are paid', ['Refunds go back to the payment method you used. We start the refund within 5 working days of approving it.', 'Your bank or card provider may take another 5 to 7 working days to show it in your account.']],
    ['7. Refunds never affect reviews', 'Paying, cancelling or getting a refund never changes a company’s ratings, review order or moderation, and cancelling never removes reviews.'],
    ['8. Contact', [`Refund and cancellation requests: knowthecompanysupport@gmail.com. Include your company name and the date you paid.${OPERATOR.phone ? ` Phone: ${esc(OPERATOR.phone)}.` : ''}`, ...(OPERATOR.address ? [`Address: ${esc(OPERATOR.address)}.`] : []), 'If you are not happy with how we handled your request, write to our grievance officer, Nimish Chhabra, at knowthecompanysupport@gmail.com.']]]);
}

/* ---------- live actions: everything a visitor saves goes to Wix ---------- */
const CC_BY_NAME = Object.fromEntries(Object.entries(COUNTRY).map(([k, v]) => [v, k]));
const errMsg = e => {
  const m = e && e.message ? e.message : '';
  if (e && e.status === 403) return 'Please log in again, then try once more.';
  return m && m.length < 160 ? m : 'Something went wrong. Please try again.';
};
const needLogin = (msg, tab) => { S.returnTo = curRoute(); if (tab) S.returnTab = tab; S.notice = msg; go('login'); window.scrollTo(0, 0); };
let PENDING = store.get('ktc_pending', []);
const addPending = p => { PENDING.unshift({ ...p, member: S.user ? S.user.id : '', at: todayISO() }); PENDING = PENDING.slice(0, 60); store.set('ktc_pending', PENDING); };
async function insertCompany(data) {
  const res = await wixRequest('/wix-data/v2/items', { body: { dataCollectionId: 'Companies', dataItem: { id: data._id, data } } });
  return (res && res.dataItem && res.dataItem.data) || data;
}
/* ---------- past reviews (Plus plan) ----------
   A Plus company can send us reviews it collected before joining: from its website, emails, surveys or
   another platform. Each goes into ReviewImports (members can add, only the team can read anyone else's
   or change them). The team emails the reviewer to confirm they wrote it and are happy for it to appear,
   then publishes it in Reviews with importedFrom and originalDate set, and it shows labelled "Imported". */
/* ---------- plan and payments (Razorpay autopay) ----------
   The server (astro/src/pages/api/pay/[action].ts) checks the owner, creates a yearly Razorpay subscription
   and confirms it. This panel shows the plan and opens Razorpay Checkout. Paying never changes a rating. */
const PAY = { company: '', loading: false, data: null, err: '', busy: '', off: false };
/* The plan panel sits on the dashboard and on the claim and list pages. */
const payRedraw = () => { if (curRoute() === 'dashboard') renderKeep(); else if (['claim', 'list'].includes(curRoute())) cfRefresh(false); };
async function payApi(action, body) {
  const res = await fetch('/api/pay/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: await accessToken() }, body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  if (res.status === 503) PAY.off = true;
  if (!res.ok) throw new Error(d.error || 'Something went wrong. Please try again.');
  return d;
}
async function loadPay(c, force) {
  /* One load per company: after an error, wait for a button press or a page change rather than retrying
     on every draw. */
  if (!force && PAY.company === c.wid && (PAY.data || PAY.loading || PAY.err)) return;
  Object.assign(PAY, { company: c.wid, loading: true, err: '', off: false });
  try { PAY.data = await payApi('status', { company: c.wid }); PAY.off = PAY.data.ready === false; } catch (e) { PAY.data = null; PAY.err = e.message; }
  PAY.loading = false;
  payRedraw();
}
let rzpLoad = null;
const loadCheckout = () => rzpLoad || (rzpLoad = new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = ok; s.onerror = () => { rzpLoad = null; no(new Error('Couldn’t load Razorpay. Check your connection and try again.')); }; document.head.appendChild(s); }));
async function startAutopay(c, plan) {
  PAY.busy = plan; PAY.err = ''; payRedraw();
  try {
    const [d] = await Promise.all([payApi('subscribe', { company: c.wid, plan, currency: curNow() }), loadCheckout()]);
    await new Promise((resolve, reject) => {
      const rz = new window.Razorpay({
        key: d.key, subscription_id: d.subscriptionId, name: 'Know The Company', description: `${d.name} for ${d.company}`,
        image: location.origin + '/icon-192.png', prefill: d.prefill || {}, notes: { company: c.wid }, theme: { color: '#1E293B' },
        handler: async r => { try { await payApi('verify', { company: c.wid, subscriptionId: r.razorpay_subscription_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature }); resolve(); } catch (e) { reject(e); } },
        modal: { ondismiss: () => reject(new Error('')) },
      });
      rz.on('payment.failed', r => reject(new Error((r && r.error && r.error.description) || 'The payment didn’t go through.')));
      rz.open();
    });
    toast(plan === 'basic' ? 'Basic is set up. Thank you.' : TIER_NAME[plan] + ' is on. Thank you.', 4000);
    await loadData(true); await loadPay(c, true);
  } catch (e) { PAY.err = e.message; }
  PAY.busy = ''; payRedraw();
}
function planPanel(c, inClaim) {
  loadPay(c);
  const d = PAY.company === c.wid ? PAY.data : null;
  const P = CUR_PRICES[curNow()];
  const fmt = iso => iso ? fmtDate(String(iso).slice(0, 10)) : '';
  const live = d ? d.billing.filter(b => ['authenticated', 'active', 'pending', 'cancelling'].includes(b.status)) : [];
  const running = plan => live.find(b => b.plan === plan && b.status !== 'cancelling');
  const tier = d ? (['plus', 'business'].includes(d.plan) ? d.plan : 'basic') : coTier(c);
  /* Payments not switched on yet: show the plans, but no buttons that can't work. */
  const off = PAY.company === c.wid && (PAY.off || (d && d.ready === false));
  const btn = (plan, label, main) => off ? '' : `<button class="btn ${main ? 'p' : 'o'} lg" type="button" data-act="pay-start" data-plan="${plan}" data-wid="${esc(c.wid)}" ${PAY.busy || PAY.loading ? 'disabled' : ''}>${PAY.busy === plan ? 'Opening…' : label}</button>`;
  const rows = live.map(b => `<div class="cfrow"><div class="t"><b>${TIER_NAME[b.plan] || 'Basic'} plan</b><small>${b.status === 'cancelling' ? `Won’t renew. Runs until ${esc(fmt(b.currentEnd))}` : b.status === 'active' ? `Paid until ${esc(fmt(b.currentEnd))}` : b.startAt ? `Free until ${esc(fmt(b.startAt))}` : 'Set up'}</small></div></div>`).join('');
  const box = (h, sub, body, button) => `<div class="box soft" style="gap:10px"><h3>${h}</h3>${sub ? `<p><b>${sub}</b></p>` : ''}<p>${body}</p>${button}</div>`;
  const until = d && d.planEndsAt ? `Yours until ${esc(fmt(d.planEndsAt))}, then ` : '';
  const out = [];
  if (tier === 'basic' && !running('plus') && !running('business')) out.push(box('Plus', LAUNCH ? `Free for your first month, then ${P.PP} a year` : `${P.PP} a year`, 'Reply as a verified company, add photos and updates, an employer page, and send us reviews you collected before joining.', btn('plus', LAUNCH ? 'Start Plus free' : 'Choose Plus', true)));
  if (tier === 'plus' && !running('plus') && !running('business')) out.push(box('Plus', `${until}${P.PP} a year`, 'Keep replying as a verified company, your photos, updates and employer page without a break.', btn('plus', 'Continue with Plus', true)));
  if (tier !== 'business' && !running('business')) out.push(box('Business', `${P.PZ} a year, starting today`, `Everything in Plus, with review invitations to your customers by email and WhatsApp, rating trends and a monthly report, up to ${LOCATIONS_MAX} branches and up to ${TEAM_MAX} team logins.`, btn('business', 'Choose Business', tier === 'plus')));
  if (tier === 'business' && !running('business')) out.push(box('Business', `${until}${P.PZ} a year`, 'Keep your review invitations, reports, branches and team logins without a break.', btn('business', 'Continue with Business', true)));
  if (tier === 'basic' && !live.some(b => b.status !== 'cancelling')) out.push(box('Basic', LAUNCH ? `Free for your first year, then ${P.PB} a year` : `${P.PB} a year`, 'Your verified company page, with your details kept up to date.', btn('basic', LAUNCH ? 'Start Basic free' : 'Choose Basic', false)));
  return `<section class="box" style="gap:16px">
    <div class="toolbar"><h2>${inClaim ? 'Choose your plan' : 'Plan and payments'}</h2><span class="pill ${tier !== 'basic' ? 'ok' : 'un'}">${TIER_NAME[tier]} plan</span></div>
    ${rows ? `<div style="display:flex;flex-direction:column;gap:10px">${rows}</div>` : ''}
    ${out.join('')}
    ${off ? `<p class="meta"><b>Plan sign-up opens very soon.</b> ${inClaim ? 'Your claim is saved. ' : ''}You’ll be able to choose a plan here, from your dashboard, once it’s open.</p>` : ''}
    ${PAY.err && !off ? `<p class="err" role="alert">${esc(PAY.err)}</p>` : ''}
    <p class="meta">Nothing is charged during a free period. Plans renew yearly by autopay through Razorpay (cards, UPI and netbanking), and you can cancel any time${live.some(b => b.status !== 'cancelling') ? ` <button class="link" type="button" data-act="pay-cancel" data-wid="${esc(c.wid)}">here</button>` : ''}. Moving up to a higher plan stops the lower plan’s autopay. Paying never changes your ratings or reviews. See <a href="#refunds">refunds and cancellations</a>.</p>
  </section>`;
}
/* ---------- Business plan tools ----------
   Review invitations (email through the server, astro/src/pages/api/invite, plus WhatsApp links), rating
   trends with a monthly report, branches shown on the company page, team logins (api/team) and a
   spreadsheet of the company's reviews. All of it reads the same published reviews everyone sees. */
const BIZ = { company: '', invite: null, team: null, msg: '', err: '', busy: '', link: '', kind: 'customer', list: '', full: false };
const bizApi = async (path, body) => { const res = await fetch('/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: await accessToken() }, body: JSON.stringify(body) }); const d = await res.json().catch(() => ({})); if (!res.ok) throw new Error(d.error || 'Something went wrong. Please try again.'); return d; };
async function loadBiz(c, force) {
  if (!force && BIZ.company === c.wid) return;
  Object.assign(BIZ, { company: c.wid, invite: null, team: null, msg: '', err: '', link: '' });
  const [inv, team] = await Promise.allSettled([bizApi('invite/status', { company: c.wid }), bizApi('team/list', { company: c.wid })]);
  BIZ.invite = inv.status === 'fulfilled' ? inv.value : { error: inv.reason.message };
  BIZ.team = team.status === 'fulfilled' ? team.value : { error: team.reason.message };
  if (curRoute() === 'dashboard') renderKeep();
}
const emailsIn = text => [...new Set((String(text || '').match(/[^\s@<>()",;:'`]+@[^\s@<>()",;:'`]+\.[a-z]{2,}/gi) || []).map(e => e.toLowerCase()))];
/* Month by month for the last 12 months: how many reviews, the average, and replies. */
function monthRows(c) {
  const rv = reviewsFor(c.id), er = empData(c.id).reviews, out = [];
  const d = new Date(); d.setDate(1);
  for (let i = 0; i < 12; i++) {
    const ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const cu = rv.filter(r => r.ym === ym), em = er.filter(r => r.ym === ym);
    out.push({ ym, label: d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }), cn: cu.length, ca: cu.length ? avgOf(cu) : null, en: em.length, ea: em.length ? avgOf(em) : null, rec: em.length ? Math.round(em.filter(r => r.rec === 'yes').length / em.length * 100) : null, replied: cu.concat(em).filter(r => r.reply).length });
    d.setMonth(d.getMonth() - 1);
  }
  return out.reverse();
}
const csvCell = v => { const t = String(v ?? ''); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
function downloadCsv(name, rows) {
  const blob = new Blob(['\ufeff' + rows.map(r => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function trendChart(rows) {
  const W = 640, H = 200, pad = 28, bw = (W - pad * 2) / rows.length;
  const bar = (v, i, off, col) => v === null ? '' : `<rect x="${(pad + i * bw + off).toFixed(1)}" y="${(H - pad - (v / 5) * (H - pad * 2)).toFixed(1)}" width="${(bw / 2 - 4).toFixed(1)}" height="${((v / 5) * (H - pad * 2)).toFixed(1)}" rx="3" fill="${col}"><title>${v.toFixed(1)} out of 5</title></rect>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Average rating each month for the last 12 months, customers and employees">
    ${[1, 2, 3, 4, 5].map(v => `<line x1="${pad}" x2="${W - pad}" y1="${H - pad - (v / 5) * (H - pad * 2)}" y2="${H - pad - (v / 5) * (H - pad * 2)}" stroke="var(--line)"/><text x="4" y="${H - pad - (v / 5) * (H - pad * 2) + 4}" font-size="11" fill="var(--muted)">${v}</text>`).join('')}
    ${rows.map((r, i) => bar(r.ca, i, 2, '#1B2738') + bar(r.ea, i, bw / 2, '#7CB518') + `<text x="${(pad + i * bw + bw / 2).toFixed(1)}" y="${H - 8}" font-size="10" text-anchor="middle" fill="var(--muted)">${esc(r.label.split(' ')[0])}</text>`).join('')}
  </svg><p class="meta"><span style="display:inline-block;width:10px;height:10px;background:#1B2738;border-radius:2px"></span> Customers <span style="display:inline-block;width:10px;height:10px;background:#7CB518;border-radius:2px;margin-left:12px"></span> Employees</p>`;
}
function businessPanel(c) {
  loadBiz(c);
  const sl = c.id.slice(3), page = location.origin + '/';
  const cLink = page + '#invite-' + c.id, eLink = page + '#invite-team-' + c.id;
  const wa = (text) => 'https://wa.me/?text=' + encodeURIComponent(text);
  const inv = BIZ.company === c.wid ? BIZ.invite : null, team = BIZ.company === c.wid ? BIZ.team : null;
  const left = inv && !inv.error ? Math.max(0, inv.limit - inv.sent) : 0;
  const found = emailsIn(BIZ.list).length;
  const rows = monthRows(c), any = rows.some(r => r.cn || r.en);
  const locs = (c.raw.locations || []).slice(0, LOCATIONS_MAX);
  const locRow = (l, i) => `<div class="locrow" style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><input type="text" maxlength="80" placeholder="Branch name, e.g. Agra, Sanjay Place" data-loc="${i}" data-k="name" value="${esc(l.name || '')}"><input type="text" maxlength="40" placeholder="Phone (optional)" data-loc="${i}" data-k="phone" value="${esc(l.phone || '')}"><input type="text" maxlength="160" placeholder="Address" data-loc="${i}" data-k="address" value="${esc(l.address || '')}" style="grid-column:1 / -1"></div>`;
  const editLocs = locs.length ? locs : [{}];
  return `<section class="box" style="gap:14px"><div class="toolbar"><h2>Review invitations</h2><span class="pill ok">Business</span></div>
      <p class="meta">Invite people who bought from you or worked with you to write an honest review. Invitations must go to everyone, not only the people you expect to be happy: send your whole customer list for a period, and we ask each person for an honest review, good or bad.</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px"><a class="btn g" href="${wa(`We'd value your honest review of ${c.name}, good or bad. It takes two minutes: ${cLink}`)}" target="_blank" rel="noopener">Share customer link on WhatsApp</a><a class="btn g" href="${wa(`Please share an honest, anonymous review of working at ${c.name}: ${eLink}`)}" target="_blank" rel="noopener">Share employee link on WhatsApp</a></div>
      ${!inv ? '<p class="meta">Loading…</p>' : inv.error ? `<p class="err">${esc(inv.error)}</p>` : !inv.email ? `<p class="meta"><b>Email invitations switch on soon.</b> Until then, share your links on WhatsApp or copy them from the Overview tab.</p>` : `
      <p><b>${inv.sent.toLocaleString('en-IN')} of ${inv.limit.toLocaleString('en-IN')}</b> email invitations used this month. ${left.toLocaleString('en-IN')} left.</p>
      <div class="field"><span class="l">Who are you inviting?</span><div style="display:flex;gap:16px;flex-wrap:wrap"><label class="check"><input type="radio" name="biz-kind" value="customer" ${BIZ.kind !== 'employee' ? 'checked' : ''}><span>Customers</span></label><label class="check"><input type="radio" name="biz-kind" value="employee" ${BIZ.kind === 'employee' ? 'checked' : ''}><span>Current and former employees</span></label></div></div>
      <div class="field"><label class="l" for="biz-list">Your full list of email addresses</label><textarea id="biz-list" rows="6" placeholder="Paste addresses, one per line, or a CSV export from your billing or CRM software.">${esc(BIZ.list)}</textarea><p class="meta"><span id="biz-count">${found ? `${found} address${found === 1 ? '' : 'es'} found.` : 'Paste a list or choose a file.'}</span> Anyone invited in the last 90 days, or who asked not to be invited, is skipped.</p><input type="file" id="biz-file" accept=".csv,.txt,text/csv,text/plain"></div>
      <label class="check"><input type="checkbox" id="biz-full" ${BIZ.full ? 'checked' : ''}><span>This is everyone I served${BIZ.kind === 'employee' ? ' or employed' : ''} in this period, not a hand-picked list, and I have their permission to contact them.</span></label>
      <div><button class="btn p" type="button" data-act="biz-send" data-wid="${esc(c.wid)}" ${BIZ.busy === 'send' || !found || !BIZ.full ? 'disabled' : ''}>${BIZ.busy === 'send' ? 'Sending…' : `Send ${found || ''} invitation${found === 1 ? '' : 's'}`}</button></div>`}
      ${BIZ.msg ? `<p class="meta" role="status">${esc(BIZ.msg)}</p>` : ''}${BIZ.err ? `<p class="err" role="alert">${esc(BIZ.err)}</p>` : ''}
    </section>
    <section class="box" style="gap:12px"><h2>Rating trends</h2>
      ${any ? trendChart(rows) : '<p class="meta">Your monthly averages appear here once reviews come in.</p>'}
      <div style="display:flex;flex-wrap:wrap;gap:8px"><button class="btn o" type="button" data-act="biz-report" data-wid="${esc(c.wid)}">Download monthly report</button><button class="btn g" type="button" data-act="biz-export" data-wid="${esc(c.wid)}">Export all reviews</button></div>
      <p class="meta">Both download as spreadsheets (CSV) that open in Excel or Google Sheets.</p>
    </section>
    <section class="box" style="gap:12px"><h2>Branches</h2><p class="meta">Add up to ${LOCATIONS_MAX} locations. They show on your company page with their address and phone.</p>
      <div id="biz-locs" style="display:flex;flex-direction:column;gap:14px">${editLocs.map(locRow).join('')}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">${editLocs.length < LOCATIONS_MAX ? `<button class="btn g" type="button" data-act="biz-loc-add">Add a branch</button>` : ''}<button class="btn p" type="button" data-act="biz-loc-save" data-id="${c.id}">Save branches</button></div>
    </section>
    <section class="box" style="gap:12px"><h2>Team logins</h2><p class="meta">Up to ${TEAM_MAX} people can manage this page, each with their own login. Send a teammate a link: it works once, for 7 days, and they log in or sign up with any email.</p>
      ${!team ? '<p class="meta">Loading…</p>' : team.error ? `<p class="err">${esc(team.error)}</p>` : `<div style="display:flex;flex-direction:column;gap:8px">${team.members.map((m, i) => `<div class="cfrow"><div class="t"><b>${esc(m.name || 'Team member ' + (i + 1))}</b><small>${m.you ? 'You' : 'Can manage this page'}</small></div>${m.you ? '' : `<button class="btn g" type="button" data-act="biz-team-remove" data-wid="${esc(c.wid)}" data-member="${esc(m.id)}">Remove</button>`}</div>`).join('')}</div>
      ${team.members.length < team.max ? `<div><button class="btn o" type="button" data-act="biz-team-invite" data-wid="${esc(c.wid)}" ${BIZ.busy === 'team' ? 'disabled' : ''}>Create a team invitation link</button></div>` : `<p class="meta">You have ${team.max} team logins, the most a Business plan includes.</p>`}
      ${BIZ.link ? `<div class="field"><label class="l" for="biz-link">Send this link to your teammate</label><div style="display:flex;gap:8px"><input id="biz-link" type="text" readonly class="mono" value="${esc(BIZ.link)}" style="flex:1;min-width:0;background:var(--surface)"><button class="btn g" type="button" data-act="copy-text" data-text="${esc(BIZ.link)}">Copy</button></div></div>` : ''}`}
    </section>`;
}
const IMPORT_SOURCES = ['Our website', 'Email or message', 'Survey or feedback form', 'Google', 'Another review site', 'In person or on paper', 'Other'];
const IMPORT_STATUS = { pending: ['un', 'Being checked'], confirmed: ['un', 'Confirmed, publishing soon'], published: ['ok', 'Published'], rejected: ['cat', 'Not published'] };
async function loadMyImports(c) {
  if (!S.user || !c) return;
  if (S.myImports && S.myImports.co === c.wid) return;
  S.myImports = { co: c.wid, items: null };
  try { const p = await queryItems('ReviewImports', { limit: 200, filters: [{ field: 'company', op: 'eq', value: c.wid }] }); S.myImports = { co: c.wid, items: p.items }; }
  catch (e) { S.myImports = { co: c.wid, items: [], err: errMsg(e) }; }
  renderKeep();
}
function importPanel(c) {
  if (coPlan(c) !== 'plus') return `<section class="box" style="gap:12px"><h2>Bring your past reviews</h2>
      <p>On the Plus plan you can send us reviews ${esc(c.name)} collected before joining Know The Company, from your website, emails, surveys or another review site. We contact each reviewer to confirm the review is real and that they're happy for it to appear here, then publish it on your page with an "Imported" label.</p>
      <div style="display:flex;flex-wrap:wrap;gap:10px"><a class="btn p" href="#pricing">See the Plus plan</a></div></section>`;
  loadMyImports(c);
  const list = S.myImports && S.myImports.co === c.wid ? S.myImports.items : null;
  const sent = list === null ? '<p class="meta">Loading what you have sent…</p>' : list.length
    ? list.slice().sort((a, b) => String(b._createdDate).localeCompare(String(a._createdDate))).map(x => { const [k, t] = IMPORT_STATUS[x.status] || IMPORT_STATUS.pending; return `<div class="cfrow"><div class="t"><b>${esc(x.reviewerName || 'Reviewer')} · ${'★'.repeat(Math.max(0, Math.min(5, Number(x.rating) || 0)))}</b><small>${esc(String(x.body || '').slice(0, 90))}${String(x.body || '').length > 90 ? '…' : ''}</small></div><span class="pill ${k}">${t}</span></div>`; }).join('')
    : '<p class="meta">Nothing sent yet.</p>';
  const opt = (v, cur) => `<option ${v === cur ? 'selected' : ''}>${esc(v)}</option>`;
  return `<section class="box" style="gap:14px"><h2>Bring your past reviews</h2>
      <p>Send us reviews ${esc(c.name)} received before joining, one at a time. For each one we email the reviewer to confirm they wrote it and agree to it appearing here. Reviews we can't confirm, or that look edited, aren't published.</p>
      <ul class="meta" style="font-size:14px;line-height:1.6;padding-left:18px;margin:0"><li>Send every review you can, good and bad. Picking only the best ones breaks our <a href="#guidelines">guidelines</a>.</li><li>Copy the words exactly as the reviewer wrote them.</li><li>We never show the reviewer's email. We only use it to confirm the review.</li><li>Published reviews are labelled "Imported" and show where and when they were first given.</li></ul>
    </section>
    <form class="box" id="import-form" novalidate style="gap:14px">
      <h2>Add a review</h2>
      <div class="row"><div class="field"><label class="l" for="im-name">Reviewer's name</label><input id="im-name" type="text" maxlength="60" autocomplete="off"><p class="err" id="err-im-name" hidden>Enter the reviewer's name as they gave it.</p></div>
        <div class="field"><label class="l" for="im-email">Reviewer's email</label><input id="im-email" type="email" maxlength="120" autocomplete="off" placeholder="So we can confirm it with them"><p class="err" id="err-im-email" hidden>We need the reviewer's email to confirm the review.</p></div></div>
      <div class="row"><div class="field"><label class="l" for="im-rating">Rating</label><select id="im-rating"><option value="">Choose</option>${[5, 4, 3, 2, 1].map(n => `<option value="${n}">${n} star${n === 1 ? '' : 's'}</option>`).join('')}</select><p class="err" id="err-im-rating" hidden>Choose the rating the reviewer gave.</p></div>
        <div class="field"><label class="l" for="im-date">Date it was given</label><input id="im-date" type="date" max="${todayISO()}"><p class="err" id="err-im-date" hidden>Enter roughly when the review was given.</p></div></div>
      <div class="row"><div class="field"><label class="l" for="im-source">Where it was given</label><select id="im-source">${IMPORT_SOURCES.map(v => opt(v)).join('')}</select></div>
        <div class="field"><label class="l" for="im-proof">Link or proof <span class="meta">(optional)</span></label><input id="im-proof" type="url" maxlength="400" placeholder="Where we can see the original"></div></div>
      <div class="field"><label class="l" for="im-title">Title <span class="meta">(optional)</span></label><input id="im-title" type="text" maxlength="110"></div>
      <div class="field"><label class="l" for="im-body">Review, word for word</label><textarea id="im-body" rows="5" maxlength="4000"></textarea><p class="err" id="err-im-body" hidden>Paste the review text (at least 20 characters).</p></div>
      <label class="check"><input id="im-ok" type="checkbox"><span>This review is real, written by this person about ${esc(c.name)}, and copied without changes.</span></label>
      <p class="err" id="err-im-ok" hidden>Please confirm the review is real and unchanged.</p>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center"><button class="btn p" type="submit">Send for checking</button><span class="meta" style="font-size:13px">You can add the next one straight after.</span></div>
    </form>
    <section class="box" style="gap:10px"><h2>What you've sent</h2>${sent}${S.myImports && S.myImports.err ? `<p class="err">${esc(S.myImports.err)}</p>` : ''}</section>`;
}
async function loadMyClaims() {
  if (!S.user) { S.myClaims = []; return; }
  S.myClaims = null;
  try { const p = await queryItems('Claims', { limit: 50 }); S.myClaims = p.items; }
  catch (e) { S.myClaims = []; S.claimsErr = errMsg(e); }
  renderKeep();
}
const busy = (f, on) => { const b = f && f.querySelector('button[type=submit]'); if (b) b.disabled = on; };
const checkFirst = (f, id) => { const el = f.querySelector('#' + id); const ok = !el || el.checked; const er = document.getElementById('err-' + id); if (er) er.hidden = ok; if (!ok) el.focus(); return ok; };
const AUTH_ERRORS = {
  invalidPassword: 'That email and password don’t match. Check them and try again.',
  invalidEmail: 'We couldn’t find an account with that email. Create one below.',
  emailAlreadyExists: 'There’s already an account with this email. Log in instead.',
  resetPassword: 'This account needs a new password. Contact us and we’ll help you reset it.'
};
function afterLogin() {
  const back = S.returnTo; S.returnTo = ''; S.notice = '';
  S.auth = { mode: 'signin', error: '' };
  toast(back ? (S.returnTab ? 'Logged in. You can post your review now.' : 'Logged in.') : 'Logged in.');
  go(back || (curRoute() === 'business-login' ? 'dashboard' : 'my-reviews')); window.scrollTo(0, 0);
}
function onAuthResult(r) {
  if (r.state === 'SUCCESS') { afterLogin(); return; }
  if (r.state === 'EMAIL_VERIFICATION_REQUIRED') { S.auth = { ...S.auth, mode: 'verify', error: '' }; render(); return; }
  if (r.state === 'OWNER_APPROVAL_REQUIRED') { S.auth = { ...S.auth, mode: 'approval', error: '' }; render(); return; }
  S.auth = { ...S.auth, error: AUTH_ERRORS[r.errorCode] || r.error || 'That didn’t work. Check the details and try again.' }; render();
}
async function submitClaim() {
  const d = S.listData, cf = S.cf || {};
  if (!S.user) { needLogin('Log in or create an account to claim or add your company.'); return; }
  if (claimBlock()) { toast('Delete your reviewer account before claiming a company.'); render(); return; }
  const plan = (document.querySelector('input[name=plan]:checked') || {}).value || d.plan || 'basic'; d.plan = plan;
  const method = cf.method === 'docs' ? 'documents' : cf.method === 'id' ? 'id' : 'website';
  if (method !== 'website' && !cf.file) { cf.fileErr = cf.fileErr || (method === 'id' ? 'Upload your ID card to continue.' : 'Upload the document to continue.'); cfRefresh(false); const el = document.getElementById('cf-file'); if (el) el.focus(); return; }
  const btn = document.querySelector('[data-act="cf-submit"]'); if (btn) btn.disabled = true;
  try {
    let wid = d.coId && BYID[d.coId] ? BYID[d.coId].wid : '';
    if (d.mode !== 'claim') {
      const cid = companyIdFor(d.web);
      if (BYWID[cid]) wid = cid;
      else {
        const it = await insertCompany({ _id: cid, title: d.name, slug: uniqueSlug(d.name), website: cid, category: d.cat, country: CC_BY_NAME[d.country] || 'WW', bio: '', headquarters: d.city || '', addedBy: 'owner', claimStatus: 'none', plan: 'none', countCustomer: 0, countEmployee: 0, countInterview: 0 });
        wid = it._id || cid; addCompanyLocal({ ...it, _id: wid, title: d.name, slug: it.slug || slug(d.name), website: cid, category: d.cat, addedBy: 'owner' });
      }
    }
    const docType = method === 'documents' ? ((document.getElementById('cf-doctype') || {}).value || cf.docType || '') : method === 'id' ? 'Company ID card' : '';
    /* The proof file is saved on the claim itself: the Claims collection can be read only by the person who
       sent it and by the team. */
    await insertItem('Claims', { company: wid, kind: d.mode === 'claim' ? 'claim' : 'new', person: d.person, role: d.role, email: d.email, phone: d.phone, method, token: method === 'website' ? cf.token : '', plan, message: docType ? 'Proof: ' + docType : '', proofFile: method === 'website' ? '' : cf.file, proofName: method === 'website' ? '' : cf.fileName, status: 'pending' });
    d.listedAt = todayISO(); d.coWid = wid; d.method = method; S.listStep = 4; S.myClaims = undefined; S.checkMsg = ''; cf.file = ''; cfRefresh();
  } catch (err) { if (btn) btn.disabled = false; toast(errMsg(err), 5000); }
}

document.addEventListener('submit', async e => {
  const f = e.target; const id = f.id;
  const HANDLED = ['review-form', 'emp-form', 'int-form', 'add-form', 'req-form', 'report-form', 'suggest-form', 'login-form', 'signup-form', 'verify-form', 'forgot-form', 'import-form', 'contact-form', 'pitch-form'];
  if (!HANDLED.includes(id)) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const v = k => { const el = f.querySelector('#' + k); return el ? el.value.trim() : ''; };

  /* Password reset: Wix emails a link to its reset page, which sends the member back to /login
     (an allowed redirect address of the site's sign-in app). The reply never says whether the email has
     an account, so the form can't be used to find out who is registered. */
  if (id === 'import-form') {
    const mine = S.user ? COS.filter(x => (x.raw.ownerMemberIds || []).includes(S.user.id)) : [];
    const c = mine.find(x => x.id === S.dashCo) || mine[0]; if (!c || coPlan(c) !== 'plus') return;
    const body = v('im-body'), email = v('im-email');
    const errs = { 'im-name': !v('im-name'), 'im-email': !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'im-rating': !v('im-rating'), 'im-date': !v('im-date'), 'im-body': body.length < 20, 'im-ok': !(f.querySelector('#im-ok') || {}).checked };
    Object.entries(errs).forEach(([k, bad]) => { const el = document.getElementById('err-' + k); if (el) el.hidden = !bad; });
    const first = Object.keys(errs).find(k => errs[k]); if (first) { f.querySelector('#' + first).focus(); return; }
    busy(f, true);
    try {
      const it = await insertItem('ReviewImports', { company: c.wid, companyName: c.name, type: 'customer', reviewerName: v('im-name'), reviewerEmail: email, rating: Number(v('im-rating')), title: v('im-title'), body, givenOn: v('im-date'), source: v('im-source'), proofUrl: v('im-proof'), consent: true, status: 'pending' });
      if (S.myImports && S.myImports.co === c.wid && S.myImports.items) S.myImports.items.unshift(it || { reviewerName: v('im-name'), rating: Number(v('im-rating')), body, status: 'pending', _createdDate: new Date().toISOString() });
      f.reset(); busy(f, false); renderKeep();
      toast('Sent. We’ll confirm it with the reviewer before it goes live.', 5000);
    } catch (err) { busy(f, false); toast('That didn’t send: ' + errMsg(err), 6000); }
    return;
  }

  if (id === 'forgot-form') {
    const email = v('l-email'), bad = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    document.getElementById('err-l-email').hidden = !bad;
    if (bad) { f.querySelector('#l-email').focus(); return; }
    busy(f, true);
    try {
      await wixRequest('/_api/iam/recovery/v1/send-email', { body: { email, redirect: { url: location.origin + '/login', clientId: WIX_CLIENT_ID } } });
    } catch (err) {
      const msg = String(err && err.message || err);
      if (!/not.?found|no.?member|doesn.?t exist|404/i.test(msg)) { S.auth = { ...S.auth, email, error: 'We couldn’t send the email just now. Please try again in a minute, or contact us.' }; render(); return; }
    }
    S.auth = { mode: 'forgot-sent', email, error: '' }; render();
    return;
  }

  if (id === 'login-form' || id === 'signup-form' || id === 'verify-form') {
    const email = v('l-email'), pw = (f.querySelector('#l-pass') || {}).value || '';
    let bad = null;
    if (id !== 'verify-form') {
      const eE = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), eP = pw.length < 8;
      document.getElementById('err-l-email').hidden = !eE; document.getElementById('err-l-pass').hidden = !eP;
      if (id === 'signup-form') { const eN = !v('l-first'); document.getElementById('err-l-first').hidden = !eN; if (eN) bad = 'l-first'; }
      if (id === 'signup-form') { const eA = !(f.querySelector('#l-adult') || {}).checked; document.getElementById('err-l-adult').hidden = !eA; if (eA) bad = bad || 'l-adult'; }
      if (eP) bad = bad || 'l-pass'; if (eE) bad = 'l-email';
    } else { const eC = !/^\d{4,8}$/.test(v('l-code')); document.getElementById('err-l-code').hidden = !eC; if (eC) bad = 'l-code'; }
    if (bad) { f.querySelector('#' + bad).focus(); return; }
    S.auth = { ...S.auth, email: email || S.auth.email, error: '' };
    busy(f, true);
    try {
      const r = id === 'login-form' ? await memberLogin(email, pw)
        : id === 'signup-form' ? await memberRegister(email, pw, { firstName: v('l-first'), lastName: v('l-last') })
        : await memberVerify(v('l-code'));
      onAuthResult(r);
    } catch (err) { S.auth = { ...S.auth, error: errMsg(err) }; render(); }
    return;
  }

  if (id === 'review-form') {
    const c = BYID[curRoute()]; if (!c) return;
    const body = f['r-body'].value.trim();
    const eR = !S.rating, eB = body.length < 20;
    document.getElementById('err-rating').hidden = !eR; document.getElementById('err-body').hidden = !eB;
    if (eR) { f.querySelector('[data-n="1"]').focus(); return; } if (eB) { f['r-body'].focus(); return; }
    const m = f['r-date'].value;
    if (!S.user) {
      setDraft({ cid: c.id, rating: S.rating, title: f['r-title'].value, body: f['r-body'].value, date: m });
      S.returnTo = c.id; S.notice = 'Log in to post your review. Your draft is saved.';
      go('login'); window.scrollTo(0, 0); return;
    }
    if (!checkFirst(f, 'r-first')) return;
    if (alreadyReviewed(c, 'customer')) { toast(`You've already reviewed ${c.name}. To post a new review, remove your earlier one from My reviews first.`, 7000); return; }
    busy(f, true);
    try {
      await insertItem('Reviews', { company: c.wid, companySlug: c.id.slice(3), type: 'customer', displayName: S.user.name, anonymous: false, rating: S.rating, title: f['r-title'].value.trim(), body, experienceDate: m || '', firstHand: true, invited: S.invitedFor === c.id });
    } catch (err) { busy(f, false); toast(errMsg(err), 5000); return; }
    addPending({ cid: c.id, type: 'customer', title: f['r-title'].value.trim() || body.slice(0, 80) });
    S.invitedFor = ''; S.rating = 0; setDraft(null); S.sentFor = c.id; render();
    toast('Thanks. Your review is live.', 5000);
    loadData(true).then(ch => { if (ch) renderKeep(); });
    return;
  }

  if (id === 'emp-form' || id === 'int-form') {
    const c = BYID[curRoute()]; if (!c || !S.user) return;
    const check = list => { let first = null; list.forEach(([k, bad, foc]) => { document.getElementById('err-' + k).hidden = !bad; const el = document.getElementById(k); if (el) el.setAttribute('aria-invalid', bad ? 'true' : 'false'); if (bad && !first) first = foc || k; }); if (first) document.getElementById(first).focus(); return !first; };
    let data;
    if (id === 'emp-form') {
      const rec = f.querySelector('input[name="e-rec"]:checked');
      if (!check([['e-title', !v('e-title')], ['e-overall', !S.emp.overall, 'e-overall-1'], ['e-pros', v('e-pros').length < 20], ['e-cons', v('e-cons').length < 20], ['e-rec', !rec, 'e-rec-yes']])) return;
      if (!checkFirst(f, 'e-first')) return;
      const sub = {}; SUBS.forEach(([k]) => { if (S.emp[k]) sub[k] = S.emp[k]; });
      const show = (f.querySelector('input[name="e-show"]:checked') || {}).value || 'anon'; S.empShow = show;
      data = { type: 'employee', displayName: show === 'named' ? displayName() : '', anonymous: show !== 'named', rating: S.emp.overall, subRatings: sub, pros: v('e-pros'), cons: v('e-cons'), advice: v('e-advice'), recommend: rec.value, employmentStatus: v('e-status'), jobTitle: v('e-title'), location: v('e-loc'), tenure: v('e-years') };
    } else {
      if (!check([['i-role', !v('i-role')], ['i-process', v('i-process').length < 20]])) return;
      if (!checkFirst(f, 'i-first')) return;
      data = { type: 'interview', anonymous: true, jobTitle: v('i-role'), interviewOutcome: v('i-outcome'), interviewDifficulty: v('i-diff'), interviewExperience: v('i-exp'), body: v('i-process'), interviewQuestions: v('i-questions') };
    }
    if (data.type !== 'interview' && alreadyReviewed(c, data.type)) { toast(`You've already reviewed ${c.name} as an employee. To post a new review, remove your earlier one from My reviews first.`, 7000); return; }
    busy(f, true);
    try { await insertItem('Reviews', { ...data, company: c.wid, companySlug: c.id.slice(3), firstHand: true, workEmailVerified: workVerified(c), invited: S.invitedFor === c.id }); }
    catch (err) { busy(f, false); toast(errMsg(err), 5000); return; }
    addPending({ cid: c.id, type: data.type, title: data.jobTitle });
    S.emp = EMP_ZERO(); S.invitedFor = ''; delete S.formCache[id]; render();
    toast('Thanks. Your review is live.', 5000);
    loadData(true).then(ch => { if (ch) renderKeep(); });
    return;
  }

  if (id === 'add-form') {
    const name = f['a-name'].value.trim().replace(/\s+/g, ' ');
    const web = f['a-web'].value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
    const eN = name.length < 2 || !slug(name), eW = !/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/.test(web);
    document.getElementById('err-a-name').hidden = !eN; document.getElementById('err-a-web').hidden = !eW;
    if (eN) { f['a-name'].focus(); return; } if (eW) { f['a-web'].focus(); return; }
    const cid = companyIdFor(web), W2 = webs2();
    const dup = BYWID[cid] || COS.find(c => W2[c.id] && W2[c.id] === domOf(web));
    if (dup) { toast(`${dup.name} is already listed`); navigate(dup.id); return; }
    if (!S.user) { S.addPrefill = name; needLogin('Log in to add a company. It keeps fake listings out.'); return; }
    busy(f, true);
    try {
      const it = await insertCompany({ _id: cid, title: name, slug: uniqueSlug(name), website: cid, category: f['a-cat'].value, country: f['a-cc'].value, bio: '', addedBy: 'reviewer', claimStatus: 'none', plan: 'none', countCustomer: 0, countEmployee: 0, countInterview: 0 });
      const c = addCompanyLocal({ ...it, _id: it._id || cid });
      S.addPrefill = ''; toast(`${name} added. Now share your experience.`); navigate(c.id);
    } catch (err) {
      busy(f, false);
      if (err && err.status === 409) { await loadData(true); const ex = BYWID[cid]; toast('That website is already listed'); if (ex) navigate(ex.id); return; }
      toast(errMsg(err), 5000);
    }
    return;
  }

  if (id === 'req-form') {
    const bad = { 'r-person': !v('r-person'), 'r-email': !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('r-email')) };
    let first = null; Object.entries(bad).forEach(([k, b]) => { document.getElementById('err-' + k).hidden = !b; if (b && !first) first = k; });
    if (first) { f.querySelector('#' + first).focus(); return; }
    if (!S.user) { needLogin('Log in or create an account to request access.'); return; }
    const c = BYID[S.reqCo]; busy(f, true);
    try { await insertItem('Claims', { company: c.wid, kind: 'access', person: v('r-person'), role: f['r-role'].value, email: v('r-email'), message: v('r-msg'), status: 'pending' }); }
    catch (err) { busy(f, false); toast(errMsg(err), 5000); return; }
    S.listStep = 'req-done'; S.myClaims = undefined; cfRefresh();
    return;
  }

  if (id === 'report-form') {
    const r = f.querySelector('input[name="rp-reason"]:checked'); document.getElementById('err-rp').hidden = !!r; if (!r) return;
    const c = BYID[curRoute()]; busy(f, true);
    try { await insertItem('Reports', { kind: 'report', review: f.dataset.key, company: c ? c.wid : undefined, reason: r.value, note: f.querySelector('#rp-note').value.trim(), status: 'open' }); }
    catch (err) { busy(f, false); toast(errMsg(err), 5000); return; }
    const R = store.get('ktc_reported', {}); R[f.dataset.key] = todayISO(); store.set('ktc_reported', R);
    closeModals(); renderKeep(); toast('Report sent. Our team will review it.');
    return;
  }

  if (id === 'suggest-form') {
    const note = f.querySelector('#sg-note').value.trim(); document.getElementById('err-sg').hidden = note.length >= 10;
    if (note.length < 10) { f.querySelector('#sg-note').focus(); return; }
    const c = BYID[f.dataset.id]; busy(f, true);
    try { await insertItem('Reports', { kind: 'edit', company: c ? c.wid : undefined, reason: f.querySelector('#sg-what').value, note, status: 'open' }); }
    catch (err) { busy(f, false); toast(errMsg(err), 5000); return; }
    closeModals(); toast('Thanks. We check suggestions within a few days.');
    return;
  }

  if (id === 'contact-form') {
    const errs = { 'c-name': !v('c-name'), 'c-email': !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('c-email')), 'c-msg': v('c-msg').length < 20 };
    let first = null; Object.entries(errs).forEach(([k, bad]) => { document.getElementById('err-' + k).hidden = !bad; if (bad && !first) first = k; });
    if (first) { f.querySelector('#' + first).focus(); return; }
    const topic = v('c-topic');
    const to = 'knowthecompanysupport@gmail.com';
    location.href = 'mailto:' + to + '?subject=' + encodeURIComponent(topic) + '&body=' + encodeURIComponent(v('c-msg') + '\n\n' + v('c-name') + '\n' + v('c-email'));
    S.contactSent = true; render(); window.scrollTo(0, 0);
    return;
  }

  if (id === 'pitch-form') {
    const d = { name: v('w-name'), email: v('w-email'), company: v('w-company'), topic: v('w-topic'), title: v('w-title'), outline: v('w-outline'), sample: v('w-sample') };
    const errs = { 'w-name': !d.name, 'w-email': !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email), 'w-company': !d.company, 'w-topic': !d.topic, 'w-title': !d.title, 'w-outline': d.outline.length < 80, 'w-agree': !f.querySelector('#w-agree').checked };
    let first = null; Object.entries(errs).forEach(([k, bad]) => { document.getElementById('err-' + k).hidden = !bad; if (bad && !first) first = k; });
    if (first) { f.querySelector('#' + first).focus(); return; }
    const body = `Title: ${d.title}\nTopic: ${d.topic}\n\n${d.outline}\n\nSample: ${d.sample || '-'}\n\n${d.name}, ${d.company}\n${d.email}`;
    location.href = 'mailto:knowthecompanysupport@gmail.com?subject=' + encodeURIComponent('Guest article pitch: ' + d.title) + '&body=' + encodeURIComponent(body);
    S.pitchSent = true; render(); window.scrollTo(0, 0);
    return;
  }
});

document.addEventListener('click', async e => {
  const a = e.target.closest('[data-act]'); if (!a) return;
  const act = a.dataset.act;
  const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
  if (act === 'logout') { stop(); memberLogout('/').catch(() => { toast('Couldn’t log out. Please try again.'); }); return; }
  if (act === 'idp') { stop(); a.disabled = true; startIdp(a.dataset.idp, !!a.dataset.biz).catch(err => { a.disabled = false; toast('Could not start sign-in: ' + errMsg(err)); }); return; }
  if (act === 'auth-mode') { stop(); S.auth = { mode: a.dataset.mode, error: '', email: S.auth.email || '' }; render(); const i = document.getElementById('l-email') || document.getElementById('l-code'); if (i) i.focus(); return; }
  if (act === 'reload') { stop(); location.reload(); return; }
  if (act === 'rv-report' && !S.user) { stop(); needLogin('Log in to report a review. It keeps the report button from being misused.'); return; }
  if (act === 'suggest' && !S.user) { stop(); needLogin('Log in to suggest an edit.'); return; }
  if (act === 'gate-list-login') { stop(); S.returnTo = S.flow === 'list' ? 'list' : 'claim'; S.scrollTo = 'list-form-area'; S.notice = 'Log in or create an account to claim or add your company.'; go('login'); window.scrollTo(0, 0); return; }
  if (act === 'del-review' || act === 'del-emp') {
    stop(); const wid = a.dataset.wid; if (!wid) return;
    if (!window.confirm('Remove this review? This can’t be undone.')) return;
    a.disabled = true;
    try { await removeItem('Reviews', wid); await loadData(true); render(); toast('Review removed'); }
    catch (err) { a.disabled = false; toast(errMsg(err), 5000); }
    return;
  }
  if (act === 'del-account') {
    stop(); if (!S.user) return;
    if (!window.confirm('Ask us to delete your account and everything you have posted? This can’t be undone.')) return;
    a.disabled = true;
    try {
      await insertItem('Reports', { kind: 'account-deletion', reason: 'Delete my account', note: `Member ${S.user.id} (${S.user.email}) asked for their account and everything they posted to be deleted.`, status: 'open' });
      toast('Request sent. We’ll confirm by email once your account is deleted.', 6000);
    } catch (err) { a.disabled = false; toast(errMsg(err), 5000); }
    return;
  }
  if (act === 'cf-submit') { stop(); submitClaim(); return; }
});

/* Claim proof: images are resized to at most 1600 px and saved as JPEG, small enough to keep on the claim;
   PDFs are kept as they are when under 350 KB. */
const MAX_PROOF = 380_000;
const readAsDataURL = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(r.error); r.readAsDataURL(f); });
async function proofFromFile(f) {
  if (f.type === 'application/pdf') { if (f.size > 350_000) throw new Error('That PDF is too big. Upload a PDF under 350 KB, or a photo of the document.'); return readAsDataURL(f); }
  if (!/^image\//.test(f.type)) throw new Error('Upload a JPG, PNG or PDF file.');
  if (f.size > 15_000_000) throw new Error('That file is too big. Upload one under 5 MB.');
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('We couldn’t read that image. Try another photo.')); i.src = url; });
    for (const [max, q] of [[1600, .82], [1400, .72], [1100, .65], [900, .6]]) {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const cv = document.createElement('canvas'); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
      const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
      const out = cv.toDataURL('image/jpeg', q); if (out.length <= MAX_PROOF) return out;
    }
    throw new Error('That image is too detailed to upload. Try a smaller photo.');
  } finally { URL.revokeObjectURL(url); }
}
document.addEventListener('change', async e => { const t = e.target;
  if (t.id === 'cf-doctype' && S.cf) S.cf.docType = t.value;
  if (t.name === 'plan' && S.listData) S.listData.plan = t.value;
  if (t.id !== 'cf-file' || !S.cf) return;
  const f = t.files && t.files[0]; if (!f) return;
  S.cf.fileErr = ''; S.cf.file = ''; S.cf.fileName = '';
  try { S.cf.file = await proofFromFile(f); S.cf.fileName = f.name; } catch (err) { S.cf.fileErr = err.message; }
  cfRefresh(false); });
document.addEventListener('input', e => { const t = e.target; if (t.dataset && t.dataset.jfilter === 'q') { S.jobFilter.q = t.value; const r = document.getElementById('job-results'); if (r) r.innerHTML = jobResults(); } });
document.addEventListener('change', e => { const t = e.target; if (t.dataset && t.dataset.jfilter && t.dataset.jfilter !== 'q') { S.jobFilter[t.dataset.jfilter] = t.value; const r = document.getElementById('job-results'); if (r) r.innerHTML = jobResults(); } });

/* ---------- router ---------- */
const app = document.getElementById('app');
/* ---------- scroll animations ----------
   Sections and cards fade up as they come into view, with a short stagger between siblings.
   They play once per page visit: re-renders on the same page (star picks, tabs, filters) show content straight away. */
const REVEAL = [
  ['.promises > *', ''], ['.sechead', ''],
  ['.both > .bside.c', 'rv-l'], ['.both > .bjoin', 'rv-z'], ['.both > .bside.e', 'rv-r'], ['.whyboth > *', ''],
  ['.grid > *', ''], ['.reasons > *', ''], ['.toolgrid > *', ''], ['.steps > *', ''], ['.jgrid > *', ''], ['.plans > *', ''],
  ['.pagehead', ''], ['.lbhero .wrap > *', ''], ['.band > .wrap > *', ''], ['.cohead', ''],
  ['.review', ''], ['.box', ''], ['.formcard', ''], ['.authcard', ''], ['.cocard', ''], ['.postcard', ''], ['.empty', '']
];
let revealHash = null, revealIO = null;
function setupReveal(h) {
  const root = app.firstElementChild; if (!root) return;
  const fresh = h !== revealHash; revealHash = h;
  if (revealIO) { revealIO.disconnect(); revealIO = null; }
  let reduce = false; try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  if (fresh && !reduce) { const hero = root.querySelector('.hero3'); if (hero) hero.classList.add('play'); }
  if (!fresh || reduce || !('IntersectionObserver' in window) || innerWidth < 900 || (navigator.connection && navigator.connection.saveData)) return;
  const done = el => { el.classList.remove('rv', 'in', 'rv-l', 'rv-r', 'rv-z'); el.style.removeProperty('--rv-d'); };
  const show = el => {
    el.classList.add('in');
    const d = parseInt(el.style.getPropertyValue('--rv-d')) || 0;
    setTimeout(() => done(el), d + 900);
  };
  const seen = new Set(), perParent = new Map();
  for (const [sel, dir] of REVEAL) {
    root.querySelectorAll(sel).forEach(el => {
      if (seen.has(el)) return;
      for (let p = el.parentElement; p && p !== root; p = p.parentElement) if (seen.has(p)) return;
      seen.add(el);
      const n = perParent.get(el.parentElement) || 0; perParent.set(el.parentElement, n + 1);
      el.classList.add('rv'); if (dir) el.classList.add(dir);
      el.style.setProperty('--rv-d', Math.min(n, 6) * 80 + 'ms');
    });
  }
  revealIO = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting || e.boundingClientRect.top < 0) { revealIO && revealIO.unobserve(e.target); show(e.target); }
  }), { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
  seen.forEach(el => revealIO.observe(el));
}
/* the two rows of company names under the homepage headline slide in opposite directions as the page scrolls */
let bandsReduce = false; try { bandsReduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
function moveBands() {
  const nb = document.getElementById('nbands'); if (!nb || bandsReduce) return;
  const y = window.scrollY * 0.45;
  const [a, b] = nb.querySelectorAll('.nbt');
  if (a) a.style.transform = `translate3d(${-y}px,0,0)`;
  if (b) b.style.transform = `translate3d(${y - b.scrollWidth / 2}px,0,0)`;
}
/* the blank in the headline types out real company names until someone clicks into it */
let typer = null;
function startTyper() {
  clearTimeout(typer);
  const inp = document.getElementById('hero-search'); if (!inp) return;
  let reduce = false; try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  if (reduce) return;
  const want = ['Razorpay', 'Zepto', 'CRED', 'Darwinbox', 'Cars24', 'boAt', 'Cuemath', 'Acko', 'Deel', 'Notion'];
  const names = ['the company'].concat(want.filter(n => COS.some(c => c.name === n))); if (names.length < 4) COS.slice(0, 8).forEach(c => names.push(c.name));
  /* "the company" stays up for about three seconds first, and again each time the list comes round */
  let i = 0, j = names[0].length, del = true, hold = 0;
  const tick = () => {
    if (!inp.isConnected) return;
    if (document.activeElement === inp || inp.value) { inp.placeholder = 'the company'; typer = setTimeout(tick, 600); return; }
    const word = names[i % names.length];
    if (hold) { hold--; typer = setTimeout(tick, 100); return; }
    if (!del) { j++; if (j >= word.length) { del = true; hold = i % names.length === 0 ? 28 : 16; } }
    else { j--; if (j <= 0) { del = false; i++; hold = 3; } }
    inp.placeholder = word.slice(0, j) || '\u200b';
    typer = setTimeout(tick, del ? 45 : 95);
  };
  typer = setTimeout(tick, 3000);
}
/* thin progress bar under the header, and a shadow on the header once the page has scrolled */
(() => {
  const bar = document.createElement('div'); bar.className = 'scrollbar'; bar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar);
  const top = document.querySelector('header.top');
  let ticking = false;
  const update = () => {
    ticking = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
    if (top) top.classList.toggle('scrolled', window.scrollY > 8);
    moveBands();
  };
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; window.requestAnimationFrame(update); } }, { passive: true });
  window.addEventListener('resize', update);
  update();
})();

function render() {
  const h = curRoute();
  if (!LOADED) {
    app.innerHTML = LOAD_ERR ? `<div class="wrap"><div class="empty" style="margin-top:40px"><b>We couldn't load the companies</b><p>Check your connection and try again.</p><button class="btn p" type="button" data-act="reload">Try again</button></div></div>`
      : `<div class="wrap"><div class="empty" style="margin-top:40px;border:0" aria-busy="true"><b>Loading…</b></div></div>`;
    renderNav(''); return;
  }
  let html, nav = '';
  /* A saved draft fills the review form on every draw of its company page until it is posted (a page can be
     drawn several times while data and the sign-in load). */
  if (BYID[h] && S.draft && S.draft.cid === h && !S.rating) S.rating = S.draft.rating;
  if (h === 'home' || h === '') html = vHome();
  else if (h === 'categories') { html = vCategories(); nav = 'categories'; }
  else if (h === 'search') html = vSearch();
  else if (h === 'tools') { html = vTools(); nav = 'tools'; }
  else if (h === 'why-list') { html = vWhy(); nav = 'list'; }
  else if (TOOLBYID[h]) { html = vTool(TOOLBYID[h]); nav = 'tools'; }
  else if (h === 'add') html = vAdd();
  else if (h === 'sample') { navigate('list', true); return; }
  else if (h === 'list') { html = vList(); nav = 'list'; }
  else if (h === 'claim') { html = vClaim(); nav = 'list'; }
  else if (h === 'dashboard') { html = vDashboard(); nav = 'dashboard'; }
  else if (h === 'login') { html = vLogin('reviewer'); nav = 'login'; }
  else if (h === 'business-login') { html = vLogin('business'); nav = 'login'; }
  else if (h === 'my-reviews') { html = vMyReviews(); nav = 'my-reviews'; }
  else if (h === 'jobs') { html = vJobs(); nav = 'jobs'; }
  else if (h === 'guidelines') html = vGuidelines();
  else if (h === 'blog') { html = vBlog(); nav = 'blog'; }
  else if (POSTBYID[h]) { html = vPost(POSTBYID[h]); nav = 'blog'; }
  else if (h === 'write-for-us') html = vWriteForUs();
  else if (h === 'about') html = vAbout();
  else if (h === 'contact') html = vContact();
  else if (h === 'help') html = vHelp();
  else if (h === 'terms') html = vTerms();
  else if (h === 'privacy') html = vPrivacy();
  else if (h === 'pricing') { html = vPricing(); nav = 'list'; }
  else if (h === 'refunds') html = vRefunds();
  else if (CATBYID[h]) { html = vCategory(CATBYID[h]); nav = 'categories'; }
  else if (h.startsWith('join-team-')) html = vJoinTeam(h.slice(10));
  else if (h.startsWith('invite-team-') && BYID[h.slice(12)]) html = vInvite(BYID[h.slice(12)], 'e');
  else if (h.startsWith('invite-') && BYID[h.slice(7)]) html = vInvite(BYID[h.slice(7)], 'c');
  else if (BYID[h]) { loadMedia(BYID[h]); loadFacts(BYID[h]); html = vCompany(BYID[h]); }
  else html = vNotFound();
  if (S.user && S.myClaims === undefined) loadMyClaims();
  app.innerHTML = `<div class="view">${curText(html)}</div>`;
  document.body.classList.add('ready');
  { const fo = document.getElementById('footer-op'); if (fo) fo.textContent = OPERATOR.legalName ? ` Know The Company is run by ${OPERATOR.legalName}.` : ''; }
  renderNav(nav);
  setupReveal(h);
  if (h === 'home' || h === '') { startTyper(); moveBands(); }
  if (TOOLBYID[h]) runTool();
  if (S.scrollTo) { const id = S.scrollTo; S.scrollTo = ''; setTimeout(() => { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 60); }
  const sp = document.getElementById('searchpanel'); if (sp) sp.hidden = true;
  if (BYID[h] && S.draft && S.draft.cid === h) { const g = document.getElementById('review-form'); if (g && !g['r-title'].value && !g['r-body'].value) { g['r-title'].value = S.draft.title || ''; g['r-body'].value = S.draft.body || ''; g['r-date'].value = S.draft.date || ''; } }
  setMeta(h);
  const c = BYID[h]; if (POSTBYID[h]) document.title = (POSTBYID[h].seo || POSTBYID[h].title) + ' · Know The Company'; else document.title = c ? `${c.name} reviews · Know The Company` : TOOLBYID[h] ? `${TOOLBYID[h].name} · Know The Company` : h === 'tools' ? 'Free tools · Know The Company' : h === 'why-list' ? 'Why list your company · Know The Company' : h === 'pricing' ? 'Plans and pricing · Know The Company' : h === 'refunds' ? 'Refunds and cancellations · Know The Company' : CATBYID[h] ? `${CATBYID[h].name} · Know The Company` : PAGE_TITLES[h] ? `${PAGE_TITLES[h]} · Know The Company` : h === 'home' ? 'Know The Company · Customer and employee reviews of startups' : !isRoute(h) ? 'Page not found · Know The Company' : 'Know The Company · Customer and employee reviews of startups';
}
function setMeta(h) {
  const c = BYID[h], k = CATBYID[h]; let d = 'Customer and employee reviews of startups and growing companies, on one page. Know the company before you deal with it.';
  if (c) d = `${c.name} reviews from customers and employees. ${c.bio}`; else if (k) d = catIntro(k.name); else if (POSTBYID[h]) d = POSTBYID[h].desc || POSTBYID[h].excerpt; else if (PAGE_DESCS[h]) d = PAGE_DESCS[h];
  let m = document.querySelector('meta[name="description"]'); if (!m) { m = document.createElement('meta'); m.name = 'description'; document.head.appendChild(m); } m.content = d.length > 158 ? d.slice(0, 155).replace(/\s+\S*$/, '') + '…' : d;
  let cl = document.querySelector('link[rel="canonical"]'); if (!cl) { cl = document.createElement('link'); cl.rel = 'canonical'; document.head.appendChild(cl); }
  cl.href = location.origin + urlFor(h);
  /* Social sharing tags follow the page too (the server writes them for the first page load). */
  [['og:title', document.title], ['og:description', m.content], ['og:url', cl.href], ['twitter:title', document.title], ['twitter:description', m.content]].forEach(([k2, v]) => { const t = document.querySelector(`meta[property="${k2}"],meta[name="${k2}"]`); if (t) t.content = v; });
  let rb = document.querySelector('meta[name="robots"]'); if (!rb) { rb = document.createElement('meta'); rb.name = 'robots'; document.head.appendChild(rb); }
  const noindex = !isRoute(h) || ['search', 'login', 'business-login', 'dashboard', 'my-reviews', 'add'].includes(h) || h.startsWith('invite-') || h.startsWith('join-team-'); /* every company page is indexed, so people can find a company and review it */
  rb.content = SITE_NOINDEX ? 'noindex, nofollow' : noindex ? 'noindex, follow' : 'index, follow';
  let s = document.getElementById('ldjson'); if (s) s.remove();
  if (c && !document.getElementById('ld-json')) { const l = reviewsFor(c.id); const o = { '@context': 'https://schema.org', '@type': 'Organization', name: c.name, url: 'https://' + c.web, description: c.bio };
    if (l.length) o.aggregateRating = { '@type': 'AggregateRating', ratingValue: +avgOf(l).toFixed(1), reviewCount: l.length, bestRating: 5, worstRating: 1 };
    s = document.createElement('script'); s.type = 'application/ld+json'; s.id = 'ldjson'; s.textContent = JSON.stringify(o); document.head.appendChild(s); }
}
(() => { if (store.get('ktc_consent', null)) return; const el = document.getElementById('cookie'); el.innerHTML = '<p><b>Your privacy choices</b><br><span class="ck-long">We use essential storage to keep you logged in. With your OK, we also use analytics to improve the site. </span><span class="ck-short">Analytics only with your OK. </span><a href="/privacy">Privacy policy</a></p><div class="row"><button class="btn p" type="button" data-act="cookie" data-v="all">Accept<span class="ck-long"> analytics</span></button><button class="btn g" type="button" data-act="cookie" data-v="essential">Essential only</button></div>'; el.hidden = false; })();
let lastRoute = curRoute();
function routeChanged() {
  const h = curRoute();
  canonicalUrl();
  /* The server's structured data describes the page it served; drop it once the app shows another page. */
  if (h !== lastRoute) { const ld = document.getElementById('ld-json'); if (ld) ld.remove(); }
  if (CATBYID[h] && lastRoute !== h) S.catFilter = { country: '', text: '', sort: 'name' };
  if (BYID[h] && lastRoute !== h) { S.rating = 0; S.coTab = S.returnTab || (isVerifiedCo(BYID[h]) ? 'overview' : 'customers'); S.rvSort = 'new'; S.rvStar = 0; S.rvProof = false; S.erSort = 'new'; S.returnTab = ''; S.emp = EMP_ZERO(); S.formCache = {}; }
  if (!BYID[h] && h !== 'login' && h !== 'business-login') S.returnTab = '';
  /* Entering the claim or list page: the form starts in that page's mode. A finished form, or one that was
     started on the other page, starts again (a claim picked from a company page keeps its company). */
  if ((h === 'list' || h === 'claim') && lastRoute !== h) {
    const flow = h === 'list' ? 'list' : 'claim', switched = S.flow !== flow, picked = flow === 'claim' && S.listData.mode === 'claim' && S.listStep === 1;
    S.flow = flow;
    if (S.listStep === 4 || S.listStep === 'req-done' || (switched && !picked)) { S.listStep = 0; S.listData = { plan: S.listData.plan }; }
  }
  if (h !== 'login' && h !== 'business-login') S.notice = '';
  lastRoute = h;
  render(); window.scrollTo(0, 0);
}
window.addEventListener('hashchange', routeChanged);
window.addEventListener('popstate', routeChanged);

/* ---------- toast ---------- */
let tt; function toast(msg, ms = 2600) { const t = document.getElementById('toast'); t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, ms); }

/* ---------- search suggestions ---------- */
function suggestFor(input) {
  const box = document.getElementById('sugg-' + input.dataset.suggest); if (!box) return;
  const res = searchCos(input.value).slice(0, 6);
  if (!input.value.trim() || !res.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.innerHTML = res.map(c => `<button type="button" data-go="${c.id}">${avatar(c, 36, 13)}<span><b style="font-size:15px">${esc(c.name)}</b><small>${esc(c.web)} · ${esc(c.cat)}</small></span></button>`).join('') +
    `<button type="button" data-searchall="1"><span style="padding-left:2px;font-weight:700;color:var(--accent)">See all results for “${esc(input.value.trim())}”</span></button>`;
  box.hidden = false;
}
function runSearch(q) { S.q = q; if (curRoute() === 'search') render(); else navigate('search'); }
document.addEventListener('click', e => { document.querySelectorAll('details.dd[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; }); if (e.target.classList && e.target.classList.contains('modal')) closeModals(); }, true);
document.addEventListener('toggle', e => { const d = e.target; if (!d.classList || !d.classList.contains('dd') || !d.open) return; document.querySelectorAll('details.dd[open]').forEach(o => { if (o !== d) o.open = false; }); if (d.classList.contains('bell')) { store.set('tn_seen', notifs().length); const b = d.querySelector('.badge'); if (b) b.remove(); } }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModals(); document.getElementById('searchpanel').hidden = true; document.querySelectorAll('details.dd[open]').forEach(d => d.open = false); } });
document.addEventListener('input', e => {
  if (e.target.id === 'cf-q') { S.cfQ = e.target.value; document.getElementById('cf-res').innerHTML = cfResults(e.target.value); return; }
  if (e.target.id === 'pk-q') { document.getElementById('pk-list').innerHTML = pickList(e.target.value); return; }
  if (e.target.closest && e.target.closest('[data-tool]')) { if (e.target.id === 'c-a' || e.target.id === 'c-b' || TOOLBYID[curRoute()]) runTool(); return; }
  if (e.target.id === 'biz-list') { BIZ.list = e.target.value; const n = emailsIn(BIZ.list).length, m = document.getElementById('biz-count'), b = document.querySelector('[data-act="biz-send"]'); if (m) m.textContent = n ? `${n} address${n === 1 ? '' : 'es'} found.` : 'Paste a list or choose a file.'; if (b) { b.disabled = !n || !BIZ.full; b.textContent = `Send ${n || ''} invitation${n === 1 ? '' : 's'}`; } return; }
  if (e.target.id === 'calc-sale') { const v = parseFloat(e.target.value); if (v > 0) { S.calcSale = v; const o = document.querySelector('.calc .out'); if (o) o.innerHTML = calcOut(v); } return; }
  const t = e.target;
  if (t.dataset.suggest) suggestFor(t);
  if (t.dataset.filter === 'text') { S.catFilter.text = t.value; const k = CATBYID[curRoute()]; if (k) document.getElementById('cat-results').innerHTML = catResults(k); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.name === 'biz-kind') { BIZ.kind = t.value === 'employee' ? 'employee' : 'customer'; renderKeep(); return; }
  if (t.id === 'biz-full') { BIZ.full = t.checked; const b = document.querySelector('[data-act="biz-send"]'); if (b) b.disabled = !emailsIn(BIZ.list).length || !BIZ.full; return; }
  if (t.id === 'biz-file' && t.files && t.files[0]) { const f = t.files[0]; if (f.size > 2e6) { toast('That file is too big. Use a CSV under 2 MB.'); return; } f.text().then(txt => { BIZ.list = txt; renderKeep(); }); return; }
  if (t.dataset.filter && t.dataset.filter !== 'text') { S.catFilter[t.dataset.filter] = t.value; const k = CATBYID[curRoute()]; if (k) document.getElementById('cat-results').innerHTML = catResults(k); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.sugg').forEach(b => b.hidden = true);
  const tb = e.target.closest && e.target.closest('[role="tab"][data-act="cotab"]');
  if (tb && ['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) { e.preventDefault(); const all = [...tb.parentElement.querySelectorAll('[role="tab"]')]; const i = all.indexOf(tb), n = all.length; all[e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : n - 1].click(); }
});
document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]'); if (go) { if (go.closest('#sugg-hero') && S.heroTab === 'salaries') S.returnTab = 'salaries'; document.querySelectorAll('.sugg').forEach(b => b.hidden = true); document.querySelectorAll('[data-suggest]').forEach(i => i.value = ''); navigate(go.dataset.go); return; }
  const all = e.target.closest('[data-searchall]'); if (all) { const box = all.closest('.sugg'); const inp = box.parentElement.querySelector('input'); box.hidden = true; runSearch(inp.value); return; }
  if (!e.target.closest('.hsearch')) document.querySelectorAll('.sugg').forEach(b => b.hidden = true);
  const a = e.target.closest('[data-act]'); if (!a) return;
  const act = a.dataset.act;
  if (act === 'open-search') { const p = document.getElementById('searchpanel'); p.hidden = !p.hidden; if (!p.hidden) setTimeout(() => document.getElementById('top-search').focus(), 20); return; }
  if (act === 'close-search') { document.getElementById('searchpanel').hidden = true; return; }
  if (act === 'rv-report') { openModal(`<form id="report-form" data-key="${a.dataset.key}" novalidate style="display:flex;flex-direction:column;gap:14px">${mHead('Report this review')}<p>Reports are checked by our team. We remove reviews only if they break our <a href="#guidelines" data-act="close-modal-go">guidelines</a>, not for being negative.</p><fieldset style="border:0;padding:0;margin:0;display:flex;flex-direction:column;gap:8px"><legend class="l" style="margin-bottom:6px">What's wrong with it?</legend>${RPT_REASONS.map((x, i) => `<label class="radio"><input type="radio" name="rp-reason" value="${esc(x)}" ${i ? '' : ''}>${esc(x)}</label>`).join('')}</fieldset><p class="err" id="err-rp" hidden>Choose a reason.</p><div class="field"><label class="l" for="rp-note">Details <span class="meta">(optional)</span></label><textarea id="rp-note" rows="3" maxlength="600"></textarea></div><div><button class="btn p" type="submit">Send report</button></div></form>`); return; }
  if (act === 'rv-star') { const n = +a.dataset.n; S.rvStar = S.rvStar === n ? 0 : n; renderKeep(); return; }
  if (act === 'rv-proof') { S.rvProof = !S.rvProof; renderKeep(); return; }
  if (act === 'rv-clear') { S.rvStar = 0; S.rvProof = false; renderKeep(); return; }
  if (act === 'share-co') { const c = BYID[a.dataset.id]; const u = location.origin + urlFor(c.id); const tx = encodeURIComponent(`${c.name} reviews from customers and employees: ${u}`);
    openModal(`${mHead('Share ' + esc(c.name) + "'s page")}<div class="field"><label class="l" for="sh-url">Link</label><div style="display:flex;gap:8px"><input id="sh-url" type="text" readonly value="${u}" class="mono" style="flex:1;min-width:0;background:var(--surface)"><button class="btn p" type="button" data-act="copy-text" data-text="${u}">Copy</button></div></div><div class="sharegrid"><a href="https://wa.me/?text=${tx}" target="_blank" rel="noopener">WhatsApp</a><a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}" target="_blank" rel="noopener">LinkedIn</a><a href="https://twitter.com/intent/tweet?text=${tx}" target="_blank" rel="noopener">X</a><a href="mailto:?subject=${encodeURIComponent(c.name + ' reviews')}&body=${tx}">Email</a></div>`); return; }
  if (act === 'suggest') { const c = BYID[a.dataset.id]; openModal(`<form id="suggest-form" data-id="${c.id}" novalidate style="display:flex;flex-direction:column;gap:14px">${mHead('Suggest an edit')}<p>Tell us what's wrong on ${esc(c.name)}'s page. We check every suggestion before changing anything.</p><div class="field"><label class="l" for="sg-what">What needs fixing?</label><select id="sg-what">${['Website', 'Name', 'Category', 'Country', 'Description', 'The company has closed', 'This is a duplicate page', 'Something else'].map(x => `<option>${x}</option>`).join('')}</select></div><div class="field"><label class="l" for="sg-note">What should it say?</label><textarea id="sg-note" rows="3" maxlength="600" placeholder="For example, the correct website or the page this duplicates"></textarea><p class="err" id="err-sg" hidden>Add a short explanation, at least 10 characters.</p></div><div><button class="btn p" type="submit">Send suggestion</button></div></form>`); return; }
  if (act === 'inv-rate') { const id = a.dataset.id; setDraft({ cid: id, rating: +a.dataset.n, title: '', body: '', date: '' }); S.invitedFor = id; S.returnTab = 'customers'; S.scrollTo = 'review-form'; navigate(id); return; }
  if (act === 'inv-go') { e.preventDefault(); S.invitedFor = a.dataset.id; S.returnTab = a.dataset.tab; S.scrollTo = 'emp-form'; navigate(a.dataset.id); return; }
  if (act === 'cookie') { store.set('ktc_consent', { analytics: a.dataset.v === 'all', at: todayISO() }); document.getElementById('cookie').hidden = true; toast(a.dataset.v === 'all' ? 'Thanks. Analytics is on.' : 'Only essential storage is used.'); return; }
  if (act === 'cp-del' && S.user && S.user.coId) { const own = {}; own[a.dataset.k] = ''; saveProf(S.user.coId, own); render(); toast('Removed'); return; }
  if (act === 'cp-del-photo' && S.user && S.user.coId) { const id = S.user.coId, own = {}; own.photos = cprof(BYID[id]).photos.filter((_, i) => i !== +a.dataset.i); saveProf(id, own); render(); toast('Photo removed'); return; }
  if (act === 'cp-del-upd' && S.user && S.user.coId) { const id = S.user.coId, own = {}; own.updates = cprof(BYID[id]).updates.filter((_, i) => i !== +a.dataset.i); saveProf(id, own); render(); toast('Update deleted'); return; }
  if (act === 'open-picker') { closeModals(); openPicker(a.dataset.as); return; }
  if (act === 'open-menu') { openMenu(); return; }
  if (act === 'close-modal') { closeModals(); return; }
  if (act === 'close-modal-go') { if (a.dataset.sheet === 'dash-tab') S.dashTab = a.dataset.tab; if (a.dataset.sheet === 'goto-plans') S.scrollTo = 'plans'; closeModals(); if (routeOfHref(a.getAttribute('href')) === curRoute()) { e.preventDefault(); render(); } return; }
  if (act === 'pick-co') { const as = (document.querySelector('input[name="pk-as"]:checked') || {}).value || 'customers'; closeModals(); if (curRoute() === a.dataset.id) { S.coTab = as; render(); } else { S.returnTab = as; navigate(a.dataset.id); } return; }
  if (act === 'cur') { store.set('ktc_cur', a.dataset.cur); renderKeep(); return; }
  if (act === 'claim-check') { const wid = a.dataset.wid; S.checking = true; S.checkMsg = ''; (curRoute() === 'dashboard' ? renderKeep : cfRefresh)(false);
    (async () => { try { const r = await fetch('/api/claim/check', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: await accessToken() }, body: JSON.stringify({ company: wid }) }); const d = await r.json().catch(() => ({}));
        S.checkMsg = d.message || d.error || 'Something went wrong. Please try again.'; if (d.verified) { toast('Verified. Your company page is yours to manage.', 5000); S.myClaims = undefined; await loadData(true); } }
      catch (e) { S.checkMsg = 'Something went wrong. Please try again.'; }
      S.checking = false; if (curRoute() === 'dashboard') renderKeep(); else cfRefresh(false); })(); return; }
  if (act === 'claim-plan') { S.dashPlanWid = S.dashPlanWid === a.dataset.wid ? '' : a.dataset.wid; renderKeep(); return; }
  if (act === 'pay-start') { const c = BYWID[a.dataset.wid]; if (c) startAutopay(c, ['plus', 'business'].includes(a.dataset.plan) ? a.dataset.plan : 'basic'); return; }
  if (act === 'pay-cancel') { const c = BYWID[a.dataset.wid]; if (!c || !window.confirm('Stop ' + c.name + '’s plan from renewing?')) return; (async () => { PAY.err = ''; try { await payApi('cancel', { company: c.wid }); toast('Your plan won’t renew.'); await loadData(true); await loadPay(c, true); } catch (e) { PAY.err = e.message; payRedraw(); } })(); return; }
  if (act === 'dash-tab') { S.dashTab = a.dataset.tab; if (curRoute() === 'dashboard') { e.preventDefault(); render(); } return; }
  if (act === 'goto-plans') { S.scrollTo = 'plans'; if (curRoute() === 'list') { e.preventDefault(); render(); } return; }
  if (act === 'add-cat') { S.addCat = a.dataset.cat; return; }
  if (act === 'add-prefill') { S.addPrefill = a.dataset.name || ''; return; }
  if (act === 'cotab-link') { S.returnTab = a.dataset.tab; return; }
  if (act === 'htab') { S.heroTab = a.dataset.tab; document.querySelectorAll('.htabs button').forEach(b => b.setAttribute('aria-pressed', b === a)); const box = document.getElementById('hero-form-box'); if (box) { box.innerHTML = heroForm(); const i = box.querySelector('input'); if (i) i.focus(); } return; }
  if (act === 'rate') { S.rating = +a.dataset.n; const f = document.getElementById('review-form'); const keep = { t: f['r-title'].value, b: f['r-body'].value, d: f['r-date'].value }; render(); const g = document.getElementById('review-form'); g['r-title'].value = keep.t; g['r-body'].value = keep.b; g['r-date'].value = keep.d; g.querySelector(`[data-n="${S.rating}"]`).focus(); }
  if (act === 'jump') { e.preventDefault(); const el = document.getElementById(a.dataset.to); if (el) { el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); const fo = a.dataset.focus && document.getElementById(a.dataset.focus); if (fo) fo.focus({ preventScroll: true }); } }
  if (act === 'job-pay') { if (S.jobPending) { addJob(S.jobPending, true); S.jobPending = null; render(); toast(`Paid ₹${EXTRA_JOB} (demo). Job posted for ${JOB_DAYS} days.`); } }
  if (act === 'job-cancel') { S.jobPending = null; render(); }
  if (act === 'job-close') { const j = JOBS.find(x => x.id === a.dataset.id); if (j) { j.closed = true; store.set('tn_jobs', JOBS); render(); toast('Job post closed'); } }
  if (act === 'join-login') { S.returnTo = 'join-team-' + a.dataset.token; S.notice = 'Log in or create an account to join your company’s team.'; return; }
  if (act === 'biz-send') { const c = BYWID[a.dataset.wid]; const emails = emailsIn(BIZ.list); if (!c || !emails.length || !BIZ.full) return;
    if (!window.confirm(`Send ${emails.length} review invitation${emails.length === 1 ? '' : 's'} to your ${BIZ.kind === 'employee' ? 'employees' : 'customers'}?`)) return;
    (async () => { BIZ.busy = 'send'; BIZ.err = ''; BIZ.msg = ''; renderKeep();
      try { const d = await bizApi('invite/send', { company: c.wid, kind: BIZ.kind, emails }); BIZ.msg = `Sent ${d.sent} invitation${d.sent === 1 ? '' : 's'}.${d.skippedRecent ? ` ${d.skippedRecent} skipped: invited in the last 90 days.` : ''}${d.skippedOptOut ? ` ${d.skippedOptOut} skipped: asked not to be invited.` : ''}${d.invalid ? ` ${d.invalid} weren’t valid addresses.` : ''}`; BIZ.list = ''; BIZ.full = false; BIZ.invite = await bizApi('invite/status', { company: c.wid }).catch(() => BIZ.invite); }
      catch (err) { BIZ.err = err.message; }
      BIZ.busy = ''; renderKeep(); })(); return; }
  if (act === 'biz-report') { const c = BYWID[a.dataset.wid]; if (!c) return; downloadCsv(c.id.slice(3) + '-monthly-report.csv', [['Month', 'Customer reviews', 'Customer average', 'Employee reviews', 'Employee average', 'Would recommend (%)', 'Reviews you replied to'], ...monthRows(c).map(r => [r.label, r.cn, r.ca === null ? '' : r.ca.toFixed(1), r.en, r.ea === null ? '' : r.ea.toFixed(1), r.rec === null ? '' : r.rec, r.replied])]); return; }
  if (act === 'biz-export') { const c = BYWID[a.dataset.wid]; if (!c) return; const all = reviewsFor(c.id).map(r => ['Customer', r.date, r.rating, r.title, r.body, '', '', r.name, r.reply]).concat(empData(c.id).reviews.map(r => ['Employee', r.date, r.rating, r.title, r.pros, r.cons, r.rec === 'yes' ? 'Yes' : 'No', r.named ? r.name : 'Anonymous', r.reply])); downloadCsv(c.id.slice(3) + '-reviews.csv', [['Type', 'Month', 'Rating', 'Title or job title', 'Review or pros', 'Cons', 'Would recommend', 'Reviewer', 'Your reply'], ...all]); return; }
  if (act === 'biz-loc-add' || act === 'biz-loc-save') {
    const rows = []; document.querySelectorAll('#biz-locs .locrow').forEach(row => { const v = k => (row.querySelector(`[data-k="${k}"]`) || {}).value || ''; rows.push({ name: v('name').trim(), address: v('address').trim(), phone: v('phone').trim() }); });
    const c = BYID[S.user && S.user.coId]; if (!c) return;
    if (act === 'biz-loc-add') { c.raw.locations = rows.concat([{}]).slice(0, LOCATIONS_MAX); renderKeep(); return; }
    const locs = rows.filter(l => l.name).slice(0, LOCATIONS_MAX); if (saveProf(c.id, { locations: locs })) toast(locs.length ? 'Branches saved.' : 'Branches removed.'); renderKeep(); return; }
  if (act === 'biz-team-invite') { const c = BYWID[a.dataset.wid]; if (!c) return; (async () => { BIZ.busy = 'team'; renderKeep(); try { const d = await bizApi('team/invite', { company: c.wid }); BIZ.link = d.link; } catch (err) { toast(err.message, 5000); } BIZ.busy = ''; renderKeep(); })(); return; }
  if (act === 'biz-team-remove') { const c = BYWID[a.dataset.wid]; if (!c || !window.confirm('Remove this person from your team? They won’t be able to manage the page any more.')) return; (async () => { try { await bizApi('team/remove', { company: c.wid, member: a.dataset.member }); toast('Removed from the team.'); await loadData(true); await loadBiz(c, true); } catch (err) { toast(err.message, 5000); } })(); return; }
  if (act === 'card-png') { cardPng(a.dataset.slug).catch(() => toast('Couldn’t make the image. Try again, or use the image link.')); return; }
  if (act === 'copy-text') { const txt = a.dataset.text; try { navigator.clipboard.writeText(txt).then(() => toast('Copied'), () => toast('Select the email and copy it')); } catch (err) { toast('Select the email and copy it'); } }
  if (act === 'blogcat') { S.blogCat = a.dataset.cat; render(); }
  if (act === 'pitch-again') { S.pitchSent = false; render(); }
  if (act === 'contact-again') { S.contactSent = false; render(); }
  if (act === 'logout') { S.user = null; store.set('tn_user', null); toast('Logged out'); go('home'); }
  if (act === 'auth-back') { S.auth[a.dataset.type].step = 1; render(); document.getElementById('l-email').focus(); }
  if (act === 'jump-write') { e.preventDefault(); if (S.coTab !== 'customers') { CO_FORMS.forEach(id => { const s = snapForm(id); if (s) S.formCache[id] = s; }); S.coTab = 'customers'; render(); restoreForm(S.formCache['review-form']); } const f = document.getElementById('review-form'); f.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); f.querySelector('[data-n="1"]').focus({ preventScroll: true }); }
  if (act === 'cotab') {
    CO_FORMS.forEach(id => { const s = snapForm(id); if (s) S.formCache[id] = s; });
    S.coTab = a.dataset.tab; render(); CO_FORMS.forEach(id => restoreForm(S.formCache[id]));
    const b = document.getElementById('tab-' + S.coTab); if (b) b.focus();
  }
  if (act === 'jump-emp') {
    e.preventDefault();
    if (S.coTab !== 'employees') { CO_FORMS.forEach(id => { const s = snapForm(id); if (s) S.formCache[id] = s; }); S.coTab = 'employees'; render(); CO_FORMS.forEach(id => restoreForm(S.formCache[id])); }
    const f = document.getElementById('emp-form') || document.getElementById('emp-gate');
    if (f) { f.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); const t = f.querySelector('select,input,button'); if (t) t.focus({ preventScroll: true }); }
  }
  if (act === 'erate') {
    S.emp[a.dataset.k] = +a.dataset.n; renderKeep();
    const b = document.getElementById(`e-${a.dataset.k}-${a.dataset.n}`); if (b) b.focus();
  }
  if (act === 'gate-login') {
    const c = BYID[curRoute()]; if (!c) return;
    S.returnTo = c.id; S.returnTab = S.coTab;
    S.notice = 'Log in to post. You can stay anonymous or use your name, and your email is never shown.';
    go('login'); window.scrollTo(0, 0);
  }
  if (act === 'del-emp') {
    const d = EMP[a.dataset.id]; const kind = a.dataset.kind; const i = +a.dataset.idx;
    if (d && d[kind] && d[kind][i] && isMine(d[kind][i])) { d[kind].splice(i, 1); store.set('tn_emp', EMP); renderKeep(); toast(kind === 'salaries' ? 'Salary removed' : kind === 'interviews' ? 'Interview removed' : 'Review removed'); }
  }
  if (act === 'del-review') { const id = a.dataset.id; (REVIEWS[id] || []).splice(+a.dataset.idx, 1); store.set('tn_reviews', REVIEWS); render(); toast('Review removed'); }
  if (act === 'claim') { const c = BYID[a.dataset.id] || COS.find(x => x.name === a.dataset.name); S.cf = newCf();
    if (c && isClaimed(c)) { S.reqCo = c.id; S.listStep = 'req'; } else if (c) { S.listData = { mode: 'claim', coId: c.id, name: c.name, web: c.web, cat: c.cat, country: c.country, plan: S.listData.plan }; S.listStep = 1; } else { S.listData = { mode: 'new', name: a.dataset.name || '', plan: S.listData.plan }; S.listStep = 1; }
    S.flow = c ? 'claim' : 'list'; S.scrollTo = 'list-form-area'; if (curRoute() === (c ? 'claim' : 'list')) { e.preventDefault(); render(); } }
  if (act === 'cf-claim') { const c = BYID[a.dataset.id]; S.cf = newCf(); if (isClaimed(c)) { S.reqCo = c.id; S.listStep = 'req'; } else { S.listData = { mode: 'claim', coId: c.id, name: c.name, web: c.web, cat: c.cat, country: c.country, plan: S.listData.plan }; S.listStep = 1; } cfRefresh(); return; }
  if (act === 'cf-request') { S.reqCo = a.dataset.id; S.listStep = 'req'; cfRefresh(); return; }
  if (act === 'cf-new') { const q = (S.cfQ || '').trim(); S.listData = { mode: 'new', name: q.includes('.') ? '' : q, web: q.includes('.') ? q : '', plan: S.listData.plan }; S.cf = newCf(); S.listStep = 1; cfRefresh(); return; }
  if (act === 'cf-restart') { S.listStep = 0; S.listData = { plan: S.listData.plan }; cfRefresh(); return; }
  if (act === 'cf-edit') { S.listStep = 1; S.cf.codeSent = false; cfRefresh(); return; }
  if (act === 'cf-back-verify') { S.listStep = 2; cfRefresh(); return; }
  if (act === 'cf-method') { S.cf.method = a.dataset.m; cfRefresh(false); return; }
  if (act === 'pick-plan' && curRoute() !== 'list') { e.preventDefault(); S.listData = { ...(S.listData || {}), plan: a.dataset.plan }; S.flow = 'list'; S.scrollTo = 'list-form-area'; navigate('list'); return; }
  if (act === 'pick-plan') { e.preventDefault(); S.listData = { ...S.listData, plan: a.dataset.plan }; render(); const el = document.getElementById('list-form-area'); el.scrollIntoView({ behavior: 'smooth' }); const r = document.querySelector(`input[name=plan][value=${a.dataset.plan}]`); if (r) r.checked = true; return; }
  if (act === 'to-form') { e.preventDefault(); document.getElementById('list-form-area').scrollIntoView({ behavior: 'smooth' }); const f = document.getElementById('b-name'); if (f) f.focus({ preventScroll: true }); }
  if (act === 'list-back') { S.listStep = 1; render(); document.getElementById('list-form-area').scrollIntoView(); }
  if (act === 'clear-filters') { S.catFilter = { country: '', text: '', sort: 'name' }; render(); }
  if (act === 'tab') { S.dashTab = a.dataset.tab; render(); }
  if (act === 'copy') {
    const inp = document.getElementById('share-link');
    const done = () => { S.copied = true; a.textContent = 'Copied'; toast('Link copied'); };
    try { navigator.clipboard.writeText(inp.value).then(done, () => { inp.select(); toast('Press Ctrl+C or ⌘C to copy'); }); } catch (err) { inp.select(); toast('Press Ctrl+C or ⌘C to copy'); }
  }
});
document.addEventListener('change', e => {
  if (e.target.matches && e.target.matches('[data-rvsort]')) { S.rvSort = e.target.value; renderKeep(); return; }
  if (e.target.matches && e.target.matches('[data-ersort]')) { S.erSort = e.target.value; renderKeep(); return; }
  if (e.target.matches && e.target.matches('[data-dashco]')) { S.dashCo = e.target.value; render(); return; }
  const inp = e.target; if (!inp.matches || !inp.matches('input[type=file][data-up]') || !S.user || !S.user.coId) return;
  const kind = inp.dataset.up, id = S.user.coId; const P = cprof(BYID[id]); const room = 10 - P.photos.filter(x => x.src).length;
  const files = [...inp.files].filter(f => /^image\//.test(f.type)).slice(0, kind === 'photos' ? Math.max(0, room) : 1); if (!files.length) { toast('Choose a JPG or PNG image.'); return; }
  Promise.all(files.map(f => shrinkImg(f, kind === 'logo' ? 320 : kind === 'cover' ? 1600 : 1100))).then(urls => {
    const own = {};
    if (kind === 'photos') own.photos = P.photos.filter(x => x.src).concat(urls.map(src => ({ src }))).slice(0, 10); else own[kind] = urls[0];
    if (!saveProf(id, own)) { toast('That image is too large for this prototype. Try a smaller one.'); return; }
    render(); toast(kind === 'photos' ? `${urls.length} photo${urls.length === 1 ? '' : 's'} added` : kind === 'logo' ? 'Logo updated' : 'Cover updated');
  }).catch(() => toast('Could not read that image. Try a JPG or PNG.'));
});
document.addEventListener('submit', e => {
  const f = e.target; e.preventDefault();
  if (f.id === 'hero-jobs-form') { const what = f['hj-what'].value.trim(), where = f['hj-where'].value.trim(); S.jobFilter = { q: [what, where].filter(Boolean).join(' '), type: '', mode: '' }; navigate('jobs'); return; }
  if (f.id === 'hero-search-form' && S.heroTab === 'salaries') { const q = f.querySelector('input').value.trim().toLowerCase(); document.querySelectorAll('.sugg').forEach(b => b.hidden = true);
    const m = q && (COS.find(c => c.name.toLowerCase() === q || c.web === q) || COS.find(c => c.name.toLowerCase().startsWith(q)));
    if (m) { S.returnTab = 'salaries'; navigate(m.id); } else runSearch(q); return; }
  if (f.id === 'top-search-form' || f.id === 'hero-search-form' || f.id === 'page-search-form') { const inp = f.querySelector('input'); document.querySelectorAll('.sugg').forEach(b => b.hidden = true); runSearch(inp.value); return; }
  if (f.id === 'emp-form' || f.id === 'sal-form' || f.id === 'int-form') {
    if (reviewBlock()) { toast('Company accounts can’t write reviews.'); return; }
    const c = BYID[curRoute()]; if (!c || !S.user || S.user.type !== 'reviewer') return;
    const v = id => document.getElementById(id).value.trim();
    const check = list => { let first = null; list.forEach(([k, bad, foc]) => { document.getElementById('err-' + k).hidden = !bad; const el = document.getElementById(k); if (el) el.setAttribute('aria-invalid', bad ? 'true' : 'false'); if (bad && !first) first = foc || k; }); if (first) document.getElementById(first).focus(); return !first; };
    const done = (kind, item, msg, headId) => { empBucket(c.id)[kind].unshift({ by: S.user.email, ...item, verified: workVerified(c), date: monthNow() }); store.set('tn_emp', EMP); delete S.formCache[f.id]; render(); toast(msg); const h = document.getElementById(headId); if (h) h.scrollIntoView({ block: 'start' }); };
    if (f.id === 'emp-form') {
      const rec = f.querySelector('input[name="e-rec"]:checked');
      if (!check([['e-title', !v('e-title')], ['e-overall', !S.emp.overall, 'e-overall-1'], ['e-pros', v('e-pros').length < 20], ['e-cons', v('e-cons').length < 20], ['e-rec', !rec, 'e-rec-yes']])) return;
      const sub = {}; SUBS.forEach(([k]) => { sub[k] = S.emp[k]; });
      const show = (f.querySelector('input[name="e-show"]:checked') || {}).value || 'anon';
      const item = { status: v('e-status'), title: v('e-title'), loc: v('e-loc'), years: v('e-years'), rating: S.emp.overall, sub, pros: v('e-pros'), cons: v('e-cons'), advice: v('e-advice'), rec: rec.value, named: show === 'named', name: show === 'named' ? displayName() : '' };
      S.empShow = show;
      S.emp = EMP_ZERO(); done('reviews', item, 'Review posted', 'er-h');
    }
    if (f.id === 'sal-form') {
      const amt = parseFloat(v('s-amount'));
      if (!check([['s-title', !v('s-title')], ['s-amount', !(amt > 0)]])) return;
      done('salaries', { title: v('s-title'), loc: v('s-loc'), amount: amt, cur: v('s-cur'), period: v('s-period'), exp: v('s-exp') }, 'Salary shared', 'sl-h');
    }
    if (f.id === 'int-form') {
      if (!check([['i-role', !v('i-role')], ['i-process', v('i-process').length < 20]])) return;
      done('interviews', { role: v('i-role'), outcome: v('i-outcome'), diff: v('i-diff'), exp: v('i-exp'), process: v('i-process'), questions: v('i-questions') }, 'Interview shared', 'in-h');
    }
  }
  if (f.id === 'job-form') {
    const v = id => f.querySelector('#' + id).value.trim();
    const d = { title: v('j-title'), loc: v('j-loc'), type: v('j-type'), mode: v('j-mode'), pay: v('j-pay'), desc: v('j-desc'), apply: v('j-apply') };
    const okApply = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.apply) || /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(d.apply);
    const errs = { 'j-title': !d.title, 'j-loc': !d.loc, 'j-desc': d.desc.length < 50, 'j-apply': !okApply, 'j-agree': !f.querySelector('#j-agree').checked };
    let first = null; Object.entries(errs).forEach(([k, bad]) => { document.getElementById('err-' + k).hidden = !bad; if (bad && !first) first = k; });
    if (first) { f.querySelector('#' + first).focus(); return; }
    if (!LAUNCH && postsThisMonth(S.user.name) >= FREE_JOBS) { S.jobPending = d; render(); return; }
    addJob(d, false); render(); toast(`Job posted. It stays live for ${JOB_DAYS} days.`);
  }
  if (f.id === 'employer-form') {
    const why = f.querySelector('#ep-why').value.trim();
    const bad = why.length < 40; document.getElementById('err-ep-why').hidden = !bad; if (bad) { f.querySelector('#ep-why').focus(); return; }
    const NE = { sample: false, why, benefits: [...f.querySelectorAll('input[id^="ep-b"]:checked')].map(i => i.value), size: f.querySelector('#ep-size').value, hiring: f.querySelector('#ep-hiring').checked, roles: '' };
    if (S.user && S.user.coId) saveProf(S.user.coId, { employerPage: NE }); else { EMPLOYER = NE; store.set('tn_employer', EMPLOYER); } render(); toast('Employer page saved');
  }
  if (f.id === 'list-form') {
    const v = id => (f[id] ? f[id].value.trim() : '');
    const claim = S.listData.mode === 'claim';
    const d = { ...S.listData, person: v('b-person'), role: f['b-role'].value, email: v('b-email'), phone: v('b-phone'), agree: f['b-agree'].checked };
    if (!claim) Object.assign(d, { mode: 'new', name: v('b-name'), web: v('b-web'), cat: f['b-cat'].value, country: f['b-country'].value, city: v('b-city'), type: f['b-type'].value });
    const errs = { 'b-person': !d.person, 'b-email': !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email), 'b-phone': d.phone.replace(/\D/g, '').length < 8, 'b-agree': !d.agree };
    if (!claim) Object.assign(errs, { 'b-name': !d.name, 'b-web': !/^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(d.web), 'b-cat': !d.cat, 'b-city': !d.city });
    const errEl = k => document.getElementById('err-' + k);
    if (!claim && !errs['b-web']) { const W2 = webs2(); const dup = COS.find(c => domOf(c.web) === domOf(d.web) || W2[c.id] === domOf(d.web) || c.id === 'co-' + slug(d.name)); if (dup) { errs['b-web'] = true; errEl('b-web').innerHTML = `${esc(dup.name)} already has a page. <button class="link" type="button" data-act="cf-claim" data-id="${dup.id}">${isClaimed(dup) ? 'Request access' : 'Claim it instead'}</button>`; } else errEl('b-web').textContent = 'Enter your website, like yourcompany.com.'; }
    let first = null; Object.entries(errs).forEach(([k, bad]) => { const el = errEl(k); if (el) el.hidden = !bad; if (bad && !first) first = k; });
    S.listData = d;
    if (first) { f[first].focus(); return; }
    S.cf = newCf(); S.listStep = 2; cfRefresh();
  }
  if (f.id === 'cprof-form' && S.user && S.user.coId) {
    const g = id => f.querySelector('#' + id); const val = id => g(id) ? g(id).value.trim() : '';
    const about = val('cp-about'), yr = val('cp-founded'), y = +yr, now = new Date().getFullYear();
    const eA = about.length < 60, eY = !!yr && (!/^\d{4}$/.test(yr) || y < 1900 || y > now);
    document.getElementById('err-cp-about').hidden = !eA; document.getElementById('err-cp-founded').hidden = !eY;
    if (eA) { g('cp-about').focus(); return; } if (eY) { g('cp-founded').focus(); return; }
    const w2 = val('cp-web2').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, ''); const e2 = document.getElementById('err-cp-web2');
    const main = domOf(BYID[S.user.coId].web), other = w2 && COS.find(x => x.id !== S.user.coId && domOf(x.web) === domOf(w2));
    const m2 = !w2 ? '' : !/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/.test(w2) ? 'Enter a website like yourcompany.in' : domOf(w2) === main ? 'That is already your main website.' : other ? `That website belongs to ${other.name} on Know The Company. Contact us if it's yours.` : '';
    e2.textContent = m2; e2.hidden = !m2; if (m2) { g('cp-web2').focus(); return; }
    const id = S.user.coId, own = {}; const list = s => s.split(',').map(x => x.trim()).filter(Boolean);
    Object.assign(own, { about, founded: yr, size: val('cp-size') || own.size, hq: val('cp-hq'), services: list(val('cp-services')).slice(0, 8), hours: val('cp-hours'), web2: w2 });
    if (g('cp-phone')) Object.assign(own, { phone: val('cp-phone'), email: val('cp-email'), address: val('cp-address'), socials: list(val('cp-socials')) });
    if (!saveProf(id, own)) { toast('Could not save. Your browser storage is full.'); return; }
    render(); toast('Company page saved'); return;
  }
  if (f.id === 'cp-upd-form' && S.user && S.user.coId) {
    const ta = f.querySelector('#cp-upd'), txt = ta.value.trim(), err = document.getElementById('err-cp-upd');
    const id = S.user.coId, P = cprof(BYID[id]);
    const msg = txt.length < 20 ? 'Write at least 20 characters.' : P.updates.filter(u => u.date === monthNow()).length >= 2 ? 'You can post 2 updates a month on Plus.' : '';
    err.textContent = msg; err.hidden = !msg; if (msg) { ta.focus(); return; }
    const own = {}; own.updates = [{ date: monthNow(), text: txt }].concat(P.updates).slice(0, 6);
    saveProf(id, own); render(); toast('Update posted'); return;
  }
  if (f.classList.contains('oreply') && S.user && S.user.coId) {
    const ta = f.querySelector('textarea'), txt = ta.value.trim(), er = f.querySelector('.err'); er.hidden = !!txt;
    if (!txt) { ta.focus(); return; }
    const id = S.user.coId, i = +f.dataset.idx, c = BYID[id];
    const r = f.dataset.kind === 'c' ? REVIEWS[id][i] : EMP[id].reviews[i]; if (!r || !c) return;
    r.reply = txt; render();
    insertItem('OwnerContent', { company: c.wid, kind: 'reply', review: r.wid, text: txt })
      .then(it => { r.replyWid = it._id; toast('Reply posted'); })
      .catch(e => { r.reply = ''; render(); toast('Could not post your reply: ' + errMsg(e)); });
    return;
  }
  if (f.id === 'reply-form') {
    const t = f['reply-text'].value.trim(); document.getElementById('err-reply').hidden = !!t;
    if (!t) { f['reply-text'].focus(); return; }
    S.dashReplied = true; S.dashReply = t; render(); toast('Reply posted');
  }
});

/* ---------- boot ---------- */
{ let e = ''; try { e = sessionStorage.getItem('ktc_auth_err') || ''; sessionStorage.removeItem('ktc_auth_err'); } catch (x) {} if (e) S.auth = { ...S.auth, error: e }; }
const fromCache = loadCached();
syncUser(getMemberState());
render();
/* Clean page addresses: fix the address bar, point #route links at clean addresses, handle clicks in the app. */
new MutationObserver(ms => { for (const m of ms) m.addedNodes.forEach(n => { if (n.nodeType === 1) realLinks(n); }); }).observe(document.body, { childList: true, subtree: true });
realLinks(document.body);
document.addEventListener('click', e => {
  if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest && e.target.closest('a[href]'); if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
  const href = a.getAttribute('href'); if (!href || href === '#' || /^(mailto|tel|javascript):/i.test(href)) return;
  const r = routeOfHref(href); if (!r || !isRoute(r)) return;
  e.preventDefault();
  if (r === curRoute()) { canonicalUrl(); render(); window.scrollTo(0, 0); } else navigate(r);
});
canonicalUrl();
subscribeMember(s => { syncUser(s); render(); loadMine().then(ch => { if (ch) renderKeep(); }).catch(() => {}); });
loadData().then(changed => {
  if (!changed) return;
  /* fresh data arrived after a cached draw: redraw, unless someone is typing in a form right now */
  const a = document.activeElement;
  if (fromCache && a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
  render();
});
