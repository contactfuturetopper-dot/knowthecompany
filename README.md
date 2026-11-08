# Know The Company

Customer and employee reviews of startups and growing companies, on one page.

The site runs on Wix Headless. It is a single static page that talks to the Wix CMS and Wix Members from the browser.

Live (free Wix address for now): https://headless-pnjonvjhfsn-upkautilya-140a.wix-site-host.com

## What is in this repository

- `index.html`, `app.js` and `site.css` are the files deployed to the Wix site, in readable form. Every screen is a hash route (`#co-razorpay`, `#categories` and so on) rendered by `app.js`.
- `app.js` imports three helper modules that Wix installs on the site under `/js/wix/` (`items.js`, `client.js` and `member-store.js`). They are not in this repository because Wix manages them.
- `data/companies-for-wix-cms.csv` is the seed list of 232 companies that was imported into the Companies collection.
- `docs/developer-handover.docx` covers the CMS collections, what the front end writes, and the backend work still to do. Read section 2 first. Member inserts are not locked down yet, so a signed-in member can publish their own review and set fields such as `claimStatus`.
- `test/run.mjs` renders all 35 routes in jsdom against mocked Wix modules, then submits a review and tries two company additions, one of them a duplicate.

## Running the test

```
cd test
npm install
npm test
```

It prints one line per route and ends with `ERRORS: none` when everything renders.

## Deploying

The Wix site ID is `0bb4d935-f739-4b4a-b2ee-a42910e1a74f`. The three files at the root of this repository are uploaded as they are, with no build step. Keep the `/js/wix/` modules on the site when you replace them.
