import { useEffect, useId, useState } from "react";

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
import { Cartao } from "../componentes/Cartao/Cartao";
import { ComprometidoPorMes } from "../componentes/Agenda/ComprometidoPorMes";
import { ProximosLancamentos } from "../componentes/Agenda/ProximosLancamentos";
import { FormularioDeRecorrencia } from "../componentes/Recorrencias/FormularioDeRecorrencia";
import { ListaDeRecorrencias } from "../componentes/Recorrencias/ListaDeRecorrencias";
import { hojeLocal } from "../periodo/periodo";
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
  const idTitulo = useId();
  const hoje = hojeLocal();

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
    >
      <div className={estilos.conteudo}>
        <div className={estilos.introducao}>
          <h2 className={estilos.titulo}>Outros</h2>
          <h2 id={idTitulo} className={estilos.titulo}>
            Recorrências
          </h2>
          <p className={estilos.texto}>
            O que se repete todo mês, como o salário ou o aluguel. O Gastoba cria o ganho ou o gasto
            de cada mês sozinho, no dia combinado.
          </p>
        </div>

        <Cartao como="div" variante="elevado" className={estilos.comprometido}>
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

        <div className={estilos.colunaDoFormulario}>
          <FormularioDeRecorrencia
            contas={contas.dados}
            categorias={categorias.dados}
            sugestoesDeTags={tags.dados}
            aoCriar={() => {
              sinalizarOlho("confirmando");
              avisar("confirmacao", "Recorrência criada.");
            }}
            aoFalhar={(erro) => {
              sinalizarOlho("erro");
              if (ehSemResposta(erro)) avisar("erro", MENSAGEM_SERVIDOR_FORA);
            }}
          />
        </div>

        <section className={estilos.colunaDaLista} aria-labelledby={idTitulo}>
          <ListaDeRecorrencias
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
      </div>
    </Pagina>
  );
}
