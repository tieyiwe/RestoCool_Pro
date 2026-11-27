"use client";

import { RecoverScreen } from "@/components/errors/recover-screen";

/** Any page that crashes (often a page of the previous version right after a publish). */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RecoverScreen error={error} reset={reset} />;
}
