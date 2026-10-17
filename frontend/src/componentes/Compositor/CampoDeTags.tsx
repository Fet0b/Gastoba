import { type KeyboardEvent, type Ref, useCallback, useId, useRef, useState } from "react";

import {
  LIMITE_DE_TAGS,
  normalizarTag,
  TAMANHO_MAXIMO_DA_TAG,
  validarTag,
} from "../../tags/tags";
import estilos from "./CampoDeTags.module.css";

type Propriedades = {
  /** Tags escolhidas, já normalizadas. */
  tags: readonly string[];
  aoMudar: (tags: string[]) => void;
  /** Tags já usadas em outros gastos (GET /tags), oferecidas enquanto se digita. */
  sugestoes: readonly string[];
  /** Mensagem de erro vinda de fora (ex.: a API recusou uma tag). */
  erro?: string;
  /** Texto digitado que ainda não virou tag (o formulário não envia com ele pendente). */
  aoMudarTexto?: (texto: string) => void;
  ref?: Ref<HTMLInputElement>;
};

const AVISO_DE_LIMITE = `No máximo ${LIMITE_DE_TAGS} tags por gasto.`;

/** Texto da tag sendo digitada passa do tamanho máximo? */
function excedeTamanho(texto: string): boolean {
  return [...normalizarTag(texto)].length > TAMANHO_MAXIMO_DA_TAG;
}

/**
 * Campo de tags em chips, no padrão ARIA 1.2 de combobox com lista: Enter ou
 * vírgula criam a tag (ou escolhem a sugestão destacada), setas navegam pelas
 * sugestões, Backspace com o campo vazio remove a última e Escape fecha as
 * sugestões. Enter com o campo vazio não é interceptado, para o formulário
 * em volta ser enviado. As tags seguem as regras do backend: normalizadas, sem
 * repetição, de 1 a 30 caracteres e no máximo 10.
 */
export function CampoDeTags({ tags, aoMudar, sugestoes, erro, aoMudarTexto, ref }: Propriedades) {
  const [texto, definirTextoInterno] = useState("");
  const [aberta, definirAberta] = useState(false);
  const [ativa, definirAtiva] = useState(-1);
  const [avisoDaTentativa, definirAvisoDaTentativa] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement | null>(null);
  const id = useId();

  const idEntrada = `${id}-entrada`;
  const idLista = `${id}-lista`;
  const idDica = `${id}-dica`;
  const idAviso = `${id}-aviso`;
  const idErro = `${id}-erro`;
  const idOpcao = (indice: number) => `${id}-opcao-${indice}`;

  const busca = normalizarTag(texto);
  const filtradas = sugestoes.filter(
    (sugestao) => !tags.includes(sugestao) && (busca === "" || sugestao.includes(busca)),
  );
  const expandida = aberta && filtradas.length > 0;
  const indiceAtivo = expandida && ativa < filtradas.length ? ativa : -1;
  const aviso =
    avisoDaTentativa ??
    (excedeTamanho(texto) ? `A tag deve ter de 1 a ${TAMANHO_MAXIMO_DA_TAG} caracteres.` : null);

  function definirTexto(valor: string): void {
    definirTextoInterno(valor);
    aoMudarTexto?.(valor);
  }

  function fecharLista(): void {
    definirAberta(false);
    definirAtiva(-1);
  }

  /**
   * Acrescenta as tags (textos crus) às já escolhidas, na ordem. Vazias e
   * repetidas são ignoradas; na primeira recusada, para e devolve o aviso dela e
   * os textos que não entraram (a recusada e as seguintes).
   */
  function acrescentar(textos: readonly string[]): {
    novas: string[];
    aviso: string | null;
    restantes: string[];
  } {
    const novas = [...tags];
    for (const [indice, cru] of textos.entries()) {
      const tag = normalizarTag(cru);
      if (tag === "" || novas.includes(tag)) continue;
      const problema = validarTag(tag) ?? (novas.length >= LIMITE_DE_TAGS ? AVISO_DE_LIMITE : null);
      if (problema) return { novas, aviso: problema, restantes: textos.slice(indice) };
      novas.push(tag);
    }
    return { novas, aviso: null, restantes: [] };
  }

  /**
   * Cria as tags dos textos; o que foi recusado continua no campo (com as
   * vírgulas entre as partes), junto com `resto`, e o aviso diz por quê.
   */
  function escolher(textos: readonly string[], resto: string[] = []): void {
    const { novas, aviso: problema, restantes } = acrescentar(textos);
    if (novas.length !== tags.length) aoMudar(novas);
    definirAvisoDaTentativa(problema);
    definirTexto([...restantes, ...resto].join(","));
  }

  function aoDigitar(valor: string): void {
    definirAvisoDaTentativa(null);
    definirAtiva(-1);
    definirAberta(true);
    if (!valor.includes(",")) {
      definirTexto(valor);
      return;
    }
    // Texto colado com vírgulas: cada parte antes da última vira uma tag.
    const partes = valor.split(",");
    const ultima = partes.pop() ?? "";
    escolher(partes, [ultima]);
  }

  function mover(passo: 1 | -1): void {
    const total = filtradas.length;
    if (total === 0) return;
    definirAberta(true);
    if (indiceAtivo === -1) definirAtiva(passo === 1 ? 0 : total - 1);
    else definirAtiva((indiceAtivo + passo + total) % total);
  }

  function aoTeclar(evento: KeyboardEvent<HTMLInputElement>): void {
    if (evento.nativeEvent.isComposing) return;
    switch (evento.key) {
      case "ArrowDown":
      case "ArrowUp":
        evento.preventDefault();
        mover(evento.key === "ArrowDown" ? 1 : -1);
        return;
      case "Enter":
      case ",":
        // Com o campo vazio e nada destacado, Enter segue para o formulário (envio).
        if (evento.key === "Enter" && texto === "" && indiceAtivo < 0) return;
        evento.preventDefault();
        if (indiceAtivo >= 0) escolher([filtradas[indiceAtivo]]);
        else escolher(texto.split(","));
        fecharLista();
        return;
      case "Backspace":
        if (texto === "" && tags.length > 0) {
          aoMudar(tags.slice(0, -1));
          definirAvisoDaTentativa(null);
        }
        return;
      case "Escape":
        if (expandida) {
          // Fecha só as sugestões; o diálogo em volta não deve fechar.
          evento.preventDefault();
          evento.stopPropagation();
          fecharLista();
        }
        return;
    }
  }

  function remover(tag: string): void {
    aoMudar(tags.filter((escolhida) => escolhida !== tag));
    definirAvisoDaTentativa(null);
    entrada.current?.focus();
  }

  // A ref interna (foco depois de remover) e a de fora, numa só.
  const ligarReferencias = useCallback(
    (elemento: HTMLInputElement | null): void => {
      entrada.current = elemento;
      if (typeof ref === "function") ref(elemento);
      else if (ref) ref.current = elemento;
    },
    [ref],
  );

  const descritores = [idDica, aviso ? idAviso : null, erro ? idErro : null].filter(Boolean);

  return (
    <div className={estilos.campo}>
      <label htmlFor={idEntrada} className={estilos.rotulo}>
        Tags
      </label>

      <div className={estilos.moldura} data-invalido={erro || aviso ? true : undefined}>
        {tags.length > 0 && (
          <ul className={estilos.chips} aria-label="Tags escolhidas">
            {tags.map((tag) => (
              <li key={tag} className={estilos.chip}>
                <span>{tag}</span>
                <button
                  type="button"
                  className={estilos.remover}
                  aria-label={`Remover tag ${tag}`}
                  onClick={() => remover(tag)}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <input
          ref={ligarReferencias}
          id={idEntrada}
          className={estilos.entrada}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expandida}
          aria-controls={idLista}
          aria-activedescendant={indiceAtivo >= 0 ? idOpcao(indiceAtivo) : undefined}
          aria-invalid={erro ? true : undefined}
          aria-describedby={descritores.join(" ")}
          value={texto}
          onChange={(evento) => aoDigitar(evento.target.value)}
          onKeyDown={aoTeclar}
          onBlur={fecharLista}
          autoComplete="off"
          spellCheck={false}
          placeholder={tags.length === 0 ? "pix, mercado…" : undefined}
        />
      </div>

      <ul id={idLista} role="listbox" aria-label="Sugestões de tags" className={estilos.lista} hidden={!expandida}>
        {expandida &&
          filtradas.map((sugestao, indice) => (
            <li
              key={sugestao}
              id={idOpcao(indice)}
              role="option"
              aria-selected={indice === indiceAtivo}
              className={estilos.opcao}
              // Sem tirar o foco do campo ao clicar.
              onMouseDown={(evento) => evento.preventDefault()}
              onClick={() => {
                escolher([sugestao]);
                fecharLista();
              }}
            >
              {sugestao}
            </li>
          ))}
      </ul>

      <p id={idDica} className={estilos.dica}>
        Enter ou vírgula adiciona a tag.
      </p>
      <p id={idAviso} className={estilos.aviso} aria-live="polite">
        {aviso}
      </p>
      {erro && (
        <p id={idErro} className={estilos.erro}>
          {erro}
        </p>
      )}
    </div>
  );
}
