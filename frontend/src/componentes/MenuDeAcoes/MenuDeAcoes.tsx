import { type KeyboardEvent, type Ref, useEffect, useId, useRef, useState } from "react";

import { Icone } from "../Icone/Icone";

import estilos from "./MenuDeAcoes.module.css";

export type ItemDoMenu = {
  /** Texto visível. */
  rotulo: string;
  /** `aria-label` do item, para preservar nomes acessíveis como "Excluir o ganho Salário". */
  nomeAcessivel?: string;
  destrutivo?: boolean;
  desabilitado?: boolean;
  aoEscolher: () => void;
};

type Propriedades = {
  /** Nome do gatilho: "Mais ações da conta" (nunca só "Mais"). */
  rotulo: string;
  itens: readonly ItemDoMenu[];
  ref?: Ref<HTMLButtonElement>;
  alinhamento?: "fim" | "inicio";
};

/**
 * Menu "⋯" de ações (padrão Menu Button do WAI-ARIA): setas, Home/End, Esc devolve o foco ao
 * gatilho, Tab e clique fora fecham. Escolher um item fecha e devolve o foco ao gatilho antes de
 * chamar a ação, para que um diálogo aberto por ela possa tomar o foco.
 */
export function MenuDeAcoes({ rotulo, itens, ref, alinhamento = "fim" }: Propriedades) {
  const idDaLista = useId();
  const [aberto, definirAberto] = useState(false);
  const [focoInicial, definirFocoInicial] = useState<"primeiro" | "ultimo">("primeiro");
  const gatilho = useRef<HTMLButtonElement | null>(null);
  const raiz = useRef<HTMLSpanElement | null>(null);
  const itensNoDom = useRef<Array<HTMLButtonElement | null>>([]);

  function habilitados(): HTMLButtonElement[] {
    return itensNoDom.current.filter(
      (item): item is HTMLButtonElement => item !== null && !item.disabled,
    );
  }

  useEffect(() => {
    if (!aberto) return;
    const lista = habilitados();
    (focoInicial === "primeiro" ? lista[0] : lista[lista.length - 1])?.focus();
  }, [aberto, focoInicial]);

  useEffect(() => {
    if (!aberto) return;
    function aoApertarFora(evento: PointerEvent) {
      if (!raiz.current?.contains(evento.target as Node)) definirAberto(false);
    }
    document.addEventListener("pointerdown", aoApertarFora);
    return () => document.removeEventListener("pointerdown", aoApertarFora);
  }, [aberto]);

  if (itens.length === 0) return null;

  function abrir(foco: "primeiro" | "ultimo") {
    definirFocoInicial(foco);
    definirAberto(true);
  }

  function aoTeclarNoGatilho(evento: KeyboardEvent<HTMLButtonElement>) {
    if (evento.key === "ArrowDown" || evento.key === "Enter" || evento.key === " ") {
      evento.preventDefault();
      abrir("primeiro");
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      abrir("ultimo");
    }
  }

  function aoTeclarNoMenu(evento: KeyboardEvent<HTMLUListElement>) {
    const lista = habilitados();
    const atual = lista.indexOf(document.activeElement as HTMLButtonElement);
    const focar = (indice: number) => {
      evento.preventDefault();
      lista[(indice + lista.length) % lista.length]?.focus();
    };
    switch (evento.key) {
      case "ArrowDown":
        focar(atual + 1);
        break;
      case "ArrowUp":
        focar(atual - 1);
        break;
      case "Home":
        focar(0);
        break;
      case "End":
        focar(lista.length - 1);
        break;
      case "Escape":
        evento.preventDefault();
        gatilho.current?.focus();
        definirAberto(false);
        break;
      case "Tab":
        // O foco volta ao gatilho e o Tab segue dali para o próximo elemento.
        gatilho.current?.focus();
        definirAberto(false);
        break;
    }
  }

  function escolher(item: ItemDoMenu) {
    if (item.desabilitado) return;
    gatilho.current?.focus();
    definirAberto(false);
    item.aoEscolher();
  }

  function guardarGatilho(elemento: HTMLButtonElement | null) {
    gatilho.current = elemento;
    if (typeof ref === "function") ref(elemento);
    else if (ref) ref.current = elemento;
  }

  return (
    <span className={estilos.menu} data-alinhamento={alinhamento} ref={raiz}>
      <button
        type="button"
        ref={guardarGatilho}
        className={estilos.gatilho}
        aria-label={rotulo}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={idDaLista}
        data-menu-de-acoes=""
        onClick={() => (aberto ? definirAberto(false) : abrir("primeiro"))}
        onKeyDown={aoTeclarNoGatilho}
      >
        <Icone nome="mais" tamanho={20} />
      </button>
      {aberto && (
        <ul id={idDaLista} role="menu" aria-label={rotulo} className={estilos.lista} onKeyDown={aoTeclarNoMenu}>
          {itens.map((item, indice) => (
            <li key={item.rotulo} role="none">
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                ref={(elemento) => {
                  itensNoDom.current[indice] = elemento;
                }}
                className={estilos.item}
                aria-label={item.nomeAcessivel}
                disabled={item.desabilitado}
                data-destrutivo={item.destrutivo ? "" : undefined}
                onClick={() => escolher(item)}
              >
                {item.rotulo}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
