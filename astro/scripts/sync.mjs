// Copies the browser app from the repository root into this project before a build:
// app.js, site.css, the Wix modules, the badge and sign-in pages into public/, and index.html (the page
// shell), scripts/pages-meta.json (page titles and headings) and the blog posts list into src/generated/.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { transform } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const pub = join(here, "..", "public");
const gen = join(here, "..", "src", "generated");
rmSync(pub, { recursive: true, force: true });
rmSync(gen, { recursive: true, force: true });
mkdirSync(pub, { recursive: true });
mkdirSync(gen, { recursive: true });
for (const f of ["app.js", "site.css", "badge.html", "auth-callback.html", "logo.png", "og-image.png", "icon.svg", "icon-48.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "site.webmanifest"]) cpSync(join(root, f), join(pub, f));
cpSync(join(root, "js"), join(pub, "js"), { recursive: true });
// Article images (WebP, under 100 KB each), served at /images/blog/<article slug>.webp.
cpSync(join(root, "images"), join(pub, "images"), { recursive: true });
// Minify the app and its styles for the browser (the repository keeps the readable copies).
for (const [f, loader] of [["app.js", "js"], ["site.css", "css"]]) {
  const src = readFileSync(join(root, f), "utf8");
  const { code } = await transform(src, { loader, minify: true, format: loader === "js" ? "esm" : undefined, target: loader === "js" ? "es2020" : ["chrome90", "safari14", "firefox90"], legalComments: "none" });
  writeFileSync(join(pub, f), code);
  console.log(`minified ${f}: ${(src.length / 1024).toFixed(0)} KB -> ${(code.length / 1024).toFixed(0)} KB`);
}
// Versioned copies for the browser to keep for a year: served by src/pages/v/[...file].ts at
// /v/<hash>/..., where <hash> changes whenever any of them changes. app.js imports the Wix modules by a
// relative path so they come from the same version. The plain copies in public/ stay for badge.html and
// auth-callback.html.
const { createHash } = await import("node:crypto");
const { readdirSync } = await import("node:fs");
const assets = join(gen, "assets");
mkdirSync(join(assets, "js", "wix"), { recursive: true });
const appMin = readFileSync(join(pub, "app.js"), "utf8").replace(/(["'`])\/js\/wix\//g, "$1./js/wix/");
writeFileSync(join(assets, "app.js"), appMin);
cpSync(join(pub, "site.css"), join(assets, "site.css"));
const wixFiles = readdirSync(join(root, "js", "wix")).filter(f => f.endsWith(".js"));
for (const f of wixFiles) cpSync(join(root, "js", "wix", f), join(assets, "js", "wix", f));
const h = createHash("sha256");
for (const f of ["app.js", "site.css", ...wixFiles.map(f => "js/wix/" + f)]) h.update(f).update(readFileSync(join(assets, f)));
const hash = h.digest("hex").slice(0, 10);
writeFileSync(join(gen, "assets-manifest.json"), JSON.stringify({ hash }));
const shell = readFileSync(join(root, "index.html"), "utf8")
  .replace(/(href|src)="\/app\.js"/g, `$1="/v/${hash}/app.js"`)
  .replace(/href="\/site\.css"/g, `href="/v/${hash}/site.css"`)
  .replace(/href="\/js\/wix\//g, `href="/v/${hash}/js/wix/`);
if (!shell.includes(`/v/${hash}/app.js`) || !shell.includes(`/v/${hash}/site.css`)) throw new Error("index.html: app.js or site.css reference not found");
writeFileSync(join(gen, "shell.html"), shell);
console.log(`versioned assets: /v/${hash}/`);
cpSync(join(root, "scripts", "pages-meta.json"), join(gen, "pages-meta.json"));
// Full text of the fixed pages for the server to send (written by test/run.mjs; empty if not made yet).
{ let snaps = "{}"; try { snaps = readFileSync(join(root, "data", "page-snapshots.json"), "utf8"); } catch (e) { if (e.code !== "ENOENT") throw e; }
  writeFileSync(join(gen, "page-snapshots.json"), snaps); }
// Data the server writes into pages, read from app.js so there is one copy: the blog posts (with their
// article text) and the one-line category intros. Each is a plain literal in app.js, evaluated here.
const app = readFileSync(join(root, "app.js"), "utf8");
function literal(name, open, close) {
  const start = app.indexOf(`const ${name} = ${open}`);
  if (start < 0) throw new Error(`${name} not found in app.js`);
  const from = app.indexOf(open, start), end = app.indexOf(`\n${close};\n`, from);
  return new Function(`return ${app.slice(from, end + 2)}`)();
}
const posts = literal("POSTS", "[", "]").map(p => ({ slug: p.slug, cat: p.cat, date: p.date, updated: p.updated, title: p.title, seo: p.seo, desc: p.desc, excerpt: p.excerpt, image: p.image, imageAlt: p.imageAlt, body: p.body }));
writeFileSync(join(gen, "posts.json"), JSON.stringify(posts, null, 1));
const intros = literal("CAT_INTROS", "{", "}");
if (Object.keys(intros).length < 5) throw new Error("category intros look wrong");
writeFileSync(join(gen, "cat-intros.json"), JSON.stringify(intros, null, 1));
// Researched company facts: the whole set for the server, and one small file per company for the browser.
let facts = {};
try { facts = JSON.parse(readFileSync(join(root, "data", "company-facts.json"), "utf8")); } catch (e) { if (e.code !== "ENOENT") throw e; }
writeFileSync(join(gen, "company-facts.json"), JSON.stringify(facts));
mkdirSync(join(pub, "facts"), { recursive: true });
for (const [id, f] of Object.entries(facts)) {
  if (!/^[a-z0-9.-]+$/.test(id)) throw new Error("unexpected company id in facts: " + id);
  writeFileSync(join(pub, "facts", id + ".json"), JSON.stringify(f));
}
console.log(`synced app files into public/ and src/generated/ (${posts.length} blog posts, ${Object.keys(intros).length} category intros, facts for ${Object.keys(facts).length} companies)`);
