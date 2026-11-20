import { type CSSProperties, useId } from "react";

import type { SituacaoDaMeta } from "../../api/tipos";
import { arcosDoAnel } from "../../metas/arcosDoAnel";
import { prefereMenosMovimento } from "../movimento";

import { PadraoDoRachurado } from "./PadraoDoRachurado";
import estilos from "./AnelDeProgresso.module.css";

type Propriedades = {
  /** Nome acessível completo: "Lazer: 42% usado, R$ 423,00 de R$ 1.007,00". */
  rotulo: string;
  /** `percentual_usado` da API (pode passar de 100); nulo sem renda. */
  usado: number | null;
  /** Situação calculada pelo backend; `estourou` enche o anel e o pinta de alerta. */
  situacao: SituacaoDaMeta;
  tom?: "neutro" | "positivo" | "negativo" | "atencao";
  /** Cor da categoria, a mesma da bolinha do nome. */
  cor: string;
  idDaDescricao?: string;
  /** Atraso escalonado da animação de entrada. */
  indice?: number;
  /** Tamanho menor (Início). */
  compacto?: boolean;
  /**
   * `percentual_guardado` da API: o que foi guardado no mês para comprar depois, em pontos do
   * círculo. Vira um trecho rachurado logo depois do gasto, limitado ao que falta para fechar o anel.
   */
  rachurado?: number;
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
  tom,
  cor,
  idDaDescricao,
  indice = 0,
  compacto = false,
  rachurado: guardado = 0,
}: Propriedades) {
  const idDoPadrao = useId();
  // Sem renda não há razão a mostrar: o anel fica só com o trilho.
  const { gasto: arco, rachurado } = arcosDoAnel(usado, guardado, situacao);
  const animando = (arco > 0 || rachurado > 0) && !prefereMenosMovimento();
  const estilo = { "--cor-do-anel": cor, "--indice": indice } as CSSProperties;

  return (
    <div
      className={estilos.anel}
      role="img"
      aria-label={rotulo}
      aria-describedby={idDaDescricao}
      data-situacao={situacao}
      data-tom={tom}
      data-compacto={compacto ? "" : undefined}
      data-rachurado={rachurado > 0 ? rachurado : undefined}
      data-animando={animando ? "" : undefined}
      style={estilo}
    >
      <svg viewBox="0 0 36 36" className={estilos.svg} aria-hidden="true" focusable="false">
        {rachurado > 0 && (
          <defs>
            <PadraoDoRachurado id={idDoPadrao} />
          </defs>
        )}
        <circle data-trilha="" className={estilos.trilha} cx="18" cy="18" r="15.915" fill="none" />
        {rachurado > 0 && (
          // Antes do arco: a ponta redonda do gasto cobre o começo do trecho.
          <circle
            data-rachurado=""
            className={estilos.rachurado}
            cx="18"
            cy="18"
            r="15.915"
            fill="none"
            pathLength="100"
            stroke={`url(#${idDoPadrao})`}
            strokeDasharray={`${rachurado} 100`}
            strokeDashoffset={-arco}
            strokeLinecap="butt"
            transform="rotate(-90 18 18)"
          />
        )}
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
