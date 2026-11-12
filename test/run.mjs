// Headless render test: the real app.js against mocked Wix modules.
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const html = fs.readFileSync('../index.html', 'utf8').replace('<script type="module" src="/app.js"></script>', '');
const dom = new JSDOM(html, { url: 'https://example.test/', pretendToBeVisual: true });
const g = globalThis;
for (const k of ['window', 'document', 'location', 'localStorage', 'navigator', 'HTMLElement', 'Node', 'CustomEvent', 'Event', 'getComputedStyle', 'matchMedia', 'URLSearchParams', 'MutationObserver', 'history', 'URL', 'PopStateEvent']) {
  try { g[k] = dom.window[k]; } catch (e) {}
}
g.window.matchMedia = g.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
g.window.scrollTo = () => {};
g.window.HTMLElement.prototype.scrollIntoView = function () {};
g.window.confirm = () => true;
g.confirm = () => true;
g.requestAnimationFrame = f => setTimeout(f, 0);
/* The site's own server, faked for the Business tools: everything else has no network. */
g.__api = [];
g.fetch = g.window.fetch = async (u, o = {}) => {
  const url = String(u);
  if (url.startsWith('/api/invite/') || url.startsWith('/api/team/') || url.startsWith('/api/pay/status')) {
    const body = JSON.parse(o.body || '{}'); g.__api.push([url, body]);
    const ok = d => new Response(JSON.stringify(d), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (url === '/api/invite/status') return ok({ email: true, month: '2026-11', sent: 10, limit: 1000 });
    if (url === '/api/invite/send') return ok({ ok: true, sent: body.emails.length, skippedRecent: 0, skippedOptOut: 0, invalid: 0, left: 990 - body.emails.length });
    if (url === '/api/team/list') return ok({ max: 5, members: [{ id: 'm1', name: 'Owner', you: true }, { id: 'm11', name: 'Teammate Tara' }] });
    if (url === '/api/team/invite') return ok({ ok: true, link: 'https://www.knowthecompany.com/#join-team-' + 'a'.repeat(48), days: 7 });
    if (url === '/api/pay/status') return ok({ ready: true, plan: 'business', planEndsAt: '2027-11-12T00:00:00Z', billing: [] });
  }
  throw new Error('no network in tests: ' + url);
};
for (const id of ['a-cat', 'a-cc', 'a-name', 'a-web', 'b-agree', 'b-cat', 'b-country', 'b-role', 'b-type', 'hj-what', 'hj-where', 'l-code', 'l-email', 'l-pass', 'r-body', 'r-date', 'r-role', 'r-title', 'reply-text']) Object.defineProperty(g.window.HTMLFormElement.prototype, id, { get() { return this.querySelector('#' + id); }, configurable: true });

// CSV -> company items, plus a few published reviews of each type
const csv = fs.readFileSync('../data/companies-for-wix-cms.csv', 'utf8').trim().split(/\r?\n/);
const parse = line => { const out = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
const hdr = parse(csv[0]);
const companies = csv.slice(1).map(l => { const r = Object.fromEntries(hdr.map((h, i) => [h, parse(l)[i]])); return { _id: r.website, title: r.title, slug: r.slug, website: r.website, category: r.category, country: r.country, bio: r.bio, addedBy: 'seed', claimStatus: 'none', plan: 'none', _owner: 'c0f544a7-207e-490b-b7d9-830ef39f49c7' }; });
// one verified Plus company to exercise the owner-written sections
// A company a member inserted with team-only fields filled in; nobody on the team has edited it.
companies.push({ _id: 'pendingco.com', title: 'PENDINGCO', slug: 'pendingco', website: 'pendingco.com', category: 'Fintech & Banking', country: 'IN', bio: '', addedBy: 'owner', claimStatus: 'none', plan: 'none', _owner: 'm8', _createdDate: '2026-11-12T00:00:00Z', _updatedDate: '2026-11-12T00:00:00Z' });
companies.push({ _id: 'fakeco.com', title: 'Fakeco', slug: 'fakeco', website: 'fakeco.com', category: 'Fintech & Banking', country: 'IN', bio: 'Inserted by a member.', addedBy: 'reviewer', claimStatus: 'verified', verifiedVia: 'email', plan: 'plus', ownerMemberIds: ['m9'], employerPage: { why: 'FAKE EMPLOYER PAGE text that must never show.', benefits: [], hiring: true }, _owner: 'm9', _createdDate: '2026-11-09T00:00:00Z', _updatedDate: '2026-11-09T00:00:00Z' });
companies.find(c => c._id === 'razorpay.com').logo = 'https://static.wixstatic.com/media/c0f544_test~mv2.png';
Object.assign(companies.find(c => c._id === 'razorpay.com'), { claimStatus: 'verified', verifiedVia: 'email', plan: 'business', about: 'About text', founded: '2014', teamSize: '201–1,000 people', services: ['Payments'], phone: '+91 80000 00000', publicEmail: 'x@y.z', employerPage: { why: 'Why work here text, long enough.', benefits: ['Health insurance'], size: '201–1,000 people', hiring: true }, ownerMemberIds: ['m1'] });
const reviews = [
  { _id: 'r1', _owner: 'm4', _createdDate: '2026-11-01T00:00:00Z', _updatedDate: '2026-11-01T01:00:00Z', company: 'razorpay.com', type: 'customer', displayName: 'Asha K.', rating: 4, title: 'Quick settlements', body: 'Payments settled in two days and support answered quickly.' },
  { _id: 'r2', _owner: 'm2', _createdDate: '2026-11-02T00:00:00Z', _updatedDate: '2026-11-02T01:00:00Z', company: 'razorpay.com', type: 'employee', anonymous: true, rating: 3, subRatings: { pay: 3 }, pros: 'Good people and learning culture here.', cons: 'Long hours during launches, every quarter.', recommend: 'yes', employmentStatus: 'Current employee', jobTitle: 'Engineer', tenure: '1–3 years' },
  { _id: 'r3', _owner: 'm2', _createdDate: '2026-11-03T00:00:00Z', _updatedDate: '2026-11-03T01:00:00Z', company: 'notion.com', type: 'interview', jobTitle: 'Designer', interviewOutcome: 'No offer', interviewDifficulty: 'Hard', interviewExperience: 'Neutral', body: 'Three rounds over two weeks, friendly panel.' },
  { _id: 'r4', _owner: 'm3', _createdDate: '2026-11-04T00:00:00Z', _updatedDate: '2026-11-04T01:00:00Z', company: 'zepto.com', type: 'customer', displayName: 'Ravi', rating: 5, title: 'Fast', body: 'Delivered in ten minutes, everything fresh and well packed.' },
  { _id: 'r6', _owner: 'm1', _createdDate: '2026-11-06T00:00:00Z', _updatedDate: '2026-11-06T01:00:00Z', company: 'zepto.com', type: 'customer', displayName: 'Owner', rating: 1, title: 'OWNER REVIEW', body: 'OWNER REVIEW written by a company account, must never show.' },
  { _id: 'r7', _owner: 'm7', _createdDate: '2026-11-06T00:00:00Z', _updatedDate: '2026-11-06T00:00:00Z', _publishStatus: 'PUBLISHED', company: 'razorpay.com', type: 'customer', displayName: 'Sneaky', rating: 5, title: 'Posted just now', body: 'Posted by its writer, goes live straight away.', proofChecked: true, workEmailVerified: true, reply: 'FAKE REPLY stored on the review by its writer.' },
  { _id: 'r8', _owner: 'c0f544a7-207e-490b-b7d9-830ef39f49c7', _createdDate: '2026-11-10T00:00:00Z', _updatedDate: '2026-11-10T00:00:00Z', company: 'razorpay.com', type: 'customer', displayName: 'Meera J.', rating: 4, title: 'Old but good', body: 'Imported review from email feedback, confirmed with the reviewer.', importedFrom: 'Email or message', originalDate: '2025-03-10' },
  { _id: 'r9', _owner: 'm4', _createdDate: '2026-10-01T00:00:00Z', _updatedDate: '2026-10-01T00:00:00Z', company: 'razorpay.com', type: 'customer', displayName: 'Asha K.', rating: 1, title: 'SECOND REVIEW', body: 'An older second review by the same person, must not count.' },
  { _id: 'r10', _owner: 'm8', _createdDate: '2026-11-07T00:00:00Z', _updatedDate: '2026-11-07T00:00:00Z', company: 'razorpay.com', type: 'customer', displayName: 'Huge', rating: 1000, title: 'HUGE RATING', body: 'A rating outside 1 to 5 sent straight to Wix, must not count.' },
  { _id: 'r5', _owner: 'm3', _createdDate: '2026-11-05T00:00:00Z', _updatedDate: '2026-11-05T01:00:00Z', company: 'zeptonow.com', type: 'customer', displayName: 'Ravi', rating: 5, title: 'Fast again', body: 'Delivered in ten minutes, everything fresh and well packed.' }
];
const ownerContent = [
  { _id: 'oc1', _owner: 'm1', _updatedDate: '2026-11-07T00:00:00Z', company: 'razorpay.com', kind: 'profile', data: { about: 'Owner written about text for the profile page.', hours: 'Mon to Fri' } },
  { _id: 'oc2', _owner: 'm9', _updatedDate: '2026-11-08T00:00:00Z', company: 'razorpay.com', kind: 'profile', data: { about: 'NOT AN OWNER: this must never show.' } },
  { _id: 'oc3', _owner: 'm1', company: 'razorpay.com', kind: 'reply', review: 'r1', text: 'Thanks for the review, glad it helped.' },
  { _id: 'oc4', _owner: 'm1', _createdDate: '2026-11-07T00:00:00Z', company: 'razorpay.com', kind: 'photo', src: 'data:image/jpeg;base64,AAAA' }
];
const inserted = [];
g.__mock = {
  queryItems: async (col, q = {}) => {
    const f = (q.filters || [])[0];
    const all = col === 'OwnerContent' ? ownerContent.filter(it => !f || it[f.field] === f.value) : col === 'Companies' ? companies : col === 'Reviews' ? reviews : col === 'Claims' ? (globalThis.__mock.member.member && globalThis.__mock.member.member.id === 'm1' ? [{ _id: 'c1', company: 'notion.com', kind: 'claim', method: 'email', status: 'pending', _createdDate: '2026-11-06T00:00:00Z' }] : []) : [];
    const skip = q.skip || 0, limit = q.limit || 20; const items = all.slice(skip, skip + limit);
    return { items, hasNext: skip + limit < all.length, total: all.length };
  },
  insertItem: async (col, data) => { inserted.push([col, data]); return { _id: 'new', ...data }; },
  updateItem: async (col, item) => { inserted.push([col + ' update', item]); return item; },
  removeItem: async (col, id) => { inserted.push([col + ' remove', id]); return null; },
  wixRequest: async (path, opts) => { inserted.push(['wixRequest', opts.body]); if (/recovery/.test(path)) { inserted.push(['recovery', path]); return {}; } return { dataItem: { data: opts.body.dataItem.data } }; },
  WIX_CLIENT_ID: 'test-client',
  toItem: x => x, imgSrc: () => '', imgRatio: () => 1, accessToken: async () => 'Bearer test-token',
  member: { member: { id: 'm5', loginEmail: 'asha@example.com', displayName: 'Asha K.' }, loggedIn: true, loading: false, error: null }
};
let src = fs.readFileSync('../app.js', 'utf8');
const MEMBER_MOCK = { subscribeMember: fn => { globalThis.__memberFn = fn; return () => {}; }, getMemberState: () => globalThis.__mock.member, login: async () => ({ state: 'SUCCESS' }), register: async () => ({ state: 'EMAIL_VERIFICATION_REQUIRED' }), verifyEmail: async () => ({ state: 'SUCCESS' }), logout: async () => {} };
globalThis.__memberMock = MEMBER_MOCK;
src = src.replace(/import\s*\{([^}]+)\}\s*from\s*"\/js\/wix\/(items|items-core|media|client|member-store|config)\.js";?/g, (m, names, mod) => {
  const parts = names.split(',').map(x => x.trim()).filter(Boolean).map(x => { const [a, b] = x.split(/\s+as\s+/); return b ? `${a}: ${b}` : a; });
  const from = mod === 'member-store' ? 'globalThis.__memberMock' : 'globalThis.__mock';
  return `const { ${parts.join(', ')} } = ${from};`;
});
fs.writeFileSync('app.test.mjs', src);

const errors = [];
g.window.addEventListener('error', e => errors.push(String(e.error || e.message)));
process.on('unhandledRejection', e => errors.push('rejection: ' + (e && e.stack || e)));
await import('./app.test.mjs');
await new Promise(r => setTimeout(r, 200));

const app = g.document.getElementById('app');
const routes = ['home', 'categories', 'cat-fintech-and-banking', 'search', 'co-razorpay', 'co-notion', 'co-zepto', 'co-1password', 'invite-co-razorpay', 'invite-team-co-razorpay', 'add', 'claim', 'tools', 'tool-offer', 'tool-hike', 'tool-gratuity', 'tool-hra', 'tool-rate', 'why-list', 'list', 'about', 'contact', 'help', 'guidelines', 'terms', 'privacy', 'pricing', 'refunds', 'jobs', 'login', 'business-login', 'my-reviews', 'dashboard', 'write-for-us', 'sample', 'nope'];
const report = [];
for (const r of routes) {
  g.location.hash = r;
  g.window.dispatchEvent(new g.window.HashChangeEvent('hashchange'));
  await new Promise(res => setTimeout(res, 30));
  const text = app.textContent.replace(/\s+/g, ' ');
  const h1 = (app.querySelector('h1') || {}).textContent || '';
  const flags = ['PENDINGCO', 'Future Topper', 'Prototype', 'prototype', 'demo', 'Saved in this browser', 'undefined', 'NaN', '[object Object]', '[[', 'OWNER REVIEW', 'FAKE REPLY', 'SECOND REVIEW', 'HUGE RATING', '1000', 'Interviews', 'interview experience', 'Share your interview'].filter(w => text.includes(w));
  report.push(`${r.padEnd(24)} ${String(text.length).padStart(6)}  h1="${h1.trim().slice(0, 50)}" ${flags.length ? ' FLAGS:' + flags.join(',') : ''}`);
  { const hs = [...app.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(h => +h.tagName[1]); const issues = [];
    if (hs.filter(x => x === 1).length !== 1) issues.push('h1 x' + hs.filter(x => x === 1).length);
    for (let i = 1; i < hs.length; i++) if (hs[i] > hs[i - 1] + 1) issues.push(`h${hs[i - 1]}>h${hs[i]}`);
    if (hs.length && hs[0] !== 1) issues.push('starts h' + hs[0]);
    const can = (g.document.querySelector('link[rel="canonical"]') || {}).href || ''; const here = g.location.origin + g.location.pathname + g.location.hash; if (!can || can !== here) issues.push('canonical=' + can + ' url=' + here);
    if (issues.length) report.push(`   HEADINGS ${r}: ${[...new Set(issues)].join(' ')} [${hs.join('')}]`); }
}
// Text snapshots of the fixed pages, as a logged-out visitor sees them. The server puts these inside <main>
// so search engines and AI crawlers that don't run JavaScript get the whole page (astro/src/lib/page.ts).
{
  globalThis.__memberFn({ loggedIn: false, loading: false, member: null, error: null });
  const SNAP = ['about', 'contact', 'help', 'guidelines', 'terms', 'privacy', 'refunds', 'pricing', 'why-list', 'claim', 'list', 'write-for-us', 'categories', 'tools', 'tool-offer', 'tool-hike', 'tool-gratuity', 'tool-hra', 'tool-rate'];
  const KEEP = new Set(['H2', 'H3', 'H4', 'P', 'UL', 'OL', 'LI', 'A', 'STRONG', 'B', 'EM', 'I', 'SECTION', 'DIV', 'SPAN', 'SMALL', 'DL', 'DT', 'DD', 'BLOCKQUOTE', 'TABLE', 'TR', 'TD', 'TH', 'TBODY', 'THEAD', 'BR', 'DETAILS', 'SUMMARY']);
  const snaps = {};
  for (const r of SNAP) {
    g.location.hash = r; g.window.dispatchEvent(new g.window.HashChangeEvent("hashchange")); await new Promise(res => setTimeout(res, 40));
    const box = app.cloneNode(true);
    box.querySelectorAll('h1, form, button, input, select, textarea, label, svg, img, script, style, nav.crumbs, .crumbs, [hidden], [aria-hidden="true"], #cookie, .toast').forEach(el => el.remove());
    const walk = el => { for (const c of [...el.children]) { walk(c); if (!KEEP.has(c.tagName)) c.replaceWith(...c.childNodes); else { for (const at of [...c.attributes]) if (!(c.tagName === 'A' && at.name === 'href')) c.removeAttribute(at.name); if (c.tagName === 'A') { const h = c.getAttribute('href') || ''; if (!/^(\/|https:|mailto:)/.test(h) || h.startsWith('#')) c.replaceWith(...c.childNodes); } } } };
    walk(box);
    box.querySelectorAll('div, span, section').forEach(el => { if (!el.textContent.trim()) el.remove(); else el.replaceWith(...el.childNodes); });
    box.querySelectorAll('p, li, h2, h3, h4').forEach(el => { if (!el.textContent.trim()) el.remove(); });
    const html = box.innerHTML.replace(/\s+/g, ' ').replace(/> </g, '><').trim();
    snaps[r] = html;
  }
  fs.writeFileSync('../data/page-snapshots.json', JSON.stringify(snaps, null, 1));
  report.push('page snapshots: ' + Object.entries(snaps).map(([k, v]) => k + ' ' + v.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length + 'w').join(', '));
  globalThis.__memberFn(globalThis.__mock.member);
}
// a few interactions: company tabs and a customer review submission
g.location.hash = 'co-1password'; g.window.dispatchEvent(new g.window.HashChangeEvent('hashchange')); await new Promise(r => setTimeout(r, 30));
const click = sel => { const el = app.querySelector(sel); if (!el) return report.push('missing ' + sel); el.dispatchEvent(new g.window.MouseEvent('click', { bubbles: true })); };
click('[data-act="rate"][data-n="4"]');
await new Promise(r => setTimeout(r, 30));
const f = app.querySelector('#review-form');
f['r-title'].value = 'Test title'; f['r-body'].value = 'This is a long enough review body for the test.'; f.querySelector('#r-first').checked = true;
f.dispatchEvent(new g.window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise(r => setTimeout(r, 60));
click('[data-act="cotab"][data-tab="employees"]'); await new Promise(r => setTimeout(r, 30));
report.push('emp form present: ' + !!app.querySelector('#emp-form'));
// add a company
g.location.hash = 'add'; g.window.dispatchEvent(new g.window.HashChangeEvent('hashchange')); await new Promise(r => setTimeout(r, 30));
const af = app.querySelector('#add-form'); af['a-name'].value = 'Blue Lotus Sarees'; af['a-web'].value = 'https://www.bluelotus.in/';
af.dispatchEvent(new g.window.Event('submit', { bubbles: true, cancelable: true })); await new Promise(r => setTimeout(r, 60));
report.push('after add, hash=' + g.location.hash + ' path=' + g.location.pathname + ' writes=' + inserted.length);
// duplicate website is blocked before any write
g.location.hash = 'add'; g.window.dispatchEvent(new g.window.HashChangeEvent('hashchange')); await new Promise(r => setTimeout(r, 30));
const af2 = app.querySelector('#add-form'); af2['a-name'].value = 'Razor Copy'; af2['a-web'].value = 'razorpay.com';
af2.dispatchEvent(new g.window.Event('submit', { bubbles: true, cancelable: true })); await new Promise(r => setTimeout(r, 60));
report.push('after duplicate add, hash=' + g.location.hash);
// a reviewer account that has written reviews can't claim a company
const routeOf = h => h.startsWith('#') ? h.slice(1) : h.replace(/\.html$/, '').replace(/^\/(company|category|blog|tools)\/(.+)$/, (m, d, x) => ({ company: 'co-', category: 'cat-', blog: 'blog-', tools: 'tool-' })[d] + x).replace(/^\/([a-z-]+)$/, '$1');
const go = async h => { g.location.hash = h; g.window.dispatchEvent(new g.window.HashChangeEvent('hashchange')); await new Promise(r => setTimeout(r, 40)); };
await go('list');
report.push('reviewer with reviews sees claim block: ' + app.textContent.includes('This account has written reviews') + ', claim form hidden: ' + !app.querySelector('#claim-panel form'));
// switch to the company owner m1
g.__mock.member = { member: { id: 'm1', loginEmail: 'owner@razorpay.com', displayName: 'Owner' }, loggedIn: true, loading: false, error: null };
globalThis.__memberFn(g.__mock.member); await new Promise(r => setTimeout(r, 60));
await go('co-1password');
report.push('company account review form hidden: ' + !app.querySelector('#review-form') + ', block shown: ' + app.textContent.includes('Company accounts can’t write reviews'));
await go('co-razorpay'); app.querySelector('[data-act=cotab][data-tab=customers]').click(); await new Promise(r => setTimeout(r, 40));
report.push('logo shown: ' + !!app.querySelector('.cologo img[src*="wixstatic"]'));
report.push('imported label: ' + app.textContent.includes('First given via Email or message in Mar 2025'));
report.push('tab: ' + (app.querySelector('[role=tab][aria-selected=true]') || {}).textContent + ', r1 shown: ' + app.textContent.includes('Quick settlements') + ', new review live: ' + app.textContent.includes('Posted just now') + ', its own proof label shown: ' + (app.innerHTML.match(/Proof checked<\/span>/g) || []).length);
await go('co-fakeco');
report.push('member-inserted company shown as verified: ' + app.textContent.includes('Verified company') + ', fake employer page shown: ' + app.textContent.includes('FAKE EMPLOYER PAGE'));
await go('co-razorpay');
const coText = app.textContent;
report.push('owner about shown: ' + coText.includes('Owner written about text') + ', non-owner hidden: ' + !coText.includes('NOT AN OWNER') + ', owner reply shown: ' + coText.includes('Thanks for the review'));
click('[data-act="cotab"][data-tab="customers"]'); await new Promise(r => setTimeout(r, 40)); report.push('reply on customers tab: ' + app.textContent.includes('Thanks for the review'));
await go('dashboard');
report.push('dashboard tabs: ' + app.querySelectorAll('[data-act="dash-tab"]').length);
report.push('badge embeds on dashboard: ' + app.querySelectorAll('iframe[src*="badge.html?c=razorpay.com"]').length);
report.push('trust card on dashboard: ' + !!app.querySelector('img[src="/card/razorpay.svg"]') + ', download: ' + !!app.querySelector('[data-act="card-png"][data-slug="razorpay"]') + ', embed code: ' + app.innerHTML.includes('https://www.knowthecompany.com/card/razorpay.svg'));
click('[data-act="dash-tab"][data-tab="import"]'); await new Promise(r => setTimeout(r, 40));
report.push('past reviews tab: form ' + !!app.querySelector('#import-form'));
{ const imf = app.querySelector('#import-form');
  if (imf) { const set = (k, v) => { imf.querySelector('#' + k).value = v; };
    set('im-name', 'Meera J.'); set('im-email', 'meera@example.com'); set('im-rating', '4'); set('im-date', '2025-03-10'); set('im-body', 'Settlements were quick and support answered within the hour.'); imf.querySelector('#im-ok').checked = true;
    imf.dispatchEvent(new g.window.Event('submit', { bubbles: true, cancelable: true })); await new Promise(r => setTimeout(r, 60)); }
  report.push('past review sent: ' + JSON.stringify(inserted.filter(x => x[0] === 'ReviewImports').map(x => [x[1].company, x[1].status, x[1].rating]))); }
click('[data-act="dash-tab"][data-tab="plan"]'); await new Promise(r => setTimeout(r, 80));
report.push('plan tab: ' + /Plan and payments/.test(app.textContent) + ', business plan shown: ' + /Business plan/.test(app.textContent) + ', continue business: ' + !!app.querySelector('[data-act="pay-start"][data-plan="business"]') + ', plus offer (should be false): ' + !!app.querySelector('[data-act="pay-start"][data-plan="plus"]') + ', basic offer (should be false): ' + !!app.querySelector('[data-act="pay-start"][data-plan="basic"]'));
click('[data-act="dash-tab"][data-tab="business"]'); await new Promise(r => setTimeout(r, 120));
report.push('business tab: ' + /Review invitations/.test(app.textContent) + ', quota: ' + /10 of 1,000/.test(app.textContent) + ', whatsapp: ' + app.querySelectorAll('a[href^="https://wa.me/?text="]').length + ', trends: ' + /Rating trends/.test(app.textContent) + ', team: ' + /Teammate Tara/.test(app.textContent));
{ const ta = app.querySelector('#biz-list'); ta.value = 'Name,Email\nAsha,asha@example.com\nRavi,RAVI@example.com; ravi@example.com\nbad@@x'; ta.dispatchEvent(new g.window.Event('input', { bubbles: true }));
  const send = () => app.querySelector('[data-act="biz-send"]');
  report.push('invite list parsed: ' + app.querySelector('#biz-count').textContent + ', send locked until full-list box ticked: ' + send().disabled);
  const full = app.querySelector('#biz-full'); full.checked = true; full.dispatchEvent(new g.window.Event('change', { bubbles: true }));
  send().click(); await new Promise(r => setTimeout(r, 120));
  const sent = g.__api.find(x => x[0] === '/api/invite/send');
  report.push('invite request: ' + JSON.stringify(sent && sent[1]) + ', result shown: ' + /Sent 2 invitations/.test(app.textContent)); }
click('[data-act="biz-team-invite"]'); await new Promise(r => setTimeout(r, 120));
report.push('team link shown: ' + !!(app.querySelector('#biz-link') && app.querySelector('#biz-link').value.includes('#join-team-')));
{ const row = app.querySelector('#biz-locs .locrow'); row.querySelector('[data-k="name"]').value = 'Agra, Sanjay Place'; row.querySelector('[data-k="address"]').value = '12 Sanjay Place, Agra'; click('[data-act="biz-loc-save"]'); await new Promise(r => setTimeout(r, 80));
  const saved = inserted.filter(x => (x[0] === 'OwnerContent' || x[0] === 'OwnerContent update') && x[1].kind === 'profile').pop();
  report.push('branches saved: ' + JSON.stringify(saved && saved[1].data && saved[1].data.locations)); }
{ let csv = ''; const B = g.window.Blob; g.window.URL.createObjectURL = b => { b.text().then(t => { csv = t; }); return 'blob:x'; }; g.window.URL.revokeObjectURL = () => {};
  click('[data-act="biz-report"]'); await new Promise(r => setTimeout(r, 40)); report.push('monthly report rows: ' + (csv.trim().split('\n').length - 1) + ', header ok: ' + csv.includes('Customer average'));
  click('[data-act="biz-export"]'); await new Promise(r => setTimeout(r, 40)); report.push('export has reviews: ' + csv.includes('Quick settlements')); }
await go('co-razorpay'); report.push('branches on public page: ' + /Branches/.test(app.textContent) + ' ' + app.textContent.includes('12 Sanjay Place, Agra'));
await go('pricing'); report.push('pricing page: cards ' + app.querySelectorAll('.plans .price').length + ', price: ' + app.textContent.includes('₹14,999') + ', perks: ' + app.textContent.includes('Up to 5 team logins') + ', h1: ' + (app.querySelector('h1') || {}).textContent);
click('[data-act="pick-plan"][data-plan="business"]'); await new Promise(r => setTimeout(r, 80));
report.push('choosing Business opens: ' + g.location.pathname + g.location.hash + (app.textContent.includes('Plans from free') ? ', list page has pricing link' : ', NO pricing link on list page') + ', no plan cards on list page: ' + !app.querySelector('.plans'));
await go('dashboard');
click('[data-act="dash-tab"][data-tab="page"]'); await new Promise(r => setTimeout(r, 40));
const pf = app.querySelector('#cprof-form'); report.push('company page form: ' + !!pf + ', photos shown: ' + app.querySelectorAll('.gallery img').length);
if (pf) { pf.querySelector('#cp-about').value = 'We build payment tools for small and growing businesses across India and abroad.'; pf.dispatchEvent(new g.window.Event('submit', { bubbles: true, cancelable: true })); await new Promise(r => setTimeout(r, 60)); }
click('[data-act="dash-tab"][data-tab="employer"]'); await new Promise(r => setTimeout(r, 40));
const ef = app.querySelector('#employer-form'); report.push('employer form: ' + !!ef);
if (ef) { ef.querySelector('#ep-why').value = 'Small senior team, real ownership, and fair hours for everyone here.'; ef.dispatchEvent(new g.window.Event('submit', { bubbles: true, cancelable: true })); await new Promise(r => setTimeout(r, 60)); }
click('[data-act="dash-tab"][data-tab="reviews"]'); await new Promise(r => setTimeout(r, 40));
const rf = app.querySelector('form.oreply'); report.push('reply forms: ' + app.querySelectorAll('form.oreply').length);
if (rf) { rf.querySelector('textarea').value = 'Thank you, we have shared this with the team.'; rf.dispatchEvent(new g.window.Event('submit', { bubbles: true, cancelable: true })); await new Promise(r => setTimeout(r, 60)); }
// currency switch on the pricing page
await go('pricing');
const before = app.textContent.includes('₹499');
click('[data-act="cur"][data-cur="USD"]'); await new Promise(r => setTimeout(r, 40));
const usd = app.textContent;
report.push('pricing INR first: ' + before + ', after USD: ' + (usd.includes('$9') && usd.includes('$19') && !usd.includes('₹499')));
click('[data-act="cur"][data-cur="INR"]'); await new Promise(r => setTimeout(r, 40));
// password reset from the login page (logged out)
{
  const keep = g.__mock.member; g.__mock.member = { member: null, loggedIn: false, loading: false, error: null }; globalThis.__memberFn(g.__mock.member); await new Promise(r => setTimeout(r, 40));
  await go('login');
  const fl = app.querySelector('[data-act=auth-mode][data-mode=forgot]'); if (fl) fl.click(); await new Promise(r => setTimeout(r, 30));
  const ff = app.querySelector('#forgot-form'); if (ff) { ff.querySelector('#l-email').value = 'someone@example.com'; ff.dispatchEvent(new g.window.Event('submit', { bubbles: true, cancelable: true })); }
  await new Promise(r => setTimeout(r, 60));
  report.push('forgot link: ' + !!fl + ', reset sent: ' + inserted.some(x => x[0] === 'recovery') + ', confirmation shown: ' + app.textContent.includes('Check your email'));
  g.__mock.member = keep; globalThis.__memberFn(keep); await new Promise(r => setTimeout(r, 40));
}
await go('list'); report.push('list in INR: ' + app.textContent.includes('₹999') + ', switch shown: ' + !!app.querySelector('.curswitch'));
// real page addresses
await go('categories');
const catA = app.querySelector('a[href*="fintech"]'); report.push('category link href: ' + (catA && catA.getAttribute('href')));
await go('home');
await go('co-zepto'); report.push('unbuilt company address: ' + g.location.pathname + g.location.hash + ' canonical=' + g.document.querySelector('link[rel="canonical"]').getAttribute('href').replace(g.location.origin, ''));
g.history.pushState(null, '', '/company/notion'); g.window.dispatchEvent(new g.window.PopStateEvent('popstate')); await new Promise(r => setTimeout(r, 40));
report.push('path route: h1=' + (app.querySelector('h1') || {}).textContent + ' canonical=' + g.document.querySelector('link[rel="canonical"]').getAttribute('href').replace(g.location.origin, ''));
g.location.hash = 'pricing'; g.window.dispatchEvent(new g.window.HashChangeEvent('hashchange')); await new Promise(r => setTimeout(r, 40));
report.push('old hash link becomes: ' + g.location.pathname + g.location.hash);
{ const a = g.document.createElement('a'); a.href = '/category/fintech-and-banking.html'; app.appendChild(a); a.dispatchEvent(new g.window.MouseEvent('click', { bubbles: true, cancelable: true })); await new Promise(r => setTimeout(r, 40)); }
report.push('click real link: path=' + g.location.pathname + ' h1=' + (app.querySelector('h1') || {}).textContent);
g.history.pushState(null, '', '/'); g.window.dispatchEvent(new g.window.PopStateEvent('popstate')); await new Promise(r => setTimeout(r, 40));
g.history.pushState(null, '', '/terms.html'); g.window.dispatchEvent(new g.window.PopStateEvent('popstate')); await new Promise(r => setTimeout(r, 40));
report.push('old .html address: ' + g.location.pathname + ' h1=' + (app.querySelector('h1') || {}).textContent);
g.history.pushState(null, '', '/no-such-page'); g.window.dispatchEvent(new g.window.PopStateEvent('popstate')); await new Promise(r => setTimeout(r, 40));
report.push('unknown address: ' + g.location.pathname + ' h1=' + (app.querySelector('h1') || {}).textContent + ' robots=' + g.document.querySelector('meta[name="robots"]').content);
g.history.pushState(null, '', '/'); g.window.dispatchEvent(new g.window.PopStateEvent('popstate')); await new Promise(r => setTimeout(r, 40));
report.push('home path: h1=' + ((app.querySelector('h1') || {}).textContent || '').slice(0, 30));
// page text for scripts/build-pages.js: title, description, h1 and intro for each page that isn't data-driven
{
  g.__mock.member = { member: null, loggedIn: false, loading: false, error: null }; globalThis.__memberFn(g.__mock.member); await new Promise(r => setTimeout(r, 40));
  const AUTH = { login: ['Log in to Know The Company', 'Log in or create a free account to write reviews.'], 'business-login': ['Company login', 'Log in to manage your company page, reply to reviews and see your plan.'], dashboard: ['Company dashboard', 'Log in to manage your company page.'], 'my-reviews': ['My reviews', 'Log in to see the reviews you have written.'], search: ['Search companies', 'Search for a company by name or website.'] };
  await go('blog'); const posts = [...new Set([...app.querySelectorAll('a.postcard, a.postfeat')].map(a => routeOf(a.getAttribute('href'))))];
  await go('tools'); const tools = [...new Set([...app.querySelectorAll('a[href]')].map(a => routeOf(a.getAttribute('href'))).filter(r => r.startsWith('tool-')))];
  const pages = ['categories', 'search', 'tools', 'why-list', 'add', 'claim', 'list', 'dashboard', 'login', 'business-login', 'my-reviews', 'jobs', 'guidelines', ...(posts.length ? ['blog'] : []), 'write-for-us', 'about', 'contact', 'help', 'terms', 'privacy', 'pricing', 'refunds'];
  const out = [];
  const DEFAULT_DESC = 'Customer and employee reviews of startups and growing companies, on one page. Know the company before you deal with it.';
  for (const r of [...pages, ...tools, ...posts]) {
    g.location.hash = r; g.window.dispatchEvent(new g.window.HashChangeEvent("hashchange")); await new Promise(res => setTimeout(res, 40));
    const h1el = app.querySelector('h1'); let intro = '';
    if (h1el) { let n = h1el; for (let i = 0; i < 6 && n; i++) { n = n.nextElementSibling || (n.parentElement && n.parentElement.nextElementSibling); if (n && n.tagName === 'P' && n.textContent.trim().length > 30) { intro = n.textContent.trim(); break; } } }
    const [ah1, aintro] = AUTH[r] || [];
    const desc = g.document.querySelector('meta[name="description"]').content;
    out.push({ route: r, title: g.document.title, ...(desc === DEFAULT_DESC ? {} : { desc }), h1: ah1 || (h1el ? h1el.textContent.trim() : ''), intro: aintro || intro });
  }
  fs.writeFileSync('../scripts/pages-meta.json', JSON.stringify(out, null, 1));
  report.push('pages-meta: ' + out.length + ' pages, missing h1: ' + out.filter(x => !x.h1).map(x => x.route).join(',') + ' missing intro: ' + out.filter(x => !x.intro).map(x => x.route).join(','));
}
console.log(report.join('\n'));
console.log('\nWRITES:'); inserted.forEach(([c, d]) => console.log(' ', c, JSON.stringify(d).slice(0, 220)));
console.log('\nERRORS:', errors.length ? errors.join('\n') : 'none');
process.exit(0);
