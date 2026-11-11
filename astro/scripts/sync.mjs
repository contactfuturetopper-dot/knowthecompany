// Copies the browser app from the repository root into this project before a build:
// app.js, site.css, the Wix modules, the badge and sign-in pages into public/, and index.html (the page
// shell), scripts/pages-meta.json (page titles and headings) and the blog posts list into src/generated/.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
for (const f of ["app.js", "site.css", "badge.html", "auth-callback.html", "logo.png"]) cpSync(join(root, f), join(pub, f));
cpSync(join(root, "js"), join(pub, "js"), { recursive: true });
cpSync(join(root, "index.html"), join(gen, "shell.html"));
cpSync(join(root, "scripts", "pages-meta.json"), join(gen, "pages-meta.json"));
// Blog posts (slug, section, date, title, summary) for their structured data, read from app.js's POSTS list.
const app = readFileSync(join(root, "app.js"), "utf8");
const posts = [...app.matchAll(/\{ slug: '([^']+)', cat: '([^']+)', date: '(\d{4}-\d{2}-\d{2})', title: '((?:[^'\\]|\\.)+)'[^\n]*\n\s*excerpt: '((?:[^'\\]|\\.)+)'/g)]
  .map(m => ({ slug: m[1], cat: m[2], date: m[3], title: m[4].replace(/\\'/g, "'"), excerpt: m[5].replace(/\\'/g, "'") }));
if (!posts.length) throw new Error("no blog posts found in app.js");
writeFileSync(join(gen, "posts.json"), JSON.stringify(posts, null, 1));
console.log(`synced app files into public/ and src/generated/ (${posts.length} blog posts)`);
