import { useEffect, useState } from "react";

import { ErroDaApiCliente } from "../api/cliente";
import { useContas } from "../api/consultas";
import type { MensagemDoAviso } from "../componentes/Aviso/Aviso";
import type { Navegacao } from "../componentes/Navegacao/telas";
import { Pagina } from "../componentes/Pagina/Pagina";
import { MENSAGEM_SEM_CONTAS } from "../componentes/Compositor/CompositorDeGasto";
import { ListaDeContas } from "../componentes/Contas/ListaDeContas";
import { Cartao } from "../componentes/Cartao/Cartao";
import { Destaque } from "../componentes/Destaque/Destaque";
import { useEstadoDoOlho } from "../componentes/Olho/useEstadoDoOlho";
import { formatar } from "../dinheiro/dinheiro";
import estilos from "./Contas.module.css";
import { dinheiroTotalDasContas } from "./dinheiroTotal";
import { ehSemResposta, MENSAGEM_SERVIDOR_FORA } from "./mensagens";

type Propriedades = {
  navegacao: Navegacao;
  /** Abre já com o formulário de nova conta (quando se chega aqui sem contas). */
  formularioInicialAberto?: boolean;
};

/** Contas: o dinheiro total (só as correntes) e a lista de contas, sem seleção para filtro. */
export function Contas({ navegacao, formularioInicialAberto = false }: Propriedades) {
  const [formularioAberto, definirFormularioAberto] = useState(formularioInicialAberto);
  const [mensagem, definirMensagem] = useState<MensagemDoAviso | null>(null);
  const [estadoDoOlho, sinalizarOlho] = useEstadoDoOlho();

  const contas = useContas();

  // Vindo de "Novo gasto" sem contas: a tela de Transações já saiu, então o aviso fica aqui. Depois
  // da montagem, para a região aria-live já existir e anunciar o texto.
  useEffect(() => {
    if (formularioInicialAberto) definirMensagem({ tipo: "erro", texto: MENSAGEM_SEM_CONTAS });
  }, []);

  useEffect(() => {
    if (!contas.erro) return;
    sinalizarOlho("erro");
    definirMensagem({
      tipo: "erro",
      texto: ehSemResposta(contas.erro)
        ? MENSAGEM_SERVIDOR_FORA
        : (contas.erro as ErroDaApiCliente).mensagem,
    });
  }, [contas.erro]);

  const dinheiroTotal = dinheiroTotalDasContas(contas.dados);

  return (
    <Pagina
      navegacao={navegacao}
      estadoDoOlho={estadoDoOlho}
      mensagem={mensagem}
      aoDispensarMensagem={() => definirMensagem(null)}
    >
      <div className={estilos.conteudo}>
        <Cartao variante="destaque" como="div">
          <Destaque
            rotulo="Dinheiro total"
            valor={dinheiroTotal === undefined ? "—" : formatar(dinheiroTotal)}
          />
        </Cartao>

        <ListaDeContas
          contas={contas.dados}
          carregando={contas.carregando}
          formularioAberto={formularioAberto}
          aoMudarFormulario={definirFormularioAberto}
          aoCriar={() => {
            sinalizarOlho("confirmando");
            definirMensagem({ tipo: "confirmacao", texto: "Conta criada." });
          }}
          aoFalhar={(erro) => {
            sinalizarOlho("erro");
            if (ehSemResposta(erro)) definirMensagem({ tipo: "erro", texto: MENSAGEM_SERVIDOR_FORA });
          }}
        />
      </div>
    </Pagina>
  );
}
