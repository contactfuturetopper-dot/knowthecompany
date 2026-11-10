/* Builds one HTML file per page so every page has a real address (Wix hosting serves only files that
   exist, and has no fallback to index.html).

   Run it through the Wix MCP tool ExecuteWixAPI, passing this file's function as `code` and
   scripts/pages-meta.json as a `files` entry named pages-meta.json. It reads the live index.html as the
   template and the Companies and Reviews collections, then writes:
     company/<slug>.html, category/<slug>.html, blog/<slug>.html, tools/<id>.html, <page>.html,
     pages.json (what was built, read by app.js) and ktc-sitemap.xml.
   Wix serves its own /sitemap.xml and /robots.txt for the domain and ignores files with those names,
   so the page sitemap is ktc-sitemap.xml: submit that address in Google Search Console at launch.
   Re-run it after companies are added, so their pages get real addresses. Until then app.js links
   them as /#co-<slug>, which still works.

   pages-meta.json is written by `cd test && npm test` from the real app, so page titles and
   headings stay in step with app.js. A page without `desc` uses the site's default description. */
async function buildPages() {
  const siteId = '0bb4d935-f739-4b4a-b2ee-a42910e1a74f';
  const ORIGIN = 'https://www.knowthecompany.com';
  const DEFAULT_DESC = 'Customer and employee reviews of startups and growing companies, on one page. Know the company before you deal with it.';
  const NOT_IN_SITEMAP = ['search', 'login', 'business-login', 'dashboard', 'my-reviews', 'add'];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const readAll = async path => {
    let text = '';
    let offset = 0;
    let part;
    do {
      part = await wix.headless.files.read({ siteId, path, offset });
      text += part.text;
      offset = part.offset + part.length;
    } while (part.hasMore);
    return text;
  };
  const queryAll = async (collection, filter) => {
    const items = [];
    for (let offset = 0; offset < 20000; offset += 1000) {
      const body = {
        dataCollectionId: collection,
        query: {
          filter: filter || {},
          paging: {
            limit: 1000,
            offset
          }
        }
      };
      const r = await wix.request({ scope: 'site', siteId, method: 'POST', url: 'https://www.wixapis.com/wix-data/v2/items/query', body });
      const page = (r.data.dataItems || []).map(d => d.data);
      items.push(...page);
      if (page.length < 1000) break;
    }
    return items;
  };

  const meta = JSON.parse(files.find(f => f.path === 'pages-meta.json').content);
  let tpl = (typeof TEMPLATE_INDEX === 'string') ? TEMPLATE_INDEX : await readAll('index.html');
  if (!/<link rel="canonical"/.test(tpl)) {
    tpl = tpl.replace('<meta name="theme-color" content="#0F172A">', '<meta name="theme-color" content="#0F172A">\n<link rel="canonical" href="' + ORIGIN + '/">');
  }
  if (tpl.split('<main id="app">').length !== 2 || tpl.split('<link rel="canonical" href="').length !== 2) {
    throw new Error('index.html template is not as expected');
  }
  const page = (path, title, desc, h1, body) => tpl
    .replace(/<title>[\s\S]*?<\/title>/, () => '<title>' + esc(title) + '</title>')
    .replace(/<meta name="description" content="[^"]*">/, () => '<meta name="description" content="' + esc(desc) + '">')
    .replace(/<link rel="canonical" href="[^"]*">/, () => '<link rel="canonical" href="' + ORIGIN + path + '">')
    .replace('<main id="app">', () => '<main id="app"><div class="wrap" style="padding-block:40px"><h1>' + esc(h1) + '</h1>' + body + '</div>');
  const trim = d => d.length > 158 ? d.slice(0, 155).replace(/\s+\S*$/, '') + '…' : d;

  const companies = await queryAll('Companies');
  const reviewed = new Set((await queryAll('Reviews')).map(r => (r.company && r.company._id) || r.company));
  const out = [];
  const built = { page: [], co: [], cat: [], blog: [], tool: [] };
  const sitemap = ['/'];

  for (const m of meta) {
    let path;
    if (m.route.startsWith('tool-')) { path = '/tools/' + m.route.slice(5) + '.html'; built.tool.push(m.route.slice(5)); }
    else if (m.route.startsWith('blog-')) { path = '/blog/' + m.route.slice(5) + '.html'; built.blog.push(m.route.slice(5)); }
    else { path = '/' + m.route + '.html'; built.page.push(m.route); }
    out.push({ path: path.slice(1), content: page(path, m.title, m.desc || DEFAULT_DESC, m.h1, m.intro ? '<p>' + esc(m.intro) + '</p>' : '') });
    if (!NOT_IN_SITEMAP.includes(m.route)) sitemap.push(path);
  }

  const cats = {};
  for (const it of companies) {
    const s = it.slug || slug(it.title || it._id);
    const name = it.title || it._id;
    const cat = it.category || 'Other';
    const cs = slug(cat);
    (cats[cs] = cats[cs] || { name: cat, list: [] }).list.push({ s, name });
    const path = '/company/' + s + '.html';
    const desc = trim(name + ' reviews from customers and employees. ' + (it.bio || ''));
    const body = '<p><a href="/category/' + cs + '.html">' + esc(cat) + '</a> · ' + esc(it.website || it._id) + '</p>' + (it.bio ? '<p>' + esc(it.bio) + '</p>' : '');
    out.push({ path: path.slice(1), content: page(path, name + ' reviews · Know The Company', desc, name, body) });
    built.co.push(s);
    if (reviewed.has(it._id)) sitemap.push(path);
  }
  for (const [cs, k] of Object.entries(cats)) {
    const path = '/category/' + cs + '.html';
    const list = k.list.sort((a, b) => a.name.localeCompare(b.name)).map(c => '<li><a href="/company/' + c.s + '.html">' + esc(c.name) + '</a></li>').join('');
    out.push({ path: path.slice(1), content: page(path, k.name + ' · Know The Company', 'Compare ' + k.name + ' companies by honest customer and employee reviews.', k.name, '<p>Compare companies by real customer experiences</p><ul>' + list + '</ul>') });
    built.cat.push(cs);
    sitemap.push(path);
  }

  out.push({ path: 'pages.json', content: JSON.stringify(built) });
  out.push({ path: 'ktc-sitemap.xml', content: '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + sitemap.map(p => '  <url><loc>' + ORIGIN + p + '</loc></url>').join('\n') + '\n</urlset>\n' });
  return { out, tpl, counts: { pages: built.page.length, tools: built.tool.length, blog: built.blog.length, companies: built.co.length, categories: built.cat.length, sitemap: sitemap.length } };
}
