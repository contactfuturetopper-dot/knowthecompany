# Company facts research brief

You are filling in facts for company pages on Know The Company (knowthecompany.com), a site where customers and employees review startups and growing companies. Each page currently has only a name, website, category, country and a one-line bio, so the pages look thin. Your job is to research each company in your batch on the web and record accurate, current, sourced facts.

## How to research

- Use WebSearch (mode "standard"; "extended" only when standard results are thin or out of date) and WebFetch. Check each company's own website first (about, company, press, careers pages), then reputable sources: stock exchange filings, regulators, official app store listings, the company's verified LinkedIn page, and established news outlets (Reuters, Bloomberg, TechCrunch, Economic Times, Financial Times, The Hindu BusinessLine and similar).
- Never cite Wikipedia, Wikidata, or any wiki, and never cite content farms, SEO listicles, or AI-generated company profile sites (for example Tracxn summaries, Clay, ZoomInfo, Owler, Craft.co, CB Insights snippets, Growjo, LeadIQ). Crunchbase is acceptable only for founding year or founders when nothing better exists.
- Facts must be current as of late 2026. If a company was acquired, renamed, merged, shut down or went public, record that. Do not guess. If you can't confirm a fact from a source you'd trust, leave that field null. A null is far better than a wrong fact.
- Put in a source URL for every fact you fill in (see `sources`). The URL must be one you actually opened or saw in search results.
- Spend about 3 to 6 tool calls per company. Don't go down rabbit holes.

## Output

Write ONE JSON file at the output path you were given: an array with one object per company, in the same order as the input. Use exactly these keys:

```json
{
  "website": "copy from input, unchanged (this is the id)",
  "name": "the company's current trading name, as it writes it",
  "legalName": "registered legal entity if clearly stated (e.g. on the site footer or terms), else null",
  "founded": "year as a string, e.g. \"2014\", else null",
  "hq": "headquarters as \"City, Country\", e.g. \"Bengaluru, India\", else null",
  "founders": ["Full Name", "Full Name"],
  "parent": "parent or owning company if it is a subsidiary or was acquired, e.g. \"Prosus\", else null",
  "ownership": "one of: \"Private\", \"Public (EXCHANGE: TICKER)\", \"Subsidiary of X\", \"Non-profit\", or null",
  "employees": "a band such as \"51-200\", \"201-500\", \"501-1,000\", \"1,001-5,000\", \"5,001-10,000\", \"10,000+\", else null",
  "products": ["3 to 6 short product or service names or phrases, e.g. \"UPI payments\", \"Business current accounts\""],
  "markets": "where it operates, short, e.g. \"India\", \"UK and EU\", \"40+ countries\", \"Worldwide\", else null",
  "description": "3 to 4 sentences, 60 to 110 words. See the writing rules below.",
  "status": "\"Active\", or a short note if not, e.g. \"Shut down in 2025\", \"Merged into X in 2024\"",
  "links": {
    "linkedin": "official company page URL or null",
    "x": "official X/Twitter URL or null",
    "instagram": null,
    "facebook": null,
    "youtube": null,
    "appStore": "official Apple App Store URL of its main app, or null",
    "playStore": "official Google Play URL of its main app, or null"
  },
  "sources": [{ "fact": "founded", "url": "https://..." }],
  "checked": "2026-11-11"
}
```

Rules for `links`: only include a profile you can tie to the company (linked from its own website, or the verified profile in search results with matching name and website). No fan pages, regional sub-accounts or founders' personal profiles. When unsure, null.

`sources`: one entry per filled fact (`founded`, `hq`, `founders`, `parent`, `ownership`, `employees`, `products`, `markets`, `status`, `description`). One URL can back several facts; list it against each.

## Writing rules for `description`

The description is shown on the company's page and read by people deciding whether to deal with or work for the company. It must read like a careful human editor wrote it, not marketing and not AI.

- Plain, specific, factual. Say what the company does, for whom, where, and one or two concrete details (what it is known for, a notable product, licence, scale, milestone). Use numbers only when sourced and current.
- No promotion and no opinions: never use words like leading, top, best, premier, innovative, revolutionary, cutting-edge, seamless, robust, world-class, empower, transform, journey, landscape, ecosystem, delve, unlock, elevate, boasts, renowned, vibrant, "in today's world", "plays a crucial role", "a testament to".
- No em dashes or en dashes. Use commas, full stops or "and". No semicolons chains, no rhetorical questions, no lists of three adjectives.
- Don't start with the company name followed by "is a leading". Starting with the name is fine ("Razorpay builds payment software for Indian businesses...").
- British spelling (organisation, licence, centre).
- Don't repeat the existing one-line bio word for word; it is shown separately. Add to it.
- Never write anything about review scores, reputation, controversies, lawsuits or complaints. Stick to neutral facts about the business.

## When you finish

Reply with a short summary: how many companies, which ones had facts you could not confirm, and any company that has shut down, been acquired or renamed.
