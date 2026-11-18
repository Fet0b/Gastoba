import { useRef, useState } from "react";

import type { Conta } from "../../api/tipos";
import { DialogoDeConfirmacao } from "../DialogoDeConfirmacao/DialogoDeConfirmacao";
import { MenuDeAcoes } from "../MenuDeAcoes/MenuDeAcoes";

type Propriedades = {
  conta: Conta;
  /** Exclui; devolve `true` se deu certo. */
  aoExcluir: (conta: Conta) => Promise<boolean>;
};

/**
 * Menu "Mais ações da conta": a exclusão da conta manual, que pede confirmação num diálogo (foco
 * em Cancelar; o foco volta ao gatilho ao cancelar ou se a exclusão falhar). A conta importada do
 * banco não tem a ação, porque a sincronização a recriaria, e então nem o menu.
 */
export function MenuDaConta({ conta, aoExcluir }: Propriedades) {
  const [aberto, definirAberto] = useState(false);
  const [excluindo, definirExcluindo] = useState(false);
  const gatilho = useRef<HTMLButtonElement | null>(null);

  if (conta.origem !== "manual") return null;

  async function confirmar(): Promise<void> {
    definirExcluindo(true);
    await aoExcluir(conta);
    definirExcluindo(false);
    definirAberto(false);
  }

  return (
    <>
      <MenuDeAcoes
        ref={gatilho}
        rotulo={`Mais ações da conta ${conta.nome}`}
        itens={[
          {
            rotulo: "Excluir conta",
            nomeAcessivel: `Excluir a conta ${conta.nome}`,
            destrutivo: true,
            aoEscolher: () => definirAberto(true),
          },
        ]}
      />
      <DialogoDeConfirmacao
        aberto={aberto}
        titulo={`Excluir a conta ${conta.nome}?`}
        descricao="Os gastos, ganhos e recorrências dela também serão apagados."
        rotuloDaAcao="Confirmar exclusão"
        pendente={excluindo}
        aoConfirmar={() => void confirmar()}
        aoCancelar={() => definirAberto(false)}
        devolverFocoPara={gatilho}
      />
    </>
  );
}
