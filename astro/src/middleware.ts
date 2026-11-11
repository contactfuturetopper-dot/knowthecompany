// Security headers on every page the server returns (static files in public/ are served by Wix's CDN
// and don't pass through here).
//   - Content-Security-Policy: scripts only from this site; data only to Wix's APIs; no other site can
//     put these pages in a frame (badge.html is a static file, so it can still be embedded).
//     Razorpay Checkout (listing payments) loads its script and payment frames from *.razorpay.com.
//   - Referrer-Policy, Permissions-Policy, X-Frame-Options (for older browsers) and HSTS with subdomains.
import { defineMiddleware } from "astro:middleware";

const CSP = [
  "default-src 'self'",
  "script-src 'self' https://checkout.razorpay.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://www.wixapis.com https://*.wixapis.com https://*.wix.com https://*.razorpay.com",
  "frame-src 'self' https://*.razorpay.com",
  "frame-ancestors 'self'",
  "form-action 'self' https://*.razorpay.com",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

function secure(res: Response) {
  const h = res.headers;
  if ((h.get("content-type") || "").includes("text/html")) {
    h.set("Content-Security-Policy", CSP);
    h.set("X-Frame-Options", "SAMEORIGIN");
  }
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), usb=(), interest-cohort=()");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  return res;
}

export const onRequest = defineMiddleware(async (_ctx, next) => {
  const res = await next();
  try { return secure(res); }
  catch { return secure(new Response(res.body, res)); } /* a response with locked headers (a redirect) */
});
