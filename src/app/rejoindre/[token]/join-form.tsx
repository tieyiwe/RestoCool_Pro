"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { joinAction, type JoinState } from "../actions";

const field = "min-h-12 w-full rounded-xl border-2 border-border bg-white px-3 text-base text-[#17231c] [color-scheme:light] focus:border-primary";

export function JoinForm({ token }: { token: string }) {
  const t = useTranslations("join");
  const [state, action, pending] = useActionState<JoinState, FormData>(joinAction, undefined);
  // Kept after an error (React resets the form); the PINs are cleared on purpose.
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  return (
    <form action={action} className="flex flex-col gap-4" data-testid="join-form">
      <input type="hidden" name="token" value={token} />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">{t("name")}</span>
        <input name="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={3} maxLength={60} autoComplete="name" placeholder={t("namePlaceholder")} className={field} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">{t("phone")}</span>
        <input name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} required type="tel" inputMode="tel" autoComplete="tel" placeholder="+226 70 00 00 00" className={field} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">{t("pin")}</span>
          <input name="pin" required type="password" inputMode="numeric" pattern="\d{4,6}" maxLength={6} autoComplete="new-password" className={`${field} text-center tracking-[0.4em]`} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">{t("pin2")}</span>
          <input name="pin2" required type="password" inputMode="numeric" pattern="\d{4,6}" maxLength={6} autoComplete="new-password" className={`${field} text-center tracking-[0.4em]`} />
        </label>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">{t("pinHint")}</p>
      {state?.error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-900" data-testid="join-error">
          {t(`error.${state.error}`)}
        </p>
      )}
      <button disabled={pending} className="min-h-14 rounded-2xl bg-primary px-5 text-lg font-bold text-primary-foreground disabled:opacity-60" data-testid="join-submit">
        {pending ? t("sending") : t("submit")}
      </button>
    </form>
  );
}
