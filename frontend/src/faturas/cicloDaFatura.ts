// O ciclo de uma fatura: quantos dias dele já passaram. Módulo puro; só datas "AAAA-MM-DD" e inteiros.

export type CicloDaFatura = {
  /** O dia do ciclo em que "hoje" está, de 0 (antes do início) até `dias`. */
  dia: number;
  /** Quantos dias tem o ciclo, do início ao fechamento, contando os dois. */
  dias: number;
  /** Inteiro de 0 a 100, arredondado para baixo. */
  percentual: number;
};

const MS_POR_DIA = 86_400_000;

/** Dias corridos desde uma data de referência fixa; usa UTC só para contar, sem fuso. */
function numeroDoDia(data: string): number {
  const [ano, mes, dia] = data.split("-").map(Number);
  return Math.round(Date.UTC(ano, mes - 1, dia) / MS_POR_DIA);
}

export function diaDoMesDe(data: string): number {
  return Number(data.slice(8, 10));
}

/** `null` quando a fatura não tem início ou o fechamento vem antes dele: a barra não aparece. */
export function cicloDaFatura(inicio: string | null, fechamento: string, hoje: string): CicloDaFatura | null {
  if (inicio === null) return null;
  const dias = numeroDoDia(fechamento) - numeroDoDia(inicio) + 1;
  if (dias < 1) return null;
  const dia = Math.min(dias, Math.max(0, numeroDoDia(hoje) - numeroDoDia(inicio) + 1));
  return { dia, dias, percentual: Math.floor((dia * 100) / dias) };
}
