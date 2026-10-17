import type { ReactNode } from "react";

import estilos from "./Cartao.module.css";

type Propriedades = {
  como?: "section" | "div" | "article" | "li";
  variante?: "padrao" | "elevado" | "destaque";
  className?: string;
  "aria-label"?: string;
  children: ReactNode;
};

/** Superfície em camadas: o bloco básico das telas. */
export function Cartao({
  como: Elemento = "section",
  variante = "padrao",
  className,
  children,
  ...resto
}: Propriedades) {
  return (
    <Elemento
      className={className ? `${estilos.cartao} ${className}` : estilos.cartao}
      data-variante={variante}
      {...resto}
    >
      {children}
    </Elemento>
  );
}
