"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Order page: who serves this order, and (managers) give it to someone else or to everyone. */
export function Reassign({ orderId, current, people, canEdit }: { orderId: string; current: string | null; people: Array<{ id: string; label: string }>; canEdit: boolean }) {
  const t = useTranslations("assignments");
  const router = useRouter();
  const [value, setValue] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  const name = people.find((p) => p.id === current)?.label ?? t("pool");
  if (!canEdit)
    return (
      <p className="text-sm" data-testid="order-assignee">
        {t("servedBy")} <strong>{name}</strong>
      </p>
    );
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm font-semibold" data-testid="order-assignee">
      {t("servedBy")}
      <select
        value={value}
        disabled={busy}
        onChange={async (e) => {
          const v = e.target.value;
          setValue(v);
          setBusy(true);
          await fetch(`/api/app/orders/${orderId}/assign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberId: v || null }) }).catch(() => null);
          setBusy(false);
          router.refresh();
        }}
        className="min-h-11 rounded-xl border border-border bg-surface px-2 text-base"
        data-testid="order-reassign"
      >
        <option value="">{t("pool")}</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
    </label>
  );
}
