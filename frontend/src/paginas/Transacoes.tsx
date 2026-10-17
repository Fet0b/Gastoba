import { useEffect, useId, useMemo, useRef, useState } from "react";

import { ErroDaApiCliente } from "../api/cliente";
import type { Ganho } from "../api/tipos";
import {
  useCategorias,
  useContas,
  useExcluirGanho,
  useGanhos,
  useGastos,
  useTags,
} from "../api/consultas";
import type { MensagemDoAviso } from "../componentes/Aviso/Aviso";
import type { Navegacao } from "../componentes/Navegacao/telas";
import { Pagina } from "../componentes/Pagina/Pagina";
import {
  CompositorDeGasto,
  MENSAGEM_GANHO_REGISTRADO,
  MENSAGEM_GASTO_REGISTRADO,
  MENSAGEM_SEM_CONTAS,
} from "../componentes/Compositor/CompositorDeGasto";
import { useAtalhoDeNovoGasto } from "../componentes/Compositor/useAtalhoDeNovoGasto";
import { EstadoVazio } from "../componentes/EstadoVazio/EstadoVazio";
import { FiltroDeCategorias } from "../componentes/Gastos/FiltroDeCategorias";
import { FiltroDeTags } from "../componentes/Gastos/FiltroDeTags";
import { CaixaDeEntrada } from "../componentes/Importadas/CaixaDeEntrada";
import { useEstadoDoOlho } from "../componentes/Olho/useEstadoDoOlho";
import { BuscaDeTransacoes } from "../componentes/Transacoes/BuscaDeTransacoes";
import { FiltroDeContasEmChips } from "../componentes/Transacoes/FiltroDeContasEmChips";
import { LinhaDoTempo } from "../componentes/Transacoes/LinhaDoTempo";
import { TotaisFiltrados } from "../componentes/Transacoes/TotaisFiltrados";
import { limites, periodoAtual } from "../periodo/periodo";
import { filtrarPorBusca, juntarTransacoes } from "../transacoes/linhaDoTempo";
import estilos from "./Transacoes.module.css";
import { ehSemResposta, MENSAGEM_SERVIDOR_FORA } from "./mensagens";

/**
 * Transações: a linha do tempo única do mês (gastos e ganhos juntos, por dia), com o total do que
 * está na lista, busca, chips de conta, categoria e tag, o compositor ("Novo gasto" ou N) e, para
 * a dona da importação bancária, a caixa de entrada. A categoria vale só para os gastos (o ganho
 * não tem categoria e some da lista, com uma nota); a tag vale para os dois.
 */
export function Transacoes({ navegacao }: { navegacao: Navegacao }) {
  const [periodo, definirPeriodo] = useState(periodoAtual);
  const [contaSelecionada, definirContaSelecionada] = useState<string | null>(null);
  const [tag, definirTag] = useState<string | null>(null);
  const [categoria, definirCategoria] = useState<string | null>(null);
  const [vista, definirVista] = useState<"gastos" | "caixa">("gastos");
  const [compositorAberto, definirCompositorAberto] = useState(false);
  const [mensagem, definirMensagem] = useState<MensagemDoAviso | null>(null);
  const [estadoDoOlho, sinalizarOlho] = useEstadoDoOlho();
  const [busca, definirBusca] = useState("");
  const idTitulo = useId();
  const titulo = useRef<HTMLHeadingElement>(null);

  const contas = useContas();
  const gastos = useGastos({
    ...limites(periodo),
    conta_id: contaSelecionada ?? undefined,
    tag: tag ?? undefined,
    categoria: categoria ?? undefined,
  });
  // Os ganhos seguem o mês e a conta; a tag é aplicada aqui no cliente (a API só a filtra nos gastos).
  const ganhos = useGanhos({ ...limites(periodo), conta_id: contaSelecionada ?? undefined });
  const excluirGanho = useExcluirGanho();
  const tags = useTags();
  const categorias = useCategorias();
  const filtrosAtivos = contaSelecionada !== null || tag !== null || categoria !== null;
  const buscando = busca.trim() !== "";

  const transacoes = useMemo(() => {
    if (gastos.dados === undefined) return undefined;
    if (categoria === null && ganhos.dados === undefined) return undefined;
    const ganhosDaTag =
      categoria !== null
        ? []
        : (ganhos.dados ?? []).filter((ganho) => tag === null || ganho.tags.includes(tag));
    return filtrarPorBusca(juntarTransacoes(gastos.dados, ganhosDaTag), busca);
  }, [gastos.dados, ganhos.dados, categoria, tag, busca]);

  // Cada mensagem é um objeto novo, para o Aviso anunciar mesmo texto repetido.
  function avisar(tipo: MensagemDoAviso["tipo"], texto: string): void {
    definirMensagem({ tipo, texto });
  }

  // Uma consulta que falha pisca o olho e avisa; os dados em cache continuam na tela.
  function avisarFalhaDaConsulta(erro: unknown): void {
    sinalizarOlho("erro");
    avisar("erro", ehSemResposta(erro) ? MENSAGEM_SERVIDOR_FORA : (erro as ErroDaApiCliente).mensagem);
  }

  // Só quando chega um erro novo; as funções da página não mudam o que fazem.
  useEffect(() => {
    if (contas.erro) avisarFalhaDaConsulta(contas.erro);
  }, [contas.erro]);
  useEffect(() => {
    if (gastos.erro) avisarFalhaDaConsulta(gastos.erro);
  }, [gastos.erro]);
  useEffect(() => {
    if (ganhos.erro) avisarFalhaDaConsulta(ganhos.erro);
  }, [ganhos.erro]);
  useEffect(() => {
    if (tags.erro) avisarFalhaDaConsulta(tags.erro);
  }, [tags.erro]);
  useEffect(() => {
    if (categorias.erro) avisarFalhaDaConsulta(categorias.erro);
  }, [categorias.erro]);

  async function excluirUmGanho(ganho: Ganho): Promise<boolean> {
    const excluido = await excluirGanho.executar(ganho.id);
    if (excluido) {
      sinalizarOlho("confirmando");
      avisar("confirmacao", "Ganho excluído.");
      // A linha do ganho some e levaria o foco junto: ele fica no título da lista.
      titulo.current?.focus();
      return true;
    }
    return false;
  }

  // Um erro ao excluir (ex.: 404, 409) aparece no aviso; a lista já foi recarregada.
  useEffect(() => {
    if (excluirGanho.erro) avisarFalhaDaConsulta(excluirGanho.erro);
  }, [excluirGanho.erro]);

  // Clicar no chip ativo limpa; clicar em outro troca.
  function alternarTag(nova: string): void {
    definirTag((atual) => (atual === nova ? null : nova));
  }

  function alternarCategoria(nova: string): void {
    definirCategoria((atual) => (atual === nova ? null : nova));
  }

  // O botão de "Limpar ..." some quando a lista volta; o foco fica no título dela.
  function limparBusca(): void {
    definirBusca("");
    titulo.current?.focus();
  }

  function limparFiltros(): void {
    titulo.current?.focus();
    definirContaSelecionada(null);
    definirTag(null);
    definirCategoria(null);
  }

  // Os erros de um formulário aparecem junto aos campos; sem resposta, no aviso.
  function avisarFalhaDoFormulario(erro: unknown): void {
    sinalizarOlho("erro");
    if (ehSemResposta(erro)) avisar("erro", MENSAGEM_SERVIDOR_FORA);
  }

  // "Novo gasto" (botão ou N): sem contas não há onde registrar, então avisa e leva à tela de
  // contas; enquanto as contas não chegam, não faz nada.
  function abrirNovoGasto(): void {
    if (contas.dados === undefined) return;
    if (contas.dados.length === 0) {
      avisar("erro", MENSAGEM_SEM_CONTAS);
      navegacao.aoIrPara("contas", { abrirFormulario: true });
      return;
    }
    definirCompositorAberto(true);
  }

  // Com o diálogo aberto o atalho fica desligado.
  useAtalhoDeNovoGasto(abrirNovoGasto, !compositorAberto && vista === "gastos");

  return (
    <Pagina
      navegacao={navegacao}
      estadoDoOlho={estadoDoOlho}
      mensagem={mensagem}
      aoDispensarMensagem={() => definirMensagem(null)}
      controles={{ periodo, aoMudarPeriodo: definirPeriodo, aoNovoGasto: abrirNovoGasto }}
    >
      <div className={estilos.conteudo}>
        {navegacao.importacaoBancaria === true && (
          <div className={estilos.alternador} role="group" aria-label="Conteúdo">
            <button
              type="button"
              className={estilos.opcao}
              aria-pressed={vista === "gastos"}
              onClick={() => definirVista("gastos")}
            >
              Gastos e ganhos
            </button>
            <button
              type="button"
              className={estilos.opcao}
              aria-pressed={vista === "caixa"}
              onClick={() => definirVista("caixa")}
            >
              Caixa de entrada
            </button>
          </div>
        )}

        {navegacao.importacaoBancaria === true && vista === "caixa" ? (
          <CaixaDeEntrada aoAvisar={avisar} aoSinalizarOlho={sinalizarOlho} />
        ) : (
          <>
            <FiltroDeContasEmChips
              contas={contas.dados}
              ativa={contaSelecionada}
              aoMudar={definirContaSelecionada}
            />
            <BuscaDeTransacoes valor={busca} aoMudar={definirBusca} />
            <div className={estilos.filtros}>
              <FiltroDeCategorias
                categorias={categorias.dados}
                ativa={categoria}
                aoAlternar={alternarCategoria}
                aoLimpar={() => definirCategoria(null)}
              />
              <FiltroDeTags
                tags={tags.dados}
                ativa={tag}
                aoAlternar={alternarTag}
                aoLimpar={() => definirTag(null)}
              />
            </div>

            <section className={estilos.secao} aria-labelledby={idTitulo}>
              <h2 ref={titulo} id={idTitulo} className={estilos.titulo} tabIndex={-1}>
                Transações
              </h2>
              {/* Só o resultado de uma busca ou de um filtro é anunciado (e sem repetir a lista). */}
              <p className="visualmente-oculto" aria-live="polite" data-resultado="">
                {transacoes !== undefined && (buscando || filtrosAtivos)
                  ? transacoes.length === 0
                    ? "Nenhuma transação encontrada."
                    : `${transacoes.length} ${transacoes.length === 1 ? "transação encontrada" : "transações encontradas"}.`
                  : ""}
              </p>
              {transacoes !== undefined && <TotaisFiltrados transacoes={transacoes} />}
              {categoria !== null && (
                <p className={estilos.nota}>
                  Ganhos não têm categoria, por isso ficam fora da lista com este filtro.
                </p>
              )}
              <div aria-busy={gastos.carregando || ganhos.carregando}>
                {transacoes === undefined ? (
                  <p className={estilos.estado}>
                    {gastos.carregando || ganhos.carregando
                      ? "Carregando transações…"
                      : "Não foi possível carregar as transações."}
                  </p>
                ) : transacoes.length === 0 ? (
                  buscando ? (
                    <EstadoVazio
                      icone="transacoes"
                      titulo="Nada encontrado para a busca"
                      texto="Confira a grafia ou busque por outra palavra."
                      acao={{ rotulo: "Limpar busca", aoClicar: limparBusca }}
                    />
                  ) : filtrosAtivos ? (
                    <EstadoVazio
                      icone="transacoes"
                      titulo="Nenhuma transação com esses filtros"
                      texto="Neste mês, nada combina com os filtros escolhidos."
                      acao={{ rotulo: "Limpar filtros", aoClicar: limparFiltros }}
                    />
                  ) : (
                    <EstadoVazio
                      icone="transacoes"
                      titulo="Nenhum gasto ou ganho neste mês"
                      texto="Registre o primeiro com N ou com o botão Novo gasto."
                    />
                  )
                ) : (
                  <LinhaDoTempo
                    reiniciarQuando={`${periodo.ano}-${periodo.mes}|${contaSelecionada}|${categoria}|${tag}|${busca}`}
                    transacoes={transacoes}
                    contas={contas.dados}
                    categorias={categorias.dados}
                    aoExcluirGanho={excluirUmGanho}
                    aoAlternarCategoria={alternarCategoria}
                    aoAlternarTag={alternarTag}
                    categoriaAtiva={categoria}
                    tagAtiva={tag}
                  />
                )}
              </div>
            </section>
          </>
        )}
      </div>

      {compositorAberto && contas.dados && (
        <CompositorDeGasto
          contas={contas.dados}
          categorias={categorias.dados}
          sugestoesDeTags={tags.dados ?? []}
          contaInicial={contaSelecionada}
          aoRegistrar={() => {
            sinalizarOlho("confirmando");
            avisar("confirmacao", MENSAGEM_GASTO_REGISTRADO);
          }}
          aoRegistrarGanho={() => {
            sinalizarOlho("confirmando");
            avisar("confirmacao", MENSAGEM_GANHO_REGISTRADO);
          }}
          aoFalhar={avisarFalhaDoFormulario}
          aoFechar={() => definirCompositorAberto(false)}
        />
      )}
    </Pagina>
  );
}
