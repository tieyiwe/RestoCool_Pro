"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { clearStaffOffline, flushStaffOutbox, pendingActions } from "@/lib/offline/staff-outbox";
import { OfflineBanner, useOnline } from "./offline-banner";

const OWNER_KEY = "rc-offline-owner";

/**
 * Staff app: offline banner (with the number of actions waiting), sends the waiting actions when
 * the network is back, and erases what the device kept when another person or business uses it.
 * `who` = business + person signed in (or null: nobody, e.g. sign-in page or locked tablet).
 */
export function StaffOfflineSync({ who }: { who: string | null }) {
  const t = useTranslations("app.offline");
  const online = useOnline();
  const [count, setCount] = useState(0);
  const [skipped, setSkipped] = useState(false);

  // Someone else (or nobody) on this device: forget the previous person's data and actions.
  useEffect(() => {
    let prev: string | null = null;
    try {
      prev = localStorage.getItem(OWNER_KEY);
      if (who) localStorage.setItem(OWNER_KEY, who);
      else localStorage.removeItem(OWNER_KEY);
    } catch {
      /* ignore */
    }
    if (!who || (prev && prev !== who)) void clearStaffOffline();
    setCount(pendingActions().length);
  }, [who]);

  useEffect(() => {
    if (!who) return;
    const onCount = (e: Event) => setCount((e as CustomEvent<number>).detail ?? pendingActions().length);
    const onSkipped = () => {
      setSkipped(true);
      window.setTimeout(() => setSkipped(false), 6000);
    };
    const flush = () => void flushStaffOutbox();
    window.addEventListener("rc:outbox", onCount);
    window.addEventListener("rc:outbox-skipped", onSkipped);
    window.addEventListener("online", flush);
    window.addEventListener("rc:net-ok", flush);
    flush();
    const id = window.setInterval(() => pendingActions().length && navigator.onLine && flush(), 10_000);
    return () => {
      window.removeEventListener("rc:outbox", onCount);
      window.removeEventListener("rc:outbox-skipped", onSkipped);
      window.removeEventListener("online", flush);
      window.removeEventListener("rc:net-ok", flush);
      window.clearInterval(id);
    };
  }, [who]);

  if (!who) return null;
  return (
    <div className="print:hidden" data-testid="staff-offline">
      <OfflineBanner text={{ title: t("title"), check: t("check"), hint: t("hint"), pending: t("pending", { n: count }), back: t("back") }} pending={count} />
      {count > 0 && online && (
        <p role="status" className="bg-amber-100 px-4 py-1.5 text-center text-xs font-semibold text-amber-950" data-testid="staff-sync-waiting">
          ⏳ {t("pending", { n: count })}
        </p>
      )}
      {skipped && (
        <p role="status" className="bg-amber-100 px-4 py-1.5 text-center text-xs font-semibold text-amber-950" data-testid="staff-sync-skipped">
          {t("skipped")}
        </p>
      )}
    </div>
  );
}
