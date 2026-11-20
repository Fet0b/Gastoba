import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";

// O ?raw do Vite devolve vazio para CSS no Vitest; lê-se o arquivo direto (o Vitest roda em frontend/).
const texto = readFileSync("src/estilos/tokens.css", "utf-8");

const NOVOS = [
  "--cor-positivo",
  "--cor-negativo",
  "--cor-atencao",
  "--cor-neutra",
  "--cor-ametista-hover",
  "--superficie-tonal",
  "--superficie-tonal-hover",
  "--superficie-badge",
  "--superficie-positiva",
  "--superficie-atencao",
  "--superficie-negativa",
  "--margem-do-cartao",
  "--numero-heroi",
  "--numero-grande",
  "--numero-medio",
  "--numero-pequeno",
  "--altura-minima-do-botao",
];

describe("tokens.css", () => {
  it.each(NOVOS)("declara o token %s", (nome) => {
    expect(texto).toMatch(new RegExp(`^\\s*${nome}:`, "m"));
  });

  it("nenhum token usa color-mix (o medidor de contraste do E2E não o lê)", () => {
    expect(texto).not.toContain("color-mix(");
  });

  it("--cor-dentro aponta para --cor-positivo", () => {
    expect(texto).toMatch(/--cor-dentro:\s*var\(--cor-positivo\)/);
  });
});
