// Headless render test: the real app.js against mocked Wix modules.
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const html = fs.readFileSync('../index.html', 'utf8').replace('<script type="module" src="/app.js"></script>', '');
const dom = new JSDOM(html, { url: 'https://example.test/', pretendToBeVisual: true });
const g = globalThis;
for (const k of ['window', 'document', 'location', 'localStorage', 'navigator', 'HTMLElement', 'Node', 'CustomEvent', 'Event', 'getComputedStyle', 'matchMedia', 'URLSearchParams']) {
  try { g[k] = dom.window[k]; } catch (e) {}
}
g.window.matchMedia = g.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
g.window.scrollTo = () => {};
g.window.HTMLElement.prototype.scrollIntoView = function () {};
g.window.confirm = () => true;
g.confirm = () => true;
g.requestAnimationFrame = f => setTimeout(f, 0);
for (const id of ['a-cat', 'a-cc', 'a-name', 'a-web', 'b-agree', 'b-cat', 'b-country', 'b-role', 'b-type', 'hj-what', 'hj-where', 'l-code', 'l-email', 'l-pass', 'r-body', 'r-date', 'r-role', 'r-title', 'reply-text']) Object.defineProperty(g.window.HTMLFormElement.prototype, id, { get() { return this.querySelector('#' + id); }, configurable: true });

// CSV -> company items, plus a few published reviews of each type
const csv = fs.readFileSync('../data/companies-for-wix-cms.csv', 'utf8').trim().split(/\r?\n/);
const parse = line => { const out = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
const hdr = parse(csv[0]);
const companies = csv.slice(1).map(l => { const r = Object.fromEntries(hdr.map((h, i) => [h, parse(l)[i]])); return { _id: r.website, title: r.title, slug: r.slug, website: r.website, category: r.category, country: r.country, bio: r.bio, addedBy: 'seed', claimStatus: 'none', plan: 'none' }; });
// one verified Plus company to exercise the owner-written sections
Object.assign(companies.find(c => c._id === 'razorpay.com'), { claimStatus: 'verified', verifiedVia: 'email', plan: 'plus', about: 'About text', founded: '2014', teamSize: '201–1,000 people', services: ['Payments'], phone: '+91 80000 00000', publicEmail: 'x@y.z', employerPage: { why: 'Why work here text, long enough.', benefits: ['Health insurance'], size: '201–1,000 people', hiring: true }, ownerMemberIds: ['m1'] });
const reviews = [
  { _id: 'r1', _owner: 'm1', _createdDate: '2026-11-01T00:00:00Z', company: 'razorpay.com', type: 'customer', displayName: 'Asha K.', rating: 4, title: 'Quick settlements', body: 'Payments settled in two days and support answered quickly.' },
  { _id: 'r2', _owner: 'm2', _createdDate: '2026-11-02T00:00:00Z', company: 'razorpay.com', type: 'employee', anonymous: true, rating: 3, subRatings: { pay: 3 }, pros: 'Good people and learning culture here.', cons: 'Long hours during launches, every quarter.', recommend: 'yes', employmentStatus: 'Current employee', jobTitle: 'Engineer', tenure: '1–3 years' },
  { _id: 'r3', _owner: 'm2', _createdDate: '2026-11-03T00:00:00Z', company: 'notion.com', type: 'interview', jobTitle: 'Designer', interviewOutcome: 'No offer', interviewDifficulty: 'Hard', interviewExperience: 'Neutral', body: 'Three rounds over two weeks, friendly panel.' },
  { _id: 'r4', _owner: 'm3', _createdDate: '2026-11-04T00:00:00Z', company: 'zepto.com', type: 'customer', displayName: 'Ravi', rating: 5, title: 'Fast', body: 'Delivered in ten minutes, everything fresh and well packed.' },
  { _id: 'r5', _owner: 'm3', _createdDate: '2026-11-05T00:00:00Z', company: 'zeptonow.com', type: 'customer', displayName: 'Ravi', rating: 5, title: 'Fast again', body: 'Delivered in ten minutes, everything fresh and well packed.' }
];
const inserted = [];
g.__mock = {
  queryItems: async (col, q = {}) => {
    const all = col === 'Companies' ? companies : col === 'Reviews' ? reviews : col === 'Claims' ? [{ _id: 'c1', company: 'notion.com', kind: 'claim', method: 'email', status: 'pending', _createdDate: '2026-11-06T00:00:00Z' }] : [];
    const skip = q.skip || 0, limit = q.limit || 20; const items = all.slice(skip, skip + limit);
    return { items, hasNext: skip + limit < all.length, total: all.length };
  },
  insertItem: async (col, data) => { inserted.push([col, data]); return { _id: 'new', ...data }; },
  removeItem: async () => null,
  wixRequest: async (path, opts) => { inserted.push(['wixRequest', opts.body]); return { dataItem: { data: opts.body.dataItem.data } }; },
  member: { member: { id: 'm1', loginEmail: 'asha@razorpay.com', displayName: 'Asha K.' }, loggedIn: true, loading: false, error: null }
};
let src = fs.readFileSync('../app.js', 'utf8');
const MEMBER_MOCK = { subscribeMember: () => () => {}, getMemberState: () => globalThis.__mock.member, login: async () => ({ state: 'SUCCESS' }), register: async () => ({ state: 'EMAIL_VERIFICATION_REQUIRED' }), verifyEmail: async () => ({ state: 'SUCCESS' }), logout: async () => {} };
globalThis.__memberMock = MEMBER_MOCK;
src = src.replace(/import\s*\{([^}]+)\}\s*from\s*"\/js\/wix\/(items|client|member-store)\.js";?/g, (m, names, mod) => {
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
const routes = ['home', 'categories', 'cat-fintech-and-banking', 'search', 'co-razorpay', 'co-notion', 'co-zepto', 'co-1password', 'invite-co-razorpay', 'invite-team-co-razorpay', 'add', 'tools', 'tool-offer', 'tool-hike', 'tool-gratuity', 'tool-hra', 'tool-rate', 'blog', 'why-list', 'list', 'about', 'contact', 'help', 'guidelines', 'removals', 'terms', 'privacy', 'jobs', 'login', 'business-login', 'my-reviews', 'dashboard', 'write-for-us', 'sample', 'nope'];
const report = [];
for (const r of routes) {
  g.location.hash = r;
  g.window.dispatchEvent(new g.window.HashChangeEvent('hashchange'));
  await new Promise(res => setTimeout(res, 30));
  const text = app.textContent.replace(/\s+/g, ' ');
  const h1 = (app.querySelector('h1') || {}).textContent || '';
  const flags = ['Future Topper', 'Prototype', 'prototype', 'demo', 'Saved in this browser', 'undefined', 'NaN', '[object Object]'].filter(w => text.includes(w));
  report.push(`${r.padEnd(24)} ${String(text.length).padStart(6)}  h1="${h1.trim().slice(0, 50)}" ${flags.length ? ' FLAGS:' + flags.join(',') : ''}`);
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
report.push('after add, hash=' + g.location.hash);
// duplicate website is blocked before any write
g.location.hash = 'add'; g.window.dispatchEvent(new g.window.HashChangeEvent('hashchange')); await new Promise(r => setTimeout(r, 30));
const af2 = app.querySelector('#add-form'); af2['a-name'].value = 'Razor Copy'; af2['a-web'].value = 'razorpay.com';
af2.dispatchEvent(new g.window.Event('submit', { bubbles: true, cancelable: true })); await new Promise(r => setTimeout(r, 60));
report.push('after duplicate add, hash=' + g.location.hash);
console.log(report.join('\n'));
console.log('\nWRITES:'); inserted.forEach(([c, d]) => console.log(' ', c, JSON.stringify(d).slice(0, 220)));
console.log('\nERRORS:', errors.length ? errors.join('\n') : 'none');
process.exit(0);
