import { type CSSProperties, useId } from "react";

import { PadraoDoRachurado } from "./PadraoDoRachurado";
import estilos from "./AnelDeProgresso.module.css";

/** A amostra do trecho rachurado, no tamanho de um ícone, ao lado do texto que o explica. */
export function AmostraDoRachurado({ cor }: { cor: string }) {
  const id = useId();
  return (
    <svg
      className={estilos.amostra}
      viewBox="0 0 8 8"
      aria-hidden="true"
      focusable="false"
      data-amostra-do-rachurado=""
      style={{ color: cor } as CSSProperties}
    >
      <defs>
        <PadraoDoRachurado id={id} />
      </defs>
      <rect width="8" height="8" rx="1.6" fill={`url(#${id})`} />
    </svg>
  );
}
