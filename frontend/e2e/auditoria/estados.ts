import type { Page } from "@playwright/test";

import type { Estado } from "./comparar";

/**
 * Faz o app ver a API no estado pedido, sem mexer na simulação nem no backend: um `window.fetch`
 * embrulhado, instalado antes do app. `vazio` esvazia as listas das respostas de GET; `carregando`
 * nunca responde aos GET. Entrar, sair e o perfil (`/auth`, `/aparencia`) e os cadastros fixos
 * (`/categorias`, `/metas/alvos`) passam direto.
 */
export async function instalarEstado(page: Page, estado: Estado): Promise<void> {
  await page.addInitScript((pedido) => {
    let real: typeof window.fetch = window.fetch.bind(window);
    const livres = /\/(auth|aparencia|categorias|metas\/alvos|health)(\/|$)/;
    const esvaziar = (valor: unknown): unknown => {
      if (Array.isArray(valor)) return [];
      if (valor && typeof valor === "object") {
        return Object.fromEntries(
          Object.entries(valor).map(([k, v]) => [k, Array.isArray(v) ? [] : v]),
        );
      }
      return valor;
    };
    const embrulhado = async (entrada: RequestInfo | URL, opcoes?: RequestInit): Promise<Response> => {
      const texto = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
      const caminho = new URL(texto, location.href).pathname;
      const metodo = (opcoes?.method ?? (entrada instanceof Request ? entrada.method : "GET")).toUpperCase();
      if (pedido === "dados" || metodo !== "GET" || livres.test(caminho)) return real(entrada, opcoes);
      if (pedido === "carregando") return new Promise<Response>(() => {});
      const resposta = await real(entrada, opcoes);
      try {
        const corpo = esvaziar(await resposta.clone().json());
        return new Response(JSON.stringify(corpo), { status: resposta.status, headers: { "Content-Type": "application/json" } });
      } catch {
        return resposta;
      }
    };
    Object.defineProperty(window, "fetch", {
      configurable: true,
      get: () => embrulhado,
      set: (novo: typeof window.fetch) => {
        real = novo;
      },
    });
  }, estado);
}
