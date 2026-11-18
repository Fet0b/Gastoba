import { useEffect, useState, type ComponentProps } from "react";

import { ErroDaApiCliente } from "../api/cliente";
import { useContas, useExcluirConta, useFaturas } from "../api/consultas";
import type { Conta } from "../api/tipos";
import type { MensagemDoAviso } from "../componentes/Aviso/Aviso";
import type { Navegacao } from "../componentes/Navegacao/telas";
import { Pagina } from "../componentes/Pagina/Pagina";
import { MENSAGEM_SEM_CONTAS } from "../componentes/Compositor/CompositorDeGasto";
import { ListaDeContas } from "../componentes/Contas/ListaDeContas";
import { situacaoDosCartoes } from "../contas/situacaoDosCartoes";
import { hojeLocal } from "../periodo/periodo";
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
  const excluirConta = useExcluirConta();

  async function excluirUmaConta(conta: Conta): Promise<boolean> {
    const excluida = await excluirConta.executar(conta.id);
    if (excluida) {
      sinalizarOlho("confirmando");
      definirMensagem({ tipo: "confirmacao", texto: "Conta excluída." });
      return true;
    }
    return false;
  }

  // Um erro ao excluir (ex.: 404, 409) aparece no aviso; a lista já foi recarregada.
  useEffect(() => {
    if (!excluirConta.erro) return;
    sinalizarOlho("erro");
    definirMensagem({
      tipo: "erro",
      texto: ehSemResposta(excluirConta.erro)
        ? MENSAGEM_SERVIDOR_FORA
        : (excluirConta.erro as ErroDaApiCliente).mensagem,
    });
  }, [excluirConta.erro]);

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
  const propriedadesDaLista: ComponentProps<typeof ListaDeContas> = {
    contas: contas.dados,
    carregando: contas.carregando,
    formularioAberto,
    aoMudarFormulario: definirFormularioAberto,
    aoCriar: () => {
      sinalizarOlho("confirmando");
      definirMensagem({ tipo: "confirmacao", texto: "Conta criada." });
    },
    aoExcluir: excluirUmaConta,
    aoFalhar: (erro) => {
      sinalizarOlho("erro");
      if (ehSemResposta(erro)) definirMensagem({ tipo: "erro", texto: MENSAGEM_SERVIDOR_FORA });
    },
  };

  return (
    <Pagina
      navegacao={navegacao}
      estadoDoOlho={estadoDoOlho}
      mensagem={mensagem}
      aoDispensarMensagem={() => definirMensagem(null)}
      cabecalho={{titulo: "Contas", subtitulo: "Seu dinheiro em cada lugar."}}
    >
      <div className={estilos.conteudo}>
        <Cartao variante="destaque" como="div">
          <Destaque
            rotulo="Dinheiro total"
            valor={dinheiroTotal === undefined ? "—" : formatar(dinheiroTotal)}
            tamanho="heroi"
          />
        </Cartao>

        {navegacao.importacaoBancaria === true ? (
          <ListaComFaturas {...propriedadesDaLista} />
        ) : (
          <ListaDeContas {...propriedadesDaLista} />
        )}
      </div>
    </Pagina>
  );
}

/**
 * A lista com a situação das faturas de cada cartão ("Fatura aberta", "Vencida"). Só para a dona
 * da importação: as demais pessoas não têm faturas, então a tela nem as consulta. Se a consulta
 * falhar, os cartões seguem sem a situação.
 */
function ListaComFaturas(propriedades: ComponentProps<typeof ListaDeContas>) {
  const faturas = useFaturas(hojeLocal());
  const situacoes = faturas.dados ? situacaoDosCartoes(faturas.dados.cartoes) : undefined;
  return <ListaDeContas {...propriedades} situacaoDosCartoes={situacoes} />;
}
