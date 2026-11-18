import { EditorDeOperacaoDoInvestimento } from "./EditorDeOperacaoDoInvestimento";
import { PainelDaTransferencia } from "./ClassificarTransferencia";
import { useEffect, useId, useRef, useState } from "react";

import { ErroDaApiCliente, MENSAGEM_SEM_RESPOSTA } from "../../api/cliente";
import {
  useAceitarTransacaoImportada,
  useDividirTransacaoImportada,
  useIgnorarTransacaoImportada,
} from "../../api/consultas";
import type { Categoria, Investimento, TransacaoImportada, TipoDeMovimento } from "../../api/tipos";
import {
  destinacoesParaEnvio,
  type LinhaDeDestinacao,
  motivoDasDestinacoes,
} from "../../investimentos/destinacoes";
import { deCentavos, formatar, paraCentavos } from "../../dinheiro/dinheiro";
import { rotuloDoDia } from "../../periodo/periodo";
import { normalizarTag } from "../../tags/tags";
import {
  type LinhaDaDivisao,
  motivoDaDivisao,
  partesParaEnvio,
} from "../../transacoes/divisao";
import { CampoDeTags } from "../Compositor/CampoDeTags";
import { MENSAGEM_TAG_PENDENTE } from "../Compositor/CompositorDeGasto";
import { SeletorDeCategoria } from "../Compositor/SeletorDeCategoria";
import { Icone } from "../Icone/Icone";
import { EditorDeDestinacoes, LINHA_INICIAL } from "../Investimentos/EditorDeDestinacoes";
import { EditorDeDivisao, LINHAS_INICIAIS_DA_DIVISAO } from "./EditorDeDivisao";
import { Badge } from "../Badge/Badge";
import { Botao } from "../Botao/Botao";
import { GrupoDeChips } from "../Compositor/GrupoDeChips";
import { ControleSegmentado } from "../ControleSegmentado/ControleSegmentado";
import estilos from "./Importadas.module.css";

const EXPLICACAO_DO_DESCARTE =
  "Parece pagamento de fatura, transferência entre suas contas ou estorno, e não um gasto nem uma renda de verdade.";
const EXPLICACAO_DO_DUPLICADO =
  "Já existe um gasto ou ganho seu da mesma conta, no mesmo dia e com o mesmo valor.";

export const MENSAGEM_ESCOLHA_A_CATEGORIA = "Escolha a categoria para aceitar como gasto.";
const MENSAGEM_ESCOLHA_UMA_CATEGORIA = "Escolha uma categoria";

type ModoDoCartao = "padrao" | "transferencia" | "investimento";

type Propriedades = {
  transacao: TransacaoImportada;
  nomeDaConta: string;
  categorias: readonly Categoria[] | undefined;
  sugestoesDeTags: readonly string[];
  /** As posições de GET /investimentos, para o aporte; `undefined` enquanto não chegam. */
  investimentos?: readonly Investimento[];
  /** Quando a transação está marcada para aceitar em lote. */
  selecionada?: boolean;
  /** Presente só nas saídas: marca ou desmarca a transação para o lote. */
  aoAlternarSelecao?: (id: string) => void;
  /** Depois de aceitar ou ignorar: a tela avisa, leva o foco adiante e a transação sai da fila. */
  aoTratar: (mensagem: string, id: string) => void;
  /** Falha de rede (sem resposta): a tela pisca o olho e avisa. */
  aoFalhar: (erro: unknown) => void;
};

/** O valor com o sinal do sentido: menos na saída, mais na entrada. */
export function valorComSinal(transacao: TransacaoImportada): string {
  const saida = transacao.sentido === "saida";
  const valor = formatar(
    deCentavos(saida ? -paraCentavos(transacao.valor) : paraCentavos(transacao.valor)),
  );
  return `${saida ? "" : "+"}${valor}`;
}

/**
 * O cartão que acabou de ser tratado, só para sair da fila com movimento: sem botões, sem campos
 * e fora da leitura (aria-hidden); a fila de verdade já foi atualizada.
 */
export function CartaoSaindo({ transacao }: { transacao: TransacaoImportada }) {
  return (
    <li className={estilos.saindo} aria-hidden="true" data-saindo="true" data-sentido={transacao.sentido}>
      <span className={estilos.nome}>{transacao.descricao}</span>
      <span className={`valor ${estilos.valor}`}>{valorComSinal(transacao)}</span>
    </li>
  );
}

function mensagemDoErro(erro: unknown): string | null {
  if (erro === null || erro === undefined) return null;
  return erro instanceof ErroDaApiCliente && erro.codigo !== "sem_resposta"
    ? erro.mensagem
    : MENSAGEM_SEM_RESPOSTA;
}

/**
 * Uma transação do banco esperando a decisão: valor, dia, conta, os avisos de "provavelmente
 * ignorar" e "possível duplicado" (sempre em texto) e as ações. Saída vira gasto (pede
 * categoria; tags são opcionais) ou operação de investimento; entrada vira ganho ou operação de investimento.
 * A saída que parece a emissão de uma posição abre como aporte dela. Ignorar descarta sem criar nada.
 */
export function CartaoDeImportada({
  transacao,
  nomeDaConta,
  categorias,
  sugestoesDeTags,
  investimentos,
  selecionada = false,
  aoAlternarSelecao,
  aoTratar,
  aoFalhar,
}: Propriedades) {
  // A saída que parece a emissão de uma posição já abre como aporte dela (a pessoa confirma).
  const sugerido = transacao.investimento_sugerido_id ?? null;
  const [comoInvestimento, definirComoInvestimento] = useState(sugerido !== null || transacao.tipo_de_movimento_sugerido != null);
  const tipoPadrao = transacao.sentido === "saida" ? "aporte" : "resgate";
  const [tipoDeMovimento, definirTipoDeMovimento] = useState<TipoDeMovimento>(transacao.tipo_de_movimento_sugerido ?? tipoPadrao);
  const [relacionado, definirRelacionado] = useState("");
  const especial = tipoDeMovimento !== "aporte" && tipoDeMovimento !== "resgate";
  const [investimentoId, definirInvestimentoId] = useState(sugerido ?? "");
  const [linhas, definirLinhas] = useState<LinhaDeDestinacao[]>(
    sugerido !== null ? [{ ...LINHA_INICIAL }] : [],
  );
  const [transferindo, definirTransferindo] = useState(false);
  const [dividindo, definirDividindo] = useState(false);
  const [partes, definirPartes] = useState<LinhaDaDivisao[]>([...LINHAS_INICIAIS_DA_DIVISAO]);
  const dividir = useDividirTransacaoImportada();
  const [categoria, definirCategoria] = useState<string | null>(null);
  const [tags, definirTags] = useState<string[]>([]);
  const [textoDaTag, definirTextoDaTag] = useState("");
  const [tagsAbertas, definirTagsAbertas] = useState(false);
  const [tentou, definirTentou] = useState(false);
  const aceitar = useAceitarTransacaoImportada();
  const ignorar = useIgnorarTransacaoImportada();
  const id = useId();
  const campoDeTags = useRef<HTMLInputElement | null>(null);
  const avisarFalha = useRef(aoFalhar);
  useEffect(() => {
    avisarFalha.current = aoFalhar;
  });
  useEffect(() => {
    if (tagsAbertas) campoDeTags.current?.focus();
  }, [tagsAbertas]);
  useEffect(() => {
    if (aceitar.erro !== null) avisarFalha.current(aceitar.erro);
  }, [aceitar.erro]);
  useEffect(() => {
    if (ignorar.erro !== null) avisarFalha.current(ignorar.erro);
  }, [ignorar.erro]);
  useEffect(() => {
    if (dividir.erro !== null) avisarFalha.current(dividir.erro);
  }, [dividir.erro]);

  const saida = transacao.sentido === "saida";
  const descarte = transacao.sugerir_descarte;
  const ocupado = aceitar.pendente || ignorar.pendente || dividir.pendente;
  const motivos: string[] = [];
  if (dividindo) {
    const motivo = motivoDaDivisao(partes, saida);
    if (motivo !== null) motivos.push(motivo);
  } else if (comoInvestimento) {
    const motivoDoAporte = especial
      ? investimentoId === "" ? "Escolha o investimento." : tipoDeMovimento !== "rendimento" && !relacionado ? "Escolha a operação relacionada ao custo." : null
      : investimentoId === "" ? null : motivoDasDestinacoes(linhas);
    if (motivoDoAporte !== null) motivos.push(motivoDoAporte);
  } else {
    if (saida && categoria === null) motivos.push(MENSAGEM_ESCOLHA_UMA_CATEGORIA);
    if (normalizarTag(textoDaTag) !== "") motivos.push(MENSAGEM_TAG_PENDENTE);
  }
  const nomeDoAporte = tipoDeMovimento;
  const erro =
    mensagemDoErro(aceitar.erro) ?? mensagemDoErro(dividir.erro) ?? mensagemDoErro(ignorar.erro);

  async function aceitarTransacao(): Promise<void> {
    if (ocupado) return;
    if (motivos.length > 0) {
      // Gasto/ganho: o botão não desabilita; o que falta aparece junto aos campos.
      definirTentou(true);
      return;
    }
    if (dividindo) {
      const feita = await dividir.executar({
        id: transacao.id,
        divisao: { partes: partesParaEnvio(partes, saida) },
      });
      if (feita) {
        const n = feita.criados.length;
        aoTratar(
          `Transação dividida em ${n} ${n === 1 ? "lançamento" : "lançamentos"}.`,
          transacao.id,
        );
      }
      return;
    }
    const dados = comoInvestimento
      ? {
          como_investimento: true,
          ...(especial ? { tipo_de_movimento: tipoDeMovimento } : {}),
          ...(relacionado && especial ? { movimento_relacionado_id: relacionado } : {}),
          tags: [],
          ...(investimentoId === ""
            ? {}
            : { investimento_id: investimentoId, destinacoes: especial ? [] : destinacoesParaEnvio(linhas) }),
        }
      : { ...(saida && categoria !== null ? { categoria } : {}), tags };
    const aceite = await aceitar.executar({ id: transacao.id, dados });
    if (aceite) {
      const textos = {
        gasto: "Gasto criado.",
        ganho: "Ganho criado.",
        aporte: "Aporte registrado.",
        resgate: "Resgate registrado.",
        rendimento: "Rendimento registrado no investimento.",
        custo: "Custo do investimento registrado.",
        imposto: "Imposto do investimento registrado.",
      };
      aoTratar(textos[aceite.tipo], transacao.id);
    }
  }

  function alternarAporte(ligado: boolean): void {
    definirComoInvestimento(ligado);
    if (ligado && linhas.length === 0) definirLinhas([{ ...LINHA_INICIAL }]);
  }

  const modo: ModoDoCartao = transferindo ? "transferencia" : comoInvestimento ? "investimento" : "padrao";
  function mudarModo(novo: ModoDoCartao): void {
    if (novo === modo) return;
    definirTransferindo(novo === "transferencia");
    if (novo === "investimento" || comoInvestimento) alternarAporte(novo === "investimento");
    definirTentou(false);
  }
  const opcoesDoModo = [
    { valor: "padrao", rotulo: saida ? "Gasto" : "Ganho" },
    { valor: "transferencia", rotulo: "Transferência" },
    { valor: "investimento", rotulo: saida ? "Aporte" : "Resgate" },
  ] as const;

  const nomeDoSugerido =
    sugerido !== null && comoInvestimento && investimentoId === sugerido
      ? investimentos?.find((investimento) => investimento.id === sugerido)?.nome
      : undefined;

  // Na aba Transferência, ignorar guarda o motivo: a transação é entre as próprias contas.
  async function ignorarTransacao(): Promise<void> {
    if (ocupado) return;
    const entrada = modo === "transferencia" ? { id: transacao.id, motivo: "transferencia_entre_contas" as const } : transacao.id;
    if (await ignorar.executar(entrada)) aoTratar("Transação ignorada.", transacao.id);
  }

  const idTitulo = `${id}-titulo`;
  const idMotivos = `${id}-motivos`;

  // Os editores de divisão e de destinações explicam o que falta junto aos próprios campos; em
  // gasto/ganho o botão fica ativo e o que falta aparece depois de tentar aceitar.
  const mostraMotivos = !dividindo && !comoInvestimento;
  const desabilitaPorMotivos = motivos.length > 0 && !mostraMotivos;
  const motivoDaCategoria = tentou && motivos.includes(MENSAGEM_ESCOLHA_UMA_CATEGORIA) ? MENSAGEM_ESCOLHA_UMA_CATEGORIA : undefined;
  const motivoDaTag = tentou && motivos.includes(MENSAGEM_TAG_PENDENTE) ? MENSAGEM_TAG_PENDENTE : null;
  const textoDoBotao = comoInvestimento
    ? `Aceitar como ${nomeDoAporte}`
    : saida
      ? "Aceitar como gasto"
      : "Aceitar como ganho";
  const botaoDeAceitar = (
    <Botao
      key="aceitar"
      variante={descarte ? "secundario" : "primario"}
      data-principal={descarte ? undefined : "true"}
      className={descarte ? undefined : estilos.principal}
      disabled={desabilitaPorMotivos || ocupado}
      aria-describedby={motivoDaTag !== null ? idMotivos : undefined}
      aria-label={`${textoDoBotao}: ${transacao.descricao}`}
      onClick={() => void aceitarTransacao()}
    >
      {aceitar.pendente ? "Criando…" : textoDoBotao}
    </Botao>
  );

  const botaoDeIgnorar = (
    <Botao
      key="ignorar"
      variante={descarte ? "primario" : "secundario"}
      data-principal={descarte ? "true" : undefined}
      className={descarte ? estilos.principal : undefined}
      disabled={ocupado}
      aria-label={`Ignorar: ${transacao.descricao}`}
      onClick={() => void ignorarTransacao()}
    >
      {ignorar.pendente ? "Ignorando…" : "Ignorar"}
    </Botao>
  );

  return (
    <li
      className={estilos.cartao}
      aria-labelledby={idTitulo}
      data-transacao={transacao.id}
      data-sentido={transacao.sentido}
      data-descarte={descarte}
      data-selecionada={selecionada || undefined}
      data-sugestao={nomeDoSugerido !== undefined || undefined}
    >
      <div className={estilos.topo}>
        {aoAlternarSelecao && (
          <input
            type="checkbox"
            className={estilos.selecao}
            checked={selecionada}
            onChange={() => aoAlternarSelecao(transacao.id)}
            aria-label={`Selecionar para aceitar em lote: ${transacao.descricao}`}
          />
        )}
        <span className={estilos.sentido} aria-hidden="true">
          <Icone nome={saida ? "saida" : "entrada"} tamanho={18} />
        </span>
        <div className={estilos.identificacao}>
          <h3 id={idTitulo} className={estilos.nome} title={transacao.descricao}>
            {transacao.descricao}
          </h3>
          <p className={estilos.detalhe}>
            <span>{rotuloDoDia(transacao.data)}</span>
            <span>{nomeDaConta || "conta removida"}</span>
            <span>{saida ? "Saída" : "Entrada"}</span>
          </p>
        </div>
        <span className={`valor ${estilos.valor}`}>{valorComSinal(transacao)}</span>
      </div>
      {(descarte || transacao.possivel_duplicado) && (
        <div className={estilos.etiquetas}>
          {descarte && (
            <span data-etiqueta="descarte" title={EXPLICACAO_DO_DESCARTE}>
              <Badge tom="atencao" icone={<Icone nome="alerta" tamanho={14} />}>
                Provavelmente ignorar
                <span className={estilos.somenteLeitor}>. {EXPLICACAO_DO_DESCARTE}</span>
              </Badge>
            </span>
          )}
          {transacao.possivel_duplicado && (
            <span data-etiqueta="duplicado" title={EXPLICACAO_DO_DUPLICADO}>
              <Badge tom="atencao" icone={<Icone nome="alerta" tamanho={14} />}>
                Possível duplicado
                <span className={estilos.somenteLeitor}>. {EXPLICACAO_DO_DUPLICADO}</span>
              </Badge>
            </span>
          )}
        </div>
      )}

      {!dividindo && (
        <ControleSegmentado
          nome={`Tipo da transação: ${transacao.descricao}`}
          opcoes={opcoesDoModo}
          valor={modo}
          aoMudar={mudarModo}
        />
      )}
      {modo === "transferencia" ? (
        <PainelDaTransferencia
          transacao={transacao}
          aoConcluir={() => aoTratar("Transferência classificada entre suas contas.", transacao.id)}
          ignorar={botaoDeIgnorar}
        />
      ) : (
        <>
          {modo === "padrao" && saida && !dividindo && (
            <SeletorDeCategoria categorias={categorias} valor={categoria} aoMudar={definirCategoria} erro={motivoDaCategoria} />
          )}
          {modo === "investimento" && !dividindo && (
            <GrupoDeChips
              rotulo="Natureza do movimento"
              opcoes={saida
                ? [{ valor: "aporte", nome: "Compra ou aplicação" }, { valor: "custo", nome: "Custo de negociação" }, { valor: "imposto", nome: "Imposto" }]
                : [{ valor: "resgate", nome: "Venda ou resgate" }, { valor: "rendimento", nome: "Rendimento" }]}
              valor={tipoDeMovimento}
              aoMudar={v => { definirTipoDeMovimento(v as TipoDeMovimento); definirRelacionado(""); }}
            />
          )}
          {nomeDoSugerido !== undefined && !dividindo && (
            <p className={estilos.sugestao}>{tipoDeMovimento === "aporte" ? "Parece o aporte de" : "Parece uma operação de"} «{nomeDoSugerido}»</p>
          )}
          {dividindo ? (
            <EditorDeDivisao
              categorias={categorias}
              linhas={partes}
              aoMudarLinhas={definirPartes}
              valor={transacao.valor}
              saida={saida}
              investimentos={investimentos}
              podeSalvar={motivos.length === 0}
              salvando={dividir.pendente}
              nomeDoSalvar={`Salvar divisão: ${transacao.descricao}`}
              aoSalvar={() => void aceitarTransacao()}
              aoCancelar={() => definirDividindo(false)}
              aoNaoDividir={() => {
                definirPartes([...LINHAS_INICIAIS_DA_DIVISAO]);
                definirDividindo(false);
              }}
            />
          ) : modo === "investimento" && especial ? (
            <EditorDeOperacaoDoInvestimento tipo={tipoDeMovimento} investimentos={investimentos ?? []}
              investimentoId={investimentoId} aoMudarInvestimento={id => { definirInvestimentoId(id); definirRelacionado(""); }}
              relacionado={relacionado} aoMudarRelacionado={definirRelacionado} />
          ) : modo === "investimento" ? (
            <EditorDeDestinacoes
              investimentos={investimentos}
              investimentoId={investimentoId}
              aoMudarInvestimento={definirInvestimentoId}
              linhas={linhas}
              aoMudarLinhas={definirLinhas}
              valor={saida ? transacao.valor : undefined}
            />
          ) : tagsAbertas ? (
            <CampoDeTags
              ref={campoDeTags}
              tags={tags}
              aoMudar={definirTags}
              aoMudarTexto={definirTextoDaTag}
              sugestoes={sugestoesDeTags}
            />
          ) : null}
          {modo === "padrao" && !dividindo && (
            <div className={estilos.secundarias}>
              {!tagsAbertas && (
                <Botao variante="terciario" icone="tags" className={estilos.secundaria} aria-label="Adicionar tags" onClick={() => definirTagsAbertas(true)}>
                  Tags
                </Botao>
              )}
              <Botao variante="terciario" icone="dividir" className={estilos.secundaria} aria-label="Dividir em partes" onClick={() => definirDividindo(true)}>
                Dividir
              </Botao>
            </div>
          )}

          {erro && (
            <p role="alert" className={estilos.erro}>
              {erro}
            </p>
          )}
          {motivoDaTag !== null && (
            <p id={idMotivos} className={estilos.erro}>
              {motivoDaTag}
            </p>
          )}

          <div className={estilos.acoes}>
            {dividindo
              ? [botaoDeIgnorar]
              : descarte
                ? [botaoDeIgnorar, botaoDeAceitar]
                : [botaoDeAceitar, botaoDeIgnorar]}
          </div>
        </>
      )}
    </li>
  );
}
