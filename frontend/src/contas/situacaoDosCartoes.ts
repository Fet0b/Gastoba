import type { CartaoComFaturas, SituacaoDaFatura } from "../api/tipos";

export type SituacaoDoCartao = {
  /** A situação da fatura mais recente; nula se o cartão ainda não tem fatura. */
  recente: SituacaoDaFatura | null;
  /** Alguma fatura do cartão venceu sem ser paga. */
  temVencida: boolean;
};

/** O que Contas precisa saber das faturas de cada cartão, pelo id da conta. */
export function situacaoDosCartoes(cartoes: readonly CartaoComFaturas[]): Map<string, SituacaoDoCartao> {
  const mapa = new Map<string, SituacaoDoCartao>();
  for (const cartao of cartoes) {
    mapa.set(cartao.conta_id, {
      recente: cartao.faturas[0]?.situacao ?? null,
      temVencida: cartao.faturas.some((fatura) => fatura.situacao === "vencida"),
    });
  }
  return mapa;
}
