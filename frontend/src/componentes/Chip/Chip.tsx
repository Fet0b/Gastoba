import type { ReactNode, Ref } from "react";

import { Icone } from "../Icone/Icone";

import estilos from "./Chip.module.css";

type Propriedades = {
  selecionado: boolean;
  aoAlternar: () => void;
  /** Cor da bolinha à esquerda (categoria ou destinação). */
  cor?: string;
  /** Pequeno: dentro de linhas de lista (a transação), onde o chip padrão ficaria alto demais. */
  tamanho?: "pequeno";
  children: ReactNode;
  "aria-label"?: string;
  ref?: Ref<HTMLButtonElement>;
};

/** Filtro ou opção alternável: selecionado fica preenchido e ganha um ✓ (nunca só a cor). */
export function Chip({ selecionado, aoAlternar, cor, tamanho, children, ref, ...resto }: Propriedades) {
  return (
    <button
      {...resto}
      ref={ref}
      type="button"
      className={estilos.chip}
      data-chip=""
      data-tamanho={tamanho}
      aria-pressed={selecionado}
      onClick={aoAlternar}
    >
      {cor !== undefined && (
        <span className={estilos.ponto} data-ponto="" style={{ backgroundColor: cor }} aria-hidden="true" />
      )}
      {selecionado && <Icone nome="verificado" tamanho={14} />}
      {children}
    </button>
  );
}
