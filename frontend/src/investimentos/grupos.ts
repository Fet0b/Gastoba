import type { Investimento } from "../api/tipos";
import { deCentavos, paraCentavos } from "../dinheiro/dinheiro";

export const CATEGORIAS_DOS_INVESTIMENTOS = [
  { tipo: "FIXED_INCOME", nome: "Renda fixa" },
  { tipo: "EQUITY", nome: "Ações" },
  { tipo: "MUTUAL_FUND", nome: "Fundos" },
  { tipo: "CAIXINHA", nome: "Conta investimentos" },
  { tipo: "OTHER", nome: "Outros" },
] as const;

/** Agrupa a apresentação das posições sem alterar a ordem dentro de cada tipo. */
export function agruparInvestimentos<T extends Pick<Investimento, "tipo" | "saldo">>(
  investimentos: readonly T[],
): { tipo: string; nome: string; investimentos: T[]; total: string }[] {
  const tiposConhecidos = new Set<string>(CATEGORIAS_DOS_INVESTIMENTOS.map((c) => c.tipo));
  const porTipo = new Map<string, T[]>();
  for (const investimento of investimentos) {
    const tipo = investimento.tipo === "ETF" ? "EQUITY" : tiposConhecidos.has(investimento.tipo) ? investimento.tipo : "OTHER";
    const grupo = porTipo.get(tipo) ?? [];
    grupo.push(investimento);
    porTipo.set(tipo, grupo);
  }
  return CATEGORIAS_DOS_INVESTIMENTOS.flatMap((categoria) => {
    const posicoes = porTipo.get(categoria.tipo);
    if (!posicoes) return [];
    const total = posicoes.reduce((soma, item) => soma + paraCentavos(item.saldo), 0n);
    return [{ ...categoria, investimentos: posicoes, total: deCentavos(total) }];
  });
}

/**
 * Os tipos de título da renda fixa, na ordem de apresentação. O `subtype` vem da Pluggy
 * (CDB, LCI, LCA, CRI, CRA, DEBENTURES, TREASURY; LC, LF e LIG ficam em "Outras").
 */
const SUBGRUPOS_DA_RENDA_FIXA = [
  { chave: "CDB", nome: "CDBs", subtipos: ["CDB"] },
  { chave: "LCI_LCA", nome: "LCIs e LCAs", subtipos: ["LCI", "LCA"] },
  { chave: "TREASURY", nome: "Tesouro Direto", subtipos: ["TREASURY"] },
  { chave: "DEBENTURES", nome: "Debêntures", subtipos: ["DEBENTURES", "DEBENTURE"] },
  { chave: "CRI_CRA", nome: "CRIs e CRAs", subtipos: ["CRI", "CRA"] },
] as const;

const SUBGRUPO_OUTRAS = { chave: "OUTRAS", nome: "Outras de renda fixa" } as const;

function chaveDoSubgrupo(subtipo: string | null): string {
  const normalizado = subtipo?.trim().toUpperCase() ?? "";
  const grupo = SUBGRUPOS_DA_RENDA_FIXA.find((g) =>
    (g.subtipos as readonly string[]).includes(normalizado),
  );
  return grupo?.chave ?? SUBGRUPO_OUTRAS.chave;
}

/** Divide as posições de renda fixa por tipo de título, sem alterar a ordem dentro de cada um. */
export function agruparRendaFixa<T extends Pick<Investimento, "subtipo" | "saldo">>(
  investimentos: readonly T[],
): { chave: string; nome: string; investimentos: T[]; total: string }[] {
  const porChave = new Map<string, T[]>();
  for (const investimento of investimentos) {
    const chave = chaveDoSubgrupo(investimento.subtipo);
    const grupo = porChave.get(chave) ?? [];
    grupo.push(investimento);
    porChave.set(chave, grupo);
  }
  return [...SUBGRUPOS_DA_RENDA_FIXA, SUBGRUPO_OUTRAS].flatMap((subgrupo) => {
    const posicoes = porChave.get(subgrupo.chave);
    if (!posicoes) return [];
    const total = posicoes.reduce((soma, item) => soma + paraCentavos(item.saldo), 0n);
    return [{ chave: subgrupo.chave, nome: subgrupo.nome, investimentos: posicoes, total: deCentavos(total) }];
  });
}
