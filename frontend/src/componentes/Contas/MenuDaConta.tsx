import { useRef, useState } from "react";

import type { Conta } from "../../api/tipos";
import { textoDaConta } from "../../contas/identificacao";
import { DialogoDeConfirmacao } from "../DialogoDeConfirmacao/DialogoDeConfirmacao";
import { MenuDeAcoes } from "../MenuDeAcoes/MenuDeAcoes";

type Propriedades = {
  conta: Conta;
  /** Abre o diálogo de apelido da conta (dono do diálogo: a lista de contas). */
  aoDarApelido: (conta: Conta) => void;
  /** Exclui; devolve `true` se deu certo. Sem ele, ou numa conta importada, não há a ação de excluir. */
  aoExcluir?: (conta: Conta) => Promise<boolean>;
};

/**
 * Menu "Mais ações da conta": "Dar apelido" ou "Mudar apelido" em toda conta e, na conta manual, a
 * exclusão, que pede confirmação num diálogo (foco em Cancelar; o foco volta ao gatilho ao cancelar ou
 * se a exclusão falhar). A conta importada do banco não tem a exclusão, porque a sincronização a
 * recriaria.
 */
export function MenuDaConta({ conta, aoDarApelido, aoExcluir }: Propriedades) {
  const [aberto, definirAberto] = useState(false);
  const [excluindo, definirExcluindo] = useState(false);
  const gatilho = useRef<HTMLButtonElement | null>(null);
  const podeExcluir = conta.origem === "manual" && aoExcluir !== undefined;

  async function confirmar(): Promise<void> {
    if (aoExcluir === undefined) return;
    definirExcluindo(true);
    await aoExcluir(conta);
    definirExcluindo(false);
    definirAberto(false);
  }

  return (
    <>
      <MenuDeAcoes
        ref={gatilho}
        rotulo={`Mais ações da conta ${textoDaConta(conta)}`}
        itens={[
          {
            rotulo: conta.apelido === null ? "Dar apelido" : "Mudar apelido",
            aoEscolher: () => aoDarApelido(conta),
          },
          ...(podeExcluir
            ? [
                {
                  rotulo: "Excluir conta",
                  nomeAcessivel: `Excluir a conta ${textoDaConta(conta)}`,
                  destrutivo: true,
                  aoEscolher: () => definirAberto(true),
                },
              ]
            : []),
        ]}
      />
      {podeExcluir && (
        <DialogoDeConfirmacao
          aberto={aberto}
          titulo={`Excluir a conta ${textoDaConta(conta)}?`}
          descricao="Os gastos, ganhos e recorrências dela também serão apagados."
          rotuloDaAcao="Confirmar exclusão"
          pendente={excluindo}
          aoConfirmar={() => void confirmar()}
          aoCancelar={() => definirAberto(false)}
          devolverFocoPara={gatilho}
        />
      )}
    </>
  );
}
