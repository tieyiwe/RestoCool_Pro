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
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self), payment=(), usb=(), serial=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  ...(isProd
    ? [
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        // Other sites can't get a handle on our windows (sign-in popups stay allowed).
        { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
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
    // Private areas, APIs and token links (table / bus QR) never appear in search results, even
    // when a link leaks: robots.txt closes them and this header covers non-HTML answers too.
    // Dish photos (/api/media) stay indexable.
    const noindex = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];
    return [
      { source: "/:path*", headers: securityHeaders },
      ...["/app/:path*", "/admin/:path*", "/api/:path((?!media/).*)", "/poste/:path*", "/pointage/:path*", "/rejoindre/:path*", "/o/:path*", "/r/:slug/t/:path*", "/r/:slug/b/:path*"].map(
        (source) => ({ source, headers: noindex }),
      ),
    ];
  },
};

export default withNextIntl(nextConfig);
