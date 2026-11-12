import "./_env";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Database backup, run before every migration on deploy (and on demand: `npm run db:backup`).
 * pg_dump (custom format, compressed) of the whole database, kept in Replit Object Storage under
 * backups/ on Replit, in .data/backups locally. The 14 most recent are kept.
 * Restore: see docs/BACKUP.md (`npm run db:restore -- <name>`).
 * Never blocks a deploy: on failure it says so and exits with an error code the caller ignores.
 */
const KEEP = 14;
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ Backup: DATABASE_URL is not set.");
  process.exit(1);
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const name = `backups/restocool-${stamp}.dump`;
  const local = path.join(process.cwd(), ".data", name);
  mkdirSync(path.dirname(local), { recursive: true });
  // --no-owner/--no-acl: restorable into another database user (Replit dev/prod differ).
  execFileSync("pg_dump", ["--format=custom", "--no-owner", "--no-acl", `--file=${local}`, url!], { stdio: ["ignore", "ignore", "inherit"] });
  const size = statSync(local).size;

  if (process.env.REPL_ID && process.env.STORAGE_DRIVER !== "local") {
    const { Client } = await import("@replit/object-storage");
    const client = new Client();
    const up = await client.uploadFromFilename(name, local);
    if (!up.ok) throw new Error(`upload failed: ${up.error.message}`);
    rmSync(local, { force: true });
    const list = await client.list({ prefix: "backups/" });
    if (list.ok) {
      const old = list.value.map((o) => o.name).filter((n) => n.startsWith("backups/restocool-")).sort().slice(0, -KEEP);
      for (const n of old) await client.delete(n);
    }
    console.log(`✓ Backup saved to Object Storage: ${name} (${Math.round(size / 1024)} KB, last ${KEEP} kept).`);
  } else {
    const dir = path.dirname(local);
    const old = readdirSync(dir).filter((f) => f.startsWith("restocool-")).sort().slice(0, -KEEP);
    for (const f of old) rmSync(path.join(dir, f), { force: true });
    console.log(`✓ Backup saved: .data/${name} (${Math.round(size / 1024)} KB, last ${KEEP} kept).`);
  }
}

main().catch((err) => {
  console.error(`✗ Backup failed: ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
});
