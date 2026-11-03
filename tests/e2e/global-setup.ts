import { execSync } from "node:child_process";

/** Fresh schema + seed (demo restaurant and the isolation-test tenant) in the test database. */
export default function globalSetup() {
  const env = { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL };
  execSync("npx tsx scripts/migrate.ts", { stdio: "inherit", env });
  execSync("npx tsx scripts/seed.ts --with-test-tenant", { stdio: "inherit", env });
}
