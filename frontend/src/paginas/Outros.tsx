import { useEffect, useId, useRef, useState } from "react";

import { ErroDaApiCliente } from "../api/cliente";
import {
  useCategorias,
  useContas,
  useEncerrarRecorrencia,
  useRecorrencias,
  useTags,
} from "../api/consultas";
import type { Recorrencia } from "../api/tipos";
import type { MensagemDoAviso } from "../componentes/Aviso/Aviso";
import type { Navegacao } from "../componentes/Navegacao/telas";
import { Pagina } from "../componentes/Pagina/Pagina";
import { useEstadoDoOlho } from "../componentes/Olho/useEstadoDoOlho";
import { Botao } from "../componentes/Botao/Botao";
import { Cartao } from "../componentes/Cartao/Cartao";
import { Dialogo } from "../componentes/Dialogo/Dialogo";
import { EstadoVazio } from "../componentes/EstadoVazio/EstadoVazio";
import { ComprometidoPorMes } from "../componentes/Agenda/ComprometidoPorMes";
import { ProximosLancamentos } from "../componentes/Agenda/ProximosLancamentos";
import { FormularioDeRecorrencia } from "../componentes/Recorrencias/FormularioDeRecorrencia";
import { ListaDeRecorrencias } from "../componentes/Recorrencias/ListaDeRecorrencias";
import { hojeLocal } from "../periodo/periodo";
import { Titulo } from "../componentes/Titulo/Titulo";
import estilos from "./Outros.module.css";
import { ehSemResposta, MENSAGEM_SERVIDOR_FORA } from "./mensagens";

function textoDoErro(erro: unknown): string {
  return ehSemResposta(erro) ? MENSAGEM_SERVIDOR_FORA : (erro as ErroDaApiCliente).mensagem;
}

/**
 * Tela das recorrências: o formulário de criar (ganho como o salário, ou gasto
 * fixo) e a lista, com o encerramento confirmado na própria linha. O servidor
 * cria o gasto ou o ganho de cada mês sozinho; criar já gera os meses vencidos.
 */
export function Outros({ navegacao }: { navegacao: Navegacao }) {
  const recorrencias = useRecorrencias();
  const contas = useContas();
  const categorias = useCategorias();
  const tags = useTags();
  const encerrar = useEncerrarRecorrencia();
  const [mensagem, definirMensagem] = useState<MensagemDoAviso | null>(null);
  const [estadoDoOlho, sinalizarOlho] = useEstadoDoOlho();
  const [formularioAberto, definirFormularioAberto] = useState(false);
  const botaoNova = useRef<HTMLButtonElement>(null);
  const idTitulo = useId();
  const hoje = hojeLocal();
  const vazio = recorrencias.dados !== undefined && recorrencias.dados.length === 0;

  function avisar(tipo: MensagemDoAviso["tipo"], texto: string): void {
    definirMensagem({ tipo, texto });
  }

  function avisarErro(erro: unknown): void {
    sinalizarOlho("erro");
    avisar("erro", textoDoErro(erro));
  }

  useEffect(() => {
    if (recorrencias.erro) avisarErro(recorrencias.erro);
  }, [recorrencias.erro]);
  useEffect(() => {
    if (contas.erro) avisarErro(contas.erro);
  }, [contas.erro]);
  useEffect(() => {
    if (categorias.erro) avisarErro(categorias.erro);
  }, [categorias.erro]);
  useEffect(() => {
    if (encerrar.erro) avisarErro(encerrar.erro);
  }, [encerrar.erro]);

  function fecharFormulario(): void {
    definirFormularioAberto(false);
    // O botão volta a existir no próximo quadro.
    queueMicrotask(() => botaoNova.current?.focus());
  }

  async function encerrarRecorrencia(recorrencia: Recorrencia): Promise<boolean> {
    const encerrada = await encerrar.executar(recorrencia.id);
    if (!encerrada) return false;
    avisar("confirmacao", "Recorrência encerrada.");
    return true;
  }

  return (
    <Pagina
      navegacao={navegacao}
      estadoDoOlho={estadoDoOlho}
      mensagem={mensagem}
      aoDispensarMensagem={() => definirMensagem(null)}
      cabecalho={{titulo: "Recorrências", subtitulo: "O que se repete todo mês.", dica: {
            assunto: "as recorrências",
            texto: "O Gastoba cria o ganho ou o gasto de cada mês sozinho, no dia combinado.",
          }, acao: !formularioAberto && !vazio && recorrencias.dados !== undefined && (
              <Botao
                ref={botaoNova}
                variante="secundario"
                icone="adicionar"
                onClick={() => definirFormularioAberto(true)}
              >
                Nova recorrência
              </Botao>
            )}}
    >
      <div className={estilos.conteudo}>
        {formularioAberto && (
          <Dialogo titulo="Nova recorrência" aberto aoFechar={fecharFormulario} devolverFocoPara={botaoNova}>
            <FormularioDeRecorrencia
              contas={contas.dados}
              categorias={categorias.dados}
              sugestoesDeTags={tags.dados}
              aoCancelar={fecharFormulario}
              aoCriar={() => {
                sinalizarOlho("confirmando");
                avisar("confirmacao", "Recorrência criada.");
                fecharFormulario();
              }}
              aoFalhar={(erro) => {
                sinalizarOlho("erro");
                if (ehSemResposta(erro)) avisar("erro", MENSAGEM_SERVIDOR_FORA);
              }}
            />
          </Dialogo>
        )}

        {vazio ? (
          !formularioAberto && (
            <EstadoVazio
              icone="repetir"
              titulo="Nenhuma recorrência ainda"
              descricao="Cadastre aluguel, assinaturas e salário para o Gastoba prever o mês."
              acao={{ ref: botaoNova, rotulo: "Criar recorrência", aoClicar: () => definirFormularioAberto(true) }}
            />
          )
        ) : (
          <>
            <Cartao como="div" className={estilos.comprometido}>
              <ComprometidoPorMes
                recorrencias={recorrencias.dados}
                hoje={hoje}
                carregando={recorrencias.carregando}
              />
            </Cartao>
            <Cartao como="div" className={estilos.agenda}>
              <ProximosLancamentos
                recorrencias={recorrencias.dados}
                hoje={hoje}
                carregando={recorrencias.carregando}
              />
            </Cartao>

            <section className={estilos.colunaDaLista} aria-labelledby={idTitulo}>
              <Titulo nivel="secao" como="h2" id={idTitulo} className={estilos.tituloDaSecao}>
                Suas recorrências
              </Titulo>
              <ListaDeRecorrencias
                aoRevisar={() => navegacao.aoIrPara("investimentos")}
                recorrencias={recorrencias.dados}
                carregando={recorrencias.carregando}
                contas={contas.dados}
                categorias={categorias.dados}
                sugestoesDeTags={tags.dados ?? []}
                aoEncerrar={encerrarRecorrencia}
                aoAlterada={() => {
                  sinalizarOlho("confirmando");
                  avisar("confirmacao", "Recorrência alterada.");
                }}
                aoFalhar={(erro) => {
                  sinalizarOlho("erro");
                  if (ehSemResposta(erro)) avisar("erro", MENSAGEM_SERVIDOR_FORA);
                }}
              />
            </section>
          </>
        )}
      </div>
    </Pagina>
  );
}
