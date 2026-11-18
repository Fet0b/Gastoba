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

const TIPOS: Readonly<Record<string, string>> = { STOCK: "Ação", CAIXINHA: "Conta investimentos", FIXED_INCOME: "Renda fixa", MUTUAL_FUND: "Fundo", EQUITY: "Ação", ETF: "ETF", SECURITY: "Previdência e outros", COE: "COE", OTHER: "Outro", TREASURY: "Tesouro Direto", DEBENTURES: "Debênture", CDB: "CDB", LCI: "LCI", LCA: "LCA", CRI: "CRI", CRA: "CRA" };
export function rotuloDoTipo(tipo: string): string { return TIPOS[tipo.toUpperCase()] ?? tipo; }

type Opcao = Entrada & { id: string; saldo: string; data_de_aplicacao?: string | null };
export function rotulosDaEvolucao(itens: readonly Opcao[]): string[] {
 const bases = itens.map(item => {
  const nome = item.nome.replace(/^([A-Z]+)\s*-\s*BANCO\s+(.+?)(?:\s+S\.?A\.?)?$/i, (_, tipo: string, banco: string) => `${tipo.toUpperCase()} ${banco.toLowerCase().replace(/\b\p{L}/gu, c => c.toUpperCase())}`);
  return `${rotuloDoInvestimento({...item,nome}).replace(/, /g," · ")} · ${formatar(item.saldo)}`;
 });
 const comData = bases.map((base, i) => bases.filter(b => b === base).length > 1 && itens[i].data_de_aplicacao ? `${base} · aplicação ${dataParaExibicao(itens[i].data_de_aplicacao!)}` : base);
 return comData.map((base, i) => comData.filter(b => b === base).length > 1 ? `${base} (${comData.slice(0,i+1).filter(b => b === base).length})` : base);
}
