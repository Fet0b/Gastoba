import type { ButtonHTMLAttributes, Ref } from "react";

import { Icone, type NomeDoIcone } from "../Icone/Icone";

import estilos from "./Botao.module.css";

export type VarianteDoBotao = "primario" | "secundario" | "terciario" | "destrutivo";

type Propriedades = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variante: VarianteDoBotao;
  /** Ícone opcional antes do texto (decorativo). */
  icone?: NomeDoIcone;
  /** Seta "→" depois do texto, para terciário de navegação. */
  seta?: boolean;
  /** Para encaixe em layout (largura, alinhamento); nunca para mudar cor. */
  className?: string;
  ref?: Ref<HTMLButtonElement>;
};

// `data-papel` continua existindo para os testes de ponta a ponta que já o usam.
const PAPEL_DA_VARIANTE: Readonly<Record<VarianteDoBotao, string>> = {
  primario: "principal",
  secundario: "secundaria",
  terciario: "terciaria",
  destrutivo: "destrutiva",
};

/** O botão de ação do app, em quatro níveis: primário, secundário, terciário e destrutivo. */
export function Botao({
  variante,
  icone,
  seta = false,
  className,
  type = "button",
  ref,
  children,
  ...resto
}: Propriedades) {
  return (
    <button
      {...resto}
      ref={ref}
      type={type}
      className={className ? `${estilos.botao} ${className}` : estilos.botao}
      data-variante={variante}
      data-papel={PAPEL_DA_VARIANTE[variante]}
    >
      {icone !== undefined && <Icone nome={icone} tamanho={18} />}
      {children}
      {seta && (
        <span data-seta="" aria-hidden="true">
          {"→"}
        </span>
      )}
    </button>
  );
}
