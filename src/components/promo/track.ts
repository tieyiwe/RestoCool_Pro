/** Counts a promotion seen (once per visit) or tapped. Fire-and-forget. */
export function trackPromo(id: string, kind: "view" | "click") {
  try {
    if (kind === "view") {
      const k = `rc-pv-${id}`;
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, "1");
    }
  } catch {
    /* storage blocked: count anyway */
  }
  const body = JSON.stringify({ id, kind });
  if (navigator.sendBeacon?.(new URL("/api/public/promo", location.href).toString(), new Blob([body], { type: "application/json" }))) return;
  void fetch("/api/public/promo", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
}
