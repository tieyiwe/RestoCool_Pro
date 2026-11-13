/**
 * robots.txt rules (src/app/robots.ts). Private areas and secret links are never crawled: table
 * and bus QR links carry a token (« /r/x/t/<token> », « /r/x/b/<token> ») and their pages also
 * say noindex. The super admin console is deliberately NOT listed (robots.txt is public and
 * would reveal its address); it is protected by sign-in and says noindex itself. « /app$ » + « /app/ » rather than « /app », which would also block /apple-icon.png.
 */
export const DISALLOW = [
  "/app$",
  "/app/",
  "/api/",
  "/poste",
  "/pointage",
  "/rejoindre",
  "/o/",
  "/reservation/",
  "/sign-in",
  "/sign-up",
  "/r/*/t/",
  "/r/*/b/",
  "/*?*preview",
  "/__clerk",
] as const;

/** Photos of dishes live under /api/media/: allowed so image search can show them. */
export const ALLOW = ["/", "/api/media/"] as const;

/**
 * Search engines and AI assistants (search, answers, training) named explicitly: all are welcome
 * on public pages, with the same private areas closed.
 */
export const KNOWN_CRAWLERS = [
  "Googlebot",
  "Bingbot",
  "Applebot",
  "DuckDuckBot",
  "YandexBot",
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "DuckAssistBot",
  "Meta-ExternalAgent",
  "MistralAI-User",
  "CCBot",
] as const;
