import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { IntensidadeDaCor } from "../api/tipos";
import { contraste, deHex, sobrepor } from "./cor";
import {
  MATIZ_PADRAO,
  PARES_EXIGIDOS,
  coresDaPaleta,
  gerarPaleta,
} from "./paleta";

const INTENSIDADES: IntensidadeDaCor[] = ["suave", "media", "viva"];
const TOKENS = readFileSync("src/estilos/tokens.css", "utf-8");

function valorDoToken(nome: string): string {
  const linha = TOKENS.split("\n").find((l) => l.trim().startsWith(`${nome}:`));
  if (!linha) throw new Error(`token ${nome} não encontrado`);
  return linha
    .trim()
    .slice(nome.length + 1)
    .replace(/\/\*.*\*\//, "")
    .replace(/;\s*$/, "")
    .trim();
}

const SEMANTICAS = ["#4ade80", "#ff7a90", "#f0b429"].map(deHex);

describe("gerarPaleta", () => {
  it("a aparência padrão reproduz exatamente os valores de tokens.css", () => {
    const paleta = gerarPaleta(MATIZ_PADRAO, "media");
    for (const [token, valor] of Object.entries(paleta)) {
      expect(valor, token).toBe(valorDoToken(token));
    }
    expect(Object.keys(paleta)).toHaveLength(12);
  });

  it("as cores semânticas do teste são as de tokens.css", () => {
    expect(valorDoToken("--cor-positivo")).toBe("#4ade80");
    expect(valorDoToken("--cor-brasa")).toBe("#ff7a90");
    expect(valorDoToken("--cor-alerta")).toBe("#f0b429");
  });

  it("360 matizes x 3 intensidades passam em todos os pares de contraste", () => {
    const falhas: string[] = [];
    for (const intensidade of INTENSIDADES) {
      for (let matiz = 0; matiz < 360; matiz += 1) {
        const c = coresDaPaleta(matiz, intensidade);
        for (const par of PARES_EXIGIDOS) {
          const valor = contraste(
            c[par.frente as keyof typeof c],
            c[par.fundo as keyof typeof c],
          );
          if (valor < par.minimo) falhas.push(`${matiz} ${intensidade} ${par.frente}/${par.fundo}`);
        }
        for (const [alfa, fundo] of [
          [0.18, c.ameixa],
          [0.26, c.ameixa],
          [0.12, c.veludo],
        ] as const) {
          if (contraste(c.nevoa, sobrepor(c.lavanda, alfa, fundo)) < 4.5) {
            falhas.push(`${matiz} ${intensidade} nevoa/tonal ${alfa}`);
          }
        }
        for (const semantica of SEMANTICAS) {
          for (const fundo of [c.ameixa, c.veludo]) {
            if (contraste(semantica, fundo) < 4.5) falhas.push(`${matiz} ${intensidade} semantica`);
          }
        }
      }
    }
    expect(falhas).toEqual([]);
  });

  it("a intensidade muda a saturação: suave é mais cinza que viva", () => {
    const [r, g, b] = coresDaPaleta(10, "suave").ametista;
    const [r2, g2, b2] = coresDaPaleta(10, "viva").ametista;
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(Math.max(r2, g2, b2) - Math.min(r2, g2, b2));
  });

  it("o fundo acompanha a matiz (vermelho tem mais vermelho que azul)", () => {
    const [r, , b] = coresDaPaleta(0, "viva").veludo;
    expect(r).toBeGreaterThan(b);
  });

  it("o hover do botão nunca é mais escuro que o botão", () => {
    for (let matiz = 0; matiz < 360; matiz += 10) {
      const c = coresDaPaleta(matiz, "media");
      expect(contraste(c.noite, c.ametistaHover)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
