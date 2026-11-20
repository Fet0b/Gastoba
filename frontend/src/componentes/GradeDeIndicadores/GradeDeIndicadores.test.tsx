import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GradeDeIndicadores } from "./GradeDeIndicadores";

const css = readFileSync(join(process.cwd(), "src/componentes/GradeDeIndicadores/GradeDeIndicadores.module.css"), "utf-8");

describe("GradeDeIndicadores (070 T019)", () => {
  it("renderiza os filhos em ordem dentro da grade", () => {
    const { container } = render(<GradeDeIndicadores colunas={3}><i>a</i><i>b</i><i>c</i></GradeDeIndicadores>);
    expect([...container.querySelectorAll("i")].map((i) => i.textContent)).toEqual(["a", "b", "c"]);
  });

  it("em duas colunas, o último cartão de uma quantidade ímpar ocupa a linha inteira", () => {
    const bloco = css.slice(css.indexOf("@container (max-width: 40rem)"), css.indexOf("@container (max-width: 20rem)"));
    expect(bloco).toMatch(/:last-child:nth-child\(odd\)\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
  });
});
