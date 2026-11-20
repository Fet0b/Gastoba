import { useEffect, useId, useMemo, useRef, useState } from "react";

import { ErroDaApiCliente } from "../api/cliente";
import {
  useAlvosDasMetas,
  useContas,
  useDefinirMeta,
  useGastos,
  useMovimentosDeInvestimento,
  useTransferencias,
  useMetas,
  useProgressoDasMetas,
  useRemoverMeta,
} from "../api/consultas";
import type { MensagemDoAviso } from "../componentes/Aviso/Aviso";
import { Botao } from "../componentes/Botao/Botao";
import { Cartao } from "../componentes/Cartao/Cartao";
import { DialogoDeConfirmacao } from "../componentes/DialogoDeConfirmacao/DialogoDeConfirmacao";
import { GradeDeIndicadores } from "../componentes/GradeDeIndicadores/GradeDeIndicadores";
import { Indicador } from "../componentes/Indicador/Indicador";
import { Dica } from "../componentes/Dica/Dica";
import { EstadoVazio } from "../componentes/EstadoVazio/EstadoVazio";
import { DivisaoDaRenda } from "../componentes/Metas/DivisaoDaRenda";
import { algumGuardado, EXPLICACAO_DO_GUARDADO } from "../componentes/Metas/guardadoDaMeta";
import { LinhaDaMeta } from "../componentes/Metas/LinhaDaMeta";
import { LinhaDeEdicaoDaMeta } from "../componentes/Metas/LinhaDeEdicaoDaMeta";
import { RendaBaseMensal } from "../componentes/Metas/RendaBaseMensal";
import { PainelDaMeta } from "../componentes/Metas/PainelDaMeta";
import type { Navegacao } from "../componentes/Navegacao/telas";
import { useEstadoDoOlho } from "../componentes/Olho/useEstadoDoOlho";
import { Pagina } from "../componentes/Pagina/Pagina";
import { ProjecaoDoMes } from "../componentes/Projecao/ProjecaoDoMes";
import { formatar } from "../dinheiro/dinheiro";
import { lancamentosDaMeta } from "../metas/lancamentosDaMeta";
import { hojeLocal, limites, mesDoPeriodo, rotulo } from "../periodo/periodo";
import { usePeriodoDaRota } from "../componentes/Navegacao/useRota";
import { gastoAteHoje } from "../projecao/projecao";
import { despesasDoPeriodo } from "../transacoes/despesas";
import { Titulo } from "../componentes/Titulo/Titulo";
import estilos from "./Orcamento.module.css";
import { ehSemResposta, MENSAGEM_SERVIDOR_FORA } from "./mensagens";
import { textoDaConta } from "../contas/identificacao";

function textoDoErro(erro: unknown): string {
  return ehSemResposta(erro) ? MENSAGEM_SERVIDOR_FORA : (erro as ErroDaApiCliente).mensagem;
}

/**
 * Aba Orçamento (as metas): a porcentagem da renda do mês para cada categoria. Lê por
 * padrão (uma linha por meta, com o painel dos lançamentos) e edita só no modo "Editar
 * metas". Mostra a renda do mês (a soma dos ganhos), a renda-base opcional, a projeção e a
 * soma das metas, que nunca passa de 100%.
 */
export function Orcamento({ navegacao }: { navegacao: Navegacao }) {
  const [periodo, definirPeriodo] = usePeriodoDaRota();
  const [editandoMetas, definirEditandoMetas] = useState(false);
  const [metaAberta, definirMetaAberta] = useState<string | null>(null);
  const [removendoMeta, definirRemovendoMeta] = useState<string | null>(null);
  const [tentouRemoverMeta, definirTentouRemoverMeta] = useState(false);
  // A categoria que perdeu a meta: o foco vai ao campo dela quando o menu some.
  const [focarCampoDe, definirFocarCampoDe] = useState<string | null>(null);
  // A categoria cujo salvar falhou: o erro da API só aparece junto ao campo dela.
  const [categoriaComErro, definirCategoriaComErro] = useState<string | null>(null);
  const [mensagem, definirMensagem] = useState<MensagemDoAviso | null>(null);
  const [estadoDoOlho, sinalizarOlho] = useEstadoDoOlho();
  const lista = useRef<HTMLUListElement>(null);
  const idResumo = useId();
  const idMetas = useId();

  const categorias = useAlvosDasMetas();
  const metas = useMetas();
  const progresso = useProgressoDasMetas(mesDoPeriodo(periodo));
  const contas = useContas();
  const gastosDoMes = useGastos(limites(periodo));
  const transferencias = useTransferencias(limites(periodo).inicio, limites(periodo).fim, navegacao.importacaoBancaria === true);
  const movimentos = useMovimentosDeInvestimento(limites(periodo).inicio, limites(periodo).fim);
  const despesas =
    gastosDoMes.dados !== undefined && movimentos.dados !== undefined
      ? despesasDoPeriodo(gastosDoMes.dados, movimentos.dados)
      : undefined;
  const definir = useDefinirMeta();
  const remover = useRemoverMeta();

  function avisar(tipo: MensagemDoAviso["tipo"], texto: string): void {
    definirMensagem({ tipo, texto });
  }

  function avisarErro(erro: unknown): void {
    sinalizarOlho("erro");
    avisar("erro", textoDoErro(erro));
  }

  useEffect(() => {
    if (categorias.erro) avisarErro(categorias.erro);
  }, [categorias.erro]);
  useEffect(() => {
    if (metas.erro) avisarErro(metas.erro);
  }, [metas.erro]);
  useEffect(() => {
    if (gastosDoMes.erro) avisarErro(gastosDoMes.erro);
  }, [gastosDoMes.erro]);
  useEffect(() => {
    if (progresso.erro) avisarErro(progresso.erro);
  }, [progresso.erro]);
  // Um erro de rede ao salvar vai ao aviso; os da API ficam junto ao campo.
  useEffect(() => {
    if (definir.erro) {
      sinalizarOlho("erro");
      if (ehSemResposta(definir.erro)) avisar("erro", MENSAGEM_SERVIDOR_FORA);
    }
  }, [definir.erro]);

  const percentuais = new Map(metas.dados?.map((meta) => [meta.categoria, meta.percentual]));
  const progressos = new Map(progresso.dados?.metas.map((p) => [p.categoria, p]));
  const somaTotal = [...percentuais.values()].reduce((soma, percentual) => soma + percentual, 0);
  const renda = progresso.dados?.renda ?? "0.00";
  const referencia = progresso.dados?.renda_de_referencia ?? renda;
  const base = progresso.dados?.renda_base ?? null;
  const hoje = hojeLocal();
  const gastoAteAgora = gastoAteHoje({ gastos: despesas ?? [], periodo, hoje });
  const nomesDasContas = useMemo(
    () => new Map(contas.dados?.map((conta) => [conta.id, textoDaConta(conta)])),
    [contas.dados],
  );

  // Removida a meta, o gatilho do menu desaparece: o foco vai ao campo da categoria.
  useEffect(() => {
    if (focarCampoDe !== null && !percentuais.has(focarCampoDe)) {
      lista.current?.querySelector<HTMLElement>(`[data-campo-da-meta="${focarCampoDe}"]`)?.focus();
      definirFocarCampoDe(null);
    }
  });

  async function salvar(categoria: string, percentual: number): Promise<void> {
    definirCategoriaComErro(categoria);
    const salva = await definir.executar({ categoria, percentual });
    if (salva) {
      sinalizarOlho("confirmando");
      avisar("confirmacao", "Meta salva.");
    }
  }

  async function confirmarRemocaoDaMeta(): Promise<void> {
    if (removendoMeta === null) return;
    definirTentouRemoverMeta(true);
    const categoria = removendoMeta;
    if (await remover.executar(categoria)) {
      avisar("confirmacao", "Meta removida.");
      definirFocarCampoDe(categoria);
      definirRemovendoMeta(null);
    }
  }

  function aoAlternarEdicao(): void {
    definirEditandoMetas((atual) => !atual);
    definirCategoriaComErro(null);
  }

  const alvos = categorias.dados;
  const nomeDe = (codigo: string) => alvos?.find((alvo) => alvo.codigo === codigo)?.nome ?? codigo;
  const lancamentos =
    metaAberta !== null && gastosDoMes.dados !== undefined && movimentos.dados !== undefined
      ? lancamentosDaMeta(metaAberta, gastosDoMes.dados, movimentos.dados, transferencias.dados ?? [])
      : undefined;
  const comMetas = (metas.dados?.length ?? 0) > 0;

  let conteudoDasMetas;
  if (alvos === undefined) {
    conteudoDasMetas = (
      <p className={estilos.estado}>
        {categorias.carregando ? "Carregando as categorias…" : "Não foi possível carregar as categorias."}
      </p>
    );
  } else if (editandoMetas) {
    conteudoDasMetas = (
      <ul ref={lista} className={estilos.metas} aria-label="Metas por categoria">
        {alvos.map((alvo) => {
          const percentual = percentuais.get(alvo.codigo);
          return (
            <LinhaDeEdicaoDaMeta
              key={alvo.codigo}
              categoria={alvo}
              percentual={percentual}
              renda={referencia}
              somaDasOutras={somaTotal - (percentual ?? 0)}
              aoSalvar={(valor) => salvar(alvo.codigo, valor)}
              aoPedirRemocao={() => { definirTentouRemoverMeta(false); definirRemovendoMeta(alvo.codigo); }}
              erro={
                categoriaComErro === alvo.codigo && definir.erro && !ehSemResposta(definir.erro)
                  ? textoDoErro(definir.erro)
                  : undefined
              }
              salvando={definir.pendente && categoriaComErro === alvo.codigo}
            />
          );
        })}
      </ul>
    );
  } else if (metas.dados !== undefined && !comMetas) {
    conteudoDasMetas = (
      <EstadoVazio
        icone="orcamento"
        titulo="Nenhuma meta ainda"
        descricao="Defina quanto da sua renda cada categoria pode usar no mês."
        acao={{ rotulo: "Editar metas", aoClicar: aoAlternarEdicao }}
      />
    );
  } else {
    conteudoDasMetas = (
      <ul ref={lista} className={estilos.metas} aria-label="Metas por categoria">
        {alvos
          .filter((alvo) => progressos.has(alvo.codigo))
          .map((alvo, indice) => (
            <LinhaDaMeta
              key={alvo.codigo}
              progresso={progressos.get(alvo.codigo)!}
              nome={alvo.nome}
              indice={indice}
              aoAbrir={() => definirMetaAberta(alvo.codigo)}
            />
          ))}
      </ul>
    );
  }

  return (
    <Pagina
      navegacao={navegacao}
      estadoDoOlho={estadoDoOlho}
      mensagem={mensagem}
      aoDispensarMensagem={() => definirMensagem(null)}
      controles={{ periodo, aoMudarPeriodo: definirPeriodo }}
      cabecalho={{titulo: "Orçamento", subtitulo: "Quanto da renda cada categoria pode usar."}}
    >
      <div className={estilos.conteudo}>
        <Cartao aria-labelledby={idResumo} className={estilos.secao}>
          <div className={estilos.cabecalhoDaSecao}>
            <Titulo nivel="secao" como="h2" id={idResumo} className={estilos.tituloDaSecao}>
              Renda e projeção
            </Titulo>
          </div>
          <GradeDeIndicadores colunas={4} className={estilos.faixa}>
            <RendaBaseMensal
              aoAvisar={(texto) => avisar("confirmacao", texto)}
              modoDeEdicao={editandoMetas}
              renda={renda}
              baseDoMes={base}
            />
            <Indicador rotulo="Renda do mês" tom="positivo" valor={formatar(renda)} />
            <Indicador rotulo="Gasto até agora" valor={gastosDoMes.dados === undefined ? "—" : formatar(gastoAteAgora)} />
            <ProjecaoDoMes
              periodo={periodo}
              gastos={despesas}
              renda={renda}
              hoje={hoje}
              carregando={gastosDoMes.carregando}
              erro={gastosDoMes.erro !== undefined && gastosDoMes.erro !== null}
              comoIndicador
            />
          </GradeDeIndicadores>
        </Cartao>

        <Cartao aria-labelledby={idMetas} className={estilos.secao}>
          <div className={estilos.cabecalhoDaSecao}>
            <Titulo nivel="secao" como="h2" id={idMetas} className={estilos.tituloDaSecao}>
              Metas por categoria
            </Titulo>
            {progresso.dados !== undefined && algumGuardado(progresso.dados.metas) && (
              <Dica assunto="o guardado para comprar">{EXPLICACAO_DO_GUARDADO}</Dica>
            )}
            {(editandoMetas || comMetas) && (
              <Botao variante="secundario" onClick={aoAlternarEdicao}>
                {editandoMetas ? "Concluir" : "Editar metas"}
              </Botao>
            )}
          </div>
          <p className={estilos.soma}>
            Metas somam {somaTotal}% (sobram {100 - somaTotal}%)
            {somaTotal === 100 && <span className={estilos.completo}>Renda toda distribuída</span>}
          </p>

          {(progresso.dados?.classificacoes_para_revisar ?? 0) > 0 && <p>
            {progresso.dados?.classificacoes_para_revisar} classificação(ões) antiga(s) deste mês precisam de revisão. O valor de Liberdade financeira usa apenas transferências confirmadas.
            <Botao variante="terciario" onClick={() => navegacao.aoIrPara("transacoes", { vistaDeTransacoes: "aportes" })}>Revisar operações de investimento</Botao>
          </p>}
          {categorias.dados !== undefined && metas.dados !== undefined && (
            <DivisaoDaRenda categorias={categorias.dados} metas={metas.dados} renda={referencia} comRendaBase={base !== null} />
          )}

          {conteudoDasMetas}
        </Cartao>
      </div>

      {metaAberta !== null && (
        <PainelDaMeta
          aberto
          nome={nomeDe(metaAberta)}
          rotuloDoMes={rotulo(periodo)}
          progresso={progressos.get(metaAberta)}
          lancamentos={lancamentos}
          nomesDasContas={nomesDasContas}
          aoFechar={() => definirMetaAberta(null)}
          aoVerTransacoes={() => navegacao.aoIrPara("transacoes")}
        />
      )}

      <DialogoDeConfirmacao
        aberto={removendoMeta !== null}
        titulo={`Remover a meta de ${removendoMeta === null ? "" : nomeDe(removendoMeta)}?`}
        descricao="Os lançamentos não mudam; a categoria só deixa de ter limite."
        rotuloDaAcao="Confirmar remoção"
        pendente={remover.pendente}
        erro={tentouRemoverMeta && remover.erro != null ? textoDoErro(remover.erro) : undefined}
        aoConfirmar={() => void confirmarRemocaoDaMeta()}
        aoCancelar={() => definirRemovendoMeta(null)}
      />
    </Pagina>
  );
}
