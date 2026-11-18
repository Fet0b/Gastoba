import { useEffect, useId, useMemo, useRef, useState } from "react";

import { ErroDaApiCliente } from "../api/cliente";
import {
  useAlvosDasMetas,
  useContas,
  useDefinirMeta,
  useDefinirRendaBase,
  useGastos,
  useMovimentosDeInvestimento,
  useTransferencias,
  useMetas,
  useProgressoDasMetas,
  useRemoverMeta,
  useRendaBase,
  useRemoverRendaBase,
} from "../api/consultas";
import type { MensagemDoAviso } from "../componentes/Aviso/Aviso";
import { Botao } from "../componentes/Botao/Botao";
import { Cartao } from "../componentes/Cartao/Cartao";
import { CampoDeValor } from "../componentes/Compositor/CampoDeValor";
import { Destaque } from "../componentes/Destaque/Destaque";
import { DialogoDeConfirmacao } from "../componentes/DialogoDeConfirmacao/DialogoDeConfirmacao";
import { Dica } from "../componentes/Dica/Dica";
import { EstadoVazio } from "../componentes/EstadoVazio/EstadoVazio";
import { DivisaoDaRenda } from "../componentes/Metas/DivisaoDaRenda";
import { LinhaDaMeta } from "../componentes/Metas/LinhaDaMeta";
import { LinhaDeEdicaoDaMeta } from "../componentes/Metas/LinhaDeEdicaoDaMeta";
import { PainelDaMeta } from "../componentes/Metas/PainelDaMeta";
import { MenuDeAcoes } from "../componentes/MenuDeAcoes/MenuDeAcoes";
import type { Navegacao } from "../componentes/Navegacao/telas";
import { useEstadoDoOlho } from "../componentes/Olho/useEstadoDoOlho";
import { Pagina } from "../componentes/Pagina/Pagina";
import { ProjecaoDoMes } from "../componentes/Projecao/ProjecaoDoMes";
import { deCentavos, formatar, paraCentavos } from "../dinheiro/dinheiro";
import { lancamentosDaMeta } from "../metas/lancamentosDaMeta";
import { hojeLocal, limites, mesDoPeriodo, periodoAtual, rotulo } from "../periodo/periodo";
import { gastoAteHoje } from "../projecao/projecao";
import { despesasDoPeriodo } from "../transacoes/despesas";
import estilos from "./Orcamento.module.css";
import { ehSemResposta, MENSAGEM_SERVIDOR_FORA } from "./mensagens";

function textoDoErro(erro: unknown): string {
  return ehSemResposta(erro) ? MENSAGEM_SERVIDOR_FORA : (erro as ErroDaApiCliente).mensagem;
}

type PropriedadesDaRendaBase = {
  aoAvisar: (texto: string) => void;
  /** Alterar e remover só existem no modo de edição das metas. */
  modoDeEdicao: boolean;
  /** A renda registrada no mês e a base que o progresso usou (`null` sem base). */
  renda: string;
  baseDoMes: string | null;
};

/** A linha única de contexto: sobre qual renda as metas são calculadas. */
function contextoDaRendaBase(renda: string, baseDoMes: string | null): string {
  if (baseDoMes === null) return "Metas calculadas sobre a renda registrada no mês";
  const acima = paraCentavos(renda) - paraCentavos(baseDoMes);
  return acima > 0n
    ? `Metas calculadas sobre a renda-base, registrada acima em ${formatar(deCentavos(acima))}`
    : "Metas calculadas sobre a renda-base";
}

function RendaBaseMensal({ aoAvisar, modoDeEdicao, renda, baseDoMes }: PropriedadesDaRendaBase) {
  const base = useRendaBase();
  const salvar = useDefinirRendaBase();
  const remover = useRemoverRendaBase();
  const [editando, definirEditando] = useState(false);
  const [confirmando, definirConfirmando] = useState(false);
  const [tentouRemover, definirTentouRemover] = useState(false);
  const [valor, definirValor] = useState("0.00");
  const campo = useRef<HTMLInputElement>(null);
  const acao = useRef<HTMLButtonElement>(null);
  const devolverFoco = useRef(false);
  const focarAcaoAoRemover = useRef(false);
  const valorAtual = base.dados?.valor ?? null;
  const pendente = salvar.pendente || remover.pendente;
  const emEdicao = modoDeEdicao && editando;

  // Sair do modo de edição das metas descarta o formulário aberto.
  useEffect(() => {
    if (!modoDeEdicao) {
      definirEditando(false);
      definirConfirmando(false);
    }
  }, [modoDeEdicao]);

  useEffect(() => {
    if (emEdicao) {
      devolverFoco.current = true;
      campo.current?.focus();
    } else if (devolverFoco.current) {
      devolverFoco.current = false;
      acao.current?.focus();
    }
  }, [emEdicao]);

  // Removida a base, o menu some: o foco vai à ação "Definir renda-base".
  useEffect(() => {
    if (focarAcaoAoRemover.current && valorAtual === null) {
      focarAcaoAoRemover.current = false;
      acao.current?.focus();
    }
  }, [valorAtual, modoDeEdicao]);

  async function aoSalvar(): Promise<void> {
    if (await salvar.executar(valor)) {
      definirEditando(false);
      aoAvisar("Renda-base salva.");
    }
  }

  async function aoRemover(): Promise<void> {
    definirTentouRemover(true);
    if (await remover.executar()) {
      definirConfirmando(false);
      focarAcaoAoRemover.current = true;
      aoAvisar("Renda-base removida.");
    }
  }

  return (
    <section className={estilos.base} aria-label="Renda-base mensal">
      <dl className={estilos.dado}>
        <dt className={estilos.rotuloDoDado}>
          <span>Renda-base mensal</span>
          <Dica assunto="a renda-base">
            Previsão usada só nos limites das metas. Não registra ganhos nem altera saldos.
          </Dica>
        </dt>
        <dd className={estilos.valorDoDado}>
          {base.dados === undefined
            ? base.carregando ? "Carregando renda-base…" : "Não foi possível carregar a renda-base."
            : valorAtual === null ? "Não definida" : formatar(valorAtual)}
        </dd>
      </dl>
      <p className={estilos.texto}>{contextoDaRendaBase(renda, baseDoMes)}</p>
      {base.erro != null && <p role="alert">{textoDoErro(base.erro)}</p>}
      {modoDeEdicao && emEdicao ? (
        <form
          aria-label="Definir renda-base mensal"
          onSubmit={(evento) => { evento.preventDefault(); void aoSalvar(); }}
        >
          <CampoDeValor
            ref={campo}
            rotulo="Valor da renda-base mensal"
            valor={valor}
            aoMudar={definirValor}
            erro={salvar.erro != null ? textoDoErro(salvar.erro) : undefined}
          />
          <div className={estilos.acoes}>
            <Botao type="submit" variante="primario" disabled={pendente || paraCentavos(valor) <= 0n}>
              Salvar renda-base
            </Botao>
            <Botao variante="secundario" disabled={pendente} onClick={() => definirEditando(false)}>
              Cancelar
            </Botao>
          </div>
        </form>
      ) : modoDeEdicao && base.dados !== undefined ? (
        <div className={estilos.acoes}>
          <Botao
            ref={acao}
            variante="secundario"
            onClick={() => { definirValor(valorAtual ?? "0.00"); definirEditando(true); }}
          >
            {valorAtual === null ? "Definir renda-base" : "Alterar renda-base"}
          </Botao>
          {valorAtual !== null && (
            <MenuDeAcoes
              rotulo="Mais ações da renda-base"
              itens={[
                {
                  rotulo: "Remover renda-base",
                  destrutivo: true,
                  aoEscolher: () => { definirTentouRemover(false); definirConfirmando(true); },
                },
              ]}
            />
          )}
        </div>
      ) : null}
      <DialogoDeConfirmacao
        aberto={confirmando}
        titulo="Remover a renda-base?"
        descricao="As metas voltarão a usar a renda registrada."
        rotuloDaAcao="Confirmar remoção da renda-base"
        pendente={remover.pendente}
        erro={tentouRemover && remover.erro != null ? textoDoErro(remover.erro) : undefined}
        aoConfirmar={() => void aoRemover()}
        aoCancelar={() => definirConfirmando(false)}
      />
    </section>
  );
}

/**
 * Aba Orçamento (as metas): a porcentagem da renda do mês para cada categoria. Lê por
 * padrão (uma linha por meta, com o painel dos lançamentos) e edita só no modo "Editar
 * metas". Mostra a renda do mês (a soma dos ganhos), a renda-base opcional, a projeção e a
 * soma das metas, que nunca passa de 100%.
 */
export function Orcamento({ navegacao }: { navegacao: Navegacao }) {
  const [periodo, definirPeriodo] = useState(periodoAtual);
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
    () => new Map(contas.dados?.map((conta) => [conta.id, conta.nome])),
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
            <h2 id={idResumo} className={estilos.tituloDaSecao}>
              Renda e projeção
            </h2>
            <Dica assunto="a renda e a projeção">
              A projeção usa os ganhos registrados no mês. As metas usam a renda-base quando definida.
            </Dica>
          </div>
          <RendaBaseMensal
            aoAvisar={(texto) => avisar("confirmacao", texto)}
            modoDeEdicao={editandoMetas}
            renda={renda}
            baseDoMes={base}
          />
          <div className={estilos.faixa}>
            <Destaque rotulo="Renda do mês" valor={formatar(renda)} />
            <Destaque
              rotulo="Gasto até agora"
              valor={gastosDoMes.dados === undefined ? "—" : formatar(gastoAteAgora)}
            />
            <ProjecaoDoMes
              periodo={periodo}
              gastos={despesas}
              renda={renda}
              hoje={hoje}
              carregando={gastosDoMes.carregando}
              erro={gastosDoMes.erro !== undefined && gastosDoMes.erro !== null}
            />
          </div>
        </Cartao>

        <Cartao aria-labelledby={idMetas} className={estilos.secao}>
          <div className={estilos.cabecalhoDaSecao}>
            <h2 id={idMetas} className={estilos.tituloDaSecao}>
              Metas por categoria
            </h2>
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
