import type { Conta } from "../../api/tipos";
import { Seletor } from "../Campo/Seletor";
import estilos from "./Contas.module.css";
import { textoDaConta } from "../../contas/identificacao";

type Propriedades = {
  /** `undefined` enquanto a primeira busca não respondeu (ou se ela falhou). */
  contas: Conta[] | undefined;
  /** Id da conta escolhida; `null` é "Todas as contas". */
  ativa: string | null;
  aoMudar: (contaId: string | null) => void;
};

/** Seletor de conta para filtrar uma tela: "Todas as contas" ou uma conta. */
export function FiltroDeContas({ contas, ativa, aoMudar }: Propriedades) {
  return (
    <div className={estilos.filtroDeContas}>
      <Seletor
        rotulo="Conta"
        valor={ativa ?? ""}
        vazio="Todas as contas"
        aoMudar={(valor) => aoMudar(valor === "" ? null : valor)}
        opcoes={(contas ?? []).map((conta) => ({ valor: conta.id, rotulo: textoDaConta(conta) }))}
      />
    </div>
  );
}
