import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

// Fuso fixo nos testes: as regras de data (hojeLocal, "Hoje"/"Ontem") são
// conferidas no horário de Brasília, inclusive perto da meia-noite.
process.env.TZ = "America/Sao_Paulo";

export default defineConfig({
  plugins: [react()],
  server: {
    // O backend só aceita CORS de http://localhost:5173: com a porta ocupada,
    // o Vite falha em vez de subir em outra porta e quebrar o CORS em silêncio.
    port: 5173,
    strictPort: true,
  },
  test: {
    exclude: [...configDefaults.exclude, "e2e/**", "e2e-teste/**"],
    environment: "jsdom",
    setupFiles: ["./src/testes/preparar.ts"],
    // Cada worker mantém um jsdom e a simulação. Limitar a concorrência evita
    // disputar recursos com os E2E e preserva o timeout padrão de 5 s (073).
    maxWorkers: 2,
  },
});
