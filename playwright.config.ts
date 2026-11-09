import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 5100);
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? "postgres://postgres@localhost/restocool_test";
process.env.E2E_DATABASE_URL = DATABASE_URL;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  // One worker: specs share the seeded database (sold-out toggles, publishing).
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  // The dev server compiles pages on first visit; allow for it.
  expect: { timeout: 10_000 },
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "phone-390", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "tablet-1024", use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 768 } } },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: {
      DATABASE_URL,
      DEV_AUTH_BYPASS: "1",
      // Force the no-Clerk path in tests even if keys exist in the shell.
      CLERK_SECRET_KEY: "",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
    },
  },
});
