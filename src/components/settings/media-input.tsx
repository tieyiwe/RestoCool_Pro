"use client";

import { useState } from "react";
import { PhotoField, type UploadedPhoto } from "@/components/menu-admin/photo-field";

/** PhotoField + hidden input, so uploads work inside a plain server-action form. */
export function MediaInput({ name, kind, label, initial }: { name: string; kind: "logo" | "cover"; label: string; initial: string | null }) {
  const [value, setValue] = useState<UploadedPhoto | null>(initial ? { fullUrl: initial, thumbUrl: initial } : null);
  return (
    <>
      <input type="hidden" name={name} value={value?.fullUrl ?? ""} />
      <PhotoField kind={kind} label={label} value={value} onChange={setValue} />
    </>
  );
}
