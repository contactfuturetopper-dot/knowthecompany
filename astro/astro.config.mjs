// @ts-check
import { defineConfig } from 'astro/config';
import wix from "@wix/astro";
import wixPages from "@wix/astro-pages";
import wixHostingAdapter from "@wix/astro-wix-hosting-adapter";

// Know The Company runs as one browser app (public/app.js). This Astro project is the server around it:
// every address gets the app's page shell with that page's own title, description, canonical tag and a
// short text version of the page, so addresses can be clean (/company/future-topper, /pricing).
export default defineConfig({
  integrations: [wix(), wixPages()],
  security: { checkOrigin: false },
  adapter: wixHostingAdapter(),
  output: "server",
});
