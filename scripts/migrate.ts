import "./_env";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "../src/db";

async function main() {
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  console.log("✓ migrations applied");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
