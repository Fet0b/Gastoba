// A rota do app: o caminho diz a tela e a query leva o mês, a vista e a data. Módulo puro, sem
// React nem `window`; quem escuta o navegador é o `useRota`.

import type { OpcoesDaIda, Tela } from "../componentes/Navegacao/telas";
import { mesDoPeriodo, type Periodo } from "../periodo/periodo";

const CAMINHOS: Record<Tela, string> = {
  inicio: "/inicio",
  transacoes: "/transacoes",
  orcamento: "/orcamento",
  contas: "/contas",
  investimentos: "/investimentos",
  caixinhas: "/caixinhas",
  faturas: "/faturas",
  tags: "/tags",
  outros: "/recorrencias",
  perfil: "/perfil",
};

const TELAS_MENSAIS: readonly Tela[] = ["inicio", "transacoes", "orcamento", "tags"];

export type Rota = {
  tela: Tela;
  mes?: Periodo;
  dataDoMovimento?: string;
  vistaDeTransacoes?: "aportes";
  /** Falso quando o endereço precisa ser reescrito (raiz, caminho desconhecido, parâmetro à toa). */
  canonico: boolean;
};

export type OpcoesDaRota = Pick<OpcoesDaIda, "dataDoMovimento" | "vistaDeTransacoes"> & { mes?: Periodo };

function periodoDe(texto: string | null): Periodo | undefined {
  const achado = texto === null ? null : /^(\d{4})-(\d{2})$/.exec(texto);
  if (achado === null) return undefined;
  const ano = Number(achado[1]);
  const mes = Number(achado[2]);
  return ano >= 1 && mes >= 1 && mes <= 12 ? { ano, mes } : undefined;
}

function dataValida(texto: string | null): string | undefined {
  const achado = texto === null ? null : /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (achado === null) return undefined;
  const [ano, mes, dia] = [Number(achado[1]), Number(achado[2]), Number(achado[3])];
  const data = new Date(ano, mes - 1, dia);
  return ano >= 1 && data.getFullYear() === ano && data.getMonth() === mes - 1 && data.getDate() === dia
    ? (texto ?? undefined)
    : undefined;
}

/** O endereço de uma tela, com o mês (só nas mensais), a vista e a data (só em Transações). */
export function paraCaminho(tela: Tela, opcoes: OpcoesDaRota = {}): string {
  const parametros = new URLSearchParams();
  const data = tela === "transacoes" ? dataValida(opcoes.dataDoMovimento ?? null) : undefined;
  const mes = data !== undefined ? periodoDe(data.slice(0, 7)) : opcoes.mes;
  if (TELAS_MENSAIS.includes(tela) && mes !== undefined) parametros.set("mes", mesDoPeriodo(mes));
  if (data !== undefined) parametros.set("data", data);
  if (tela === "transacoes" && opcoes.vistaDeTransacoes === "aportes") parametros.set("vista", "aportes");
  const texto = parametros.toString();
  return texto === "" ? CAMINHOS[tela] : `${CAMINHOS[tela]}?${texto}`;
}

/** A tela e as opções de um endereço; o que não vale é ignorado e marca `canonico: false`. */
export function deCaminho(pathname: string, search: string): Rota {
  const semBarraFinal = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const telaDoCaminho = (Object.keys(CAMINHOS) as Tela[]).find((t) => CAMINHOS[t] === semBarraFinal);
  const tela: Tela = telaDoCaminho ?? "inicio";
  const parametros = new URLSearchParams(search);
  const rota: Rota = { tela, canonico: telaDoCaminho !== undefined };
  const mes = periodoDe(parametros.get("mes"));
  if (mes !== undefined && TELAS_MENSAIS.includes(tela)) rota.mes = mes;
  const data = dataValida(parametros.get("data"));
  if (data !== undefined && tela === "transacoes") rota.dataDoMovimento = data;
  if (parametros.get("vista") === "aportes" && tela === "transacoes") rota.vistaDeTransacoes = "aportes";
  // Canônico é exatamente o que `paraCaminho` escreveria: parâmetro inválido ou à toa o reescreve.
  const esperado = paraCaminho(tela, rota);
  rota.canonico = rota.canonico && esperado === pathname + (search === "" || search === "?" ? "" : search);
  return rota;
}
