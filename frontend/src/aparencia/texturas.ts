import type { TexturaDoFundo } from "../api/tipos";

/**
 * Cada textura é uma camada de `background` (imagem, posição e tamanho) feita só de gradientes
 * CSS, em branco com opacidade baixa: aparece sobre qualquer cor do fundo e sem arquivo de imagem.
 * O valor vai para `--textura-da-pagina`; `nenhuma` é `none`.
 */
const TRACO = "rgb(255 255 255 / 0.05)";

export const TEXTURAS: Readonly<Record<TexturaDoFundo, string>> = {
  nenhuma: "none",
  pontos: `radial-gradient(circle, ${TRACO} 1.5px, transparent 2px) 0 0 / 24px 24px`,
  linhas: `repeating-linear-gradient(135deg, ${TRACO} 0 1px, transparent 1px 14px) 0 0 / auto`,
  grade: `linear-gradient(${TRACO} 1px, transparent 1px) 0 0 / 32px 32px, linear-gradient(90deg, ${TRACO} 1px, transparent 1px) 0 0 / 32px 32px`,
  grao: `radial-gradient(circle, ${TRACO} 0.5px, transparent 1px) 0 0 / 3px 3px, radial-gradient(circle, ${TRACO} 0.5px, transparent 1px) 1px 2px / 5px 5px`,
};
