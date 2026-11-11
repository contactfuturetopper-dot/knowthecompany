
/* Embeddable rating badge: badge.html?c=<company website id>&t=customer|employee
   It reads the company and its published reviews straight from the Wix CMS, so the rating is always the
   live one. Nothing here can be set by the company: the numbers are counted from published reviews. */
const { getItemById, queryItems } = globalThis.__m;

const q = new URLSearchParams(location.search);
const wid = (q.get('c') || '').trim().toLowerCase();
const type = q.get('t') === 'employee' ? 'employee' : 'customer';
const el = document.getElementById('body'), link = document.getElementById('badge');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const star = (fill, k) => `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="g${k}"><stop offset="${fill * 100}%" stop-color="#F5B301"/><stop offset="${fill * 100}%" stop-color="#D9DEE6"/></linearGradient></defs><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z" fill="url(#g${k})"/></svg>`;
const stars = avg => `<span class="stars" aria-hidden="true">${[0, 1, 2, 3, 4].map(i => star(Math.max(0, Math.min(1, avg - i)), i)).join('')}</span>`;
const brand = '<span class="brand">Know<b>The</b>Company</span>';
const site = new URL('./', location.href).href;
/* Team-only company fields count only once the team has touched the company (same rule as "trust" in app.js). */
const ADMIN_ID = 'c0f544a7-207e-490b-b7d9-830ef39f49c7';
const tms = d => { const v = d && typeof d === 'object' && !(d instanceof Date) && '$date' in d ? d.$date : d; const t = v instanceof Date ? v.getTime() : Date.parse(v); return isNaN(t) ? 0 : t; };
const adminTouched = it => !!it && (it._owner === ADMIN_ID || tms(it._updatedDate) > tms(it._createdDate));

async function run() {
  if (!wid) { el.innerHTML = `<span class="msg">Rating unavailable</span>${brand}`; link.href = site; return; }
  const co = await getItemById('Companies', wid);
  if (!co) { el.innerHTML = `<span class="msg">Rating unavailable</span>${brand}`; link.href = site; return; }
  const name = co.title || wid;
  link.href = site + 'company/' + (co.slug || slug(name));
  link.setAttribute('aria-label', `${name} reviews on Know The Company`);
  const items = [];
  for (let skip = 0, i = 0; i < 10; i++) {
    const page = await queryItems('Reviews', { filters: [{ field: 'company', op: 'eq', value: wid }], limit: 1000, skip });
    items.push(...page.items);
    if (!page.hasNext || !page.items.length) break;
    skip += page.items.length;
  }
  /* Reviews written by any account that manages a company don't count, the same rule as the main site. */
  const authors = [...new Set(items.map(r => r._owner).filter(Boolean))];
  const blocked = new Set();
  for (let i = 0; i < authors.length; i += 50) {
    const page = await queryItems('Companies', { filters: [{ field: 'ownerMemberIds', op: 'hasSome', value: authors.slice(i, i + 50) }], limit: 1000 });
    page.items.filter(adminTouched).forEach(c => (c.ownerMemberIds || []).forEach(id => blocked.add(id)));
  }
  const list = items.filter(r => !blocked.has(r._owner) && (r.type || 'customer') === type && Number(r.rating) > 0);
  const verified = adminTouched(co) && co.claimStatus === 'verified' ? '<span class="ver">Verified</span>' : '';
  if (!list.length) {
    el.innerHTML = `<span class="row"><span class="msg">No ${type} reviews yet</span>${verified}</span><span class="meta">Be the first to review ${esc(name)} on ${brand}</span>`;
    return;
  }
  const avg = list.reduce((s, r) => s + Number(r.rating), 0) / list.length;
  const label = type === 'employee' ? 'employee' : 'customer';
  el.innerHTML = `<span class="row"><span class="score">${avg.toFixed(1)}</span>${stars(avg)}${verified}</span>
    <span class="meta">${label === 'employee' ? 'Employee' : 'Customer'} rating on ${brand}</span>`;
  link.title = `${name}: ${avg.toFixed(1)} out of 5 from ${label}s on Know The Company`;
}
run().catch(() => { el.innerHTML = `<span class="msg">Rating unavailable right now</span>${brand}`; link.href = site; });

export const done = new Promise(r => setTimeout(r, 30));