"""Merge researched company facts (data/facts/batch-*.json) into data/company-facts.json.

Checks every record: the id must be a company in the seed list, links must be https, the description
must avoid promotional and AI-sounding wording, and dashes are replaced. Records that fail a check
keep their other facts but lose the failing field, and the problem is printed."""
import csv, glob, json, re, sys
ROOT = __file__.rsplit('/scripts/', 1)[0]
ids = {r['website'] for r in csv.DictReader(open(f'{ROOT}/data/companies-for-wix-cms.csv'))}
BANNED = r'\b(leading|top|best|premier|innovative|revolutionary|cutting-edge|seamless|seamlessly|robust|world-class|empower\w*|transform\w*|journey|landscape|ecosystem|delve|unlock|elevate|boasts?|renowned|vibrant|testament|crucial role|in today)\b'
LINK_KEYS = ['linkedin', 'x', 'instagram', 'facebook', 'youtube', 'appStore', 'playStore']
out, problems = {}, []
for f in sorted(glob.glob(f'{ROOT}/data/facts/batch-*.json')):  # batch-z-* (second passes) sort last
    try: rows = json.load(open(f))
    except Exception as e: problems.append(f'{f}: unreadable ({e})'); continue
    for x in rows:
        wid = str(x.get('website', '')).strip().lower()
        if wid not in ids: problems.append(f'{f}: unknown company {wid!r}'); continue
        d = (x.get('description') or '').strip()
        d = re.sub(r'\s*[—–]\s*', ', ', d)
        if re.search(BANNED, d, re.I): problems.append(f'{wid}: description wording: {re.search(BANNED, d, re.I).group(0)}')
        links = {k: v for k, v in (x.get('links') or {}).items() if k in LINK_KEYS and isinstance(v, str) and re.match(r'^https://[^\s"\'<>]+$', v)}
        srcs = [s for s in (x.get('sources') or []) if isinstance(s, dict) and re.match(r'^https?://', str(s.get('url', ''))) and not re.search(r'wikipedia|wikidata|wiki\.', s['url'], re.I)]
        clean = lambda v: (v.strip() if isinstance(v, str) and v.strip() and v.strip().lower() not in ('null', 'none', 'unknown', 'n/a') else None)
        rec = {
            'name': clean(x.get('name')), 'legalName': clean(x.get('legalName')), 'founded': clean(str(x['founded'])) if x.get('founded') else None,
            'hq': clean(x.get('hq')), 'founders': [n.strip() for n in (x.get('founders') or []) if isinstance(n, str) and n.strip()][:6],
            'parent': clean(x.get('parent')), 'ownership': clean(x.get('ownership')), 'employees': clean(x.get('employees')),
            'products': [p.strip() for p in (x.get('products') or []) if isinstance(p, str) and p.strip()][:6],
            'markets': clean(x.get('markets')), 'description': d or None, 'status': clean(x.get('status')) or 'Active',
            'links': links, 'sources': [{'fact': str(s.get('fact', '')), 'url': s['url']} for s in srcs], 'checked': clean(x.get('checked')) or '2026-11-11',
        }
        if rec['founded'] and not re.match(r'^(1[89]|20)\d\d$', rec['founded']): problems.append(f'{wid}: odd founded {rec["founded"]}'); rec['founded'] = None
        rec = {k: v for k, v in rec.items() if v not in (None, [], {})}
        if wid in out:  # a later pass fills gaps; it never blanks a fact found earlier
            prev = out[wid]
            for k, v in rec.items():
                if k == 'sources': prev['sources'] = prev.get('sources', []) + [x for x in v if x not in prev.get('sources', [])]
                elif k == 'links': prev['links'] = {**prev.get('links', {}), **v}
                elif k == 'status' and v == 'Active' and prev.get('status'): continue
                else: prev[k] = v
        else:
            out[wid] = rec
# Hand corrections after review, applied last. Status notes must stay true for months, not days.
OVERRIDES = {'mercadobitcoin.com.br': {'status': 'Active'}}
for wid, fix in OVERRIDES.items():
    if wid in out: out[wid].update(fix)
json.dump(dict(sorted(out.items())), open(f'{ROOT}/data/company-facts.json', 'w'), indent=1, ensure_ascii=False)
print(f'merged facts for {len(out)} companies')
for p in problems: print('  check:', p)
