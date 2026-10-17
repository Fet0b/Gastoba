import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

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
    environment: "jsdom",
    setupFiles: ["./src/testes/preparar.ts"],
  },
});
