import { type ReactNode, type RefObject, useRef, useState } from "react";

import type { Ganho } from "../../api/tipos";
import { DialogoDeConfirmacao } from "../DialogoDeConfirmacao/DialogoDeConfirmacao";
import type { ItemDoMenu } from "../MenuDeAcoes/MenuDeAcoes";

/**
 * A exclusão de um ganho, para a linha da transação: devolve o item "Excluir" do menu "Mais
 * ações" e o diálogo de confirmação que ele abre (foco em Cancelar; o foco volta ao gatilho do
 * menu ao cancelar ou se a exclusão falhar, e vai para `focoAposExcluir` se der certo). O ganho
 * gerado por uma recorrência não tem a ação (a recorrência o recriaria): para parar de gerar,
 * altere ou encerre a recorrência. A mensagem de uma falha vai ao aviso da página, que também
 * recarrega a lista (a linha pode sumir junto com o diálogo).
 */
export function useExcluirGanho(
  ganho: Ganho | null,
  aoExcluir: (ganho: Ganho) => Promise<boolean>,
  focoAposExcluir?: RefObject<HTMLElement | null>,
): { item: ItemDoMenu | null; dialogo: ReactNode } {
  const [aberto, definirAberto] = useState(false);
  const [excluindo, definirExcluindo] = useState(false);
  const alvoDoFoco = useRef<HTMLElement | null>(null);

  if (ganho === null || ganho.recorrencia_id !== null) return { item: null, dialogo: null };

  async function confirmar(alvo: Ganho): Promise<void> {
    definirExcluindo(true);
    const excluido = await aoExcluir(alvo);
    alvoDoFoco.current = excluido ? (focoAposExcluir?.current ?? null) : null;
    definirExcluindo(false);
    definirAberto(false);
  }

  return {
    item: {
      rotulo: "Excluir",
      nomeAcessivel: `Excluir o ganho ${ganho.descricao}`,
      destrutivo: true,
      aoEscolher: () => {
        alvoDoFoco.current = null;
        definirAberto(true);
      },
    },
    dialogo: (
      <DialogoDeConfirmacao
        aberto={aberto}
        titulo={`Excluir ${ganho.descricao}?`}
        descricao="O valor sai do saldo da conta."
        rotuloDaAcao="Confirmar exclusão"
        pendente={excluindo}
        aoConfirmar={() => void confirmar(ganho)}
        aoCancelar={() => definirAberto(false)}
        devolverFocoPara={alvoDoFoco}
      />
    ),
  };
}
