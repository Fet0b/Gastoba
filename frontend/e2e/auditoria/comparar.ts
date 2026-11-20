import { appendFileSync } from "node:fs";

import type { Achado } from "./regras";
import { PENDENCIAS } from "./pendencias";

export type Estado = "dados" | "vazio" | "carregando";
export type Ambiente = "simulacao" | "teste";

/** O que a auditoria ainda acusa, e que uma faixa da 070 vai corrigir. Estado padrão: `dados`. */
export type Pendencia = { regra: string; largura: number; estado?: Estado; nota?: string };

const chave = (regra: string, largura: number, estado: Estado): string => `${regra}|${largura}|${estado}`;

export function compararComPendencias(
  achados: readonly Achado[],
  vista: string,
  ambiente: Ambiente,
  largura: number,
  estado: Estado,
): { novas: string[]; sumidas: string[] } {
  const listadas = (PENDENCIAS[vista]?.[ambiente] ?? []).filter(
    (p) => p.largura === largura && (p.estado ?? "dados") === estado,
  );
  const esperadas = new Set(listadas.map((p) => chave(p.regra, p.largura, p.estado ?? "dados")));
  const vistas = new Map<string, string[]>();
  for (const a of achados) {
    const k = chave(a.regra, largura, estado);
    vistas.set(k, [...(vistas.get(k) ?? []), a.alvo]);
  }
  const novas = [...vistas.entries()]
    .filter(([k]) => !esperadas.has(k))
    .map(([k, alvos]) => `${k}: ${alvos.slice(0, 6).join(" | ")}${alvos.length > 6 ? ` (+${alvos.length - 6})` : ""}`);
  const sumidas = [...esperadas].filter((k) => !vistas.has(k));
  return { novas, sumidas };
}

/**
 * Com `GASTOBA_AUDITORIA_RELATORIO=<arquivo>` cada vista acrescenta uma linha JSON por regra acusada;
 * `gerar-pendencias.ts` transforma o relatório nos arquivos de `pendencias/`.
 */
export function registrar(
  ambiente: Ambiente,
  vista: string,
  estado: Estado,
  largura: number,
  achados: readonly Achado[],
): void {
  const arquivo = process.env.GASTOBA_AUDITORIA_RELATORIO;
  if (!arquivo) return;
  const porRegra = new Map<string, string[]>();
  for (const a of achados) porRegra.set(a.regra, [...(porRegra.get(a.regra) ?? []), a.alvo]);
  const linhas = [...porRegra.entries()].map(([regra, alvos]) =>
    JSON.stringify({ ambiente, vista, estado, largura, regra, quantidade: alvos.length, alvos: alvos.slice(0, 12) }),
  );
  if (linhas.length === 0) linhas.push(JSON.stringify({ ambiente, vista, estado, largura, regra: null }));
  appendFileSync(arquivo, `${linhas.join("\n")}\n`);
}
