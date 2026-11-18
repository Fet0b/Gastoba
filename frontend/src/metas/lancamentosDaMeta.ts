import type { Gasto, MovimentoDeInvestimento, TransferenciaEntreContas } from "../api/tipos";
import { paraCentavos } from "../dinheiro/dinheiro";
import { valorLiquido } from "../transacoes/despesas";

/** Um lançamento que conta numa meta do mês (só leitura; as regras espelham as do servidor). */
export type LancamentoDaMeta = {
  id: string;
  /** "AAAA-MM-DD". */
  data: string;
  descricao: string;
  /** Valor líquido, string decimal. */
  valor: string;
  origem: "gasto" | "aporte" | "transferencia";
  conta_id: string | null;
};

const LIBERDADE_FINANCEIRA = "liberdade_financeira";

/**
 * Categorias mostram seus gastos líquidos. Liberdade financeira mostra somente o fluxo
 * líquido confirmado entre contas correntes e de investimento, inclusive retiradas.
 * Movimentos da posição e classificações legadas não demonstram dinheiro novo.
 */
export function lancamentosDaMeta(
  codigo: string,
  gastos: readonly Gasto[],
  _movimentos: readonly MovimentoDeInvestimento[],
  transferencias: readonly TransferenciaEntreContas[] = [],
): LancamentoDaMeta[] {
  const liberdade = codigo === LIBERDADE_FINANCEIRA;
  const doGasto = (gasto: Gasto): LancamentoDaMeta => ({
    id: gasto.id,
    data: gasto.data,
    descricao: gasto.descricao,
    valor: valorLiquido(gasto),
    origem: "gasto",
    conta_id: gasto.conta_id,
  });
  const itens = [
    ...gastos
      .filter((gasto) => !liberdade && gasto.categoria === codigo)
      .filter((gasto) => paraCentavos(valorLiquido(gasto)) > 0n)
      .map(doGasto),
    ...(liberdade ? transferencias.filter(t => paraCentavos(t.aporte_liquido) !== 0n).map((t): LancamentoDaMeta => ({
      id: t.id, data: t.data, descricao: "Transferência entre contas próprias", valor: t.aporte_liquido,
      origem: "transferencia", conta_id: t.papel_destino === "investimento" ? t.conta_destino_id : t.conta_origem_id,
    })) : []),
  ];
  return itens.sort((a, b) => b.data.localeCompare(a.data) || a.descricao.localeCompare(b.descricao, "pt-BR"));
}
