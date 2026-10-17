import { useEffect, useId, useRef, useState } from "react";

import { ErroDaApiCliente, MENSAGEM_SEM_RESPOSTA } from "../../api/cliente";
import { useAceitarTransacaoImportada, useIgnorarTransacaoImportada } from "../../api/consultas";
import type { Categoria, TransacaoImportada } from "../../api/tipos";
import { deCentavos, formatar, paraCentavos } from "../../dinheiro/dinheiro";
import { rotuloDoDia } from "../../periodo/periodo";
import { normalizarTag } from "../../tags/tags";
import { CampoDeTags } from "../Compositor/CampoDeTags";
import { MENSAGEM_TAG_PENDENTE } from "../Compositor/CompositorDeGasto";
import { SeletorDeCategoria } from "../Compositor/SeletorDeCategoria";
import { Icone } from "../Icone/Icone";
import estilos from "./Importadas.module.css";

const EXPLICACAO_DO_DESCARTE =
  "Parece pagamento de fatura, transferência entre suas contas ou estorno, e não um gasto nem uma renda de verdade.";
const EXPLICACAO_DO_DUPLICADO =
  "Já existe um gasto ou ganho seu da mesma conta, no mesmo dia e com o mesmo valor.";

export const MENSAGEM_ESCOLHA_A_CATEGORIA = "Escolha a categoria para aceitar como gasto.";

type Propriedades = {
  transacao: TransacaoImportada;
  nomeDaConta: string;
  categorias: readonly Categoria[] | undefined;
  sugestoesDeTags: readonly string[];
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
 * categoria; tags são opcionais); entrada vira ganho. Ignorar descarta sem criar nada.
 */
export function CartaoDeImportada({
  transacao,
  nomeDaConta,
  categorias,
  sugestoesDeTags,
  aoTratar,
  aoFalhar,
}: Propriedades) {
  const [categoria, definirCategoria] = useState<string | null>(null);
  const [tags, definirTags] = useState<string[]>([]);
  const [textoDaTag, definirTextoDaTag] = useState("");
  const [tagsAbertas, definirTagsAbertas] = useState(false);
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

  const saida = transacao.sentido === "saida";
  const descarte = transacao.sugerir_descarte;
  const ocupado = aceitar.pendente || ignorar.pendente;
  const motivos: string[] = [];
  if (saida && categoria === null) motivos.push(MENSAGEM_ESCOLHA_A_CATEGORIA);
  if (normalizarTag(textoDaTag) !== "") motivos.push(MENSAGEM_TAG_PENDENTE);
  const erro = mensagemDoErro(aceitar.erro) ?? mensagemDoErro(ignorar.erro);

  async function aceitarTransacao(): Promise<void> {
    if (motivos.length > 0 || ocupado) return;
    const aceite = await aceitar.executar({
      id: transacao.id,
      dados: { ...(saida && categoria !== null ? { categoria } : {}), tags },
    });
    if (aceite) aoTratar(aceite.tipo === "gasto" ? "Gasto criado." : "Ganho criado.", transacao.id);
  }

  async function ignorarTransacao(): Promise<void> {
    if (ocupado) return;
    if (await ignorar.executar(transacao.id)) aoTratar("Transação ignorada.", transacao.id);
  }

  const idTitulo = `${id}-titulo`;
  const idMotivos = `${id}-motivos`;

  const botaoDeAceitar = (
    <button
      key="aceitar"
      type="button"
      className={descarte ? estilos.secundario : estilos.primario}
      data-principal={descarte ? undefined : "true"}
      disabled={motivos.length > 0 || ocupado}
      aria-describedby={motivos.length > 0 ? idMotivos : undefined}
      aria-label={`${saida ? "Aceitar como gasto" : "Aceitar como ganho"}: ${transacao.descricao}`}
      onClick={() => void aceitarTransacao()}
    >
      {aceitar.pendente ? "Criando…" : saida ? "Aceitar como gasto" : "Aceitar como ganho"}
    </button>
  );
  const botaoDeIgnorar = (
    <button
      key="ignorar"
      type="button"
      className={descarte ? estilos.primario : estilos.secundario}
      data-principal={descarte ? "true" : undefined}
      disabled={ocupado}
      aria-label={`Ignorar: ${transacao.descricao}`}
      onClick={() => void ignorarTransacao()}
    >
      {ignorar.pendente ? "Ignorando…" : "Ignorar"}
    </button>
  );

  return (
    <li
      className={estilos.cartao}
      aria-labelledby={idTitulo}
      data-transacao={transacao.id}
      data-sentido={transacao.sentido}
      data-descarte={descarte}
    >
      <div className={estilos.topo}>
        <span className={estilos.sentido} aria-hidden="true">
          <Icone nome={saida ? "saida" : "entrada"} tamanho={18} />
        </span>
        <div className={estilos.identificacao}>
          <h3 id={idTitulo} className={estilos.nome}>
            {transacao.descricao}
          </h3>
          <p className={estilos.detalhe}>
            {rotuloDoDia(transacao.data)} · {nomeDaConta || "conta removida"} ·{" "}
            {saida ? "Saída" : "Entrada"}
          </p>
        </div>
        <span className={`valor ${estilos.valor}`}>{valorComSinal(transacao)}</span>
      </div>
      {(descarte || transacao.possivel_duplicado) && (
        <div className={estilos.etiquetas}>
          {descarte && (
            <span
              className={estilos.etiqueta}
              data-etiqueta="descarte"
              title={EXPLICACAO_DO_DESCARTE}
            >
              <Icone nome="alerta" tamanho={14} />
              <span>Provavelmente ignorar</span>
              <span className={estilos.somenteLeitor}>. {EXPLICACAO_DO_DESCARTE}</span>
            </span>
          )}
          {transacao.possivel_duplicado && (
            <span
              className={estilos.etiqueta}
              data-etiqueta="duplicado"
              title={EXPLICACAO_DO_DUPLICADO}
            >
              <Icone nome="alerta" tamanho={14} />
              <span>Possível duplicado</span>
              <span className={estilos.somenteLeitor}>. {EXPLICACAO_DO_DUPLICADO}</span>
            </span>
          )}
        </div>
      )}

      {saida && (
        <SeletorDeCategoria categorias={categorias} valor={categoria} aoMudar={definirCategoria} />
      )}
      {tagsAbertas ? (
        <CampoDeTags
          ref={campoDeTags}
          tags={tags}
          aoMudar={definirTags}
          aoMudarTexto={definirTextoDaTag}
          sugestoes={sugestoesDeTags}
        />
      ) : (
        <button
          type="button"
          className={estilos.adicionarTags}
          onClick={() => definirTagsAbertas(true)}
        >
          Adicionar tags
        </button>
      )}

      {erro && (
        <p role="alert" className={estilos.erro}>
          {erro}
        </p>
      )}
      {motivos.length > 0 && (
        <ul id={idMotivos} className={estilos.motivos}>
          {motivos.map((motivo) => (
            <li key={motivo}>{motivo}</li>
          ))}
        </ul>
      )}

      <div className={estilos.acoes}>
        {descarte ? [botaoDeIgnorar, botaoDeAceitar] : [botaoDeAceitar, botaoDeIgnorar]}
      </div>
    </li>
  );
}
