// Módulo puro (sem React nem fetch): o nome de um investimento com o que o distingue dos parecidos.

import type { Investimento } from "../api/tipos";
import { rotuloDaTaxa } from "./taxa";

type Entrada = Pick<Investimento, "nome" | "taxa"> & { vencimento?: string | null };

/**
 * "CDB - BANCO INTER S.A, 104% CDI, vence 03/2027": nome, taxa e mês do vencimento, só do que a
 * instituição informa. Serve para distinguir dezenas de títulos com o mesmo nome.
 */
export function rotuloDoInvestimento(investimento: Entrada): string {
  const partes = [investimento.nome];
  const taxa = rotuloDaTaxa(investimento.taxa);
  if (taxa !== null) partes.push(taxa);
  const vencimento = /^(\d{4})-(\d{2})-\d{2}$/.exec(investimento.vencimento ?? "");
  if (vencimento !== null) partes.push(`vence ${vencimento[2]}/${vencimento[1]}`);
  return partes.join(", ");
}

import { formatar } from "../dinheiro/dinheiro";
import { dataParaExibicao } from "../periodo/periodo";

// Rótulos dos `type` e `subtype` que a Pluggy documenta (docs.pluggy.ai/docs/investments, conferido
// em 2026-11-13; ver specs/063-estrategias-de-investimento/research.md) e de "CAIXINHA" (nosso).
const TIPOS: Readonly<Record<string, string>> = {
  CAIXINHA: "Conta investimentos",
  FIXED_INCOME: "Renda fixa", SECURITY: "Previdência e outros", MUTUAL_FUND: "Fundo", EQUITY: "Ação", ETF: "ETF", COE: "COE", OTHER: "Outro",
  STOCK: "Ação", BDR: "BDR", REAL_ESTATE_FUND: "Fundo imobiliário", DERIVATIVES: "Derivativo", OPTION: "Opção",
  CRI: "CRI", CRA: "CRA", LCI: "LCI", LCA: "LCA", LC: "LC", TREASURY: "Tesouro Direto", DEBENTURES: "Debênture", CDB: "CDB", LIG: "LIG", LF: "LF",
  INVESTMENT_FUND: "Fundo de investimento", STOCK_FUND: "Fundo de ações", MULTIMARKET_FUND: "Fundo multimercado", EXCHANGE_FUND: "Fundo cambial",
  FIXED_INCOME_FUND: "Fundo de renda fixa", FIP_FUND: "Fundo de participações", OFFSHORE_FUND: "Fundo offshore", ETF_FUND: "Fundo de ETF",
  RETIREMENT: "Previdência", PGBL: "PGBL", VGBL: "VGBL",
};
/** Nunca devolve o código cru: valor desconhecido usa o rótulo do tipo pai (se informado) ou "Outro". */
export function rotuloDoTipo(tipo: string, pai?: string): string {
  return TIPOS[tipo.toUpperCase()] ?? (typeof pai === "string" ? TIPOS[pai.toUpperCase()] : undefined) ?? "Outro";
}

type Opcao = Entrada & { id: string; saldo: string; data_de_aplicacao?: string | null };
export function rotulosDaEvolucao(itens: readonly Opcao[]): string[] {
 const bases = itens.map(item => {
  const nome = item.nome.replace(/^([A-Z]+)\s*-\s*BANCO\s+(.+?)(?:\s+S\.?A\.?)?$/i, (_, tipo: string, banco: string) => `${tipo.toUpperCase()} ${banco.toLowerCase().replace(/\b\p{L}/gu, c => c.toUpperCase())}`);
  return `${rotuloDoInvestimento({...item,nome})}, ${formatar(item.saldo)}`;
 });
 const comData = bases.map((base, i) => bases.filter(b => b === base).length > 1 && itens[i].data_de_aplicacao ? `${base}, aplicação ${dataParaExibicao(itens[i].data_de_aplicacao!)}` : base);
 return comData.map((base, i) => comData.filter(b => b === base).length > 1 ? `${base} (${comData.slice(0,i+1).filter(b => b === base).length})` : base);
}
