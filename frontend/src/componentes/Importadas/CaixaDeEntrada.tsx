import { useEffect, useRef, useState } from "react";

import { ErroDaApiCliente } from "../../api/cliente";
import {
  useAceitarEmLote,
  useCategorias,
  useContas,
  useInvestimentos,
  useSincronizarContasBancarias,
  useTags,
  useTransacoesImportadas,
} from "../../api/consultas";
import type { AceiteDaTransacao, TransacaoImportada } from "../../api/tipos";
import { ehSemResposta, MENSAGEM_SERVIDOR_FORA } from "../../paginas/mensagens";
import type { MensagemDoAviso } from "../Aviso/Aviso";
import type { EstadoDoOlho } from "../Olho/Olho";
import { EstadoVazio } from "../EstadoVazio/EstadoVazio";
import { prefereMenosMovimento } from "../movimento";
import { CartaoDeImportada, CartaoSaindo } from "./CartaoDeImportada";
import { ListaDeIgnoradas } from "./ListaDeIgnoradas";
import { ResumoDaRevisaoDaBolsa } from "../Investimentos/ResumoDaRevisaoDaBolsa";
import { PainelDoLote } from "./PainelDoLote";
import { Botao } from "../Botao/Botao";
import { Titulo } from "../Titulo/Titulo";
import { Caixa } from "../Campo/Caixa";
import { Esqueleto } from "../Esqueleto/Esqueleto";
import { EstadoDeErro } from "../EstadoDeErro/EstadoDeErro";
import estilos from "./Importadas.module.css";
import { textoDaConta } from "../../contas/identificacao";

function textoDoErro(erro: unknown): string {
  return ehSemResposta(erro) ? MENSAGEM_SERVIDOR_FORA : (erro as ErroDaApiCliente).mensagem;
}

export function textoDaSincronizacao(novas: number, falhas: number): string {
  const achadas =
    novas === 0
      ? "Nenhuma transação nova."
      : novas === 1
        ? "1 transação nova na caixa."
        : `${novas} transações novas na caixa.`;
  return falhas === 0 ? achadas : `${achadas} ${falhas} falha(s): tente de novo mais tarde.`;
}

/** Quanto o cartão tratado fica saindo da fila (igual à animação de `.saindo` no CSS). */
const DURACAO_DA_SAIDA_MS = 260;

type Fantasma = { transacao: TransacaoImportada; indice: number };

type Propriedades = {
  /** A página dona mostra o aviso. */
  aoAvisar: (tipo: MensagemDoAviso["tipo"], texto: string) => void;
  /** A página dona move o olho. */
  aoSinalizarOlho: (estado: EstadoDoOlho) => void;
};

/**
 * A caixa de entrada das transações que vieram do banco pelo Meu Pluggy esperando a decisão. Nada
 * vira gasto ou ganho sem a pessoa aceitar; "Sincronizar agora" busca no banco o que o Meu Pluggy
 * já atualizou (ele mesmo atualiza a cada 24 horas).
 */
export function CaixaDeEntrada({ aoAvisar, aoSinalizarOlho }: Propriedades) {
  const transacoes = useTransacoesImportadas();
  const contas = useContas();
  const categorias = useCategorias();
  const tags = useTags();
  const sincronizar = useSincronizarContasBancarias();
  const investimentos = useInvestimentos();
  const emLote = useAceitarEmLote();
  const [selecionadas, definirSelecionadas] = useState<ReadonlySet<string>>(new Set());
  const [verIgnoradas, definirVerIgnoradas] = useState(false);

  function avisarErro(erro: unknown): void {
    aoSinalizarOlho("erro");
    aoAvisar("erro", textoDoErro(erro));
  }

  useEffect(() => {
    if (transacoes.erro) avisarErro(transacoes.erro);
  }, [transacoes.erro]);
  useEffect(() => {
    if (contas.erro) avisarErro(contas.erro);
  }, [contas.erro]);
  useEffect(() => {
    if (categorias.erro) avisarErro(categorias.erro);
  }, [categorias.erro]);
  useEffect(() => {
    if (sincronizar.erro) avisarErro(sincronizar.erro);
  }, [sincronizar.erro]);

  const dados = transacoes.dados;
  const titulo = useRef<HTMLHeadingElement | null>(null);
  const lista = useRef<HTMLUListElement | null>(null);
  const dadosAtuais = useRef(dados);
  dadosAtuais.current = dados;
  // O cartão que vinha depois de cada um, guardado para o foco achar o "próximo" mesmo quando a
  // lista nova já chegou antes de o aviso de "tratada".
  const proximoDe = useRef(new Map<string, string | null>());
  const foco = useRef<{ id: string; proximo: string | null } | null>(null);
  const anteriores = useRef<readonly TransacaoImportada[] | undefined>(undefined);
  const timeouts = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [fantasmas, definirFantasmas] = useState<readonly Fantasma[]>([]);

  if (dados) dados.forEach((t, i) => proximoDe.current.set(t.id, dados[i + 1]?.id ?? null));

  function levarOFoco(): void {
    const pendente = foco.current;
    const atuais = dadosAtuais.current;
    if (pendente === null || atuais === undefined || atuais.some((t) => t.id === pendente.id)) return;
    foco.current = null;
    const cartao =
      pendente.proximo === null || !atuais.some((t) => t.id === pendente.proximo)
        ? null
        : Array.from(lista.current?.querySelectorAll<HTMLElement>("[data-transacao]") ?? []).find(
            (elemento) => elemento.dataset.transacao === pendente.proximo,
          );
    // Saída comum: a categoria é o próximo passo; sugerida a ignorar ou entrada: o botão principal;
    // aporte sugerido de uma posição: as destinações.
    const alvo = cartao?.querySelector<HTMLElement>(
      cartao.dataset.descarte === "true"
        ? "button[data-principal]"
        : cartao.dataset.sugestao === "true"
          ? 'input[aria-label="Tag da destinação 1"]'
          : 'input[type="radio"], button[data-principal]:not(:disabled)',
    );
    (alvo ?? titulo.current)?.focus();
  }

  useEffect(() => {
    const antes = anteriores.current;
    anteriores.current = dados;
    levarOFoco();
    if (antes === undefined || dados === undefined || prefereMenosMovimento()) return;
    const saidas = antes
      .map((transacao, indice) => ({ transacao, indice }))
      .filter(({ transacao }) => !dados.some((t) => t.id === transacao.id));
    if (saidas.length === 0) return;
    definirFantasmas((atuais) => [...atuais, ...saidas]);
    const temporizador = setTimeout(
      () =>
        definirFantasmas((atuais) =>
          atuais.filter((f) => !saidas.some((s) => s.transacao.id === f.transacao.id)),
        ),
      DURACAO_DA_SAIDA_MS,
    );
    timeouts.current.add(temporizador);
  }, [dados]);

  useEffect(() => {
    const guardados = timeouts.current;
    return () => guardados.forEach(clearTimeout);
  }, []);

  function tratada(texto: string, id: string): void {
    foco.current = { id, proximo: proximoDe.current.get(id) ?? null };
    levarOFoco();
    aoSinalizarOlho("confirmando");
    aoAvisar("confirmacao", texto);
  }

  async function sincronizarAgora(): Promise<void> {
    if (sincronizar.pendente) return;
    const resultado = await sincronizar.executar();
    if (resultado) {
      aoSinalizarOlho("confirmando");
      aoAvisar("confirmacao", textoDaSincronizacao(resultado.transacoes_novas, resultado.falhas));
    }
  }

  // Só as saídas pendentes entram no lote; o que saiu da fila sai da seleção.
  const saidas = (dados ?? []).filter((transacao) => transacao.sentido === "saida");
  const selecionadasValidas = saidas.filter((transacao) => selecionadas.has(transacao.id));
  useEffect(() => {
    if (selecionadas.size === selecionadasValidas.length) return;
    definirSelecionadas(new Set(selecionadasValidas.map((transacao) => transacao.id)));
  }, [dados]);

  function alternarSelecao(id: string): void {
    definirSelecionadas((atuais) => {
      const novas = new Set(atuais);
      if (!novas.delete(id)) novas.add(id);
      return novas;
    });
  }

  function alternarTodas(): void {
    definirSelecionadas(
      selecionadasValidas.length === saidas.length
        ? new Set()
        : new Set(saidas.map((transacao) => transacao.id)),
    );
  }

  async function aceitarSelecionadas(dadosDoLote: AceiteDaTransacao): Promise<void> {
    if (emLote.pendente || selecionadasValidas.length === 0) return;
    const resposta = await emLote.executar({
      ...dadosDoLote,
      transacao_ids: selecionadasValidas.map((transacao) => transacao.id),
    });
    if (!resposta) return;
    const quantidade = resposta.aceitas.length;
    const aportes = resposta.aceitas[0]?.tipo === "aporte";
    definirSelecionadas(new Set());
    titulo.current?.focus();
    aoSinalizarOlho("confirmando");
    aoAvisar(
      "confirmacao",
      quantidade === 1
        ? aportes
          ? "1 aporte registrado."
          : "1 gasto criado."
        : `${quantidade} ${aportes ? "aportes registrados" : "gastos criados"}.`,
    );
  }

  const nomesDasContas = new Map(contas.dados?.map((conta) => [conta.id, textoDaConta(conta)]));
  const vazia = dados !== undefined && dados.length === 0;

  if (verIgnoradas) {
    return (
      <section className={estilos.coluna} aria-label="Caixa de entrada">
        <div className={estilos.cabecalho}>
          <Titulo nivel="secao" como="h2" ref={titulo} tabIndex={-1} className={estilos.titulo}>
            Transações ignoradas
          </Titulo>
          <Botao variante="secundario"

            onClick={() => definirVerIgnoradas(false)}
          >
            Ver pendentes
          </Botao>
        </div>
        <ListaDeIgnoradas
          aoRestaurar={(texto) => {
            aoSinalizarOlho("confirmando");
            aoAvisar("confirmacao", texto);
          }}
          aoFalhar={avisarErro}
        />
      </section>
    );
  }

  const itens = (dados ?? []).map((transacao) => (
    <CartaoDeImportada
      key={transacao.id}
      transacao={transacao}
      nomeDaConta={nomesDasContas.get(transacao.conta_id) ?? ""}
      categorias={categorias.dados}
      sugestoesDeTags={tags.dados ?? []}
      investimentos={investimentos.dados}
      selecionada={selecionadas.has(transacao.id)}
      aoAlternarSelecao={transacao.sentido === "saida" ? alternarSelecao : undefined}
      aoTratar={tratada}
      aoAvisar={(texto) => aoAvisar("confirmacao", texto)}
      aoFalhar={(erro) => {
        aoSinalizarOlho("erro");
        if (ehSemResposta(erro)) aoAvisar("erro", MENSAGEM_SERVIDOR_FORA);
      }}
    />
  ));
  // Os cartões que acabaram de sair ocupam o lugar em que estavam, só até a animação terminar.
  const saindo = [...fantasmas].sort((a, b) => b.indice - a.indice);
  for (const { transacao, indice } of saindo) {
    itens.splice(Math.min(indice, itens.length), 0, <CartaoSaindo key={`saindo-${transacao.id}`} transacao={transacao} />);
  }

  return (
    <section className={estilos.coluna} aria-label="Caixa de entrada">
      <div className={estilos.cabecalho}>
        <div>
          <Titulo nivel="secao" como="h2" ref={titulo} tabIndex={-1} className={estilos.titulo}>
            Caixa de entrada
          </Titulo>
          {dados !== undefined && dados.length > 0 && (
            <p className={estilos.contagem} data-testid="contagem-da-fila" aria-live="polite">
              {dados.length} esperando
            </p>
          )}
        </div>
        <div className={estilos.acoesDoCabecalho}>
          <Botao variante="secundario"

            onClick={() => definirVerIgnoradas(true)}
          >
            Ver ignoradas
          </Botao>
          {!vazia && (
            <Botao variante="secundario"

              disabled={sincronizar.pendente}
              onClick={() => void sincronizarAgora()}
            >
              {sincronizar.pendente ? "Sincronizando…" : "Sincronizar agora"}
            </Botao>
          )}
        </div>
      </div>
      <ResumoDaRevisaoDaBolsa habilitada aoAvisar={texto => aoAvisar("confirmacao", texto)} />
      {dados === undefined ? (
        transacoes.carregando
          ? <Esqueleto rotulo="Carregando as transações…" />
          : <EstadoDeErro mensagem="Não foi possível carregar as transações." />
      ) : vazia && fantasmas.length === 0 ? (
        <EstadoVazio
          icone="ok"
          titulo="Nada esperando você na caixa de entrada"
          descricao="As transações novas do banco chegam aqui para você aceitar ou ignorar."
          acao={{
            rotulo: sincronizar.pendente ? "Sincronizando…" : "Sincronizar agora",
            aoClicar: () => void sincronizarAgora(),
          }}
        />
      ) : (
        <>
          {saidas.length > 1 && (
            <div className={estilos.barraDoLote}>
              <Caixa
                rotulo={`Selecionar todas as saídas (${saidas.length})`}
                marcada={selecionadasValidas.length === saidas.length}
                aoMudar={alternarTodas}
              />
              <span>Categorize várias de uma vez, em vez de aceitar uma por uma.</span>
            </div>
          )}
          <ul ref={lista} className={estilos.lista} aria-label="Transações importadas">
            {itens}
          </ul>
          {selecionadasValidas.length > 0 && (
            <PainelDoLote
              quantidade={selecionadasValidas.length}
              categorias={categorias.dados}
              sugestoesDeTags={tags.dados ?? []}
              investimentos={investimentos.dados}
              pendente={emLote.pendente}
              erro={
                emLote.erro === null || emLote.erro === undefined
                  ? null
                  : textoDoErro(emLote.erro)
              }
              aoAceitar={(dadosDoLote) => void aceitarSelecionadas(dadosDoLote)}
              aoLimpar={() => definirSelecionadas(new Set())}
            />
          )}
        </>
      )}
    </section>
  );
}
