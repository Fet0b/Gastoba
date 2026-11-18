import type { CSSProperties } from "react";

import type { SituacaoDaMeta } from "../../api/tipos";
import { prefereMenosMovimento } from "../movimento";

import estilos from "./AnelDeProgresso.module.css";

type Propriedades = {
  /** Nome acessível completo: "Lazer: 42% usado, R$ 423,00 de R$ 1.007,00". */
  rotulo: string;
  /** `percentual_usado` da API (pode passar de 100); nulo sem renda. */
  usado: number | null;
  /** Situação calculada pelo backend; `estourou` enche o anel e o pinta de alerta. */
  situacao: SituacaoDaMeta;
  /** Cor da categoria, a mesma da bolinha do nome. */
  cor: string;
  idDaDescricao?: string;
  /** Atraso escalonado da animação de entrada. */
  indice?: number;
  /** Tamanho menor (Início). */
  compacto?: boolean;
};

/**
 * O uso de uma meta como um anel pequeno: trilho neutro sempre visível, arco na cor da
 * categoria (limitado a 100%; vermelho e cheio ao estourar) e a porcentagem usada no centro.
 * A situação em texto fica fora dele, na linha da meta.
 */
export function AnelDeProgresso({
  rotulo,
  usado,
  situacao,
  cor,
  idDaDescricao,
  indice = 0,
  compacto = false,
}: Propriedades) {
  // Sem renda não há razão a mostrar: o anel fica só com o trilho.
  const arco = situacao === "sem_renda" ? 0 : Math.min(Math.max(usado ?? 0, 0), 100);
  const animando = arco > 0 && !prefereMenosMovimento();
  const estilo = { "--cor-do-anel": cor, "--indice": indice } as CSSProperties;

  return (
    <div
      className={estilos.anel}
      role="img"
      aria-label={rotulo}
      aria-describedby={idDaDescricao}
      data-situacao={situacao}
      data-compacto={compacto ? "" : undefined}
      data-animando={animando ? "" : undefined}
      style={estilo}
    >
      <svg viewBox="0 0 36 36" className={estilos.svg} aria-hidden="true" focusable="false">
        <circle data-trilha="" className={estilos.trilha} cx="18" cy="18" r="15.915" fill="none" />
        <circle
          data-arco=""
          className={estilos.arco}
          cx="18"
          cy="18"
          r="15.915"
          fill="none"
          pathLength="100"
          strokeDasharray={`${arco} 100`}
          // Com arco zero, a ponta redonda desenharia um ponto: a ponta reta não desenha nada.
          strokeLinecap={arco === 0 ? "butt" : "round"}
          transform="rotate(-90 18 18)"
        />
      </svg>
      <span className={estilos.centro} data-centro="" aria-hidden="true">
        {usado === null ? "–" : `${usado}%`}
      </span>
    </div>
  );
}
