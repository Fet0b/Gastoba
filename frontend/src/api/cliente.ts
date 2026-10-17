// Cliente HTTP da API: JSON de ida e volta e o formato único de erro
// `{"erro": {"codigo", "mensagem", "detalhes"?}}` transformado em ErroDaApiCliente.
// A sessão viaja no cookie HttpOnly que o backend define em `POST /auth/entrar`:
// toda chamada o envia (`credentials: "include"`), e toda escrita leva o
// cabeçalho anti-CSRF que o backend exige quando o cookie autentica.

import type { DetalheDoErro } from "./tipos";

/**
 * Endereço da API; a simulação usa a mesma base para casar os caminhos.
 * `localhost`, e não `127.0.0.1`: o cookie de sessão é SameSite=Strict, e o
 * navegador só o envia se a página (http://localhost:5173) e a API forem do
 * mesmo site. `||` e não `??`: `VITE_API_URL=` (vazia) também cai no padrão.
 */
export const URL_BASE = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/+$/, "");

/** Mensagem de quando não há resposta utilizável (rede, CORS, corpo fora do formato). */
export const MENSAGEM_SEM_RESPOSTA = "Não foi possível falar com o servidor.";

/** Cabeçalho que um formulário de outro site não consegue enviar (proteção contra CSRF). */
const CABECALHO_ANTI_CSRF = "X-Gastoba-Requisicao";

export class ErroDaApiCliente extends Error {
  /** Status HTTP; 0 quando não houve resposta. */
  readonly status: number;
  readonly codigo: string;
  readonly mensagem: string;
  readonly detalhes?: DetalheDoErro[];
  /** Segundos do cabeçalho `Retry-After` (ex.: no 429 `muitas_tentativas`), se válido. */
  readonly esperarSegundos?: number;

  constructor(
    status: number,
    codigo: string,
    mensagem: string,
    detalhes?: DetalheDoErro[],
    esperarSegundos?: number,
  ) {
    super(mensagem);
    this.name = "ErroDaApiCliente";
    this.status = status;
    this.codigo = codigo;
    this.mensagem = mensagem;
    this.detalhes = detalhes;
    this.esperarSegundos = esperarSegundos;
  }
}

export type OpcoesDaChamada = {
  metodo?: "GET" | "POST" | "PUT" | "DELETE";
  corpo?: unknown;
  /** Parâmetros da query string; os indefinidos não são enviados. */
  parametros?: Record<string, string | undefined>;
  signal?: AbortSignal;
};

// --- sessão perdida ------------------------------------------------------------

type OuvinteDaSessaoPerdida = () => void;

const ouvintesDaSessaoPerdida = new Set<OuvinteDaSessaoPerdida>();

/**
 * Registra quem precisa saber que a sessão acabou (um 401 `nao_autenticado`).
 * Devolve a função que remove o ouvinte. Outros 401, como o
 * `credenciais_invalidas` do formulário de entrar, não avisam.
 */
export function aoPerderASessao(ouvinte: OuvinteDaSessaoPerdida): () => void {
  ouvintesDaSessaoPerdida.add(ouvinte);
  return () => {
    ouvintesDaSessaoPerdida.delete(ouvinte);
  };
}

function avisarQueASessaoAcabou(): void {
  for (const ouvinte of [...ouvintesDaSessaoPerdida]) ouvinte();
}

// --- respostas -----------------------------------------------------------------

function semResposta(status: number): ErroDaApiCliente {
  return new ErroDaApiCliente(status, "sem_resposta", MENSAGEM_SEM_RESPOSTA);
}

function ehDetalhe(valor: unknown): valor is DetalheDoErro {
  if (typeof valor !== "object" || valor === null) return false;
  const { campo, mensagem } = valor as Record<string, unknown>;
  return typeof campo === "string" && typeof mensagem === "string";
}

/** `Retry-After` em segundos inteiros; a forma de data HTTP e o resto são ignorados. */
function segundosDoRetryAfter(valor: string | null): number | undefined {
  const texto = valor?.trim() ?? "";
  if (!/^\d+$/.test(texto)) return undefined;
  const segundos = Number.parseInt(texto, 10);
  return Number.isSafeInteger(segundos) ? segundos : undefined;
}

/** O ErroDaApiCliente do corpo, se ele estiver no formato de erro da API. */
function erroDoCorpo(resposta: Response, corpo: unknown): ErroDaApiCliente | null {
  if (typeof corpo !== "object" || corpo === null) return null;
  const erro = (corpo as Record<string, unknown>).erro;
  if (typeof erro !== "object" || erro === null) return null;
  const { codigo, mensagem, detalhes } = erro as Record<string, unknown>;
  if (typeof codigo !== "string" || typeof mensagem !== "string") return null;
  const esperarSegundos = segundosDoRetryAfter(resposta.headers.get("Retry-After"));
  // O esquema OpenAPI declara `detalhes` como opcional e nulo; nulo vale como ausente.
  if (detalhes === undefined || detalhes === null) {
    return new ErroDaApiCliente(resposta.status, codigo, mensagem, undefined, esperarSegundos);
  }
  if (!(Array.isArray(detalhes) && detalhes.every(ehDetalhe))) return null;
  return new ErroDaApiCliente(resposta.status, codigo, mensagem, detalhes, esperarSegundos);
}

function montarUrl(caminho: string, parametros?: Record<string, string | undefined>): string {
  const busca = new URLSearchParams();
  for (const [nome, valor] of Object.entries(parametros ?? {})) {
    if (valor !== undefined) busca.append(nome, valor);
  }
  const consulta = busca.toString();
  return `${URL_BASE}${caminho}${consulta ? `?${consulta}` : ""}`;
}

function montarCabecalhos(metodo: string, temCorpo: boolean): Record<string, string> | undefined {
  const cabecalhos: Record<string, string> = {};
  if (temCorpo) cabecalhos["content-type"] = "application/json";
  if (metodo !== "GET") cabecalhos[CABECALHO_ANTI_CSRF] = "1";
  return Object.keys(cabecalhos).length > 0 ? cabecalhos : undefined;
}

/**
 * Chama a API e devolve o JSON da resposta (`undefined` num 204, que não tem
 * corpo). Lança ErroDaApiCliente com o erro da API (respostas não 2xx no
 * formato do contrato) ou com `codigo: "sem_resposta"` (falha de rede ou corpo
 * fora do formato). Um 401 `nao_autenticado` também avisa os ouvintes de
 * `aoPerderASessao`. O cancelamento pelo `signal` é repassado como está
 * (AbortError), sem virar `sem_resposta`.
 */
export async function chamar<T>(caminho: string, opcoes: OpcoesDaChamada = {}): Promise<T> {
  const { metodo = "GET", corpo, parametros, signal } = opcoes;
  let resposta: Response;
  try {
    resposta = await fetch(montarUrl(caminho, parametros), {
      method: metodo,
      credentials: "include",
      headers: montarCabecalhos(metodo, corpo !== undefined),
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal,
    });
  } catch (erro) {
    if (signal?.aborted) throw erro;
    throw semResposta(0);
  }

  if (resposta.ok && resposta.status === 204) return undefined as T;

  let json: unknown;
  try {
    json = await resposta.json();
  } catch (erro) {
    if (signal?.aborted) throw erro;
    throw semResposta(resposta.status);
  }

  if (resposta.ok) return json as T;
  const erro = erroDoCorpo(resposta, json);
  if (erro === null) throw semResposta(resposta.status);
  if (erro.status === 401 && erro.codigo === "nao_autenticado") avisarQueASessaoAcabou();
  throw erro;
}
