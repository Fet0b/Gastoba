// `fetch` simulado: mesma assinatura do `fetch`, responde com a simulação em
// memória (manipuladores.ts). Só é carregado pelos testes e, em desenvolvimento,
// por import dinâmico no main.tsx; nunca entra no bundle de produção.

import { URL_BASE } from "../api/cliente";
import { entrarNaSimulacao, reiniciarSimulacao, responder } from "./manipuladores";

export { entrarNaSimulacao, reiniciarSimulacao };

function erroDeCancelamento(): DOMException {
  return new DOMException("This operation was aborted", "AbortError");
}

function caminhoRelativoABase(url: URL): string | null {
  const base = new URL(URL_BASE);
  const prefixo = base.pathname.replace(/\/+$/, "");
  if (url.origin !== base.origin || !url.pathname.startsWith(prefixo)) return null;
  return url.pathname.slice(prefixo.length) || "/";
}

/**
 * Se o navegador mandaria o cookie: com `credentials: "include"` sempre; com o
 * padrão `"same-origin"`, só se a API for da mesma origem da página.
 */
function enviaCookie(credenciais: RequestCredentials, url: URL): boolean {
  if (credenciais === "include") return true;
  return credenciais === "same-origin" && url.origin === globalThis.location?.origin;
}

export async function fetchSimulado(
  entrada: RequestInfo | URL,
  opcoes?: RequestInit,
): Promise<Response> {
  const pedido = entrada instanceof Request ? entrada : null;
  const signal = opcoes?.signal ?? pedido?.signal;
  if (signal?.aborted) throw erroDeCancelamento();

  const url = new URL(pedido ? pedido.url : String(entrada), URL_BASE);
  const metodo = opcoes?.method ?? pedido?.method ?? "GET";
  const cabecalhos = new Headers(opcoes?.headers ?? pedido?.headers);
  const credenciais = opcoes?.credentials ?? pedido?.credentials ?? "same-origin";
  let corpo: string | null = null;
  if (opcoes?.body !== undefined && opcoes.body !== null) corpo = String(opcoes.body);
  else if (pedido) corpo = (await pedido.text()) || null;

  // Uma volta no laço de eventos, como uma resposta de rede; o cancelamento
  // durante a espera também é respeitado.
  await Promise.resolve();
  if (signal?.aborted) throw erroDeCancelamento();

  const caminho = caminhoRelativoABase(url);
  const resposta = responder({
    metodo,
    caminho: caminho ?? `fora da API: ${url.href}`,
    parametros: url.searchParams,
    corpo,
    cabecalhos,
    enviaCookie: enviaCookie(credenciais, url),
  });
  // 204: sem corpo e sem content-type, como o backend.
  if (resposta.corpo === undefined) {
    return new Response(null, { status: resposta.status, headers: resposta.cabecalhos });
  }
  return new Response(JSON.stringify(resposta.corpo), {
    status: resposta.status,
    headers: { ...resposta.cabecalhos, "content-type": "application/json" },
  });
}
