import {
  type KeyboardEvent,
  type SyntheticEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import estilos from "./Chaves.module.css";

type Propriedades = {
  nome: string;
  /** O segredo da chave recém-criada; só existe enquanto este diálogo está aberto. */
  segredo: string;
  /** Fecha o diálogo; quem o abriu descarta o segredo. */
  aoFechar: () => void;
};

type ResultadoDaCopia = "copiado" | "falhou" | null;

/** A área de transferência, se o navegador a oferece (só em contexto seguro, como localhost). */
function areaDeTransferencia(): Clipboard | null {
  const clipboard = (navigator as Navigator & { clipboard?: Clipboard }).clipboard;
  return typeof clipboard?.writeText === "function" ? clipboard : null;
}

/**
 * O segredo de uma chave recém-criada, mostrado uma única vez num `<dialog>`
 * modal. "Copiar" usa a área de transferência; sem ela, o texto fica
 * selecionável (o foco nele já o seleciona) e o diálogo avisa. Fechar (botão,
 * Esc ou o `cancel` do diálogo) pede a quem abriu para descartar o segredo.
 * O segredo só aparece como texto: nunca em atributo, URL, log ou armazenamento.
 */
export function SegredoDaChave({ nome, segredo, aoFechar }: Propriedades) {
  const [resultado, definirResultado] = useState<ResultadoDaCopia>(null);
  const id = useId();
  const dialogo = useRef<HTMLDialogElement>(null);
  const botaoCopiar = useRef<HTMLButtonElement>(null);
  const texto = useRef<HTMLElement>(null);
  const area = areaDeTransferencia();

  // Abre como modal ao montar; ao desmontar fecha e devolve o foco a quem abriu.
  useLayoutEffect(() => {
    const elemento = dialogo.current;
    if (!elemento) return;
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!elemento.open) elemento.showModal();
    (botaoCopiar.current ?? texto.current)?.focus();
    return () => {
      if (elemento.open) elemento.close();
      if (anterior?.isConnected) anterior.focus();
    };
  }, []);

  async function copiar(): Promise<void> {
    if (!area) return;
    try {
      await area.writeText(segredo);
      definirResultado("copiado");
    } catch {
      definirResultado("falhou");
    }
  }

  function selecionarTudo(): void {
    if (texto.current) window.getSelection()?.selectAllChildren(texto.current);
  }

  function aoTeclar(evento: KeyboardEvent<HTMLDialogElement>): void {
    if (evento.key !== "Escape" || evento.defaultPrevented) return;
    evento.preventDefault();
    aoFechar();
  }

  function aoCancelar(evento: SyntheticEvent<HTMLDialogElement>): void {
    // O navegador fecharia o diálogo sozinho; quem fecha é a página.
    evento.preventDefault();
    aoFechar();
  }

  const idTitulo = `${id}-titulo`;
  const idExplicacao = `${id}-explicacao`;

  return (
    <dialog
      ref={dialogo}
      className={estilos.dialogo}
      aria-labelledby={idTitulo}
      aria-describedby={idExplicacao}
      onKeyDown={aoTeclar}
      onCancel={aoCancelar}
    >
      <div className={estilos.conteudoDoDialogo}>
        <h2 id={idTitulo} className={estilos.subtitulo}>
          Chave criada
        </h2>
        <p id={idExplicacao}>
          A chave {nome} foi criada. Copie o segredo agora: ele não será mostrado de novo.
        </p>

        <code
          ref={texto}
          className={estilos.segredo}
          tabIndex={0}
          onFocus={selecionarTudo}
        >
          {segredo}
        </code>

        {!area && (
          <p className={estilos.dica}>
            A área de transferência não está disponível aqui: selecione o segredo e copie à mão.
          </p>
        )}

        <p className={estilos.resultadoDaCopia} aria-live="polite">
          {resultado === "copiado" && "Segredo copiado."}
          {resultado === "falhou" && "Não foi possível copiar. Selecione o segredo e copie à mão."}
        </p>

        <div className={estilos.acoes}>
          {area && (
            <button
              ref={botaoCopiar}
              type="button"
              className={estilos.primario}
              onClick={() => void copiar()}
            >
              Copiar
            </button>
          )}
          <button type="button" className={estilos.secundario} onClick={aoFechar}>
            Fechar
          </button>
        </div>
      </div>
    </dialog>
  );
}
