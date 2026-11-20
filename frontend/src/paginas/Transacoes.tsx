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
import { Chip } from "../componentes/Chip/Chip";
import { Pagina } from "../componentes/Pagina/Pagina";
import {
  CompositorDeGasto,
  MENSAGEM_GANHO_REGISTRADO,
  MENSAGEM_GASTO_REGISTRADO,
  MENSAGEM_SEM_CONTAS,
} from "../componentes/Compositor/CompositorDeGasto";
import { EstadoVazio } from "../componentes/EstadoVazio/EstadoVazio";
import { SeletorMultiplo } from "../componentes/SeletorMultiplo/SeletorMultiplo";
import { CaixaDeEntrada } from "../componentes/Importadas/CaixaDeEntrada";
import { useEstadoDoOlho } from "../componentes/Olho/useEstadoDoOlho";
import { AportesEResgates } from "../componentes/Transacoes/AportesEResgates";
import { BarraDeFiltros } from "../componentes/Transacoes/BarraDeFiltros";
import { ContadorDaCaixa } from "../componentes/Transacoes/ContadorDaCaixa";
import { useLayoutLargo } from "../componentes/Navegacao/useLayoutLargo";
import { LinhaDoTempo } from "../componentes/Transacoes/LinhaDoTempo";
import { TotaisFiltrados } from "../componentes/Transacoes/TotaisFiltrados";
import { limites } from "../periodo/periodo";
import { usePeriodoDaRota } from "../componentes/Navegacao/useRota";
import {
  alternarNaLista,
  contarFiltros,
  FILTROS_VAZIOS,
  type FiltrosDeTransacoes,
  type GrupoDeFiltro,
  passaNosFiltros,
} from "../transacoes/filtros";
import { filtrarPorBusca, juntarTransacoes } from "../transacoes/linhaDoTempo";
import { Esqueleto } from "../componentes/Esqueleto/Esqueleto";
import { EstadoDeErro } from "../componentes/EstadoDeErro/EstadoDeErro";
import estilos from "./Transacoes.module.css";
import { ehSemResposta, MENSAGEM_SERVIDOR_FORA } from "./mensagens";
import { textoDaConta } from "../contas/identificacao";

/**
 * Transações: a linha do tempo única do mês (gastos e ganhos juntos, por dia), com o total do que
 * está na lista, busca, chips de conta, categoria e tag, o compositor ("Novo gasto" ou N) e, para
 * a dona da importação bancária, a caixa de entrada. A categoria vale só para os gastos (o ganho
 * não tem categoria e some da lista, com uma nota); a tag vale para os dois.
 */
export function Transacoes({
  navegacao,
  vistaInicial = "gastos",
  dataDoMovimento,
  abrirCompositorAoEntrar = false,
}: {
  navegacao: Navegacao;
  vistaInicial?: "gastos" | "caixa" | "aportes";
  dataDoMovimento?: string;
  /** Vindo de "Novo gasto" ou da tecla N em outra tela: abre o compositor assim que as contas chegam. */
  abrirCompositorAoEntrar?: boolean;
}) {
  const podeVerAportes = navegacao.importacaoBancaria === true || navegacao.gestaoDeInvestimentos === true;
  const [periodo, definirPeriodo] = usePeriodoDaRota();
  useEffect(() => { if (dataDoMovimento) { definirPeriodo({ano:Number(dataDoMovimento.slice(0,4)),mes:Number(dataDoMovimento.slice(5,7))}, { substituir: true }); if (podeVerAportes) definirVista("aportes"); } }, [dataDoMovimento]);
  const [filtros, definirFiltros] = useState<FiltrosDeTransacoes>(FILTROS_VAZIOS);
  const [vista, definirVista] = useState<"gastos" | "caixa" | "aportes">(() => vistaInicial === "aportes" && podeVerAportes ? "aportes" : vistaInicial === "caixa" && navegacao.importacaoBancaria === true ? "caixa" : "gastos");
  const [compositorAberto, definirCompositorAberto] = useState(false);
  const [mensagem, definirMensagem] = useState<MensagemDoAviso | null>(null);
  const [estadoDoOlho, sinalizarOlho] = useEstadoDoOlho();
  const [busca, definirBusca] = useState("");
  const campoDeBusca = useRef<HTMLInputElement>(null);
  // Abaixo de 45rem os filtros viram um botão que abre uma folha, com os ativos em chips.
  const celular = !useLayoutLargo();
  const idTitulo = useId();
  const titulo = useRef<HTMLHeadingElement>(null);

  const contas = useContas();
  // A API filtra por um valor de cada vez: com uma só escolha ela vai na consulta; com várias, a lista
  // vem inteira e o filtro (`passaNosFiltros`) é aplicado aqui, igual para gastos e ganhos.
  const unico = (lista: readonly string[]): string | undefined => (lista.length === 1 ? lista[0] : undefined);
  const gastos = useGastos({
    ...limites(periodo),
    conta_id: unico(filtros.contas),
    tag: unico(filtros.tags),
    categoria: unico(filtros.categorias),
  });
  const ganhos = useGanhos({ ...limites(periodo), conta_id: unico(filtros.contas) });
  const excluirGanho = useExcluirGanho();
  const tags = useTags();
  const categorias = useCategorias();
  const quantidadeDeFiltros = contarFiltros(filtros);
  const filtrosAtivos = quantidadeDeFiltros > 0;
  const buscando = busca.trim() !== "";

  const transacoes = useMemo(() => {
    if (gastos.dados === undefined) return undefined;
    const semGanhos = filtros.categorias.length > 0;
    if (!semGanhos && ganhos.dados === undefined) return undefined;
    const juntas = juntarTransacoes(gastos.dados, semGanhos ? [] : (ganhos.dados ?? []));
    return filtrarPorBusca(juntas.filter((transacao) => passaNosFiltros(transacao, filtros)), busca);
  }, [gastos.dados, ganhos.dados, filtros, busca]);

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
      // A linha do ganho some e levaria o foco junto: o diálogo o leva ao título da lista
      // (`focoAposExcluir`) quando fecha; antes disso o título está inerte por trás do modal.
      return true;
    }
    return false;
  }

  // Um erro ao excluir (ex.: 404, 409) aparece no aviso; a lista já foi recarregada.
  useEffect(() => {
    if (excluirGanho.erro) avisarFalhaDaConsulta(excluirGanho.erro);
  }, [excluirGanho.erro]);

  // Ligar ou desligar um valor de um grupo; os outros grupos ficam como estão.
  function alternarFiltro(grupo: GrupoDeFiltro, valor: string): void {
    definirFiltros((atuais) => ({ ...atuais, [grupo]: alternarNaLista(atuais[grupo], valor) }));
  }

  // Tecla "/": foca a busca, salvo digitando num campo ou com um diálogo aberto (como a tecla N).
  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent): void {
      if (evento.key !== "/" || evento.ctrlKey || evento.metaKey || evento.altKey || evento.defaultPrevented) return;
      const alvo = evento.target instanceof HTMLElement ? evento.target : null;
      if (alvo?.closest("input, textarea, select, [contenteditable]")) return;
      if (document.querySelector("dialog[open]")) return;
      if (!campoDeBusca.current) return;
      evento.preventDefault();
      campoDeBusca.current.focus();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  // O botão de "Limpar ..." some quando a lista volta; o foco fica no título dela.
  function limparBusca(): void {
    definirBusca("");
    titulo.current?.focus();
  }

  function limparFiltros(): void {
    titulo.current?.focus();
    definirFiltros(FILTROS_VAZIOS);
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
    // Nas vistas da caixa e de aportes o compositor não cabe: volta aos gastos e abre.
    definirVista("gastos");
    definirCompositorAberto(true);
  }

  const [aberturaPendente, definirAberturaPendente] = useState(abrirCompositorAoEntrar);
  useEffect(() => {
    if (!aberturaPendente || contas.dados === undefined) return;
    definirAberturaPendente(false);
    abrirNovoGasto();
  }, [aberturaPendente, contas.dados]);

  return (
    <Pagina
      navegacao={navegacao}
      estadoDoOlho={estadoDoOlho}
      mensagem={mensagem}
      aoDispensarMensagem={() => definirMensagem(null)}
      controles={{ periodo, aoMudarPeriodo: definirPeriodo }}
      aoNovoGasto={abrirNovoGasto}
      atalhoDeNovoGasto={!compositorAberto}
      cabecalho={{ titulo: "Transações", subtitulo: "Tudo o que entrou e saiu, dia a dia.", tituloRef: titulo, tituloId: idTitulo }}
    >
      <div className={estilos.conteudo}>
        {(navegacao.importacaoBancaria === true || podeVerAportes) && (
          <div className={estilos.alternador} role="group" aria-label="Conteúdo">
            <Chip selecionado={vista === "gastos"} aoAlternar={() => definirVista("gastos")}>
              Gastos e ganhos
            </Chip>
            {navegacao.importacaoBancaria === true && (
              <Chip selecionado={vista === "caixa"} aoAlternar={() => definirVista("caixa")}>
                Caixa de entrada
                <ContadorDaCaixa />
              </Chip>
            )}
            {podeVerAportes && (
              <Chip selecionado={vista === "aportes"} aoAlternar={() => definirVista("aportes")}>
                Aportes e resgates
              </Chip>
            )}
          </div>
        )}

        {navegacao.importacaoBancaria === true && vista === "caixa" ? (
          <CaixaDeEntrada aoAvisar={avisar} aoSinalizarOlho={sinalizarOlho} />
        ) : podeVerAportes && vista === "aportes" ? (
          <>
            <div className={estilos.filtrosDeAportes}>
              <SeletorMultiplo
                rotulo="Contas"
                opcoes={(contas.dados ?? []).map((conta) => ({ valor: conta.id, rotulo: textoDaConta(conta) }))}
                selecionados={filtros.contas}
                aoMudar={(valores) => definirFiltros((atuais) => ({ ...atuais, contas: valores }))}
              />
            </div>
            <AportesEResgates periodo={periodo} contasSelecionadas={filtros.contas} navegacao={navegacao} aoAvisar={(texto) => { sinalizarOlho("confirmando"); avisar("confirmacao", texto); }} aoFalhar={avisarFalhaDaConsulta} aoLimparContas={() => definirFiltros((atuais) => ({ ...atuais, contas: [] }))} />
          </>
        ) : (
          <>
            <BarraDeFiltros
              busca={busca}
              aoMudarBusca={definirBusca}
              buscaRef={campoDeBusca}
              contas={contas.dados}
              categorias={categorias.dados}
              tags={tags.dados}
              filtros={filtros}
              aoAlternar={alternarFiltro}
              aoLimparTudo={limparFiltros}
              celular={celular}
            />

            <section className={estilos.secao} aria-labelledby={idTitulo}>
              {/* Só o resultado de uma busca ou de um filtro é anunciado (e sem repetir a lista). */}
              <p className="visualmente-oculto" aria-live="polite" data-resultado="">
                {transacoes !== undefined && (buscando || filtrosAtivos)
                  ? transacoes.length === 0
                    ? "Nenhuma transação encontrada."
                    : `${transacoes.length} ${transacoes.length === 1 ? "transação encontrada" : "transações encontradas"}.`
                  : ""}
              </p>
              {transacoes !== undefined && <TotaisFiltrados transacoes={transacoes} filtrada={buscando || filtrosAtivos} />}
              {filtros.categorias.length > 0 && (
                <p className={estilos.nota}>
                  Ganhos não têm categoria, por isso ficam fora da lista com este filtro.
                </p>
              )}
              <div aria-busy={gastos.carregando || ganhos.carregando}>
                {transacoes === undefined ? (
                  gastos.carregando || ganhos.carregando
                    ? <Esqueleto rotulo="Carregando transações…" />
                    : <EstadoDeErro mensagem="Não foi possível carregar as transações." />
                ) : transacoes.length === 0 ? (
                  buscando ? (
                    <EstadoVazio
                      icone="transacoes"
                      titulo="Nada encontrado para a busca"
                      descricao="Tente outra palavra, ou limpe a busca para ver tudo."
                      acao={{ rotulo: "Limpar busca", aoClicar: limparBusca }}
                    />
                  ) : filtrosAtivos ? (
                    <EstadoVazio
                      icone="transacoes"
                      titulo="Nenhuma transação com esses filtros"
                      descricao="Troque ou limpe os filtros para ver as transações do mês."
                      acao={{ rotulo: "Limpar filtros", aoClicar: limparFiltros }}
                    />
                  ) : (
                    <EstadoVazio
                      icone="transacoes"
                      titulo="Nenhum gasto ou ganho neste mês"
        descricao="Registre seu primeiro lançamento para acompanhar o mês."
                      acao={{ rotulo: "Registrar o primeiro gasto", aoClicar: abrirNovoGasto }}
                    />
                  )
                ) : (
                  <LinhaDoTempo
                    aoDesfazerClassificacao={() => definirMensagem({ tipo: "confirmacao", texto: "Transação devolvida à caixa de entrada." })}
                    podeDesfazerClassificacao={navegacao.importacaoBancaria === true}
                    reiniciarQuando={`${periodo.ano}-${periodo.mes}|${filtros.contas.join(",")}|${filtros.categorias.join(",")}|${filtros.tags.join(",")}|${busca}`}
                    transacoes={transacoes}
                    contas={contas.dados}
                    categorias={categorias.dados}
                    aoExcluirGanho={excluirUmGanho}
                    focoAposExcluir={titulo}
                    aoAlternarCategoria={(codigo) => alternarFiltro("categorias", codigo)}
                    aoAlternarTag={(tag) => alternarFiltro("tags", tag)}
                    categoriasAtivas={filtros.categorias}
                    tagsAtivas={filtros.tags}
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
          contaInicial={unico(filtros.contas) ?? null}
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
