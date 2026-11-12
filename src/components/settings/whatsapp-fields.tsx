"use client";

import { useState } from "react";

/**
 * The business's WhatsApp, and the question « Est-ce ce WhatsApp qui reçoit vos commandes à
 * emporter ? » (checked = yes). Unchecked, a second number is asked: takeaway orders go there.
 */
export function WhatsappFields({
  label,
  input,
  whatsapp,
  takeaway,
  t,
}: {
  label: string;
  input: string;
  whatsapp: string;
  takeaway: string;
  t: { whatsapp: string; question: string; hint: string; other: string };
}) {
  const [same, setSame] = useState(!takeaway);
  return (
    <div className="flex flex-col gap-2 sm:col-span-3">
      <label>
        <span className={label}>{t.whatsapp}</span>
        <input name="whatsapp" type="tel" inputMode="tel" defaultValue={whatsapp} className={input} data-testid="whatsapp-input" />
      </label>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/40 p-3">
        <input type="checkbox" name="takeawaySame" checked={same} onChange={(e) => setSame(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--color-primary)]" data-testid="takeaway-same" />
        <span>
          <span className="block text-sm font-semibold">🛍️ {t.question}</span>
          <span className="block text-xs text-muted-foreground">{t.hint}</span>
        </span>
      </label>
      {!same && (
        <label>
          <span className={label}>{t.other}</span>
          <input name="takeawayWhatsapp" type="tel" inputMode="tel" defaultValue={takeaway} required placeholder="+226 70 00 00 00" className={input} data-testid="takeaway-whatsapp" />
        </label>
      )}
    </div>
  );
}
