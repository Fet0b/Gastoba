/** Cor em inteiros: matiz em graus, saturação e luminosidade em 0-100, canais de 0 a 255. */

export type Rgb = readonly [number, number, number];
export type Hsl = readonly [number, number, number];

const limitar = (valor: number, minimo: number, maximo: number): number =>
  Math.min(maximo, Math.max(minimo, valor));

export function hslParaRgb(matiz: number, saturacao: number, luminosidade: number): Rgb {
  const h = (((matiz % 360) + 360) % 360) / 60;
  const s = limitar(saturacao, 0, 100) / 100;
  const l = limitar(luminosidade, 0, 100) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const base: Rgb =
    h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [
    Math.round((base[0] + m) * 255),
    Math.round((base[1] + m) * 255),
    Math.round((base[2] + m) * 255),
  ];
}

export function rgbParaHsl([vermelho, verde, azul]: Rgb): Hsl {
  const r = vermelho / 255;
  const g = verde / 255;
  const b = azul / 255;
  const maior = Math.max(r, g, b);
  const menor = Math.min(r, g, b);
  const l = (maior + menor) / 2;
  const d = maior - menor;
  let matiz = 0;
  if (d !== 0) {
    if (maior === r) matiz = ((g - b) / d + 6) % 6;
    else if (maior === g) matiz = (b - r) / d + 2;
    else matiz = (r - g) / d + 4;
    matiz *= 60;
  }
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return [matiz, s * 100, l * 100];
}

export function hex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((canal) => canal.toString(16).padStart(2, "0")).join("")}`;
}

export function deHex(texto: string): Rgb {
  const n = (i: number) => Number.parseInt(texto.slice(i, i + 2), 16);
  return [n(1), n(3), n(5)];
}

function canalLinear(canal: number): number {
  const c = canal / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminancia([r, g, b]: Rgb): number {
  return 0.2126 * canalLinear(r) + 0.7152 * canalLinear(g) + 0.0722 * canalLinear(b);
}

/** Razão de contraste da WCAG entre duas cores opacas (de 1 a 21). */
export function contraste(a: Rgb, b: Rgb): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** A cor `frente` com opacidade `alfa` (0 a 1) sobre `fundo`, como o navegador a compõe. */
export function sobrepor(frente: Rgb, alfa: number, fundo: Rgb): Rgb {
  return [
    Math.round(frente[0] * alfa + fundo[0] * (1 - alfa)),
    Math.round(frente[1] * alfa + fundo[1] * (1 - alfa)),
    Math.round(frente[2] * alfa + fundo[2] * (1 - alfa)),
  ];
}

/** Texto CSS `rgb(r g b / alfa)`, no formato usado em `tokens.css`. */
export function comAlfa([r, g, b]: Rgb, alfa: number): string {
  return `rgb(${r} ${g} ${b} / ${alfa})`;
}
