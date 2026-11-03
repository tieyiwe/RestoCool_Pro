import type { MetadataRoute } from "next";
import { BRAND } from "@/config/brand";

/** Staff/owner app manifest (values from docs/brand/site.webmanifest). Public menus get their own per restaurant. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RestoCool",
    short_name: "RestoCool",
    description: "Votre menu, vos commandes, vos tables. Simple.",
    lang: "fr",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: BRAND.creme,
    theme_color: BRAND.vert,
    icons: [
      { src: "/brand/png/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/png/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // TODO(brand kit): add maskable-192/512 when the files are provided.
    ],
  };
}
