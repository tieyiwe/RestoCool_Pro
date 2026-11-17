"use client";

import { useEffect, useState } from "react";
import { formatFCFA } from "@/lib/format";
import { makeT, type Messages } from "@/lib/public-menu/translate";
import { deviceId } from "@/components/public-menu/seating";

type Status = { status: string; amount: number; method: string; billSettled: boolean };

export function PaymentStatus({ slug, intentId, name, messages }: { slug: string; intentId: string; name: string; messages: Record<"fr" | "en" | "zh", Messages> }) {
  const [lang, setLang] = useState<"fr" | "en" | "zh">("fr");
  const [s, setS] = useState<Status | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    try {
      const l = sessionStorage.getItem("rc-lang");
      if (l === "en" || l === "zh") setLang(l);
    } catch {}
  }, []);
  useEffect(() => {
    let stop = false;
    async function poll() {
      const res = await fetch(`/api/public/pay/${intentId}?slug=${encodeURIComponent(slug)}&deviceId=${encodeURIComponent(deviceId())}`, { cache: "no-store" }).catch(() => null);
      if (stop) return;
      if (res?.status === 404) return setMissing(true);
      if (res?.ok) {
        const body = (await res.json()) as Status;
        setS(body);
        if (body.status === "succeeded" || body.status === "failed" || body.status === "expired" || body.status === "cancelled") return;
      }
      setTimeout(() => void poll(), 4000);
    }
    void poll();
    return () => {
      stop = true;
    };
  }, [intentId, slug]);
  const t = makeT(messages[lang]);
  const done = s?.status === "succeeded";
  const failed = s && ["failed", "expired", "cancelled"].includes(s.status);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center" data-testid="payment-status">
      <p className="text-sm font-semibold text-muted-foreground">{name}</p>
      <h1 className="text-2xl font-extrabold">{t("payTitle")}</h1>
      {missing ? (
        <p>{t("payNotFound")}</p>
      ) : done ? (
        <p className="text-xl font-bold text-green-700" data-testid="payment-ok">✅ {t("paySucceeded")}</p>
      ) : failed ? (
        <>
          <p className="text-xl font-bold text-red-700">{t("payFailed")}</p>
          <p>{t("payFailedSub")}</p>
          <a href={`/r/${slug}#orders`} className="flex min-h-11 items-center rounded-xl border border-border px-4 font-bold">{t("payRetry")}</a>
        </>
      ) : (
        <>
          <div className="size-10 animate-spin rounded-full border-4 border-border border-t-green-700 motion-reduce:animate-none" aria-hidden />
          <p className="font-bold">{t("payWaiting")}</p>
          <p className="text-sm">{t("payWaitingSub")}</p>
        </>
      )}
      {s && <p className="text-sm">{t("payAmount", { amount: formatFCFA(s.amount) ?? "" })}</p>}
      <a href={`/r/${slug}`} className="mt-4 underline">{t("payBack")}</a>
    </main>
  );
}
