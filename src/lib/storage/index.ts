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

/**
 * Keys look like r/<restaurant uuid>/<random>.webp (or .jpg from iPhones; .png only for imported
 * logos) — validated before any read or write.
 */
export const MEDIA_KEY_RE = /^r\/[0-9a-f-]{36}\/[A-Za-z0-9_-]{16,64}(?:-t)?\.(?:webp|jpg|png)$/;

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
    forgetMedia(key);
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
    forgetMedia(key);
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
    // Local disk is wiped on every republish: photos would be lost. Say it loudly in production.
    if (driver === "local" && process.env.NODE_ENV === "production") {
      log.error("storage_local_in_production", { hint: "Uploads are stored on the local disk and will be lost on republish. Use Replit Object Storage (REPL_ID set, bucket in .replit) or STORAGE_DRIVER=replit." });
    }
    g.__rcStore = driver === "replit" ? new ReplitStore() : new LocalStore(path.join(process.cwd(), ".data", "uploads"));
  }
  return g.__rcStore;
}

export function mediaUrl(key: string): string {
  return `/api/media/${key}`;
}

/**
 * Photos never change once uploaded (random keys, never reused), so the server keeps the most
 * recently served ones in memory: the second customer to open a menu gets its thumbnails without
 * a round trip to Object Storage. Bounded (96 MB total, files up to 2 MB), least recently used out.
 */
const CACHE_MAX_BYTES = 96 * 1024 * 1024;
const CACHE_MAX_FILE = 2 * 1024 * 1024;
const cache = new Map<string, Buffer>();
let cachedBytes = 0;

export async function getMediaCached(key: string): Promise<Buffer | null> {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit); // most recently used last
    return hit;
  }
  const bytes = await getStore().get(key);
  if (bytes && bytes.length <= CACHE_MAX_FILE) {
    cache.set(key, bytes);
    cachedBytes += bytes.length;
    for (const [k, b] of cache) {
      if (cachedBytes <= CACHE_MAX_BYTES) break;
      cache.delete(k);
      cachedBytes -= b.length;
    }
  }
  return bytes;
}

/** A deleted photo stops being served at once (also from memory). */
export function forgetMedia(key: string) {
  const b = cache.get(key);
  if (b) {
    cache.delete(key);
    cachedBytes -= b.length;
  }
}
