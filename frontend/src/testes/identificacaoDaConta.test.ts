import { expect, it } from "vitest";

/**
 * Art. XI.5.6 (frente 068): uma conta se identifica por rótulo, tipo e final, nunca pelo nome
 * interno (que leva o "(2)"). Fora de `contas/`, `api/` e da simulação, nenhum código lê
 * `conta.nome` nem `conta_nome`: a identificação vem de `identificacaoDaConta`/`textoDaConta`.
 */
const FONTES = import.meta.glob(
  [
    "../**/*.ts",
    "../**/*.tsx",
    "!../**/*.test.ts",
    "!../**/*.test.tsx",
    "!../contas/**",
    "!../api/**",
    "!../simulacao/**",
    "!../testes/**",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

const PROIBIDO = /\bconta\??\.nome\b|\bconta_nome\b/;

it("nenhuma tela lê o nome interno da conta", () => {
  const achados = Object.entries(FONTES).flatMap(([arquivo, codigo]) =>
    codigo
      .split("\n")
      .map((linha, indice) => ({ linha, indice }))
      .filter(({ linha }) => PROIBIDO.test(linha))
      .map(({ linha, indice }) => `${arquivo}:${indice + 1}: ${linha.trim().slice(0, 80)}`),
  );
  expect(achados).toEqual([]);
});
