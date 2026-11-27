"use client";

import { RecoverScreen } from "@/components/errors/recover-screen";
import "./globals.css";

/** A crash in the root layout itself: same recovery, with its own <html>. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh bg-[#fff8ec] text-[#17231c] antialiased">
        <RecoverScreen error={error} />
      </body>
    </html>
  );
}
