# Know The Company

Customer and employee reviews of startups and growing companies, on one page.

The site runs on Wix Headless. It is one browser app that talks to the Wix CMS and Wix Members, served by a small Astro server on Wix hosting so every page has a clean address (`/company/razorpay`, `/pricing`).

Live: https://www.knowthecompany.com

## What is in this repository

- `index.html`, `app.js` and `site.css` are the browser app. `index.html` is the page shell; `app.js` reads the page from the address (`/company/<slug>`, `/category/<slug>`, `/blog/<slug>`, `/tools/<id>`, `/<page>`) and draws it. Views still write links as `#route`; `app.js` turns them into clean addresses, and old `/#route` and `/page.html` links move to the clean one.
- `js/wix/` holds the Wix helper modules the app imports (from Wix's headless templates; `config.js` holds the site's public client id).
- `astro/` is the server. Every address goes to `astro/src/pages/[...path].astro`, which sends the shell with that page's title, description, canonical and robots tags and a short text version of the page (company and category details are read from the CMS as a visitor). `scripts/pages-meta.json` gives the titles and headings of the fixed pages; `npm test` rewrites it from the app.
- The sitemap is served by the server at `/sitemap-ktc.xml` (built live from the CMS: home, public pages, tools, blog posts, categories and every company). Wix answers `/sitemap.xml` and any address ending in `sitemap.xml` with its own editor sitemap, which this site doesn't use, so robots.txt (set through Wix's SEO robots.txt API) points to ours.
- `badge.html` and `auth-callback.html` are standalone pages (the embeddable rating badge and the return page for Google and Facebook sign-in).
- `data/companies-for-wix-cms.csv` is the seed list of 232 companies that was imported into the Companies collection.
- `docs/developer-handover.docx` covers the CMS collections, what the front end writes, and the backend work still to do. Read section 2 first. Reviews go live as soon as they are posted (the Reviews collection publishes new items by default); the team takes down any that break the guidelines. Signed-in members can insert items (Wix has no field-level rules), but only admins can edit them. Wix gives a new item equal created and updated times, so the app, the server and the badge ignore a review's own "Proof checked" or "Work email verified" label and any reply stored on it, and ignore `claimStatus`, `plan`, `ownerMemberIds` and `employerPage` on a company a member inserted, until someone on the team has edited or published that item (see "trust" in `app.js`). To give a review a label, edit it in the CMS; to verify a member-added company, edit it there. Check the team-only fields when you do.
- `test/run.mjs` renders all 35 routes in jsdom against mocked Wix modules, then submits a review and tries two company additions, one of them a duplicate.

## Running the test

```
cd test
npm install
npm test
```

It prints one line per route and ends with `ERRORS: none` when everything renders.

## Deploying

Pushing to `main` publishes the site: `.github/workflows/publish.yml` runs the page test, builds `astro/` and releases it with the Wix CLI. It needs the repository secret `WIX_API_KEY` (a Wix API key with access to this site). Run it by hand from the Actions tab with "Run workflow".

To publish by hand instead:

The Wix site ID is `0bb4d935-f739-4b4a-b2ee-a42910e1a74f`; its OAuth client (and Code Store project) id is `5783d517-0173-420b-ba45-67e1d2efd460`.

```
cd astro
npm ci
npm run build        # copies the app into public/ and src/generated/, then builds
zip -qr build.zip .wix dist
```

Release `build.zip` with the Wix MCP tool `UploadHeadlessWebsiteFiles` (`prepare: true` with the zip's size, PUT the zip to the URL it returns, then the second call). The upload URL is on Amazon S3, so the PUT has to run from a machine that can reach it. `astro/.env.local` (not in git) holds `WIX_CLIENT_ID="5783d517-0173-420b-ba45-67e1d2efd460"`, `WIX_CLOUD_PROVIDER="KUBERNETES"` and placeholder values for `WIX_CLIENT_INSTANCE_ID`, `WIX_CLIENT_PUBLIC_KEY` and `WIX_CLIENT_SECRET`, which the hosting fills in at release.

Do not upload the root files to the site as static files any more: a release replaces the whole site, and a static drop over it would bring back `.html` addresses that the app no longer serves.

## Past reviews from Plus companies

Companies on the Plus plan can send reviews they collected before joining from the "Past reviews" tab of their dashboard. Each one lands in the `ReviewImports` collection with status `pending` (members can add items and see their own; only the team can see the rest or change them). To publish one:

1. Email the reviewer at `reviewerEmail` and ask them to confirm they wrote it and agree to it appearing on Know The Company. Set `status` to `confirmed` once they reply, or `rejected` with a `note` if they don't or the text doesn't match.
2. Add it to `Reviews` from the CMS (so it is the admin's item): `company` = the website id, `type` = `customer`, `displayName`, `rating`, `title`, `body`, `importedFrom` = the `source`, `originalDate` = `givenOn`.
3. Set the import's `status` to `published`.

The site shows these reviews with an "Imported" label, where and when they were first given, and that the reviewer confirmed them. They count towards the rating like any other review.
