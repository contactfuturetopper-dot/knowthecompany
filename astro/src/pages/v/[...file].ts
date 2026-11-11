// The app's script, styles and Wix modules at /v/<hash>/..., kept by browsers for a year. The hash in the
// address changes with every change to any of them (scripts/sync.mjs), so a new version is always fetched
// fresh. A page cached from just before a release may ask for the previous hash: it gets the current files
// with a short cache, rather than a missing script.
import type { APIRoute } from "astro";
import manifest from "../../generated/assets-manifest.json";

const files = import.meta.glob("../../generated/assets/**/*.{js,css}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export const GET: APIRoute = ({ params }) => {
  const parts = String(params.file || "").split("/");
  const hash = parts.shift();
  const rel = parts.join("/");
  const body = /^[a-z0-9./-]+$/i.test(rel) && !rel.includes("..") ? files["../../generated/assets/" + rel] : undefined;
  if (body === undefined) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(body, {
    headers: {
      "Content-Type": rel.endsWith(".css") ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8",
      "Cache-Control": hash === manifest.hash ? "public, max-age=31536000, s-maxage=31536000, immutable" : "public, max-age=0, s-maxage=60",
    },
  });
};
