import type { ProgressoDaMeta } from "../../api/tipos";
import { formatar, paraCentavos } from "../../dinheiro/dinheiro";
import { rotuloDeExibicao } from "../../texto/rotulo";

/**
 * As caixinhas que pagaram compras da categoria no mês, uma frase cada, para completar
 * "R$ 4.200 de R$ 954": "+ R$ 3.500 da caixinha Computador". Vazio quando nenhuma pagou.
 */
export function frasesDasCaixinhas(progresso: ProgressoDaMeta): string[] {
  return progresso.caixinhas
    .filter((c) => paraCentavos(c.valor) > 0n)
    .map((c) => `+ ${formatar(c.valor)} da caixinha ${rotuloDeExibicao(c.tag)}`);
}

/** O gasto que o cartão mostra: com caixinha pagando compras, o bruto; sem, o de sempre. */
export function gastoDoCartao(progresso: ProgressoDaMeta): string {
  return paraCentavos(progresso.limite_adicional) > 0n ? progresso.gasto_bruto : progresso.gasto;
}
