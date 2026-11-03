import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Keep pg out of the client/edge bundles.
  serverExternalPackages: ["pg"],
};

export default withNextIntl(nextConfig);
