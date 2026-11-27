"use client";

import { useEffect, useState } from "react";
import { reloadOnce } from "@/lib/recover";

/**
 * Shown instead of Next's bare « Application error ». It first reloads the page once by itself
 * (almost always a page from the previous version, or the server restarting during a publish);
 * if the error comes back, it explains and offers a button. Bilingual on purpose: it must work
 * even when the translations could not load.
 */
export function RecoverScreen({ error, reset }: { error: Error & { digest?: string }; reset?: () => void }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    console.error(error);
    if (!reloadOnce()) setShow(true);
  }, [error]);
  if (!show) return <div className="min-h-dvh" aria-busy="true" />;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center" data-testid="recover-screen">
      <p className="text-4xl" aria-hidden>
        🔄
      </p>
      <h1 className="text-xl font-bold">
        RestoCool vient d’être mis à jour
        <span className="mt-1 block text-base font-normal opacity-70">RestoCool was just updated</span>
      </h1>
      <p className="opacity-80">
        Rechargez la page pour continuer. · Reload the page to continue.
      </p>
      <button
        type="button"
        onClick={() => {
          reset?.();
          window.location.reload();
        }}
        className="min-h-12 rounded-xl bg-[#0f6b3e] px-6 font-bold text-white"
      >
        Recharger · Reload
      </button>
      {error.digest && <p className="font-mono text-xs opacity-50">{error.digest}</p>}
    </main>
  );
}
