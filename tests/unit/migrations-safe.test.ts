import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Republishing must never lose businesses, accounts, orders or photos. Migrations run on every
 * deploy start, so they may only ADD things. A statement that removes or rewrites data fails this
 * test unless the migration explains why on the line before with « -- data-safe: <reason> »
 * (for example a column dropped after its data was copied elsewhere in the same migration).
 */
const DESTRUCTIVE = [/\bdrop\s+table\b/i, /\bdrop\s+column\b/i, /\btruncate\b/i, /\bdelete\s+from\b/i, /\balter\s+column\s+\S+\s+(set\s+data\s+)?type\b/i, /\bdrop\s+schema\b/i, /\brename\s+(column|to)\b/i];

describe("migrations never destroy data", () => {
  const dir = path.join(process.cwd(), "drizzle");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
  it("has migrations to check", () => expect(files.length).toBeGreaterThan(10));
  for (const f of files) {
    it(f, () => {
      const lines = readFileSync(path.join(dir, f), "utf8").split("\n");
      const bad = lines
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => !line.trim().startsWith("--") && DESTRUCTIVE.some((re) => re.test(line)))
        .filter(({ i }) => !/--\s*data-safe:/i.test(lines[i - 1] ?? ""));
      expect(bad.map((b) => `${f}:${b.i + 1}: ${b.line.trim()}`)).toEqual([]);
    });
  }
});
