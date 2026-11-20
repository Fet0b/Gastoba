import type { IntensidadeDaCor } from "../api/tipos";
import {
  type Hsl,
  type Rgb,
  comAlfa,
  contraste,
  deHex,
  hex,
  hslParaRgb,
  rgbParaHsl,
  sobrepor,
} from "./cor";

export type Paleta = Readonly<Record<string, string>>;

/** O roxo atual do app: `rgbParaHsl(#8b5cf6)` dá matiz 258. É o ponto de partida de toda paleta. */
export const MATIZ_PADRAO = 258;

/** Os valores de `tokens.css` hoje. A paleta de cada matiz é o deslocamento destes pontos. */
const BASE = {
  noite: "#0c0814",
  ameixa: "#171024",
  veludo: "#241a38",
  ametista: "#8b5cf6",
  ametistaHover: "#976cf7",
  lavanda: "#c9b8ff",
  nevoa: "#eee9fb",
  bruma: "#9a8fb8",
} as const;

/** Multiplicador da saturação de cada intensidade; `media` é o padrão do app. */
const FATOR_DE_SATURACAO: Readonly<Record<IntensidadeDaCor, number>> = {
  suave: 0.5,
  media: 1,
  viva: 1.3,
};

/** Cores semânticas fixas de `tokens.css` (positivo, brasa, alerta); só entram nas conferências. */
const SEMANTICAS: readonly Rgb[] = [deHex("#4ade80"), deHex("#ff7a90"), deHex("#f0b429")];

/** Alfa das superfícies tonais, as mesmas de `tokens.css`. */
const ALFA = { tonal: 0.18, tonalHover: 0.26, badge: 0.12, borda: 0.08 } as const;

export type ParDeContraste = {
  frente: string;
  fundo: string;
  minimo: number;
};

/** Os pares da tabela do plano 065 §6.1 (nomes das chaves de `BASE`). Os semânticos ficam no teste. */
export const PARES_EXIGIDOS: readonly ParDeContraste[] = [
  { frente: "nevoa", fundo: "noite", minimo: 4.5 },
  { frente: "nevoa", fundo: "ameixa", minimo: 4.5 },
  { frente: "nevoa", fundo: "veludo", minimo: 4.5 },
  { frente: "bruma", fundo: "noite", minimo: 4.5 },
  { frente: "bruma", fundo: "ameixa", minimo: 4.5 },
  { frente: "lavanda", fundo: "noite", minimo: 4.5 },
  { frente: "lavanda", fundo: "ameixa", minimo: 4.5 },
  { frente: "lavanda", fundo: "veludo", minimo: 4.5 },
  { frente: "noite", fundo: "ametista", minimo: 4.5 },
  { frente: "noite", fundo: "ametistaHover", minimo: 4.5 },
  { frente: "ametista", fundo: "veludo", minimo: 3 },
  { frente: "ametista", fundo: "ameixa", minimo: 3 },
];

function deslocada(base: string, matiz: number, fator: number): Hsl {
  const [h, s, l] = rgbParaHsl(deHex(base));
  return [h + (matiz - MATIZ_PADRAO), Math.min(100, s * fator), l];
}

/** Sobe a luminosidade de 1 em 1 ponto até `passa` aceitar a cor (ou chegar ao branco). */
function clarear(hsl: Hsl, passa: (cor: Rgb) => boolean): Rgb {
  let l = hsl[2];
  let cor = hslParaRgb(hsl[0], hsl[1], l);
  while (!passa(cor) && l < 100) {
    l = Math.min(100, l + 1);
    cor = hslParaRgb(hsl[0], hsl[1], l);
  }
  return cor;
}

/** Baixa a luminosidade de 1 em 1 ponto até as cores semânticas terem 4,5:1 sobre o fundo. */
function escurecer(hsl: Hsl): Rgb {
  let l = hsl[2];
  let cor = hslParaRgb(hsl[0], hsl[1], l);
  while (SEMANTICAS.some((s) => contraste(s, cor) < 4.5) && l > 0) {
    l -= 1;
    cor = hslParaRgb(hsl[0], hsl[1], l);
  }
  return cor;
}

/** Valores RGB (opacos) de cada papel, já com o contraste garantido. */
export function coresDaPaleta(matiz: number, intensidade: IntensidadeDaCor): Record<keyof typeof BASE, Rgb> {
  const fator = FATOR_DE_SATURACAO[intensidade];
  const fundo = (chave: "noite" | "ameixa" | "veludo"): Rgb =>
    escurecer(deslocada(BASE[chave], matiz, fator));
  const noite = fundo("noite");
  const ameixa = fundo("ameixa");
  const veludo = fundo("veludo");

  const lavanda = clarear(deslocada(BASE.lavanda, matiz, fator), (c) =>
    [noite, ameixa, veludo].every((f) => contraste(c, f) >= 4.5),
  );
  const bruma = clarear(deslocada(BASE.bruma, matiz, fator), (c) =>
    [noite, ameixa].every((f) => contraste(c, f) >= 4.5),
  );
  // O texto principal também precisa passar sobre as superfícies tonais (lavanda com alfa).
  const nevoa = clarear(deslocada(BASE.nevoa, matiz, fator), (c) => {
    const tonais: [number, Rgb][] = [
      [ALFA.tonal, ameixa],
      [ALFA.tonalHover, ameixa],
      [ALFA.badge, veludo],
    ];
    return (
      [noite, ameixa, veludo].every((f) => contraste(c, f) >= 4.5) &&
      tonais.every(([alfa, f]) => contraste(c, sobrepor(lavanda, alfa, f)) >= 4.5)
    );
  });

  const ametistaHsl = deslocada(BASE.ametista, matiz, fator);
  const ametista = clarear(
    ametistaHsl,
    (c) =>
      contraste(noite, c) >= 4.5 && contraste(c, veludo) >= 3 && contraste(c, ameixa) >= 3,
  );
  // O hover é sempre um pouco mais claro que o botão, como no tema original.
  const [hBase, sBase, lBase] = deslocada(BASE.ametistaHover, matiz, fator);
  const lDoAmetista = rgbParaHsl(ametista)[2];
  const deslocamentoDoHover = rgbParaHsl(deHex(BASE.ametistaHover))[2] - rgbParaHsl(deHex(BASE.ametista))[2];
  const ametistaHover = clarear(
    [hBase, sBase, Math.max(lBase, lDoAmetista + deslocamentoDoHover)],
    (c) => contraste(noite, c) >= 4.5,
  );

  return { noite, ameixa, veludo, ametista, ametistaHover, lavanda, nevoa, bruma };
}

/** O mapa token → valor CSS, para toda matiz e intensidade, com os contrastes de XI.8.2. */
export function gerarPaleta(matiz: number, intensidade: IntensidadeDaCor): Paleta {
  const c = coresDaPaleta(matiz, intensidade);
  return {
    "--cor-noite": hex(c.noite),
    "--cor-ameixa": hex(c.ameixa),
    "--cor-veludo": hex(c.veludo),
    "--cor-ametista": hex(c.ametista),
    "--cor-ametista-hover": hex(c.ametistaHover),
    "--cor-lavanda": hex(c.lavanda),
    "--cor-nevoa": hex(c.nevoa),
    "--cor-bruma": hex(c.bruma),
    "--superficie-tonal": comAlfa(c.lavanda, ALFA.tonal),
    "--superficie-tonal-hover": comAlfa(c.lavanda, ALFA.tonalHover),
    "--superficie-badge": comAlfa(c.lavanda, ALFA.badge),
    "--borda-de-camada": `1px solid ${comAlfa(c.lavanda, ALFA.borda)}`,
  };
}
