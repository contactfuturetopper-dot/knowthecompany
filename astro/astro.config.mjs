// @ts-check
import { defineConfig, envField } from 'astro/config';
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
  // Razorpay keys for listing payments (src/lib/pay.ts). Set on Wix's servers with `wix env set`, never in
  // the code; the publish workflow does it from the repository secrets of the same names. Until they are
  // set, the payment buttons say payments aren't switched on yet.
  env: {
    schema: {
      RAZORPAY_KEY_ID: envField.string({ context: "server", access: "secret", optional: true }),
      RAZORPAY_KEY_SECRET: envField.string({ context: "server", access: "secret", optional: true }),
      RAZORPAY_WEBHOOK_SECRET: envField.string({ context: "server", access: "secret", optional: true }),
      // Review invitation emails for the Business plan (src/lib/business.ts): a Brevo API key and the sender
      // address verified in Brevo. Until both are set, invitations go by WhatsApp and review links only.
      BREVO_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      INVITE_SENDER_EMAIL: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
