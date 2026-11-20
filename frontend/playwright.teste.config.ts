import { defineConfig } from "@playwright/test";

// Conferência de fim de projeto (frente 067): roda contra o ambiente de teste já no ar
// (`docker compose -f compose.teste.yaml up --build -d`), sem subir servidor próprio. Não entra no CI.
export default defineConfig({
  testDir: "./e2e-teste",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  use: {
    browserName: "chromium",
    baseURL: "http://localhost:8180",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "desktop", use: { viewport: { width: 1280, height: 800 } } }],
});
