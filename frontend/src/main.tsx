import "@fontsource-variable/bricolage-grotesque";
import "./estilos/global.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";

async function iniciar(): Promise<void> {
  // A API simulada só existe em desenvolvimento: fora do DEV o Vite troca a
  // condição por `false` e o import dinâmico (com a simulação) sai do bundle.
  if (import.meta.env.DEV && import.meta.env.VITE_USAR_SIMULACAO === "true") {
    const { fetchSimulado, reiniciarSimulacao } = await import("./simulacao/fetchSimulado");
    reiniciarSimulacao({ comExemplos: true });
    window.fetch = fetchSimulado;
  }

  const raiz = document.getElementById("raiz");
  if (!raiz) throw new Error("Elemento #raiz não encontrado no index.html.");

  createRoot(raiz).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void iniciar();
