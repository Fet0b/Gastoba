import type { ProgressoDaMeta, SituacaoDaMeta } from "../../api/tipos";
import { corDaCategoria } from "../../categorias/cores";
import { deCentavos, formatar, paraCentavos } from "../../dinheiro/dinheiro";
import { prefereMenosMovimento } from "../movimento";
import estilos from "./Metas.module.css";

type Propriedades = {
  progresso: ProgressoDaMeta;
  /** Nome da categoria; o próprio código quando ela é desconhecida. */
  nomeDaCategoria: string;
};

/** O ícone de cada situação: a cor nunca é a única pista, sempre há texto e símbolo. */
const ICONES: Readonly<Record<SituacaoDaMeta, string>> = {
  dentro: "✓",
  alerta: "!",
  estourou: "✕",
  sem_renda: "–",
};

/** O texto da situação, com o quanto sobra ou o quanto passou. */
export function textoDaSituacao(progresso: ProgressoDaMeta): string {
  const restante = formatar(progresso.restante);
  switch (progresso.situacao) {
    case "dentro":
      return `Dentro da meta · restam ${restante}`;
    case "alerta":
      return `Perto do limite · restam ${restante}`;
    case "estourou":
      return `Estourou em ${formatar(deCentavos(-paraCentavos(progresso.restante)))}`;
    case "sem_renda":
      return "Sem renda neste mês";
  }
}

/**
 * A meta de uma categoria no mês como um anel de progresso: o percentual usado no
 * centro, o arco (limitado a 100%; vazio sem renda) na cor da situação, o nome com
 * o percentual da renda e a situação em texto e símbolo. O estado fica em
 * `data-situacao`, que o CSS usa para a cor.
 */
export function Medidor({ progresso, nomeDaCategoria }: Propriedades) {
  const usado = progresso.percentual_usado;
  const largura = Math.min(usado ?? 100, 100);
  // Sem renda não há razão a mostrar: o anel fica vazio, e o aria-valuenow segue o de sempre.
  const arco = progresso.situacao === "sem_renda" ? 0 : largura;
  const valores = `${formatar(progresso.gasto)} de ${formatar(progresso.limite)}`;
  const valorTexto = `${valores}${usado === null ? "" : `, ${usado}%`}`;

  // `data-animando` só existe com movimento permitido e algo a encher; o CSS também
  // desliga tudo em prefers-reduced-motion. `data-pulso` pede atenção (alerta e estourou).
  const animando = arco > 0 && !prefereMenosMovimento();
  const pulsa = progresso.situacao === "alerta" || progresso.situacao === "estourou";

  return (
    <div
      className={estilos.medidor}
      data-situacao={progresso.situacao}
      data-animando={animando ? "" : undefined}
      data-pulso={pulsa ? "" : undefined}
    >
      <div
        className={estilos.anel}
        role="progressbar"
        aria-label={`Meta de ${nomeDaCategoria}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={largura}
        aria-valuetext={valorTexto}
      >
        <svg viewBox="0 0 36 36" className={estilos.anelSvg} aria-hidden="true" focusable="false">
          <circle className={estilos.trilhaDoAnel} cx="18" cy="18" r="15.915" fill="none" />
          <circle
            data-arco=""
            className={estilos.arcoDoAnel}
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
        <span className={estilos.centroDoAnel} data-centro="">
          {usado === null ? "\u2013" : `${usado}%`}
        </span>
      </div>
      <div className={estilos.identificacao}>
        <span className={estilos.nomeDaCategoria}>
          <span
            className={estilos.ponto}
            style={{ backgroundColor: corDaCategoria(progresso.categoria) }}
            aria-hidden="true"
          />
          {nomeDaCategoria}
        </span>
        <span className={estilos.percentualDaMeta}>{progresso.percentual}% da renda</span>
      </div>
      <p className={estilos.situacao} data-situacao-texto="">
        <span className={estilos.icone} aria-hidden="true">
          {ICONES[progresso.situacao]}
        </span>
        {textoDaSituacao(progresso)}
      </p>
      <p className={estilos.valores} data-valores="">
        {valores}
      </p>
    </div>
  );
}
