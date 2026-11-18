import { expect, it } from "vitest";

/**
 * A interface diz "Revisão da bolsa" e "ligar" (frente 061, D6): a palavra "casamento" é nome
 * interno do código e da API, nunca texto visível. Varre as frases (literais com espaço e texto
 * de JSX) dos componentes e das páginas de produção.
 */
const FONTES = import.meta.glob(["../componentes/**/*.tsx", "../paginas/**/*.tsx", "!../**/*.test.tsx"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function frases(codigo: string): string[] {
  const semComentarios = codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const literais = [...semComentarios.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)].map(m => m[2]);
  const jsx = [...semComentarios.matchAll(/>([^<>{}]+)</g)].map(m => m[1]);
  return [...literais, ...jsx].filter(t => /\s/.test(t.trim()));
}

it("nenhum texto visível da interface usa a palavra 'casamento'", () => {
  const achados = Object.entries(FONTES).flatMap(([arquivo, codigo]) =>
    frases(codigo).filter(t => /casament/i.test(t)).map(t => `${arquivo}: ${t.trim().slice(0, 60)}`),
  );
  expect(achados).toEqual([]);
});
