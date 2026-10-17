import { useEffect, useId, useRef, useState } from "react";

import type { Ganho } from "../../api/tipos";
import estilos from "./AcaoDeExcluirGanho.module.css";

type Propriedades = {
  ganho: Ganho;
  /** Exclui; devolve `true` se deu certo. */
  aoExcluir: (ganho: Ganho) => Promise<boolean>;
};

/**
 * A ação de excluir um ganho, para a linha da transação. O botão pede confirmação na própria
 * linha (com o foco em Cancelar); o ganho gerado por uma recorrência não tem a ação (a
 * recorrência o recriaria): para parar de gerar, altere ou encerre a recorrência.
 */
export function AcaoDeExcluirGanho({ ganho, aoExcluir }: Propriedades) {
  const [confirmando, definirConfirmando] = useState(false);
  const [excluindo, definirExcluindo] = useState(false);
  const id = useId();
  const botaoExcluir = useRef<HTMLButtonElement>(null);
  const botaoCancelar = useRef<HTMLButtonElement>(null);
  const devolverFoco = useRef(false);

  useEffect(() => {
    if (confirmando) {
      botaoCancelar.current?.focus();
    } else if (devolverFoco.current) {
      devolverFoco.current = false;
      botaoExcluir.current?.focus();
    }
  }, [confirmando]);

  if (ganho.recorrencia_id !== null) return null;

  function cancelar(): void {
    devolverFoco.current = true;
    definirConfirmando(false);
  }

  async function confirmar(): Promise<void> {
    definirExcluindo(true);
    const excluido = await aoExcluir(ganho);
    definirExcluindo(false);
    if (!excluido) cancelar();
  }

  const idPergunta = `${id}-pergunta`;

  if (confirmando) {
    return (
      <div className={estilos.confirmacao} role="group" aria-labelledby={idPergunta}>
        <p id={idPergunta}>Excluir {ganho.descricao}? O valor sai do saldo da conta.</p>
        <div className={estilos.acoes}>
          <button
            type="button"
            className={estilos.perigo}
            disabled={excluindo}
            onClick={() => void confirmar()}
          >
            Confirmar exclusão
          </button>
          <button
            ref={botaoCancelar}
            type="button"
            className={estilos.secundario}
            disabled={excluindo}
            onClick={cancelar}
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      ref={botaoExcluir}
      type="button"
      className={estilos.excluir}
      aria-label={`Excluir o ganho ${ganho.descricao}`}
      onClick={() => definirConfirmando(true)}
    >
      Excluir
    </button>
  );
}
