import { AportesSemInvestimento } from "../componentes/Investimentos/AportesSemInvestimento";
import { ResumoDaRevisaoDaBolsa } from "../componentes/Investimentos/ResumoDaRevisaoDaBolsa";
import { Banner } from "../componentes/Banner/Banner";
import { Titulo } from "../componentes/Titulo/Titulo";
import { Seletor } from "../componentes/Campo/Seletor";
import { Esqueleto } from "../componentes/Esqueleto/Esqueleto";
import { EstadoDeErro } from "../componentes/EstadoDeErro/EstadoDeErro";
import { ConferenciaDaCaixinha } from "../componentes/Investimentos/ConferenciaDaCaixinha";
import { entradasDaDistribuicao, CHAVE_SEM_DESTINACAO } from "../investimentos/distribuicao";
import {RevisaoDeInvestimentos} from "../componentes/Revisao/RevisaoDeInvestimentos";
import { useEffect, useMemo, useState } from "react";

import { ErroDaApiCliente } from "../api/cliente";
import {
  useHistoricoDeInvestimentos,
  useRevisaoDaBolsa,
  useMovimentosDeInvestimento,
  useInvestimentos,
  useResumoDeInvestimentos,
} from "../api/consultas";
import type { VisaoDosInvestimentos } from "../api/tipos";
import type { MensagemDoAviso } from "../componentes/Aviso/Aviso";
import { Botao } from "../componentes/Botao/Botao";
import { Cartao } from "../componentes/Cartao/Cartao";
import { Chip } from "../componentes/Chip/Chip";
import { EstadoVazio } from "../componentes/EstadoVazio/EstadoVazio";
import { GraficoDeEvolucao } from "../componentes/Grafico/GraficoDeEvolucao";
import { GraficoDePizza } from "../componentes/Grafico/GraficoDePizza";
import { ListaDeInvestimentos } from "../componentes/Investimentos/ListaDeInvestimentos";
import type { Navegacao } from "../componentes/Navegacao/telas";
import { useEstadoDoOlho } from "../componentes/Olho/useEstadoDoOlho";
import { Pagina } from "../componentes/Pagina/Pagina";
import { ValorAnimado } from "../componentes/ValorAnimado/ValorAnimado";
import { deCentavos, formatar, paraCentavos } from "../dinheiro/dinheiro";
import {
  JANELAS,
  type Janela,
  montarSerie,
  periodoDaJanela,
} from "../investimentos/evolucao";
import { ResumoDoPeriodo } from "../componentes/Investimentos/ResumoDoPeriodo";
import { rotulosDaEvolucao } from "../investimentos/rotulo";
import { hojeLocal } from "../periodo/periodo";
import { ehSemResposta, MENSAGEM_SERVIDOR_FORA } from "./mensagens";
import estilos from "./Investimentos.module.css";

function textoDoErro(erro: unknown): string {
  return ehSemResposta(erro) ? MENSAGEM_SERVIDOR_FORA : (erro as ErroDaApiCliente).mensagem;
}

const VISOES: readonly { visao: VisaoDosInvestimentos; rotulo: string }[] = [
  { visao: "destinacao", rotulo: "Por destinação" },
  { visao: "tipo", rotulo: "Por tipo" },
];

/**
 * Investimentos: o total, a distribuição em pizza (por destinação ou por tipo), a evolução do saldo,
 * as posições com as destinações (e a realocação) e os aportes e resgates. Um aporte não é gasto.
 */
export function Investimentos({ navegacao }: { navegacao: Navegacao }) {
  const [visao, definirVisao] = useState<VisaoDosInvestimentos>("destinacao");
  const [janela, definirJanela] = useState<Janela>("30dias");
  const [daSerie, definirDaSerie] = useState("");
  const [mensagem, definirMensagem] = useState<MensagemDoAviso | null>(null);
  const [estadoDoOlho, sinalizarOlho] = useEstadoDoOlho();

  const hoje = hojeLocal();
  const periodo = periodoDaJanela(janela, hoje);
  const investimentos = useInvestimentos();
  const resumo = useResumoDeInvestimentos(visao);
  const historico = useHistoricoDeInvestimentos(periodo.inicio, periodo.fim);
  const revisao = useRevisaoDaBolsa(navegacao.importacaoBancaria === true);


  // O que a Revisão da bolsa já propõe ligar sai deste aviso: lá é que se resolve.
  const casaveis = (revisao.dados?.propostas ?? []).flatMap(p => [...p.bruto, ...p.taxas]).filter(t => t.situacao === "aporte_sem_investimento");
  const totalDoResumo = paraCentavos(resumo.dados?.aportes_sem_destino?.total ?? "0.00");
  const totalCasavel = casaveis.reduce((soma, t) => soma + paraCentavos(t.valor), 0n);
  const quantidadeRestante = Math.max(0, (resumo.dados?.aportes_sem_destino?.quantidade ?? 0) - casaveis.length);
  const semInvestimento = { quantidade: quantidadeRestante, total: deCentavos(quantidadeRestante === 0 || totalDoResumo < totalCasavel ? 0n : totalDoResumo - totalCasavel) };

  function avisar(tipo: MensagemDoAviso["tipo"], texto: string): void {
    definirMensagem({ tipo, texto });
  }
  function avisarErro(erro: unknown): void {
    sinalizarOlho("erro");
    avisar("erro", textoDoErro(erro));
  }
  useEffect(() => {
    if (investimentos.erro) avisarErro(investimentos.erro);
  }, [investimentos.erro]);
  useEffect(() => {
    if (resumo.erro) avisarErro(resumo.erro);
  }, [resumo.erro]);
  useEffect(() => {
    if (historico.erro) avisarErro(historico.erro);
  }, [historico.erro]);

  const lista = investimentos.dados;
  const total = useMemo(() => {
    const soma = (lista ?? []).reduce((acumulado, item) => acumulado + paraCentavos(item.saldo), 0n);
    return `${soma / 100n}.${(soma % 100n).toString().padStart(2, "0")}`;
  }, [lista]);
  const entradas = entradasDaDistribuicao(resumo.dados?.fatias ?? [], visao, lista ?? []);
  const rotulos = rotulosDaEvolucao(lista ?? []);
  const serie = useMemo(
    () => montarSerie(historico.dados ?? [], daSerie === "" ? undefined : daSerie),
    [historico.dados, daSerie],
  );
  const movimentosDoPeriodo=useMovimentosDeInvestimento(serie[0]?.data??"",serie[serie.length-1]?.data??"",serie.length>=2);
  const vazio = lista !== undefined && lista.length === 0;

  return (
    <Pagina
      navegacao={navegacao}
      estadoDoOlho={estadoDoOlho}
      mensagem={mensagem}
      aoDispensarMensagem={() => definirMensagem(null)}
      cabecalho={{titulo: "Investimentos", subtitulo: "Para onde vai o que você guarda.", dica: {
            assunto: "os aportes",
            texto:
              "Aportes com dinheiro do mês reduzem o disponível. Reaplicações confirmadas de resgates não entram nessa conta.",
          }, acao: (navegacao.importacaoBancaria === true || navegacao.gestaoDeInvestimentos === true) && (
              <Botao
                variante="terciario"
                seta
                onClick={() => navegacao.aoIrPara("transacoes", { vistaDeTransacoes: "aportes" })}
              >
                Ver aportes e resgates em Transações
              </Botao>
            )}}
    >
      <div className={estilos.conteudo}>
        {navegacao.importacaoBancaria === true && <div className={estilos.cheia}><ResumoDaRevisaoDaBolsa habilitada aoAvisar={(texto) => { sinalizarOlho("confirmando"); avisar("confirmacao", texto); }} /></div>}
        {semInvestimento.quantidade > 0 && <div className={estilos.cheia}><Banner tom="atencao" titulo={`${semInvestimento.quantidade} ${semInvestimento.quantidade===1?"aporte":"aportes"} sem investimento`} texto={`${formatar(semInvestimento.total)} ainda não estão ligados a nenhum investimento`} /></div>}
        <div className={estilos.cheia}><RevisaoDeInvestimentos /></div>
        {navegacao.gestaoDeInvestimentos && semInvestimento.quantidade > 0 && <div className={estilos.cheia}><AportesSemInvestimento investimentos={lista ?? []} /></div>}
        {investimentos.erro ? <div className={estilos.cheia}><EstadoDeErro mensagem="Não foi possível carregar as posições." /></div> : lista === undefined ? <div className={estilos.cheia}><Esqueleto rotulo="Carregando investimentos" /></div> : null}
            <div className={estilos.linhaDoTopo}>
              {lista !== undefined && !vazio && <Cartao className={estilos.total} variante="destaque" aria-label="Total investido">
                <span className={estilos.rotuloDoTotal}>Total investido</span>
                <ValorAnimado valor={total} className={estilos.valorDoTotal} />
                {janela === "30dias" ? <ResumoDoPeriodo compacto consulta={daSerie === "" ? movimentosDoPeriodo : undefined} serie={montarSerie(historico.dados??[])} pontos={historico.dados??[]} investimentoId="" /> : <ResumoDoTopo hoje={hoje} />}
              </Cartao>}
              {navegacao.importacaoBancaria === true && <ConferenciaDaCaixinha investimentos={investimentos.carregando?[]:lista??[]} />}
            </div>

        {lista === undefined ? null : vazio ? (

          <Cartao className={estilos.cheia}>
            <EstadoVazio
              icone="investimentos"
              titulo="Nenhum investimento ainda"
        descricao="Suas posições aparecem aqui para acompanhar o dinheiro guardado."
              acao={{ rotulo: "Ir para Transações", aoClicar: () => navegacao.aoIrPara("transacoes") }}
            />
          </Cartao>
        ) : (
          <>

            <Cartao className={estilos.evolucao} aria-label="Evolução do saldo">
              <div className={estilos.cabecalho}>
                <Titulo nivel="secao">Evolução</Titulo>
                <div className={estilos.alternadores} role="group" aria-label="Janela da evolução">
                  {JANELAS.map((opcao) => (
                    <Chip
                      key={opcao.janela}
                      selecionado={janela === opcao.janela}
                      aoAlternar={() => definirJanela(opcao.janela)}
                    >
                      {opcao.rotulo}
                    </Chip>
                  ))}
                </div>
              </div>
              <Seletor rotulo="Investimento" valor={daSerie} aoMudar={definirDaSerie} vazio="Todos os investimentos" opcoes={(lista??[]).map((item,indice)=>({valor:item.id,rotulo:rotulos[indice]}))} />
              {historico.carregando ? (
                <Esqueleto rotulo="Carregando saldos…" />
              ) : historico.erro ? (
                <EstadoDeErro mensagem="Não foi possível carregar os saldos." />
              ) : historico.dados === undefined ? (
                <Esqueleto rotulo="Carregando saldos…" />
              ) : serie.length === 0 ? (
                <p className={estilos.texto}>
                  Ainda não há saldos guardados neste período. O Gastoba guarda um por dia a cada
                  sincronização; antes disso não há como saber o passado.
                </p>
              ) : (
                <>
                  <GraficoDeEvolucao
                    titulo={`Saldo de ${daSerie === "" ? "todos os investimentos" : (lista ?? []).find((i) => i.id === daSerie)?.nome ?? "investimento"}`}
                    serie={serie}
                  />
                  <ResumoDoPeriodo
                    consulta={movimentosDoPeriodo}
                    serie={serie}
                    pontos={historico.dados ?? []}
                    investimentoId={daSerie}
                    className={estilos.texto}
                  />
                </>
              )}
            </Cartao>

            <Cartao className={estilos.pizza} aria-label="Distribuição dos investimentos">
              <div className={estilos.cabecalho}>
                <Titulo nivel="secao">Distribuição</Titulo>
                <div className={estilos.alternadores} role="group" aria-label="Visão da distribuição">
                  {VISOES.map((opcao) => (
                    <Chip
                      key={opcao.visao}
                      selecionado={visao === opcao.visao}
                      aoAlternar={() => definirVisao(opcao.visao)}
                    >
                      {opcao.rotulo}
                    </Chip>
                  ))}
                </div>
              </div>
              {resumo.dados ? (
                <GraficoDePizza
                  key={visao}
                  titulo={visao === "tipo" ? "Distribuição por tipo" : "Distribuição por destinação"}
                  entradas={entradas}
                  total={resumo.dados.total}
                  chaveNeutra={CHAVE_SEM_DESTINACAO}
                />
              ) : resumo.erro ? <EstadoDeErro mensagem="Não foi possível carregar a distribuição." /> : (
                <Esqueleto rotulo="Carregando distribuição" />
              )}
            </Cartao>

            <section className={estilos.secao} aria-label="Posições">
              <Titulo nivel="secao">Posições</Titulo>
              {lista === undefined ? (
                <Esqueleto rotulo="Carregando posições" />
              ) : (
                <ListaDeInvestimentos
                  investimentos={lista}
                  aoAvisar={(texto) => {
                    sinalizarOlho("confirmando");
                    avisar("confirmacao", texto);
                  }}
                  aoFalhar={avisarErro}
                />
              )}
            </section>


          </>
        )}
      </div>
    </Pagina>
  );
}

function ResumoDoTopo({hoje}:{hoje:string}) {
  const periodo=periodoDaJanela("30dias",hoje);
  const historico=useHistoricoDeInvestimentos(periodo.inicio,periodo.fim);
  return <ResumoDoPeriodo compacto serie={montarSerie(historico.dados??[])} pontos={historico.dados??[]} investimentoId="" />;
}
