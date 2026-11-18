import type { Investimento, Operacao } from "../../api/tipos";
import { LancarOperacao } from "./LancarOperacao";

/** A abertura usa o mesmo formulário das operações manuais. */
export function EditarAbertura(props: { investimento: Investimento; operacoes: Operacao[]; operacao: Operacao; aoCancelar: () => void; aoSalvar: () => void }) {
  return <LancarOperacao {...props} />;
}
