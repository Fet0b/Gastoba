import { Icone } from "../Icone/Icone";

import estilos from "./Destaque.module.css";

type Tom = "neutro" | "positivo" | "negativo";

type Propriedades = {
  rotulo: string;
  /** Valor já formatado (quem chama formata o dinheiro). */
  valor: string;
  tom?: Tom;
};

const PALAVRA_DO_TOM = { positivo: "Positivo", negativo: "Negativo" } as const;

/** Rótulo e número grande, com algarismos proporcionais. O tom sempre vem com ícone e palavra. */
export function Destaque({ rotulo, valor, tom = "neutro" }: Propriedades) {
  const nome =
    tom === "neutro"
      ? `${rotulo}: ${valor}`
      : `${rotulo}: ${valor}, ${PALAVRA_DO_TOM[tom].toLowerCase()}`;
  return (
    <div className={estilos.destaque} data-tom={tom} role="group" aria-label={nome}>
      <span className={estilos.rotulo}>{rotulo}</span>
      <span className={estilos.valor}>{valor}</span>
      {tom !== "neutro" && (
        <span className={estilos.tom}>
          <Icone nome={tom === "positivo" ? "entrada" : "saida"} tamanho={16} />
          {PALAVRA_DO_TOM[tom]}
        </span>
      )}
    </div>
  );
}
