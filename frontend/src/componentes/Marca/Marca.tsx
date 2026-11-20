import type { Ref } from "react";

import type { MarcaDoApp } from "../../api/tipos";
import { Icone } from "../Icone/Icone";
import { type EstadoDoOlho, Olho } from "../Olho/Olho";
import estilos from "./Marca.module.css";

type Propriedades = {
  marca: MarcaDoApp;
  /** O nome do app: dá a letra da marca `inicial` e o nome acessível quando não é decorativa. */
  nome: string;
  estadoDoOlho?: EstadoDoOlho;
  decorativo?: boolean;
  className?: string;
  /** O `<svg>` do olho, para `useSeguirCursor`; as outras marcas não o usam. */
  refDoOlho?: Ref<SVGSVGElement>;
};

/** Primeira letra do nome, em maiúscula; "?" se não houver. */
export function inicialDe(nome: string): string {
  const primeira = Array.from(nome.trim())[0];
  return primeira === undefined ? "?" : primeira.toLocaleUpperCase("pt-BR");
}

/**
 * A logo do app, de um conjunto fixo (Art. XI.9.5): o olho (que reage ao estado e ao cursor) ou um
 * desenho do `Icone` ou a inicial do nome, num círculo nas cores do tema. Não há envio de arquivo.
 */
export function Marca({
  marca,
  nome,
  estadoDoOlho = "normal",
  decorativo = false,
  className,
  refDoOlho,
}: Propriedades) {
  if (marca === "olho") {
    return <Olho ref={refDoOlho} decorativo={decorativo} estado={estadoDoOlho} className={className} />;
  }
  const acessibilidade = decorativo
    ? ({ "aria-hidden": true } as const)
    : ({ role: "img", "aria-label": nome } as const);
  return (
    <span
      className={className ? `${estilos.marca} ${className}` : estilos.marca}
      data-marca={marca}
      {...acessibilidade}
    >
      {marca === "inicial" ? (
        <span className={estilos.inicial} aria-hidden="true">
          {inicialDe(nome)}
        </span>
      ) : (
        <Icone nome={marca} tamanho={24} />
      )}
    </span>
  );
}
