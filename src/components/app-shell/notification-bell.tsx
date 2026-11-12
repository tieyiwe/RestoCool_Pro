"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type Popup = { id: string; kind: string; title: string; body: string; link: string | null };
type Summary = { unread: number; support: number; popup: Popup | null };

const POLL_MS = 45_000;

/**
 * Bell in the app header: unread messages from RestoCool + answers to support requests. Checks
 * every 45 s while visible, on each screen change, and right away on a live « notice ».
 * A new-feature message opens once as a pop-up.
 */
export function NotificationBell({ initial, labels }: { initial: Summary; labels: { bell: string; newTitle: string; open: string; later: string; kinds: Record<string, string> } }) {
  const [s, setS] = useState(initial);
  const [popup, setPopup] = useState<Popup | null>(initial.popup);
  const path = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);

  const refresh = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const r = await fetch("/api/app/notifications", { cache: "no-store", headers: { "x-rc-passive": "1" } });
      if (!r.ok) return;
      const next = (await r.json()) as Summary;
      setS(next);
      if (next.popup) setPopup((cur) => cur ?? next.popup);
    } catch {
      /* offline: keep the last count */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [path, refresh]);

  useEffect(() => {
    const id = setInterval(refresh, POLL_MS);
    const onVisible = () => void refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("rc:notice", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("rc:notice", onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    if (popup && !path.startsWith("/app/notifications") && !dialog.current?.open) dialog.current?.showModal();
  }, [popup, path]);

  const close = (go?: boolean) => {
    if (!popup) return;
    void fetch("/api/app/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [popup.id] }) }).catch(() => {});
    dialog.current?.close();
    setPopup(null);
    setS((x) => ({ ...x, unread: Math.max(0, x.unread - 1), popup: null }));
    if (go && popup.link) window.location.assign(popup.link);
  };

  const total = s.unread + s.support;
  return (
    <>
      <Link href="/app/notifications" aria-label={`${labels.bell}${total ? ` (${total})` : ""}`} className="relative inline-flex size-11 items-center justify-center rounded-full hover:bg-muted" data-testid="notification-bell">
        <span aria-hidden className="text-xl">
          🔔
        </span>
        {total > 0 && (
          <span className="absolute top-1 right-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] leading-5 font-bold text-white" data-testid="notification-count">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </Link>
      <dialog ref={dialog} onCancel={(e) => (e.preventDefault(), close())} className="m-auto w-[min(92vw,30rem)] rounded-3xl border border-border bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/50" aria-labelledby="rc-popup-title" data-testid="notification-popup">
        {popup && (
          <div className="flex flex-col gap-3 p-6">
            <p className="text-sm font-bold text-primary">✨ {labels.kinds[popup.kind] ?? labels.newTitle}</p>
            <h2 id="rc-popup-title" className="text-xl font-extrabold">
              {popup.title}
            </h2>
            <p className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap">{popup.body}</p>
            <div className="mt-2 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => close()} className="min-h-11 rounded-xl border border-border px-4 font-semibold" data-testid="notification-popup-close">
                {labels.later}
              </button>
              {popup.link && (
                <button type="button" onClick={() => close(true)} className="min-h-11 rounded-xl bg-primary px-4 font-bold text-primary-foreground">
                  {labels.open}
                </button>
              )}
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
