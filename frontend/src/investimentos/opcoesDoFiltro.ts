import type { Investimento } from "../api/tipos";
import { paraCentavos } from "../dinheiro/dinheiro";
import { agruparInvestimentos } from "./categorias";

export type OpcaoDoFiltro = { valor: string; rotulo: string };
export type GrupoDoFiltro = { nome: string; opcoes: OpcaoDoFiltro[] };

type Entrada = Pick<Investimento, "id" | "nome" | "tipo" | "saldo"> & { rotulo?: string | null };

/**
 * As opções do filtro de investimento, agrupadas por categoria (na ordem de `agruparInvestimentos`).
 * Com o `rotulo` da API (único: vencimento, taxa e, se preciso, o final do id) ele é usado como está.
 * Sem ele (resposta antiga), nomes repetidos ganham sufixo: o de maior saldo fica com o nome, os
 * demais com "(2)", "(3)"...
 */
export function opcoesDoFiltroDeInvestimento(investimentos: readonly Entrada[]): {
  grupos: GrupoDoFiltro[];
} {
  const rotulos = new Map<string, string>();
  if (investimentos.length > 0 && investimentos.every((i) => i.rotulo)) {
    return {
      grupos: agruparInvestimentos(investimentos).map((g) => ({
        nome: g.nome,
        opcoes: g.investimentos.map((i) => ({ valor: i.id, rotulo: i.rotulo as string })),
      })),
    };
  }
  const porNome = new Map<string, Entrada[]>();
  for (const i of investimentos) porNome.set(i.nome, [...(porNome.get(i.nome) ?? []), i]);
  for (const [nome, itens] of porNome) {
    const ordenados = [...itens].sort((a, b) => {
      const diferenca = paraCentavos(b.saldo) - paraCentavos(a.saldo);
      return diferenca > 0n ? 1 : diferenca < 0n ? -1 : 0;
    });
    ordenados.forEach((i, posicao) => rotulos.set(i.id, posicao === 0 ? nome : `${nome} (${posicao + 1})`));
  }
  return {
    grupos: agruparInvestimentos(investimentos).map((g) => ({
      nome: g.nome,
      opcoes: g.investimentos.map((i) => ({ valor: i.id, rotulo: rotulos.get(i.id) ?? i.nome })),
    })),
  };
}
