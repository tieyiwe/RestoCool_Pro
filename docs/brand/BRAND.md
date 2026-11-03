# RestoCool brand kit: instructions for Claude Code

This folder is the **source of truth** for the RestoCool look. Use these files as they are. Don't redraw the logo, change the colors, or invent new ones.

## 1. Where to put the files (Next.js App Router)

Copy this folder into the project so that:

| From this kit | Goes to | Why |
|---|---|---|
| `svg/`, `png/` | `public/brand/svg/`, `public/brand/png/` | Logos and icons served as static files |
| `favicon.ico` | `app/favicon.ico` | Next.js serves it automatically |
| `svg/restocool-favicon.svg` | `app/icon.svg` | Modern browsers use the SVG favicon |
| `png/apple-touch-icon.png` | `app/apple-icon.png` | iPhone "Add to Home Screen" |
| `png/og-image-1200x630.png` | `app/opengraph-image.png` (and `app/twitter-image.png`) | Preview when restocool.com is shared on WhatsApp, Facebook, X |
| `site.webmanifest` | `app/manifest.webmanifest` (or generate it with `app/manifest.ts` using the same values) | Installable PWA |
| `tokens/brand.css` | imported at the top of `app/globals.css` | Tailwind v4 `@theme` colors, fonts, radius, shadcn variables |
| `tokens/brand-tokens.json` | `src/config/brand-tokens.json` | Same values for TypeScript (charts, PDFs, emails, QR cards) |

Load the fonts with `next/font/google` (`Baloo_2` weights 600 and 800, `Manrope` weights 500 and 700, `display: "swap"`, subsets `latin` and `latin-ext`), and map them to `--font-display` and `--font-sans`. Remove the `@import` line in `brand.css` once next/font is set up.

## 2. Which file to use where

| Situation | File |
|---|---|
| Header of the landing page, app top bar (light) | `restocool-logo-horizontal.svg` |
| On dark green or photo backgrounds | `restocool-logo-horizontal-dark.svg` |
| Login screen, splash screen, centered layouts | `restocool-logo-stacked.svg` |
| Small spaces (collapsed sidebar, avatar, loading spinner) | `restocool-icon.svg` |
| Footer badge on every restaurant's public menu | `restocool-favicon.svg` at 24 to 28px + text « Menu par **RestoCool** · Powered by **TIBLOGICS** » |
| One-color uses (receipts, PDF tickets, stamps, embroidery, laser engraving) | `restocool-mark-ink.svg` or `restocool-mark-white.svg` |
| On cream/sand without the green square | `restocool-mark.svg` |
| Play Store / App Store icon (later, with Capacitor) | `png/app-icon-1024.png` (square, the store rounds it) |
| Android adaptive icon foreground | `svg/restocool-icon-maskable.svg` (artwork inside the safe zone) |
| QR table cards (PDF) | `restocool-icon.svg` on cream, or the white mark on green, with the restaurant's own name first |

All logo SVGs have the wordmark **converted to shapes**, so they look identical with or without the font installed. Keep them as `<img>` or Next `<Image>`, or inline them as React components (SVGR) when a color change is needed.

## 3. Rules (enforce them in code review)

- **Clear space:** keep empty space around the logo at least the height of the star (about 20 % of the icon size).
- **Minimum size:** horizontal logo 120px wide on screens; icon 24px; below 32px always use `restocool-favicon.svg` (simplified).
- **Never:** stretch, rotate, add shadows or outlines, recolor the star anything other than gold (#E9B530), or the laterite (#B24A26) on light, put the light logo on a busy photo without a dark overlay, or rewrite "RestoCool" in another font. Never use the Burkina Faso flag or official state symbols next to the logo as if they were part of it.
- **Name:** always one word, capital R and capital C: **RestoCool**. Never "Resto Cool", "Restocool", or "RESTOCOOL" in body text.
- **Restaurants come first:** on a restaurant's public menu, its own logo, name and theme lead. RestoCool appears only in the footer badge (and is hideable on the Business plan).

## 4. Colors and accessibility

| Token | Hex | Use | Text on it |
|---|---|---|---|
| `vert` | #0F6B3E | primary buttons, links, active tabs | `creme` (6.2:1) |
| `nuit` | #0B3D26 | hero, footer, premium sections, dark mode background | `creme` (11.6:1), `or` (6.5:1) |
| `or` | #E9B530 | star, badges, highlights, dark-mode primary | `encre` (8.6:1) |
| `laterite` | #B24A26 | errors, alerts, "spicy", destructive actions | `creme` (5.1:1) |
| `creme` | #FFF8EC | main light background | `encre` (15.4:1) |
| `sable` | #F1E6D0 | cards, secondary panels | `encre` |
| `encre` | #17231C | body text | |
| `encre-2` | #3E4A42 | secondary text | |
| `ligne` | #E4D9C2 | borders | |

- **Gold on green** is only 3.5:1, so use it for large text (24px and up) or decoration only.
- **Ratio:** about 60 % cream, 22 % green, 10 % dark green, 8 % gold and laterite. Gold stays an accent; never a full-page background.
- **Status colors** (orders): new = `or`, confirmed/preparing = `vert`, ready = `#2F7DD1` (blue, so it differs from green in lightness, not hue alone), served = `encre-2`, cancelled = `laterite`. Always pair the color with an icon or label.

## 5. Typography

- **Baloo 2** (600, 800): logo, page titles, big numbers (totals, table numbers). Warm and rounded.
- **Manrope** (500, 700): everything else. Use `tabular-nums` on prices, totals and timers.
- Sizes (mobile first): body 16px, small 14px, H1 32 to 40px, H2 24px. Inputs always 16px (no zoom on iPhone).

## 6. "100 % local" elements

- Badge: green pill, gold star, text « 100 % local » (see `og-image.svg` for the reference shape). Use it on the landing page, sign-up, the "About" screen and marketing visuals.
- Taglines: « Votre menu, vos commandes, vos tables. Simple. » · « Pensé au Burkina, pour les restaurants du Burkina » · « Fièrement burkinabè ».
- Only make local claims that the owner has confirmed are true (see the master prompt's honesty rule).

## 7. Licenses

Baloo 2 and Manrope are under the SIL Open Font License (free for commercial use, including the outlined logo). The logo, icon and artwork are original to RestoCool / TIBLOGICS.
