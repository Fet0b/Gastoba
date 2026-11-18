import type { ReactNode } from "react";

import estilos from "./Badge.module.css";

type Propriedades = {
  tom?: "neutro" | "positivo" | "negativo" | "atencao";
  icone?: ReactNode;
  children: ReactNode;
};

/** Selo informativo: não é clicável, não recebe foco. Para filtrar, use o Chip. */
export function Badge({ tom = "neutro", icone, children }: Propriedades) {
  return (
    <span className={estilos.badge} data-badge="" data-tom={tom}>
      {icone}
      {children}
    </span>
  );
}
