import { useId } from "react";

import type { Conta } from "../../api/tipos";
import estilos from "./Contas.module.css";

type Propriedades = {
  /** `undefined` enquanto a primeira busca não respondeu (ou se ela falhou). */
  contas: Conta[] | undefined;
  /** Id da conta escolhida; `null` é "Todas as contas". */
  ativa: string | null;
  aoMudar: (contaId: string | null) => void;
};

/** Seletor de conta para filtrar uma tela: "Todas as contas" ou uma conta. */
export function FiltroDeContas({ contas, ativa, aoMudar }: Propriedades) {
  const id = useId();
  return (
    <div className={estilos.filtroDeContas}>
      <label htmlFor={id} className={estilos.rotuloDoFiltro}>
        Conta
      </label>
      <select
        id={id}
        className={estilos.seletor}
        value={ativa ?? ""}
        onChange={(evento) => aoMudar(evento.target.value === "" ? null : evento.target.value)}
      >
        <option value="">Todas as contas</option>
        {contas?.map((conta) => (
          <option key={conta.id} value={conta.id}>
            {conta.nome}
          </option>
        ))}
      </select>
    </div>
  );
}
