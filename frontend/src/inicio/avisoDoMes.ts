// O aviso único do Início: a pior situação entre as metas do mês.
// Módulo puro; escreve a própria frase (o `textoDaSituacao` do Medidor é de outro plano).

import type { ProgressoDaMeta, ResumoDasMetas } from "../api/tipos";
import { deCentavos, formatar, paraCentavos } from "../dinheiro/dinheiro";

export type AvisoDoMes = {
  categoria: string;
  situacao: "alerta" | "estourou";
  texto: string;
};

function gravidade(meta: ProgressoDaMeta): number {
  // Estouro sempre acima de alerta; dentro de cada um, o maior percentual usado
  // (nulo, o limite zero com gasto, é o pior possível).
  const base = meta.situacao === "estourou" ? 1_000_000_000 : 0;
  return base + (meta.percentual_usado ?? 999_999_999);
}

/** O aviso da pior meta do mês, ou `null` se nenhuma está em alerta ou estourou. */
export function avisoDoMes(
  resumo: ResumoDasMetas | undefined,
  nomesDasCategorias: Readonly<Record<string, string>>,
): AvisoDoMes | null {
  if (!resumo) return null;
  let pior: ProgressoDaMeta | null = null;
  for (const meta of resumo.metas) {
    if (meta.situacao !== "alerta" && meta.situacao !== "estourou") continue;
    // `>` estrito: no empate fica a primeira, que é a da ordem do enum.
    if (pior === null || gravidade(meta) > gravidade(pior)) pior = meta;
  }
  if (pior === null) return null;
  const nome = nomesDasCategorias[pior.categoria] ?? pior.categoria;
  if (pior.situacao === "estourou") {
    const passou = deCentavos(-paraCentavos(pior.restante));
    return {
      categoria: pior.categoria,
      situacao: "estourou",
      texto: `${nome} estourou a meta em ${formatar(passou)}`,
    };
  }
  return {
    categoria: pior.categoria,
    situacao: "alerta",
    texto: `${nome} a ${pior.percentual_usado ?? 0}% da meta`,
  };
}
