import { type PointerEvent, type ReactNode, useId, useState } from "react";

import { Icone } from "../Icone/Icone";

import estilos from "./Dica.module.css";

type Propriedades = {
  /** Sobre o que é a dica: vira o nome do botão ("Sobre {assunto}"). */
  assunto: string;
  children: ReactNode;
  /** Id do texto, para outro elemento apontar para ele com `aria-describedby`. */
  id?: string;
};

/**
 * Explicação curta de uma regra, num balão que abre por clique, toque ou teclado (toggletip).
 * O texto fica sempre no DOM, escondido, para o `aria-describedby` lê-lo mesmo fechado.
 */
export function Dica({ assunto, children, id }: Propriedades) {
  const idGerado = useId();
  const idDoTexto = id ?? idGerado;
  const [aberta, definirAberta] = useState(false);

  function aoEntrar(evento: PointerEvent) {
    if (evento.pointerType === "mouse") definirAberta(true);
  }

  function aoSair(evento: PointerEvent) {
    if (evento.pointerType === "mouse") definirAberta(false);
  }

  return (
    <span className={estilos.dica} data-dica="">
      <button
        type="button"
        className={estilos.botao}
        aria-label={`Sobre ${assunto}`}
        aria-expanded={aberta}
        aria-controls={idDoTexto}
        aria-describedby={idDoTexto}
        onClick={() => definirAberta((atual) => !atual)}
        onKeyDown={(evento) => {
          if (evento.key === "Escape") definirAberta(false);
        }}
        onBlur={() => definirAberta(false)}
        onPointerEnter={aoEntrar}
        onPointerLeave={aoSair}
      >
        <Icone nome="info" tamanho={16} />
      </button>
      <span id={idDoTexto} hidden={!aberta} className={estilos.balao}>
        {children}
      </span>
    </span>
  );
}
