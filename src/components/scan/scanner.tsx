"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { scanTarget } from "@/lib/scan";

type Phase = "starting" | "scanning" | "found" | "denied" | "nocamera" | "unknown";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
declare global {
  interface Window {
    BarcodeDetector?: { new (opts: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> };
  }
}

/**
 * In-app QR scanner for personnel: the customer's « Montrer au serveur » QR opens the order, the
 * check-in QR opens the check-in, table/menu QRs open the menu. Uses the phone's native detector
 * (fast, Android Chrome) and falls back to a small decoder loaded only here (iPhone).
 */
export function Scanner({ round }: { round?: { tripId: string; initial: string[] } } = {}) {
  const t = useTranslations("scan");
  // Hostess round (bus): every order QR scanned joins the round; the camera stays open.
  const roundIds = useRef(new Set(round?.initial ?? []));
  const [roundCount, setRoundCount] = useState(round?.initial.length ?? 0);
  const [roundMsg, setRoundMsg] = useState<string | null>(null);
  // Read through refs so the decoding loop (and the camera) never restarts on a re-render.
  const roundRef = useRef(round);
  const tRef = useRef(t);
  tRef.current = t;
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [lastText, setLastText] = useState("");
  const [torch, setTorch] = useState<boolean | null>(null);
  const [manual, setManual] = useState("");

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
  }, []);

  const open = useCallback(
    (text: string) => {
      const target = scanTarget(text);
      if (roundRef.current) {
        if (target?.kind !== "order") {
          setRoundMsg(tRef.current("roundNotOrder"));
          return false;
        }
        const id = target.path.split("/").pop()!;
        if (roundIds.current.has(id)) return false;
        roundIds.current.add(id);
        setRoundCount(roundIds.current.size);
        setRoundMsg(tRef.current("roundAdded", { n: roundIds.current.size }));
        try {
          navigator.vibrate?.(60);
        } catch {}
        return false;
      }
      if (!target) {
        setLastText(text.slice(0, 120));
        setPhase("unknown");
        return false;
      }
      setPhase("found");
      try {
        navigator.vibrate?.(60);
      } catch {}
      stop();
      router.push(target.path);
      return true;
    },
    [router, stop],
  );

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let busy = false;
    let decode: ((img: ImageData) => string | null) | null = null;
    let detector: Detector | null = null;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) return setPhase("nocamera");
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) return s.getTracks().forEach((tr) => tr.stop());
        stream.current = s;
        const track = s.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };
        setTorch(caps.torch ? false : null);
        const v = video.current!;
        v.srcObject = s;
        await v.play().catch(() => {});
      } catch (err) {
        return setPhase(err instanceof DOMException && err.name === "NotAllowedError" ? "denied" : "nocamera");
      }
      if (window.BarcodeDetector) {
        try {
          const formats = (await window.BarcodeDetector.getSupportedFormats?.()) ?? ["qr_code"];
          if (formats.includes("qr_code")) detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        } catch {
          detector = null;
        }
      }
      if (!detector) {
        const jsQR = (await import("jsqr")).default;
        decode = (img) => jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
      }
      setPhase("scanning");
      tick();
    }

    async function tick() {
      if (cancelled) return;
      raf = requestAnimationFrame(tick);
      const v = video.current;
      if (busy || !v || v.readyState < 2 || !v.videoWidth) return;
      busy = true;
      try {
        let text: string | null = null;
        if (detector) {
          text = (await detector.detect(v))[0]?.rawValue ?? null;
        } else if (decode) {
          // Decode a centred square, scaled down: fast enough on entry-level phones.
          const side = Math.min(v.videoWidth, v.videoHeight);
          const size = Math.min(480, side);
          const c = (canvas.current ??= document.createElement("canvas"));
          c.width = size;
          c.height = size;
          const g = c.getContext("2d", { willReadFrequently: true })!;
          g.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, size, size);
          text = decode(g.getImageData(0, 0, size, size));
        }
        if (text && !cancelled && open(text)) cancelAnimationFrame(raf);
      } catch {
        // A frame that fails to decode is just skipped.
      } finally {
        busy = false;
      }
    }

    void start();
    // Stop the camera when the screen goes off or the page closes (battery, privacy).
    const onHide = () => {
      if (document.visibilityState === "hidden") stop();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onHide);
      stop();
    };
  }, [open, stop]);

  const toggleTorch = async () => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      setTorch(null);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="scanner" data-phase={phase}>
      <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-3xl bg-black">
        <video ref={video} playsInline muted className="h-full w-full object-cover" aria-label={t("camera")} />
        {/* Viewfinder */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
          <div className="relative size-2/3">
            {["left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl", "right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl", "left-0 bottom-0 border-l-4 border-b-4 rounded-bl-2xl", "right-0 bottom-0 border-r-4 border-b-4 rounded-br-2xl"].map((c) => (
              <span key={c} className={`absolute size-10 border-white ${c}`} />
            ))}
            {phase === "scanning" && <span className="absolute inset-x-2 top-1/2 h-0.5 animate-pulse bg-emerald-400 shadow-[0_0_12px_2px_rgba(52,211,153,.7)] motion-reduce:animate-none" />}
          </div>
        </div>
        {phase !== "scanning" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-6 text-center text-white" role="status">
            <p className="font-semibold">{t(`phase.${phase}`)}</p>
          </div>
        )}
        {torch !== null && (
          <button type="button" onClick={toggleTorch} className="absolute bottom-3 right-3 min-h-11 rounded-full bg-black/60 px-4 text-sm font-semibold text-white" aria-pressed={torch}>
            🔦 {t("torch")}
          </button>
        )}
      </div>

      <p className="text-center text-sm text-muted-foreground">{t("hint")}</p>
      {phase === "unknown" && (
        <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900" data-testid="scan-unknown">
          {t("unknown")} <span className="break-all font-mono text-xs">{lastText}</span>
        </p>
      )}

      {round && (
        <div className="mx-auto flex w-full max-w-md flex-col gap-2 rounded-2xl border-2 border-primary bg-primary/5 p-3" data-testid="round-bar">
          <p className="text-center font-bold" role="status" aria-live="polite" data-testid="round-count">
            {roundMsg ?? t("roundEmpty")}
          </p>
          <a
            href={`/app/trips/${round.tripId}?round=${[...roundIds.current].join(",")}`}
            onClick={stop}
            className={`flex min-h-12 items-center justify-center rounded-xl bg-primary px-4 font-bold text-primary-foreground ${roundCount ? "" : "pointer-events-none opacity-50"}`}
            data-testid="round-finish"
          >
            {t("roundFinish", { n: roundCount })}
          </a>
        </div>
      )}
      <form
        className="mx-auto flex w-full max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          open(manual);
        }}
      >
        <label htmlFor="scan-manual" className="sr-only">
          {t("manualLabel")}
        </label>
        <input
          id="scan-manual"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder={t("manualPlaceholder")}
          autoCapitalize="characters"
          className="rc-code-input min-h-12 min-w-0 flex-1 rounded-xl px-3 font-mono text-base font-bold"
          data-testid="scan-manual"
        />
        <button className="min-h-12 rounded-xl bg-primary px-4 font-bold text-primary-foreground" data-testid="scan-manual-go">
          {t("go")}
        </button>
      </form>
    </div>
  );
}
