import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { describe, expect, it } from "vitest";
import { sseResponse } from "@/lib/realtime/sse";

describe("live streams per visitor", () => {
  it("refuses a connection above the limit and frees the slot when one closes", async () => {
    const a = new AbortController();
    const first = sseResponse(new Request("http://x/s", { signal: a.signal }), () => null, { key: "test-ip", max: 1 });
    expect(first.status).toBe(200);
    const second = sseResponse(new Request("http://x/s"), () => null, { key: "test-ip", max: 1 });
    expect(second.status).toBe(429);
    await first.body?.cancel();
    const third = sseResponse(new Request("http://x/s"), () => null, { key: "test-ip", max: 1 });
    expect(third.status).toBe(200);
    await third.body?.cancel();
  });
});
