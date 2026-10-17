import type { Conta } from "../../api/tipos";
import estilos from "../Gastos/Gastos.module.css";

type Propriedades = {
  /** `undefined` enquanto a primeira busca não respondeu (ou se ela falhou). */
  contas: Conta[] | undefined;
  /** Id da conta escolhida; `null` é "Todas as contas". */
  ativa: string | null;
  aoMudar: (contaId: string | null) => void;
};

/** Chips das contas: "Todas as contas" e uma por conta; clicar na ativa volta a todas. */
export function FiltroDeContasEmChips({ contas, ativa, aoMudar }: Propriedades) {
  return (
    <div className={estilos.filtro} role="group" aria-label="Filtrar por conta">
      <span className={estilos.rotuloDoFiltro} aria-hidden="true">
        Contas
      </span>
      <ul className={estilos.chips}>
        <li>
          <button
            type="button"
            className={estilos.chip}
            aria-pressed={ativa === null}
            onClick={() => aoMudar(null)}
          >
            Todas as contas
          </button>
        </li>
        {contas?.map((conta) => (
          <li key={conta.id}>
            <button
              type="button"
              className={estilos.chip}
              aria-pressed={conta.id === ativa}
              onClick={() => aoMudar(conta.id === ativa ? null : conta.id)}
            >
              {conta.nome}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
