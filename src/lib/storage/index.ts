import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { log } from "@/lib/log";

/** Minimal object store: Replit Object Storage on Replit, a local folder elsewhere (dev, tests). */
export interface ObjectStore {
  readonly kind: "replit" | "local";
  put(key: string, bytes: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

/** Keys look like r/<restaurant uuid>/<random>.webp — validated before any read or write. */
export const MEDIA_KEY_RE = /^r\/[0-9a-f-]{36}\/[A-Za-z0-9_-]{16,64}(?:-t)?\.webp$/;

class LocalStore implements ObjectStore {
  readonly kind = "local" as const;
  constructor(private readonly root: string) {}
  private file(key: string) {
    if (!MEDIA_KEY_RE.test(key)) throw new Error("invalid media key");
    return path.join(this.root, key);
  }
  async put(key: string, bytes: Buffer) {
    const f = this.file(key);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, bytes);
  }
  async get(key: string) {
    try {
      return await readFile(this.file(key));
    } catch {
      return null;
    }
  }
  async delete(key: string) {
    await rm(this.file(key), { force: true });
  }
}

class ReplitStore implements ObjectStore {
  readonly kind = "replit" as const;
  // Typed loosely to avoid loading the SDK outside Replit.
  private clientPromise: Promise<import("@replit/object-storage").Client> | null = null;
  private client() {
    this.clientPromise ??= import("@replit/object-storage").then(({ Client }) => new Client());
    return this.clientPromise;
  }
  async put(key: string, bytes: Buffer) {
    if (!MEDIA_KEY_RE.test(key)) throw new Error("invalid media key");
    const res = await (await this.client()).uploadFromBytes(key, bytes);
    if (!res.ok) throw new Error(`object storage upload failed: ${res.error.message}`);
  }
  async get(key: string) {
    if (!MEDIA_KEY_RE.test(key)) return null;
    const res = await (await this.client()).downloadAsBytes(key);
    return res.ok ? res.value[0] : null;
  }
  async delete(key: string) {
    if (!MEDIA_KEY_RE.test(key)) return;
    const res = await (await this.client()).delete(key);
    if (!res.ok) log.warn("object_storage_delete_failed", { key, error: res.error.message });
  }
}

const g = globalThis as unknown as { __rcStore?: ObjectStore };

/**
 * STORAGE_DRIVER=local|replit forces a driver. Default: Replit when running on Replit
 * (REPL_ID is set), otherwise ./.data/uploads.
 */
export function getStore(): ObjectStore {
  if (!g.__rcStore) {
    const driver = process.env.STORAGE_DRIVER ?? (process.env.REPL_ID ? "replit" : "local");
    g.__rcStore = driver === "replit" ? new ReplitStore() : new LocalStore(path.join(process.cwd(), ".data", "uploads"));
  }
  return g.__rcStore;
}

export function mediaUrl(key: string): string {
  return `/api/media/${key}`;
}
