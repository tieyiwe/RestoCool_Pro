import "./_env";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Restore a backup made by scripts/backup.ts: `npm run db:restore -- backups/restocool-<date>.dump`
 * (or `-- --list` to see them). Replaces the current data of DATABASE_URL with the backup's.
 * Asks for --yes, because it overwrites the database.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const args = process.argv.slice(2);
  const onReplit = Boolean(process.env.REPL_ID) && process.env.STORAGE_DRIVER !== "local";
  const client = onReplit ? new (await import("@replit/object-storage")).Client() : null;
  if (args.includes("--list")) {
    if (client) {
      const list = await client.list({ prefix: "backups/" });
      if (!list.ok) throw new Error(list.error.message);
      for (const o of list.value.map((x) => x.name).sort()) console.log(o);
    } else console.log(execFileSync("ls", ["-1", path.join(".data", "backups")]).toString());
    return;
  }
  const name = args.find((a) => !a.startsWith("--"));
  if (!name || !/^backups\/restocool-[0-9T-]+\.dump$/.test(name)) throw new Error("Give the backup name, e.g. backups/restocool-2026-11-12T08-00-00.dump (see --list)");
  if (!args.includes("--yes")) throw new Error("This replaces the current data with the backup. Run again with --yes to confirm.");
  const local = path.join(process.cwd(), ".data", name);
  mkdirSync(path.dirname(local), { recursive: true });
  if (client) {
    const dl = await client.downloadToFilename(name, local);
    if (!dl.ok) throw new Error(dl.error.message);
  }
  if (!existsSync(local)) throw new Error(`Backup not found: ${name}`);
  execFileSync("pg_restore", ["--clean", "--if-exists", "--no-owner", "--no-acl", "--single-transaction", `--dbname=${url}`, local], { stdio: "inherit" });
  console.log(`✓ Restored ${name}.`);
}

main().catch((err) => {
  console.error(`✗ Restore: ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
});
