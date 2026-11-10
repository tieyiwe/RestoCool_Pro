"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { clearLocationAction, saveGpsLocationAction, saveLinkLocationAction, type LocationResult } from "@/app/app/settings/actions";
import { osmEmbedUrl, placeUrl, type LatLng } from "@/lib/location/parse";

type Phase = "idle" | "confirm" | "locating";

/**
 * « Emplacement » of the business: from the phone's GPS while on site (after a clear warning that
 * customers will see it), or from a Google Maps link. Previewed on a free OpenStreetMap frame.
 */
export function LocationField({ initial }: { initial: (LatLng & { source: string | null; accuracyM: number | null }) | null }) {
  const t = useTranslations("location");
  const [point, setPoint] = useState(initial);
  const [phase, setPhase] = useState<Phase>("idle");
  const [link, setLink] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const handle = (res: LocationResult, source: "gps" | "link", accuracyM: number | null) => {
    if (res?.ok) {
      setPoint({ lat: res.lat, lng: res.lng, source, accuracyM });
      setMsg({ kind: "ok", text: t("saved") });
      setLink("");
    } else setMsg({ kind: "error", text: t(`error.${res?.error ?? "unknown"}`) });
  };

  const useGps = () => {
    setMsg(null);
    if (!("geolocation" in navigator)) {
      setPhase("idle");
      setMsg({ kind: "error", text: t("error.noGps") });
      return;
    }
    setPhase("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const accuracyM = Math.round(pos.coords.accuracy);
        start(async () => {
          handle(await saveGpsLocationAction({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM }), "gps", accuracyM);
          setPhase("idle");
        });
      },
      (err) => {
        setPhase("idle");
        setMsg({ kind: "error", text: t(err.code === err.PERMISSION_DENIED ? "error.denied" : "error.noGps") });
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  };

  const useLink = () => {
    setMsg(null);
    start(async () => handle(await saveLinkLocationAction(link), "link", null));
  };

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/30 p-4" aria-labelledby="loc-title" data-testid="location-field">
      <div>
        <h3 id="loc-title" className="font-bold">
          📍 {t("title")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
      </div>

      {point && (
        <div className="flex flex-col gap-2" data-testid="location-saved">
          <iframe
            title={t("previewTitle")}
            src={osmEmbedUrl(point)}
            loading="lazy"
            className="h-48 w-full rounded-xl border border-border"
            referrerPolicy="no-referrer"
          />
          <p className="text-xs text-muted-foreground">
            {point.source === "gps" && point.accuracyM != null ? t("savedGps", { m: point.accuracyM }) : t("savedLink")} · {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
          </p>
          <div className="flex flex-wrap gap-2">
            <a href={placeUrl(point)} target="_blank" rel="noopener" className="flex min-h-11 items-center rounded-lg border border-border bg-surface px-3 text-sm font-semibold">
              {t("openMaps")} ↗
            </a>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await clearLocationAction();
                  setPoint(null);
                  setMsg(null);
                })
              }
              className="min-h-11 rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:bg-muted"
            >
              {t("remove")}
            </button>
          </div>
        </div>
      )}

      {/* 1. On site: the phone's position, after the owner confirms. */}
      {phase === "confirm" ? (
        <div role="alertdialog" aria-labelledby="loc-confirm" className="rounded-xl border-2 border-[#E9B530] bg-surface p-3" data-testid="location-confirm">
          <p id="loc-confirm" className="font-bold">
            {t("confirmTitle")}
          </p>
          <p className="mt-1 text-sm">{t("confirmText")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={useGps} className="min-h-11 rounded-lg bg-primary px-4 font-semibold text-primary-foreground" data-testid="location-confirm-yes">
              {t("confirmYes")}
            </button>
            <button type="button" onClick={() => setPhase("idle")} className="min-h-11 rounded-lg border border-border px-4 font-semibold">
              {t("confirmNo")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={pending || phase === "locating"}
          onClick={() => setPhase("confirm")}
          className="min-h-12 rounded-xl bg-primary px-4 font-bold text-primary-foreground disabled:opacity-60"
          data-testid="location-here"
        >
          {phase === "locating" ? t("locating") : point ? t("hereAgain") : t("here")}
        </button>
      )}

      {/* 2. Or a Google Maps link (place link or a shared « ma position »). */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="loc-link" className="text-sm font-semibold">
          {t("linkLabel")}
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="loc-link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            inputMode="url"
            placeholder="https://maps.app.goo.gl/…"
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-base"
            data-testid="location-link"
          />
          <button type="button" disabled={pending || !link.trim()} onClick={useLink} className="min-h-11 rounded-lg border border-border bg-surface px-3 font-semibold disabled:opacity-50" data-testid="location-link-save">
            {t("useLink")}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("linkHelp")}{" "}
          <a href="https://www.google.com/maps" target="_blank" rel="noopener" className="font-semibold underline">
            {t("openGoogleMaps")}
          </a>
        </p>
      </div>

      {msg && (
        <p role={msg.kind === "error" ? "alert" : "status"} className={msg.kind === "error" ? "rounded-lg bg-red-50 p-2 text-sm text-red-900" : "rounded-lg bg-emerald-50 p-2 text-sm text-emerald-900"} data-testid="location-msg">
          {msg.text}
        </p>
      )}
    </section>
  );
}
