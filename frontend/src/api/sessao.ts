// Chamadas da sessão: quem está conectado, entrar e sair. A sessão vive só no
// cookie HttpOnly que o backend define em `POST /auth/entrar`; o token que vem no
// corpo da resposta é ignorado (o JavaScript nunca o guarda: um XSS não o rouba).
// Entrar e sair limpam o cache das consultas, para que os dados de uma pessoa
// nunca apareçam para a próxima.

import { aoPerderASessao, chamar } from "./cliente";
import type { Sessao, Usuario } from "./tipos";
import { limparCache } from "./useConsulta";

export type Credenciais = { email: string; senha: string };
export type DadosDeCadastro = { nome: string; email: string; senha: string };

/**
 * Registra quem precisa saber que a sessão terminou no meio do uso (um 401
 * `nao_autenticado` de qualquer chamada). O cache é limpo antes de avisar.
 * Devolve a função que remove o ouvinte.
 */
export function aoTerminarASessao(ouvinte: () => void): () => void {
  return aoPerderASessao(() => {
    limparCache();
    ouvinte();
  });
}

/** `GET /auth/eu`: a pessoa da sessão; sem sessão, ErroDaApiCliente 401 `nao_autenticado`. */
export function eu(signal?: AbortSignal): Promise<Usuario> {
  return chamar<Usuario>("/auth/eu", { signal });
}

/**
 * `POST /auth/entrar`. Em caso de sucesso o navegador guarda o cookie e o cache
 * é limpo; em caso de falha, lança o ErroDaApiCliente (ex.: 401
 * `credenciais_invalidas`, 429 `muitas_tentativas` com `esperarSegundos`).
 */
export async function entrar(credenciais: Credenciais): Promise<void> {
  // O corpo (`Sessao`, com o token) é descartado de propósito.
  await chamar<Sessao>("/auth/entrar", { metodo: "POST", corpo: credenciais });
  limparCache();
}

/**
 * `POST /auth/cadastro`: cria a pessoa, sem entrar. Com o cadastro fechado no
 * backend, lança 403 `cadastro_fechado`; e-mail repetido, 409 `email_ja_cadastrado`.
 */
export function cadastrar(dados: DadosDeCadastro): Promise<Usuario> {
  return chamar<Usuario>("/auth/cadastro", { metodo: "POST", corpo: dados });
}

/**
 * `POST /auth/sair`. Nunca falha: sem resposta do servidor ou com a sessão já
 * encerrada (401), a saída local vale do mesmo jeito (o cookie expira sozinho).
 * O cache é limpo em qualquer caso.
 */
export async function sair(): Promise<void> {
  try {
    await chamar<void>("/auth/sair", { metodo: "POST" });
  } catch {
    // A pessoa pediu para sair: o estado local deixa a sessão de qualquer jeito.
  } finally {
    limparCache();
  }
}
