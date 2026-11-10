// Renders badge.html in jsdom against mocked Wix data and prints what it shows.
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const html = fs.readFileSync('../badge.html', 'utf8');
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const companies = { 'razorpay.com': { _id: 'razorpay.com', title: 'Razorpay', slug: 'razorpay', claimStatus: 'verified' }, 'notion.com': { _id: 'notion.com', title: 'Notion', slug: 'notion' } };
const reviews = [
  { company: 'razorpay.com', type: 'customer', rating: 5 }, { company: 'razorpay.com', type: 'customer', rating: 4 },
  { company: 'razorpay.com', type: 'employee', rating: 3 }
];
async function render(qs) {
  const dom = new JSDOM(html.replace(/<script type="module">[\s\S]*?<\/script>/, ''), { url: 'https://example.test/badge.html' + qs });
  const g = globalThis; g.document = dom.window.document; g.location = dom.window.location; g.URLSearchParams = dom.window.URLSearchParams; g.URL = dom.window.URL;
  g.__m = {
    getItemById: async (col, id) => companies[id] || null,
    queryItems: async (col, q) => { const f = q.filters[0]; const items = reviews.filter(r => r[f.field] === f.value); return { items, hasNext: false }; }
  };
  const src = script.replace(/import\s*\{([^}]+)\}\s*from\s*"\/js\/wix\/items\.js";/, 'const {$1} = globalThis.__m;');
  fs.writeFileSync('badge.test.mjs', src + `\nexport const done = new Promise(r => setTimeout(r, 30));`);
  const mod = await import('./badge.test.mjs?' + qs); await mod.done;
  const a = dom.window.document.getElementById('badge');
  return `${qs.padEnd(30)} -> ${a.textContent.replace(/\s+/g, ' ').trim()} | href=${a.getAttribute('href')}`;
}
for (const qs of ['?c=razorpay.com', '?c=razorpay.com&t=employee', '?c=notion.com', '?c=nope.com', '']) console.log(await render(qs));
fs.unlinkSync('badge.test.mjs');
