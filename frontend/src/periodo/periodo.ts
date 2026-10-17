// Períodos e datas como texto ("AAAA-MM-DD") ou componentes numéricos.
// Nunca `new Date("AAAA-MM-DD")` (interpretado em UTC) nem `toISOString()`
// (que dá o dia em UTC e erra a data à noite no Brasil).

/** Um mês do calendário; `mes` vai de 1 (janeiro) a 12 (dezembro). */
export type Periodo = { ano: number; mes: number };

const DIAS_DA_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const FORMATO_DO_ROTULO = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

function doisDigitos(numero: number): string {
  return String(numero).padStart(2, "0");
}

function textoDaData(data: Date): string {
  return `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}`;
}

/** Primeiro e último dia do mês, inclusivos, no formato da API. */
export function limites(periodo: Periodo): { inicio: string; fim: string } {
  // Dia 0 do mês seguinte é o último dia deste (cuida dos anos bissextos).
  const ultimoDia = new Date(periodo.ano, periodo.mes, 0).getDate();
  const prefixo = `${periodo.ano}-${doisDigitos(periodo.mes)}`;
  return { inicio: `${prefixo}-01`, fim: `${prefixo}-${doisDigitos(ultimoDia)}` };
}

export function anterior(periodo: Periodo): Periodo {
  return periodo.mes === 1
    ? { ano: periodo.ano - 1, mes: 12 }
    : { ano: periodo.ano, mes: periodo.mes - 1 };
}

export function proximo(periodo: Periodo): Periodo {
  return periodo.mes === 12
    ? { ano: periodo.ano + 1, mes: 1 }
    : { ano: periodo.ano, mes: periodo.mes + 1 };
}

/** "outubro de 2026". */
export function rotulo(periodo: Periodo): string {
  return FORMATO_DO_ROTULO.format(new Date(periodo.ano, periodo.mes - 1, 1));
}

/** O mês de hoje, no fuso local. */
/** O mês no formato da API: "AAAA-MM". */
export function mesDoPeriodo(periodo: Periodo): string {
  return `${String(periodo.ano).padStart(4, "0")}-${String(periodo.mes).padStart(2, "0")}`;
}

/** Uma data "AAAA-MM-DD" como "dd/mm/aaaa", sem passar por `Date` (que usaria UTC). */
export function dataParaExibicao(data: string): string {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function periodoAtual(): Periodo {
  const agora = new Date();
  return { ano: agora.getFullYear(), mes: agora.getMonth() + 1 };
}

/** A data de hoje no fuso local, como "AAAA-MM-DD". */
export function hojeLocal(): string {
  return textoDaData(new Date());
}

/** A data de ontem no fuso local, como "AAAA-MM-DD". */
export function ontemLocal(): string {
  const agora = new Date();
  return textoDaData(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 1));
}

/** Cabeçalho de um dia da lista: "Hoje", "Ontem" ou "sexta, 3 de outubro". */
export function rotuloDoDia(data: string): string {
  if (data === hojeLocal()) return "Hoje";
  if (data === ontemLocal()) return "Ontem";
  const [ano, mes, dia] = data.split("-").map((parte) => Number.parseInt(parte, 10));
  const diaDaSemana = new Date(ano, mes - 1, dia).getDay();
  return `${DIAS_DA_SEMANA[diaDaSemana]}, ${dia} de ${MESES[mes - 1]}`;
}
