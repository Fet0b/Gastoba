import type { MovimentoDeInvestimento, TipoDeMovimento } from "../api/tipos";
import { formatar, paraCentavos } from "../dinheiro/dinheiro";
import { normalizarNomeDaInstituicao } from "../texto/nomeDaInstituicao";

type Entrada = Pick<MovimentoDeInvestimento, "natureza" | "descricao" | "tipo">;

/** Rótulo legível do movimento pela natureza; a descrição do banco fica em segundo plano. */
export function rotuloDoMovimento(m: Entrada): string {
  switch (m.natureza) {
    case "liquidacao_de_bolsa": return "Liquidação da bolsa";
    case "imposto_ou_taxa": return /\b(irrf|iof)\b/i.test(m.descricao) ? "Imposto" : "Taxa da B3";
    case "conta_remunerada": return m.tipo === "resgate" ? "Resgate automático" : "Aplicação automática";
    case "vencimento": return "Vencimento";
    case "rendimento": return "Rendimento";
    default: return normalizarNomeDaInstituicao(m.descricao);
  }
}

/** Saída do bolso é "−" (aporte, custo, imposto); entrada é "+" (resgate, rendimento). */
export function sinalDoMovimento(tipo: TipoDeMovimento): "−" | "+" {
  return tipo === "aporte" || tipo === "custo" || tipo === "imposto" ? "−" : "+";
}

/** O valor (texto decimal) com o sinal à frente, sem nunca virar `number`. */
export function valorComSinal(tipo: TipoDeMovimento, valor: string): string {
  const absoluto = paraCentavos(valor) < 0n ? valor.replace("-", "") : valor;
  return `${sinalDoMovimento(tipo)}${formatar(absoluto)}`;
}
