"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DayAssignments } from "@/lib/assignments";

/**
 * « Affectations du jour »: the manager picks a server, then taps their tables, rooms and areas
 * for today. A table belongs to one server: giving it to someone takes it from the other.
 */
export function AssignmentsEditor({ data, canEdit }: { data: DayAssignments; canEdit: boolean }) {
  const t = useTranslations("assignments");
  const router = useRouter();
  const [who, setWho] = useState<string | null>(data.people[0]?.id ?? null);
  const person = data.people.find((p) => p.id === who) ?? null;
  const [seatIds, setSeatIds] = useState<string[]>(person?.seatIds ?? []);
  const [areaIds, setAreaIds] = useState<string[]>(person?.areaIds ?? []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ownerOf = new Map(data.people.flatMap((p) => p.seatIds.map((s) => [s, p] as const)));
  const pick = (id: string) => {
    const p = data.people.find((x) => x.id === id);
    setWho(id);
    setSeatIds(p?.seatIds ?? []);
    setAreaIds(p?.areaIds ?? []);
    setMsg(null);
  };
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const post = async (body: unknown) => {
    setBusy(true);
    const res = await fetch("/api/app/assignments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    return res?.ok ? ((await res.json()) as Record<string, number>) : null;
  };
  const save = async () => {
    if (!who) return;
    const r = await post({ memberId: who, seatIds, areaIds });
    setMsg(r ? t("saved") : t("error"));
    router.refresh();
  };
  const copy = async () => {
    const r = await post({ copyYesterday: true });
    setMsg(r ? (r.copied ? t("copied", { n: r.copied }) : t("nothingToCopy")) : t("error"));
    router.refresh();
  };
  const label = (p: { name: string; staffNo: number | null }) => `${p.name}${p.staffNo != null ? ` · ${String(p.staffNo).padStart(3, "0")}` : ""}`;
  const seatName = (s: { type: string; label: string }) => (s.type === "room" ? `🛋️ ${s.label}` : s.type === "area" ? `🌿 ${s.label}` : s.label);

  return (
    <div className="flex flex-col gap-4" data-testid="assignments">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold">🗂️ {t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("intro")}</p>
        </div>
        {canEdit && (
          <button type="button" disabled={busy} onClick={() => void copy()} className="min-h-11 rounded-xl border border-border px-3 text-sm font-bold">
            ↺ {t("copyYesterday")}
          </button>
        )}
      </div>

      {/* Summary: who has what today. */}
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {data.people.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => pick(p.id)} aria-pressed={who === p.id} className="flex min-h-14 w-full flex-col items-start rounded-2xl border-2 border-border bg-surface p-3 text-left aria-pressed:border-primary" data-testid="assign-person" data-name={p.name}>
              <span className="font-bold">{label(p)}</span>
              <span className="text-xs text-muted-foreground">
                {p.seatIds.length + p.areaIds.length === 0
                  ? t("none")
                  : [
                      ...p.areaIds.map((a) => data.areas.find((x) => x.id === a)?.name ?? ""),
                      ...p.seatIds.map((s) => data.seats.find((x) => x.id === s)?.label ?? ""),
                    ]
                      .filter(Boolean)
                      .join(", ")}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {data.people.length === 0 && <p className="text-sm text-muted-foreground">{t("noPeople")}</p>}

      {person && canEdit && (
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" aria-label={label(person)}>
          <h2 className="font-extrabold">{t("for", { name: person.name })}</h2>
          {data.areas.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-semibold">{t("areas")}</p>
              <div className="flex flex-wrap gap-2">
                {data.areas.map((a) => (
                  <button key={a.id} type="button" onClick={() => setAreaIds((l) => toggle(l, a.id))} aria-pressed={areaIds.includes(a.id)} className="min-h-11 rounded-xl border-2 border-border px-3 font-semibold aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground">
                    {a.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="mb-1 text-sm font-semibold">{t("seats")}</p>
            <div className="flex flex-wrap gap-2">
              {data.seats.map((s) => {
                const other = ownerOf.get(s.id);
                const taken = other && other.id !== person.id && !seatIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSeatIds((l) => toggle(l, s.id))}
                    aria-pressed={seatIds.includes(s.id)}
                    title={taken ? t("takenBy", { name: other!.name }) : undefined}
                    className={`min-h-11 min-w-11 rounded-xl border-2 px-3 font-bold aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground ${taken ? "border-dashed border-muted-foreground/50 text-muted-foreground" : "border-border"}`}
                    data-testid="assign-seat"
                    data-label={s.label}
                  >
                    {seatName(s)}
                    {taken && <span className="ml-1 text-[10px]">({other!.name.split(" ")[0]})</span>}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("oneServer")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={busy} onClick={() => void save()} className="min-h-12 rounded-xl bg-primary px-5 font-extrabold text-primary-foreground disabled:opacity-50" data-testid="assign-save">
              {t("save")}
            </button>
            {msg && (
              <p role="status" className="text-sm font-semibold">
                {msg}
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
