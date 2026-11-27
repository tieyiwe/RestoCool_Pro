/**
 * Recovery after a new version is published. A page opened before (or during) a publish can ask
 * for JavaScript files or server actions of the previous version, which no longer exist; the page
 * then crashes. Reloading once loads the new version and fixes it.
 *
 * The same guard is used by the early script in the root layout and by the error screens: at most
 * one automatic reload every RELOAD_GAP_MS, so a real bug never turns into a reload loop.
 */
export const RELOAD_KEY = "rc-recover-at";
export const RELOAD_GAP_MS = 20_000;


/**
 * Inline script for <head>: runs before Next's scripts, reloads once when one of our own
 * /_next/ files fails to load (deleted by the new version, or the server restarting), or when a
 * lazy chunk / server action of the old version is refused.
 */
export const EARLY_RECOVER_SCRIPT = `(function(){var K=${JSON.stringify(RELOAD_KEY)},G=${RELOAD_GAP_MS};function r(){try{var n=Date.now(),l=+(sessionStorage.getItem(K)||0);if(n-l<G)return;sessionStorage.setItem(K,String(n))}catch(e){return}location.reload()}addEventListener("error",function(e){var t=e&&e.target;if(t&&(t.tagName==="SCRIPT"||t.tagName==="LINK")){var u=t.src||t.href||"";if(u.indexOf("/_next/")>-1)r()}},true);addEventListener("unhandledrejection",function(e){var x=e&&e.reason,m=x?String((x.name||"")+" "+(x.message||x)):"";if(/ChunkLoadError|Loading (CSS )?chunk|dynamically imported module|Server Action/i.test(m))r()})})();`;

/** Reloads once (same guard as the early script). Returns false when it just reloaded. */
export function reloadOnce(): boolean {
  try {
    const now = Date.now();
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (now - last < RELOAD_GAP_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(now));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
