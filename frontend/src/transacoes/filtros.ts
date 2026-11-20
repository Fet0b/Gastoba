// Filtros de Transações: conta, categoria e tag, cada um com várias escolhas. Módulo puro.
// Dentro de um grupo vale qualquer uma das escolhas; entre os grupos, todos precisam valer.

import type { Categoria, Conta } from "../api/tipos";
import type { TransacaoDaLinha } from "./linhaDoTempo";
import { textoDaConta } from "../contas/identificacao";

export type FiltrosDeTransacoes = {
  contas: readonly string[];
  categorias: readonly string[];
  tags: readonly string[];
};

export const FILTROS_VAZIOS: FiltrosDeTransacoes = { contas: [], categorias: [], tags: [] };

/** Tira o valor da lista se já está nela e o acrescenta se não está; nunca muda a original. */
export function alternarNaLista(lista: readonly string[], valor: string): string[] {
  return lista.includes(valor) ? lista.filter((item) => item !== valor) : [...lista, valor];
}

export function contarFiltros(filtros: FiltrosDeTransacoes): number {
  return filtros.contas.length + filtros.categorias.length + filtros.tags.length;
}

/** O ganho não tem categoria: com categoria escolhida, ele fica de fora. */
export function passaNosFiltros(transacao: TransacaoDaLinha, filtros: FiltrosDeTransacoes): boolean {
  if (filtros.contas.length > 0 && !filtros.contas.includes(transacao.conta_id)) return false;
  if (filtros.categorias.length > 0) {
    if (transacao.tipo === "ganho" || !filtros.categorias.includes(transacao.categoria)) return false;
  }
  if (filtros.tags.length > 0 && !transacao.tags.some((tag) => filtros.tags.includes(tag))) return false;
  return true;
}

export type GrupoDeFiltro = keyof FiltrosDeTransacoes;

export type FiltroAtivo = { grupo: GrupoDeFiltro; valor: string; rotulo: string };

/** Os filtros escolhidos, na ordem conta, categoria e tag, com o nome que a pessoa lê. */
function textoDaContaOuPadrao(conta: Conta | undefined): string {
  return conta === undefined ? "Conta" : textoDaConta(conta);
}

export function filtrosAtivos(
  filtros: FiltrosDeTransacoes,
  contas: readonly Conta[] | undefined,
  categorias: readonly Categoria[] | undefined,
): FiltroAtivo[] {
  return [
    ...filtros.contas.map((valor) => ({
      grupo: "contas" as const,
      valor,
      rotulo: textoDaContaOuPadrao(contas?.find((conta) => conta.id === valor)),
    })),
    ...filtros.categorias.map((valor) => ({
      grupo: "categorias" as const,
      valor,
      rotulo: categorias?.find((categoria) => categoria.codigo === valor)?.nome ?? valor,
    })),
    ...filtros.tags.map((valor) => ({ grupo: "tags" as const, valor, rotulo: valor })),
  ];
}
