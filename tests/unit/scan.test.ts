import { describe, expect, it } from "vitest";
import { scanTarget } from "@/lib/scan";

describe("what a scanned QR opens", () => {
  it("opens RestoCool links on the current site, whatever host the QR carries", () => {
    expect(scanTarget("https://restocool.com/app/orders/3f2b7c1e-1d2a-4b5c-8d9e-0a1b2c3d4e5f")).toEqual({ kind: "order", path: "/app/orders/3f2b7c1e-1d2a-4b5c-8d9e-0a1b2c3d4e5f" });
    // The QR printed on « Montrer au serveur » (/o/<id>) opens the same order in the app.
    expect(scanTarget("https://restocool.com/o/3f2b7c1e-1d2a-4b5c-8d9e-0a1b2c3d4e5f")).toEqual({ kind: "order", path: "/app/orders/3f2b7c1e-1d2a-4b5c-8d9e-0a1b2c3d4e5f" });
    expect(scanTarget("https://x.replit.app/pointage/AbCdEfGhIjKlMnOpQrStUv")).toEqual({ kind: "checkin", path: "/pointage/AbCdEfGhIjKlMnOpQrStUv" });
    expect(scanTarget("https://restocool.com/rv/AbCdEfGhIjKlMnOpQrStUv12")).toEqual({ kind: "reservation", path: "/app/reservations/checkin/AbCdEfGhIjKlMnOpQrStUv12" });
    expect(scanTarget("https://restocool.com/rv/short")).toBeNull();
    expect(scanTarget("https://restocool.com/rejoindre/AbCdEfGhIjKlMnOpQrStUv")).toEqual({ kind: "join", path: "/rejoindre/AbCdEfGhIjKlMnOpQrStUv" });
    expect(scanTarget("https://restocool.com/r/restaurant-demo")).toEqual({ kind: "menu", path: "/r/restaurant-demo" });
    expect(scanTarget("https://restocool.com/r/restaurant-demo/t/AbCdEfGhIjKlMnOpQrStUv")).toEqual({ kind: "menu", path: "/r/restaurant-demo/t/AbCdEfGhIjKlMnOpQrStUv" });
    expect(scanTarget("https://restocool.com/c/k7m3p")).toEqual({ kind: "code", path: "/c/K7M3P" });
  });
  it("accepts a typed numéro RC, with or without RC", () => {
    expect(scanTarget("RC-K7M3P")?.path).toBe("/c/K7M3P");
    expect(scanTarget(" k7m3p ")?.path).toBe("/c/K7M3P");
    expect(scanTarget("RC K7M 3P")?.path).toBe("/c/K7M3P");
  });
  it("refuses anything else (other paths, scripts, look-alike codes)", () => {
    for (const bad of ["", "javascript:alert(1)", "https://evil.example/login", "https://restocool.com/app/settings", "https://restocool.com/app/orders/../settings", "K7M3O", "hello", "data:text/html,x"]) {
      expect(scanTarget(bad), bad).toBeNull();
    }
  });
});
