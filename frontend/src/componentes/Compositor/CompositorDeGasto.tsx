import {
  type FormEvent,
  type KeyboardEvent,
  type SyntheticEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { ErroDaApiCliente, MENSAGEM_SEM_RESPOSTA } from "../../api/cliente";
import { useRegistrarGanho, useRegistrarGasto } from "../../api/consultas";
import type { Categoria, Conta, Ganho, Gasto } from "../../api/tipos";
import { hojeLocal } from "../../periodo/periodo";
import { aparar, normalizarTag } from "../../tags/tags";
import { CampoDeTags } from "./CampoDeTags";
import { CampoDeValor } from "./CampoDeValor";
import estilos from "./CompositorDeGasto.module.css";
import { SeletorDeCategoria } from "./SeletorDeCategoria";

/** Confirmação que o painel anuncia no aviso depois de `aoRegistrar`. */
export const MENSAGEM_GASTO_REGISTRADO = "Gasto registrado.";

/** Confirmação que o painel anuncia depois de `aoRegistrarGanho`. */
export const MENSAGEM_GANHO_REGISTRADO = "Ganho registrado.";

/** Por que não dá para registrar um gasto sem contas (o painel também a anuncia). */
export const MENSAGEM_SEM_CONTAS = "Crie uma conta antes de registrar um gasto.";

/** Texto no campo de tags que ainda não virou tag: não é enviado em silêncio. */
export const MENSAGEM_TAG_PENDENTE =
  "Adicione a tag digitada com Enter ou apague o texto do campo Tags.";

type Propriedades = {
  /** Contas para o campo "Conta" (GET /contas). */
  contas: readonly Conta[];
  /** Categorias de GET /categorias; `undefined` enquanto não chegam. */
  categorias: readonly Categoria[] | undefined;
  /** Tags já usadas (GET /tags), sugeridas no campo de tags. */
  sugestoesDeTags: readonly string[];
  /** Conta selecionada no painel; sem ela (ou se não existir), a primeira da lista. */
  contaInicial: string | null;
  /** Gasto registrado; o compositor chama `aoFechar` logo depois. */
  aoRegistrar: (gasto: Gasto) => void;
  /** Ganho registrado (modo "Ganho"); o compositor chama `aoFechar` logo depois. */
  aoRegistrarGanho?: (ganho: Ganho) => void;
  /** Toda falha ao registrar (o painel pisca o olho e, sem resposta, avisa). */
  aoFalhar: (erro: unknown) => void;
  /** Pedido de fechar (Esc, Cancelar ou depois do registro): o painel desmonta o compositor. */
  aoFechar: () => void;
};

/** O que o formulário registra: gasto (com categoria) ou ganho (sem). */
type Tipo = "gasto" | "ganho";

type Campo = "valor" | "descricao" | "data" | "conta" | "categoria" | "tags";

type ErrosDoCompositor = Partial<Record<Campo | "geral", string>>;

/** Ordem dos campos no formulário: o foco vai ao primeiro com erro. */
const CAMPOS: readonly Campo[] = ["valor", "descricao", "data", "conta", "categoria", "tags"];

const CAMPO_DO_DETALHE: Readonly<Record<string, Campo>> = {
  "body.valor": "valor",
  "body.descricao": "descricao",
  "body.data": "data",
  "body.conta_id": "conta",
  "body.categoria": "categoria",
  "body.tags": "tags",
};

/** Campo do formulário de um `detalhes[].campo` ("body.tags.0" é das tags). */
function campoDoDetalhe(campo: string): Campo | undefined {
  if (campo.startsWith("body.tags.")) return "tags";
  return Object.hasOwn(CAMPO_DO_DETALHE, campo) ? CAMPO_DO_DETALHE[campo] : undefined;
}

/** Onde mostrar o erro da API: junto ao campo correspondente ou no formulário. */
function errosDoCompositor(erro: unknown): ErrosDoCompositor {
  if (erro === null || erro === undefined) return {};
  if (!(erro instanceof ErroDaApiCliente)) return { geral: MENSAGEM_SEM_RESPOSTA };
  switch (erro.codigo) {
    case "valor_invalido":
      return { valor: erro.mensagem };
    case "descricao_invalida":
      return { descricao: erro.mensagem };
    case "tag_invalida":
      return { tags: erro.mensagem };
    case "conta_nao_encontrada":
      return { conta: erro.mensagem };
    case "requisicao_invalida": {
      const erros: ErrosDoCompositor = {};
      for (const { campo, mensagem } of erro.detalhes ?? []) {
        const destino = campoDoDetalhe(campo);
        if (destino) erros[destino] ??= mensagem;
      }
      return Object.keys(erros).length > 0 ? erros : { geral: erro.mensagem };
    }
    default:
      // Inclui `sem_resposta`: o diálogo é modal, então a mensagem aparece nele também.
      return { geral: erro.mensagem };
  }
}

/**
 * Compositor de gasto e de ganho: um `<dialog>` modal (folha inferior no celular)
 * com o formulário de valor, descrição, data, conta, categoria (só no gasto) e
 * tags. Abre em "Gasto"; o seletor do topo troca para "Ganho". O painel o
 * monta para abrir e o desmonta para fechar; ao abrir, guarda o elemento com
 * foco e o devolve ao fechar. Esc (ou o `cancel` do diálogo) pede para fechar.
 * O envio fica desabilitado, com a explicação visível, até o gasto estar
 * completo, e enquanto a requisição está pendente (duplo clique envia uma vez).
 * Erros da API aparecem junto ao campo correspondente e o diálogo fica aberto.
 */
export function CompositorDeGasto({
  contas,
  categorias,
  sugestoesDeTags,
  contaInicial,
  aoRegistrar,
  aoRegistrarGanho,
  aoFalhar,
  aoFechar,
}: Propriedades) {
  const [tipo, definirTipo] = useState<Tipo>("gasto");
  const [valor, definirValor] = useState("0.00");
  const [descricao, definirDescricao] = useState("");
  const [data, definirData] = useState(hojeLocal);
  const [contaId, definirContaId] = useState(() =>
    contaInicial !== null && contas.some((conta) => conta.id === contaInicial)
      ? contaInicial
      : (contas[0]?.id ?? ""),
  );
  const [categoria, definirCategoria] = useState<string | null>(null);
  const [tags, definirTags] = useState<string[]>([]);
  const [textoDaTag, definirTextoDaTag] = useState("");
  const registrarGasto = useRegistrarGasto();
  const registrarGanho = useRegistrarGanho();
  const registrar = tipo === "gasto" ? registrarGasto : registrarGanho;
  const id = useId();

  const dialogo = useRef<HTMLDialogElement>(null);
  const campoValor = useRef<HTMLInputElement>(null);
  const campoDescricao = useRef<HTMLInputElement>(null);
  const campoData = useRef<HTMLInputElement>(null);
  const campoConta = useRef<HTMLSelectElement>(null);
  const campoCategoria = useRef<HTMLInputElement>(null);
  const campoTags = useRef<HTMLInputElement>(null);

  const erros = errosDoCompositor(registrar.erro);

  // Abre como modal ao montar; ao desmontar fecha e devolve o foco a quem abriu.
  // De layout: abre antes da primeira pintura e devolve o foco no mesmo commit
  // em que o diálogo sai da página, sem um instante com o foco no <body>.
  useLayoutEffect(() => {
    const elemento = dialogo.current;
    if (!elemento) return;
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!elemento.open) elemento.showModal();
    campoValor.current?.focus();
    return () => {
      if (elemento.open) elemento.close();
      if (anterior?.isConnected) anterior.focus();
    };
  }, []);

  // As funções mais recentes numa ref: cada erro novo avisa uma vez só.
  const avisarFalha = useRef(aoFalhar);
  useEffect(() => {
    avisarFalha.current = aoFalhar;
  });
  useEffect(() => {
    if (registrar.erro === null) return;
    avisarFalha.current(registrar.erro);
    // O foco vai ao primeiro campo com erro, para a mensagem ligada a ele ser lida.
    const comErro = errosDoCompositor(registrar.erro);
    const elementos = {
      valor: campoValor,
      descricao: campoDescricao,
      data: campoData,
      conta: campoConta,
      categoria: campoCategoria,
      tags: campoTags,
    };
    const primeiro = CAMPOS.find((campo) => comErro[campo]);
    if (primeiro) elementos[primeiro].current?.focus();
  }, [registrar.erro]);

  const motivos: string[] = [];
  if (contas.length === 0) motivos.push(MENSAGEM_SEM_CONTAS);
  if (valor === "0.00") motivos.push("Informe um valor maior que zero.");
  if (aparar(descricao) === "") motivos.push("Escreva uma descrição.");
  if (data === "") motivos.push("Escolha a data.");
  if (tipo === "gasto" && categoria === null) motivos.push("Escolha uma categoria.");
  if (normalizarTag(textoDaTag) !== "") motivos.push(MENSAGEM_TAG_PENDENTE);

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (motivos.length > 0) return;
    if (tipo === "ganho") {
      const ganho = await registrarGanho.executar({
        conta_id: contaId,
        valor,
        descricao: aparar(descricao),
        data,
        tags,
      });
      if (ganho) {
        aoRegistrarGanho?.(ganho);
        aoFechar();
      }
      return;
    }
    if (categoria === null) return;
    const gasto = await registrarGasto.executar({
      conta_id: contaId,
      valor,
      descricao: aparar(descricao),
      data,
      categoria,
      tags,
    });
    if (gasto) {
      aoRegistrar(gasto);
      aoFechar();
    }
  }

  function aoTeclar(evento: KeyboardEvent<HTMLDialogElement>): void {
    // Um campo que usa o Escape (as sugestões de tag) impede o padrão antes.
    if (evento.key !== "Escape" || evento.defaultPrevented) return;
    evento.preventDefault();
    aoFechar();
  }

  function aoCancelar(evento: SyntheticEvent<HTMLDialogElement>): void {
    // O navegador fecharia o diálogo sozinho; quem fecha é o painel.
    evento.preventDefault();
    aoFechar();
  }

  const idTitulo = `${id}-titulo`;
  const idDescricao = `${id}-descricao`;
  const idData = `${id}-data`;
  const idConta = `${id}-conta`;
  const idMotivos = `${id}-motivos`;
  const idErro = (campo: Campo) => `${id}-erro-${campo}`;

  return (
    <dialog
      ref={dialogo}
      className={estilos.dialogo}
      aria-labelledby={idTitulo}
      onKeyDown={aoTeclar}
      onCancel={aoCancelar}
    >
      <form
        className={estilos.formulario}
        onSubmit={enviar}
        noValidate
        aria-busy={registrar.pendente ? true : undefined}
      >
        <header className={estilos.topo}>
          <h2 id={idTitulo} className={estilos.titulo}>
            {tipo === "gasto" ? "Novo gasto" : "Novo ganho"}
          </h2>
          <p className={estilos.atalho}>
            <kbd>Esc</kbd> fecha
          </p>
        </header>

        <div role="group" aria-label="O que registrar" className={estilos.tipos}>
          {(["gasto", "ganho"] as const).map((opcao) => (
            <button
              key={opcao}
              type="button"
              className={estilos.tipo}
              aria-pressed={tipo === opcao}
              onClick={() => definirTipo(opcao)}
            >
              {opcao === "gasto" ? "Gasto" : "Ganho"}
            </button>
          ))}
        </div>

        <CampoDeValor
          ref={campoValor}
          rotulo="Valor"
          valor={valor}
          aoMudar={definirValor}
          erro={erros.valor}
        />

        <div className={estilos.campo}>
          <label htmlFor={idDescricao} className={estilos.rotulo}>
            Descrição
          </label>
          <input
            ref={campoDescricao}
            id={idDescricao}
            className={estilos.entrada}
            value={descricao}
            onChange={(evento) => definirDescricao(evento.target.value)}
            maxLength={200}
            autoComplete="off"
            aria-invalid={erros.descricao ? true : undefined}
            aria-describedby={erros.descricao ? idErro("descricao") : undefined}
          />
          {erros.descricao && (
            <p id={idErro("descricao")} className={estilos.erro}>
              {erros.descricao}
            </p>
          )}
        </div>

        <div className={estilos.linha}>
          <div className={estilos.campo}>
            <label htmlFor={idData} className={estilos.rotulo}>
              Data
            </label>
            <input
              ref={campoData}
              id={idData}
              type="date"
              className={estilos.entrada}
              value={data}
              onChange={(evento) => definirData(evento.target.value)}
              aria-invalid={erros.data ? true : undefined}
              aria-describedby={erros.data ? idErro("data") : undefined}
            />
            {erros.data && (
              <p id={idErro("data")} className={estilos.erro}>
                {erros.data}
              </p>
            )}
          </div>

          <div className={estilos.campo}>
            <label htmlFor={idConta} className={estilos.rotulo}>
              Conta
            </label>
            <select
              ref={campoConta}
              id={idConta}
              className={estilos.entrada}
              value={contaId}
              onChange={(evento) => definirContaId(evento.target.value)}
              disabled={contas.length === 0}
              aria-invalid={erros.conta ? true : undefined}
              aria-describedby={erros.conta ? idErro("conta") : undefined}
            >
              {contas.map((conta) => (
                <option key={conta.id} value={conta.id}>
                  {conta.nome}
                </option>
              ))}
            </select>
            {erros.conta && (
              <p id={idErro("conta")} className={estilos.erro}>
                {erros.conta}
              </p>
            )}
          </div>
        </div>

        {tipo === "gasto" && (
          <SeletorDeCategoria
            ref={campoCategoria}
            categorias={categorias}
            valor={categoria}
            aoMudar={definirCategoria}
            erro={erros.categoria}
          />
        )}

        <CampoDeTags
          ref={campoTags}
          tags={tags}
          aoMudar={definirTags}
          aoMudarTexto={definirTextoDaTag}
          sugestoes={sugestoesDeTags}
          erro={erros.tags}
        />

        {/* Sem campo ao qual ligar a mensagem: o alerta a anuncia. */}
        {erros.geral && (
          <p role="alert" className={estilos.erro}>
            {erros.geral}
          </p>
        )}

        <footer className={estilos.rodape}>
          {motivos.length > 0 && (
            <ul id={idMotivos} className={estilos.motivos}>
              {motivos.map((motivo) => (
                <li key={motivo}>{motivo}</li>
              ))}
            </ul>
          )}
          <div className={estilos.acoes}>
            <button type="button" className={estilos.secundario} onClick={aoFechar}>
              Cancelar
            </button>
            <button
              type="submit"
              className={estilos.primario}
              disabled={motivos.length > 0 || registrar.pendente}
              aria-describedby={motivos.length > 0 ? idMotivos : undefined}
            >
              {registrar.pendente
                ? "Registrando…"
                : tipo === "gasto"
                  ? "Registrar gasto"
                  : "Registrar ganho"}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}
