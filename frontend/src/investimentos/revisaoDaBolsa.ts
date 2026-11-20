import type { PropostaDeCasamento, SituacaoNaRevisao } from "../api/tipos";
import { formatar, paraCentavos, somar } from "../dinheiro/dinheiro";

const VERBO = { compra_na_bolsa: "Compra", venda_na_bolsa: "Venda", resgate_de_renda_fixa: "Resgate" } as const;

/** "Compra de BBAS3 (1) e ITUB4 (3)": o conceito da proposta pelo nome das operações. */
export function rotuloDaProposta(p: PropostaDeCasamento): string {
  const verbo = VERBO[p.tipo];
  if (p.tipo === "resgate_de_renda_fixa") return `${verbo} de ${p.operacoes.map(o => o.rotulo).join(", ")}`;
  const itens = p.operacoes.map(o => `${o.rotulo} (${o.quantidade})`);
  const lista = itens.length > 1 ? `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}` : itens[0];
  return `${verbo} de ${lista}`;
}

const SITUACAO: Record<SituacaoNaRevisao, string> = {
  pendente: "hoje: na caixa de entrada",
  aporte_sem_investimento: "hoje: aporte sem investimento",
  resgate_sem_investimento: "hoje: resgate sem investimento",
  ganho: "hoje: ganho",
  aporte_de_outra_posicao: "hoje: ligado a outra posição",
};
export function rotuloDaSituacao(situacao: SituacaoNaRevisao): string { return SITUACAO[situacao]; }

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** O que acontece com cada lançamento ao ligar, em frases, a partir dos `efeitos` do servidor. */
export function textosDosEfeitos(p: PropostaDeCasamento): string[] {
  const codigo = (id: string) => p.efeitos.find(e => e.transacao_id === id)?.codigo;
  const deCodigo = (c: string, lista: PropostaDeCasamento["bruto"]) => lista.filter(t => codigo(t.id) === c);
  const ativo = p.operacoes.map(o => o.rotulo).join(" e ");
  const textos: string[] = [];
  const aportes = deCodigo("aporte_passa_a_ser_da_posicao", p.bruto);
  if (aportes.length > 0) {
    const valor = formatar(somar(aportes.map(t => t.valor)));
    textos.push(aportes.length === 1
      ? `O ${p.tipo === "venda_na_bolsa" || p.tipo === "resgate_de_renda_fixa" ? "resgate" : "aporte"} sem investimento de ${valor} passa a ser o ${p.tipo === "compra_na_bolsa" ? "aporte" : "resgate"} de ${ativo}.`
      : `Os ${aportes.length} lançamentos sem investimento (${valor}) passam a ser da posição de ${ativo}.`);
  }
  const taxas = deCodigo("taxa_deixa_de_ser_aporte", p.taxas);
  if (taxas.length > 0) {
    textos.push(`${taxas.length === 1 ? "A taxa" : `As ${taxas.length} taxas`} (${formatar(somar(taxas.map(t => t.valor)))}) ${taxas.length === 1 ? "deixa" : "deixam"} de ser ${taxas.length === 1 ? "aporte" : "aportes"}; o custo já está na operação.`);
  }
  const ganhos = [...p.bruto, ...p.taxas].filter(t => codigo(t.id) === "ganho_deixa_de_ser_renda");
  if (ganhos.length > 0) textos.push(`${plural(ganhos.length, "ganho deixa", "ganhos deixam")} de contar como renda e passa${ganhos.length === 1 ? "" : "m"} a ser o resgate da posição.`);
  const pendentes = [...p.bruto, ...p.taxas].filter(t => codigo(t.id) === "aceita_a_pendente");
  if (pendentes.length > 0) textos.push(`${plural(pendentes.length, "lançamento da caixa de entrada passa", "lançamentos da caixa de entrada passam")} a ser aceito${pendentes.length === 1 ? "" : "s"} como parte desta operação.`);
  textos.push("Saldo, custo da posição e caixinhas não mudam.");
  return textos;
}

/** Diferença em dinheiro com sinal explícito: "+R$ 0,13", "−R$ 0,13" e "R$ 0,00". */
export function diferencaComSinal(valor: string): string {
  return paraCentavos(valor) > 0n ? `+${formatar(valor)}` : formatar(valor);
}

export function textoDoBotaoDeLigar(selecionadas: number): string {
  return `Ligar ${selecionadas} ${selecionadas === 1 ? "selecionada" : "selecionadas"}`;
}

/** O que falta para o botão de ligar funcionar; nulo quando pode clicar (Art. XI.6.2). */
export function motivoDoBotaoDeLigar(selecionadas: number, ligando: boolean): string | null {
  if (ligando) return "Ligando as propostas…";
  return selecionadas === 0 ? "Selecione ao menos uma proposta." : null;
}

export function chavesDasExatas(propostas: readonly PropostaDeCasamento[]): string[] {
  return propostas.filter(p => p.confianca === "exata").map(p => p.chave);
}

/** O valor com sinal ("−R$ 1,00" na saída, "+R$ 1,00" na entrada); sem sentido conhecido, sem sinal. */
export function valorComSinal(valor: string, sentido: "entrada" | "saida" | null): string {
  if (sentido === "saida") return formatar(`-${valor}`);
  return sentido === "entrada" ? `+${formatar(valor)}` : formatar(valor);
}
