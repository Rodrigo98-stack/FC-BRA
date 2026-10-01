import { defineConfig } from "@playwright/test";

/**
 * Testes ponta a ponta. Rode com o servidor no ar:
 *   npm run build && npm start   (ou npm run dev)
 *   E2E_BASE_URL=http://localhost:3000 npx playwright test
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : undefined,
  },
});
