import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { PROVIDERS, CREDENTIAL_FIELDS, ONLINE_PROVIDERS } = await import("@/payments/registry");
const { ProviderNotConfiguredError } = await import("@/payments/types");
const { encryptJson, decryptJson } = await import("@/payments/crypto");

const input = { intentId: "00000000-0000-4000-8000-000000000001", amount: 2500, currency: "XOF" as const, method: "orange_money" as const, description: "Table 4" };

/**
 * Contract (section 8b): every adapter, real or stub, keeps the same promises. A stub never
 * charges anything: it refuses with ProviderNotConfiguredError until it is written.
 */
describe.each(Object.values(PROVIDERS))("payment provider « $id »", (p) => {
  it("declares XOF, at least one method, and its credential fields", () => {
    expect(p.supports.currency).toBe("XOF");
    expect(p.supports.methods.length).toBeGreaterThan(0);
    if (p.id !== "manual") expect(CREDENTIAL_FIELDS[p.id as keyof typeof CREDENTIAL_FIELDS].length).toBeGreaterThan(0);
  });

  it("creates a payment with a provider ref, or refuses when not configured", async () => {
    if (p.implemented) {
      const r = await p.createPayment({ ...input, method: p.supports.methods[0]! });
      expect(r.providerRef).toBeTruthy();
      expect(["succeeded", "redirect", "ussd", "pending"]).toContain(r.kind);
    } else {
      await expect(p.createPayment(input)).rejects.toBeInstanceOf(ProviderNotConfiguredError);
      await expect(p.getStatus("x")).rejects.toBeInstanceOf(ProviderNotConfiguredError);
    }
  });

  it("never accepts an unsigned webhook", async () => {
    const req = new Request("https://restocool.com/api/webhooks/payments/" + p.id, { method: "POST", body: "{}" });
    if (p.implemented) expect(await p.verifyWebhook(req, "{}")).toBeNull();
    else await expect(p.verifyWebhook(req, "{}")).rejects.toBeInstanceOf(ProviderNotConfiguredError);
  });
});

describe("manual provider", () => {
  it("settles at once and refuses a bad amount", async () => {
    const m = PROVIDERS.manual;
    expect(await m.createPayment({ ...input, method: "cash" })).toEqual({ kind: "succeeded", providerRef: `manual:${input.intentId}` });
    await expect(m.createPayment({ ...input, amount: 0 })).rejects.toThrow();
    expect(await m.getStatus(`manual:${input.intentId}`)).toBe("succeeded");
  });
  it("is the only one implemented today (online providers are stubs)", () => {
    expect(ONLINE_PROVIDERS.filter((id) => PROVIDERS[id].implemented)).toEqual([]);
  });
});

describe("credentials encryption (AES-256-GCM)", () => {
  it("round-trips, and a tampered value is refused", () => {
    process.env.PAYMENT_ENCRYPTION_KEY = "a".repeat(64);
    const sealed = encryptJson({ apiKey: "secret-123" });
    expect(sealed).not.toContain("secret-123");
    expect(decryptJson(sealed)).toEqual({ apiKey: "secret-123" });
    const [iv, tag, data] = sealed.split(".");
    expect(() => decryptJson([iv, tag, data!.slice(0, -2) + "AA"].join("."))).toThrow();
  });
});
