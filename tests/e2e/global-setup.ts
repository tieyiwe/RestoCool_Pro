import { execSync } from "node:child_process";

/** Fresh schema + seed (demo restaurant and the isolation-test tenant) in the test database. */
export default function globalSetup() {
  const env = { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL };
  execSync("npx tsx scripts/migrate.ts", { stdio: "inherit", env });
  execSync("npx tsx scripts/seed.ts --with-test-tenant", { stdio: "inherit", env });
  // Remove restaurants created by earlier e2e runs with the dev user.
  execSync(
    `psql "${process.env.E2E_DATABASE_URL}" -qc "delete from restaurants where id in (select restaurant_id from members where clerk_user_id = 'dev-owner') and slug <> 'restaurant-demo'"`,
    { stdio: "inherit" },
  );
  // The real restaurant Shangri-La (its own spec checks every feature on the real menu).
  execSync("npx tsx --conditions=react-server scripts/import-shangri-la.ts --if-missing", { stdio: "inherit", env });
}
