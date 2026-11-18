import { useState } from "react";

import { DialogoDeConfirmacao } from "../DialogoDeConfirmacao/DialogoDeConfirmacao";
import { MenuDeAcoes } from "../MenuDeAcoes/MenuDeAcoes";

type Propriedades = {
  /** O que será desfeito, para o nome acessível ("realocação de R$ 400,00 de a para b"). */
  descricao: string;
  texto?: string;
  pendente: boolean;
  aoConfirmar: () => void;
};

/**
 * "Desfazer" em dois passos: o menu "Mais ações" oferece o item e o diálogo pergunta. O foco vai
 * para "Cancelar" (o mais seguro) e volta ao gatilho do menu ao cancelar. Confirmar fecha o
 * diálogo e chama `aoConfirmar`; as mensagens da API ficam junto ao item, em quem o usa.
 */
export function DesfazerComConfirmacao({ descricao, texto = "Desfazer", pendente, aoConfirmar }: Propriedades) {
  const [confirmando, definirConfirmando] = useState(false);

  return (
    <>
      <MenuDeAcoes
        rotulo={`Mais ações de ${descricao}`}
        itens={[
          {
            rotulo: texto,
            nomeAcessivel: `Desfazer ${descricao}`,
            destrutivo: true,
            desabilitado: pendente,
            aoEscolher: () => definirConfirmando(true),
          },
        ]}
      />
      <DialogoDeConfirmacao
        aberto={confirmando}
        titulo={`Desfazer ${descricao}?`}
        rotuloDaAcao="Sim, desfazer"
        pendente={pendente}
        aoConfirmar={() => {
          definirConfirmando(false);
          aoConfirmar();
        }}
        aoCancelar={() => definirConfirmando(false)}
      />
    </>
  );
}
