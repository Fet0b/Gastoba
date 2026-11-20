import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Metadados } from "./Metadados";

describe("Metadados", () => {
  it("mantém itens, ordem e texto, sem o separador no conteúdo", () => {
    const { container } = render(
      <Metadados>
        <span>Renda fixa</span>
        <span>104% CDI</span>
        <span>vence 03/2027</span>
      </Metadados>,
    );
    const grupo = container.querySelector("[data-metadados]");
    expect(grupo?.children.length).toBe(3);
    expect([...(grupo?.children ?? [])].map((i) => i.textContent)).toEqual(["Renda fixa", "104% CDI", "vence 03/2027"]);
    expect(grupo?.textContent).not.toContain("·");
  });

  it("ignora filhos vazios e aceita a classe do chamador", () => {
    const { container } = render(
      <Metadados className="de-fora">
        {null}
        {false}
        <span>Só um</span>
      </Metadados>,
    );
    const grupo = container.querySelector("[data-metadados]");
    expect(grupo?.classList.contains("de-fora")).toBe(true);
    expect(grupo?.children.length).toBe(1);
  });
});
