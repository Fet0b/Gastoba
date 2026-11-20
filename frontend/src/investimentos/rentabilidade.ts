import type { Investimento, PendenciaDeInvestimento } from "../api/tipos";

export type RentabilidadeDaPosicao =
  | { tipo: "calculada"; periodo: string; anualizada: string | null }
  | { tipo: "instituicao"; valor: string }
  | { tipo: "ausente"; motivo: string };

/**
 * O que mostrar de rentabilidade. Nunca um número inventado: com o histórico incompleto fica o
 * motivo; o que a própria instituição informa continua valendo.
 */
export function rentabilidadeDaPosicao(i: Investimento): RentabilidadeDaPosicao {
  if (i.historico_completo && i.rentabilidade_do_periodo != null) {
    return { tipo: "calculada", periodo: i.rentabilidade_do_periodo, anualizada: i.rentabilidade_anualizada ?? null };
  }
  if (i.origem_da_rentabilidade === "instituicao" && i.rentabilidade !== null) {
    return { tipo: "instituicao", valor: i.rentabilidade };
  }
  return { tipo: "ausente", motivo: i.motivo_sem_rentabilidade ?? "historico_incompleto" };
}

/**
 * O aplicado e o rendimento a mostrar: os das operações quando o histórico fecha (o aplicado da
 * instituição pode estar defasado), senão os da instituição ou dos aportes.
 */
export function aplicadoERendimento(i: Investimento): { aplicado: string | null; rendimento: string | null } {
  if (i.valor_aplicado_das_operacoes != null && i.rendimento_das_operacoes != null) {
    return { aplicado: i.valor_aplicado_das_operacoes, rendimento: i.rendimento_das_operacoes };
  }
  return { aplicado: i.valor_aplicado, rendimento: i.rendimento };
}

/** "Faltam ~25 cotas de AUPO11: informe data e preço." (vírgula decimal; "Falta ~1 cota" no singular). */
export function textoDaPendencia(p: PendenciaDeInvestimento, nome: string): string {
  const quantidade = p.quantidade_estimada.replace(".", ",");
  const umaSo = /^1([.,]0+)?$/.test(p.quantidade_estimada);
  const cotas = umaSo ? "cota" : "cotas";
  return p.tipo === "faltam_cotas"
    ? `${umaSo ? "Falta" : "Faltam"} ~${quantidade} ${cotas} de ${nome}: informe data e preço.`
    : `${umaSo ? "Sobra" : "Sobram"} ~${quantidade} ${cotas} de ${nome}: registre a venda.`;
}
