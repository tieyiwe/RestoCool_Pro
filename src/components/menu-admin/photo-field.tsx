"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { compressImage, formatBytes } from "@/lib/image/compress";

export type UploadedPhoto = { fullUrl: string; thumbUrl: string };

/** Pick a photo → compress to WebP in the browser → upload → returns URLs. */
export function PhotoField({
  kind,
  value,
  onChange,
  label,
}: {
  kind: "item" | "logo" | "cover";
  value: UploadedPhoto | null;
  onChange: (v: UploadedPhoto | null) => void;
  label: string;
}) {
  const t = useTranslations("menuAdmin.item");
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "compressing" | "uploading" | "error">("idle");
  const [sizeNote, setSizeNote] = useState<string | null>(null);

  async function onFile(file: File) {
    setState("compressing");
    setSizeNote(null);
    try {
      const img = await compressImage(file);
      setState("uploading");
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("width", String(img.width));
      fd.set("height", String(img.height));
      fd.set("full", img.full, img.full.type === "image/jpeg" ? "full.jpg" : "full.webp");
      fd.set("thumb", img.thumb, img.thumb.type === "image/jpeg" ? "thumb.jpg" : "thumb.webp");
      const res = await fetch("/api/app/media", { method: "POST", body: fd });
      if (!res.ok) throw new Error(`upload ${res.status}`);
      const body = (await res.json()) as UploadedPhoto & { bytes: number };
      onChange({ fullUrl: body.fullUrl, thumbUrl: body.thumbUrl });
      const units = { kb: (n: string) => t("sizeKb", { n }), mb: (n: string) => t("sizeMb", { n }) };
      setSizeNote(t("photoSize", { size: formatBytes(body.bytes, units), original: formatBytes(img.originalBytes, units) }));
      setState("idle");
    } catch {
      setState("error");
    }
  }

  const busy = state === "compressing" || state === "uploading";
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold">{label}</span>
      <div className="flex flex-wrap items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- preview of the uploaded thumbnail
          <img src={value.thumbUrl} alt="" width={84} height={84} className="h-21 w-21 rounded-lg object-cover" data-testid="photo-preview" />
        ) : (
          <span className="flex h-21 w-21 items-center justify-center rounded-lg bg-muted text-2xl" aria-hidden>
            📷
          </span>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label={value ? t("changePhoto") : t("addPhoto")}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = "";
          }}
        />
        <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="min-h-11 rounded-lg border border-border bg-surface px-3 text-sm font-semibold hover:bg-muted">
          {state === "compressing" ? t("compressing") : state === "uploading" ? t("uploading") : value ? t("changePhoto") : t("addPhoto")}
        </button>
        {value && !busy && (
          <button type="button" onClick={() => onChange(null)} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-danger hover:bg-muted">
            {t("removePhoto")}
          </button>
        )}
      </div>
      {sizeNote && <p className="text-xs text-muted-foreground" role="status">{sizeNote}</p>}
      {state === "error" && (
        <p className="text-sm text-danger" role="alert">
          {t("photoError")}
        </p>
      )}
    </div>
  );
}
