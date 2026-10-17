import { ErroDaApiCliente, MENSAGEM_SEM_RESPOSTA } from "../api/cliente";

/** Aviso de quando o servidor não responde (rede, CORS ou 500 sem CORS). */
export const MENSAGEM_SERVIDOR_FORA = `${MENSAGEM_SEM_RESPOSTA} Confira se a API está rodando.`;

/** Verdadeiro quando não houve resposta da API (a `mensagem` do erro não serve de aviso). */
export function ehSemResposta(erro: unknown): boolean {
  return !(erro instanceof ErroDaApiCliente) || erro.codigo === "sem_resposta";
}
