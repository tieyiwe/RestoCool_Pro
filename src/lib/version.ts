import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

let cached: string | null = null;
/** Identifier of the running build: changes on every publish (Next.js BUILD_ID). */
export function buildVersion(): string {
  if (cached) return cached;
  try {
    cached = readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    cached = process.env.REPLIT_DEPLOYMENT_ID ?? "dev";
  }
  return cached;
}
