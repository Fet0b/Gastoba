import { defineConfig } from "@playwright/test";

// O E2E usa só a simulação, então pode rodar noutra porta (o CORS do backend real não entra).
const porta = process.env.GASTOBA_E2E_PORTA ?? "5173";
const origem = `http://localhost:${porta}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    browserName: "chromium",
    baseURL: origem,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npm run dev -- --port ${porta}`,
    url: origem,
    reuseExistingServer: false,
    env: { VITE_USAR_SIMULACAO: "true" },
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
    {
      name: "celular",
      use: {
        viewport: { width: 320, height: 640 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
