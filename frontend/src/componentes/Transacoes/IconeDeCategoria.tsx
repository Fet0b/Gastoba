import type { CSSProperties } from "react";

import { corDaCategoria } from "../../categorias/cores";
import { Icone, type NomeDoIcone } from "../Icone/Icone";
import estilos from "./Transacoes.module.css";

const ICONES_DAS_CATEGORIAS: Readonly<Record<string, NomeDoIcone>> = {
  investimentos: "investimentos",
  lazer: "lazer",
  conhecimento: "conhecimento",
  conforto: "conforto",
  gasto_fixo: "gasto_fixo",
};

type Propriedades = {
  /** Código da categoria do gasto; `null` é uma entrada (o ganho não tem categoria). */
  categoria: string | null;
  tamanho?: number;
};

/**
 * O círculo com o ícone da categoria, na cor dela, ou o ícone de entrada. É decorativo:
 * quem o usa mostra o nome da categoria em texto ao lado (a cor nunca está sozinha).
 */
export function IconeDeCategoria({ categoria, tamanho = 18 }: Propriedades) {
  if (categoria === null) {
    return (
      <span className={estilos.icone} data-sentido="entrada">
        <Icone nome="entrada" tamanho={tamanho} />
      </span>
    );
  }
  const nome = Object.hasOwn(ICONES_DAS_CATEGORIAS, categoria)
    ? ICONES_DAS_CATEGORIAS[categoria]
    : "outros";
  return (
    <span
      className={estilos.icone}
      data-categoria={categoria}
      style={{ "--cor-da-categoria": corDaCategoria(categoria) } as CSSProperties}
    >
      <Icone nome={nome} tamanho={tamanho} />
    </span>
  );
}
