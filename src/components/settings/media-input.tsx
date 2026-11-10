"use client";

import { useState } from "react";
import { PhotoField, type UploadedPhoto } from "@/components/menu-admin/photo-field";

/** PhotoField + hidden input, so uploads work inside a plain server-action form. */
export function MediaInput({
  name,
  kind,
  label,
  initial,
  onChange,
}: {
  name: string;
  kind: "logo" | "cover";
  label: string;
  initial: string | null;
  onChange?: (url: string | null) => void;
}) {
  const [value, setValueState] = useState<UploadedPhoto | null>(initial ? { fullUrl: initial, thumbUrl: initial } : null);
  const setValue = (v: UploadedPhoto | null) => {
    setValueState(v);
    onChange?.(v?.fullUrl ?? null);
  };
  return (
    <>
      <input type="hidden" name={name} value={value?.fullUrl ?? ""} />
      <PhotoField kind={kind} label={label} value={value} onChange={setValue} />
    </>
  );
}
