import type { ProgressoDaMeta } from "../../api/tipos";
import { formatar, paraCentavos } from "../../dinheiro/dinheiro";

/** O que a Dica do cabeçalho das metas diz sobre o trecho rachurado (066). */
export const EXPLICACAO_DO_GUARDADO =
  "O trecho rachurado é o que você guardou este mês para comprar depois. Ele não conta como gasto.";

/** O servidor calcula o guardado; aqui só se decide se há algo a mostrar. */
export function temGuardado(progresso: ProgressoDaMeta): boolean {
  return paraCentavos(progresso.guardado ?? "0.00") > 0n;
}

export function algumGuardado(progressos: readonly ProgressoDaMeta[]): boolean {
  return progressos.some(temGuardado);
}

/** "R$ 300,00 guardados para comprar". */
export function textoDoGuardado(progresso: ProgressoDaMeta): string {
  return `${formatar(progresso.guardado ?? "0.00")} guardados para comprar`;
}
