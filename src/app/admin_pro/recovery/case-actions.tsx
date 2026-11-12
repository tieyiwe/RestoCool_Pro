"use client";

import { useActionState } from "react";
import { recoveryAction, type RecoveryState } from "./actions";

type Member = { id: string; name: string | null; email: string | null; role: string; staffNo: number | null; active: boolean; hasPin: boolean; locked: boolean; signIn: boolean };
type Labels = Record<string, string>;

const btn = "min-h-11 rounded-lg px-3 text-sm font-bold";

/** Actions on a verified case. The new PIN is shown once, here, to read to the caller. */
export function CaseActions({ caseId, team, labels }: { caseId: string; team: Member[]; labels: Labels }) {
  const [state, act, pending] = useActionState<RecoveryState, FormData>(recoveryAction, undefined);
  const hidden = (m: Member) => (
    <>
      <input type="hidden" name="case" value={caseId} />
      <input type="hidden" name="member" value={m.id} />
      <input type="hidden" name="name" value={m.name ?? m.email ?? ""} />
    </>
  );
  return (
    <div className="flex flex-col gap-4">
      {state?.pin && (
        <div role="status" className="rounded-2xl border-2 border-emerald-500 bg-emerald-50 p-4 text-emerald-950" data-testid="recovery-pin">
          <p className="font-semibold">{labels.newPin?.replace("{name}", state.who ?? "")}</p>
          <p className="my-2 font-mono text-4xl font-extrabold tracking-[0.3em]">{state.pin}</p>
          <p className="text-sm">{labels.newPinHint}</p>
        </div>
      )}
      {state?.ok && !state.pin && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900" data-testid="recovery-ok">
          ✓ {labels[`ok_${state.ok}`]?.replace("{name}", state.who ?? "")}
        </p>
      )}
      {state?.error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900" data-testid="recovery-error">
          {labels[`err_${state.error}`]}
        </p>
      )}
      <ul className="flex flex-col divide-y divide-border">
        {team.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid="recovery-member">
            <span className="text-sm">
              <span className="font-mono text-xs text-muted-foreground">{String(m.staffNo ?? 0).padStart(3, "0")}</span> <b>{m.name ?? m.email ?? "—"}</b> · {labels[`role_${m.role}`] ?? m.role}
              {!m.active && <span className="text-muted-foreground"> · {labels.inactive}</span>}
              {m.locked && <span className="ml-1 rounded bg-red-100 px-1.5 text-xs font-bold text-red-900">{labels.locked}</span>}
            </span>
            <span className="flex flex-wrap gap-2">
              {m.locked && (
                <form action={act}>
                  {hidden(m)}
                  <input type="hidden" name="what" value="unlock" />
                  <button disabled={pending} className={`${btn} border border-border bg-surface`}>
                    {labels.unlock}
                  </button>
                </form>
              )}
              {!(m.role === "owner" && m.signIn) && (
                <form action={act} onSubmit={(e) => !confirm(labels.resetConfirm?.replace("{name}", m.name ?? "") ?? "") && e.preventDefault()}>
                  {hidden(m)}
                  <input type="hidden" name="what" value="reset" />
                  <button disabled={pending} className={`${btn} bg-primary text-primary-foreground`} data-testid="recovery-reset">
                    {m.hasPin ? labels.resetPin : labels.setPin}
                  </button>
                </form>
              )}
              {m.signIn && (
                <form action={act}>
                  {hidden(m)}
                  <input type="hidden" name="what" value="signin" />
                  <button disabled={pending} className={`${btn} border border-border bg-surface`}>
                    {labels.unlockSignIn}
                  </button>
                </form>
              )}
            </span>
          </li>
        ))}
      </ul>
      <form action={act} className="flex flex-col gap-2 rounded-2xl border border-border p-4" data-testid="recovery-owner-form">
        <input type="hidden" name="case" value={caseId} />
        <input type="hidden" name="what" value="owner" />
        <p className="font-semibold">{labels.ownerTitle}</p>
        <p className="text-xs text-muted-foreground">{labels.ownerHint}</p>
        <div className="flex flex-wrap gap-2">
          <input name="email" type="email" required maxLength={200} placeholder="nouvelle@adresse.com" aria-label={labels.ownerTitle} className="min-h-11 min-w-64 flex-1 rounded-lg border border-border bg-surface px-3 text-base" />
          <button disabled={pending} className={`${btn} bg-nuit text-creme`} onClick={(e) => !confirm(labels.ownerConfirm ?? "") && e.preventDefault()}>
            {labels.ownerSubmit}
          </button>
        </div>
      </form>
    </div>
  );
}
