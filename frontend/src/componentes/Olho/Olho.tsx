import { type Ref, useId } from "react";

import estilos from "./Olho.module.css";

export type EstadoDoOlho = "normal" | "confirmando" | "erro";

type Propriedades = {
  /** `confirmando` gira as marcas uma volta; `erro` pisca o olho uma vez. */
  estado?: EstadoDoOlho;
  /** No cabeçalho o nome "Gastoba" já é anunciado: o olho fica `aria-hidden`. */
  decorativo?: boolean;
  className?: string;
  /** O `<svg>`, para `useSeguirCursor` escrever `--olho-x`/`--olho-y` nele. */
  ref?: Ref<SVGSVGElement>;
};

/**
 * A logo do Gastoba: um olho original (íris violeta, três marcas em vírgula
 * e a pupila em forma de moeda) que observa os gastos.
 */
export function Olho({ estado = "normal", decorativo = false, className, ref }: Propriedades) {
  // Ids únicos por instância: dois olhos na tela não disputam o mesmo gradiente.
  const base = useId();
  const idIris = `${base}-iris`;
  const idMarca = `${base}-marca`;
  const idGlobo = `${base}-globo`;

  const acessibilidade = decorativo
    ? ({ "aria-hidden": true } as const)
    : ({ role: "img", "aria-label": "Gastoba" } as const);

  return (
    <svg
      ref={ref}
      viewBox="-32 -32 64 64"
      xmlns="http://www.w3.org/2000/svg"
      className={className ? `${estilos.olho} ${className}` : estilos.olho}
      data-estado={estado}
      focusable="false"
      {...acessibilidade}
    >
      <defs>
        <radialGradient id={idIris} r="1">
          <stop offset="0" stopColor="#C9B8FF" />
          <stop offset=".55" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#3B1F8F" />
        </radialGradient>
        <path id={idMarca} d="M0,-18 a5,5 0 1 1 -4,8 c3,-1 4,-4 4,-8z" />
        <clipPath id={idGlobo}>
          <circle r="29" />
        </clipPath>
      </defs>

      <circle r="30" fill="#171024" />

      <g clipPath={`url(#${idGlobo})`}>
        <g className={estilos.olhar}>
          <circle r="24" fill={`url(#${idIris})`} />
          <g className={estilos.giro}>
            <g className={estilos.marcas} fill="#0C0814">
              <use href={`#${idMarca}`} />
              <use href={`#${idMarca}`} transform="rotate(120)" />
              <use href={`#${idMarca}`} transform="rotate(240)" />
            </g>
          </g>
          <g className={estilos.pupila}>
            <circle r="7" fill="#0C0814" />
            <path d="M-1.2,-7 h2.4 v5 h-2.4z" fill="#8B5CF6" />
          </g>
        </g>
        <g className={estilos.piscada}>
          <rect className={estilos.palpebra} x="-32" y="-32" width="64" height="64" fill="#171024" />
        </g>
      </g>

      <circle r="30" fill="none" stroke="#8B5CF6" strokeWidth="2" />
    </svg>
  );
}
