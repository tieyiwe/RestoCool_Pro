import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isProd = process.env.NODE_ENV === "production";

/**
 * Conservative security headers. No script-src CSP yet (Clerk, next/font and inline styles
 * would need nonces); framing is only blocked in production because the Replit workspace
 * previews the dev server inside an iframe.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
  ...(isProd
    ? [
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
        { key: "Strict-Transport-Security", value: "max-age=31536000" },
      ]
    : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Keep pg out of the client/edge bundles.
  serverExternalPackages: ["pg"],
  // French-friendly aliases for the legal pages.
  async redirects() {
    return [
      { source: "/confidentialite", destination: "/privacy?lang=fr", permanent: true },
      { source: "/conditions", destination: "/terms?lang=fr", permanent: true },
      { source: "/cgu", destination: "/terms?lang=fr", permanent: true },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
