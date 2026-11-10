// Copies the browser app from the repository root into this project before a build:
// app.js, site.css, the Wix modules, the badge and sign-in pages into public/, and index.html (the page
// shell) and scripts/pages-meta.json (page titles and headings) into src/generated/.
import { cpSync, mkdirSync, rmSync } from "node:fs";
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
for (const f of ["app.js", "site.css", "badge.html", "auth-callback.html"]) cpSync(join(root, f), join(pub, f));
cpSync(join(root, "js"), join(pub, "js"), { recursive: true });
cpSync(join(root, "index.html"), join(gen, "shell.html"));
cpSync(join(root, "scripts", "pages-meta.json"), join(gen, "pages-meta.json"));
console.log("synced app files into public/ and src/generated/");
