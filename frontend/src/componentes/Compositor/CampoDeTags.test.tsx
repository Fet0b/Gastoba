import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { CampoDeTags } from "./CampoDeTags";

type Opcoes = { iniciais?: string[]; sugestoes?: string[]; erro?: string };

/** Guarda as tags escolhidas e as mostra fora do campo, separadas por "|". */
function ComTags({ iniciais = [], sugestoes = [], erro }: Opcoes) {
  const [tags, definirTags] = useState(iniciais);
  return (
    <>
      <CampoDeTags tags={tags} aoMudar={definirTags} sugestoes={sugestoes} erro={erro} />
      <output data-testid="tags">{tags.join("|")}</output>
    </>
  );
}

function campo(): HTMLInputElement {
  return screen.getByLabelText("Tags") as HTMLInputElement;
}

function tags(): string {
  return screen.getByTestId("tags").textContent ?? "";
}

function digitar(texto: string): void {
  fireEvent.change(campo(), { target: { value: texto } });
}

/** Dispara a tecla e diz se o padrão foi impedido. */
function tecla(key: string): boolean {
  return !fireEvent.keyDown(campo(), { key });
}

function opcoes(): HTMLElement[] {
  return screen.queryAllByRole("option");
}

function descricao(): string {
  const ids = campo().getAttribute("aria-describedby") ?? "";
  return ids
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
}

describe("CampoDeTags", () => {
  it("é um combobox ARIA ligado à lista de sugestões", () => {
    render(<ComTags sugestoes={["pix"]} />);
    const entrada = campo();
    expect(entrada.getAttribute("role")).toBe("combobox");
    expect(entrada.getAttribute("aria-autocomplete")).toBe("list");
    expect(entrada.getAttribute("aria-expanded")).toBe("false");
    const lista = document.getElementById(entrada.getAttribute("aria-controls") ?? "");
    expect(lista?.getAttribute("role")).toBe("listbox");
    expect(entrada.hasAttribute("aria-activedescendant")).toBe(false);
  });

  it("Enter com texto cria a tag normalizada e não envia o formulário", () => {
    render(<ComTags />);
    digitar("  Pix ");
    expect(tecla("Enter")).toBe(true);
    expect(tags()).toBe("pix");
    expect(campo().value).toBe("");
  });

  it("vírgula também cria a tag", () => {
    render(<ComTags />);
    digitar("Mercado  Livre");
    expect(tecla(",")).toBe(true);
    expect(tags()).toBe("mercado livre");
  });

  it("texto colado com vírgulas vira várias tags", () => {
    render(<ComTags />);
    digitar("pix, mercado,caf");
    expect(tags()).toBe("pix|mercado");
    expect(campo().value).toBe("caf");
  });

  it("Enter com o campo vazio não é interceptado", () => {
    render(<ComTags iniciais={["pix"]} />);
    expect(tecla("Enter")).toBe(false);
    expect(tags()).toBe("pix");
  });

  it("não repete uma tag já escolhida", () => {
    render(<ComTags iniciais={["pix"]} />);
    digitar("PIX");
    tecla("Enter");
    expect(tags()).toBe("pix");
    expect(campo().value).toBe("");
  });

  it("ignora tag só de espaços", () => {
    render(<ComTags />);
    digitar("   ");
    expect(tecla("Enter")).toBe(true);
    expect(tags()).toBe("");
    expect(campo().value).toBe("");
  });

  it("Backspace com o campo vazio remove a última tag", () => {
    render(<ComTags iniciais={["pix", "mercado"]} />);
    tecla("Backspace");
    expect(tags()).toBe("pix");
  });

  it("Backspace com texto só apaga o texto", () => {
    render(<ComTags iniciais={["pix"]} />);
    digitar("ab");
    expect(tecla("Backspace")).toBe(false);
    expect(tags()).toBe("pix");
  });

  it("o botão de remover tira a tag e devolve o foco ao campo", () => {
    render(<ComTags iniciais={["pix", "mercado"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Remover tag pix" }));
    expect(tags()).toBe("mercado");
    expect(document.activeElement).toBe(campo());
  });

  it("filtra as sugestões pelo texto e tira as já escolhidas", () => {
    render(<ComTags iniciais={["pix"]} sugestoes={["mercado", "mercado livre", "pix", "uber"]} />);
    digitar("Merc");
    expect(campo().getAttribute("aria-expanded")).toBe("true");
    expect(opcoes().map((opcao) => opcao.textContent)).toEqual(["mercado", "mercado livre"]);
  });

  it("setas destacam a sugestão e Enter a escolhe", () => {
    render(<ComTags sugestoes={["mercado", "mercado livre", "uber"]} />);
    digitar("mer");
    expect(tecla("ArrowDown")).toBe(true);
    let [primeira, segunda] = opcoes();
    expect(campo().getAttribute("aria-activedescendant")).toBe(primeira.id);
    expect(primeira.getAttribute("aria-selected")).toBe("true");
    expect(segunda.getAttribute("aria-selected")).toBe("false");

    tecla("ArrowDown");
    [primeira, segunda] = opcoes();
    expect(campo().getAttribute("aria-activedescendant")).toBe(segunda.id);
    tecla("ArrowDown");
    expect(campo().getAttribute("aria-activedescendant")).toBe(opcoes()[0].id);
    tecla("ArrowUp");
    expect(campo().getAttribute("aria-activedescendant")).toBe(opcoes()[1].id);

    expect(tecla("Enter")).toBe(true);
    expect(tags()).toBe("mercado livre");
    expect(campo().value).toBe("");
    expect(campo().getAttribute("aria-expanded")).toBe("false");
    expect(campo().hasAttribute("aria-activedescendant")).toBe(false);
  });

  it("seta para baixo com o campo vazio abre todas as sugestões", () => {
    render(<ComTags sugestoes={["mercado", "pix"]} />);
    expect(campo().getAttribute("aria-expanded")).toBe("false");
    tecla("ArrowDown");
    expect(campo().getAttribute("aria-expanded")).toBe("true");
    expect(opcoes()).toHaveLength(2);
  });

  it("clicar numa sugestão a escolhe", () => {
    render(<ComTags sugestoes={["mercado", "pix"]} />);
    digitar("p");
    fireEvent.click(screen.getByRole("option", { name: "pix" }));
    expect(tags()).toBe("pix");
  });

  it("Escape fecha as sugestões sem fechar o diálogo em volta", () => {
    render(<ComTags sugestoes={["mercado"]} />);
    digitar("m");
    expect(campo().getAttribute("aria-expanded")).toBe("true");
    expect(tecla("Escape")).toBe(true);
    expect(campo().getAttribute("aria-expanded")).toBe("false");
    // Com as sugestões fechadas, Escape segue para o diálogo.
    expect(tecla("Escape")).toBe(false);
  });

  it("a 11ª tag avisa e não entra", () => {
    const dez = Array.from({ length: 10 }, (_, i) => `tag${i}`);
    render(<ComTags iniciais={dez} />);
    digitar("mais uma");
    tecla("Enter");
    expect(tags().split("|")).toHaveLength(10);
    expect(campo().value).toBe("mais uma");
    expect(descricao()).toContain("No máximo 10 tags por gasto.");
  });

  it("avisa ao passar de 30 caracteres e não cria a tag", () => {
    render(<ComTags />);
    digitar("a".repeat(31));
    expect(descricao()).toContain("A tag deve ter de 1 a 30 caracteres.");
    tecla("Enter");
    expect(tags()).toBe("");
    digitar("a".repeat(30));
    expect(descricao()).not.toContain("A tag deve ter");
    tecla("Enter");
    expect(tags()).toBe("a".repeat(30));
  });

  it("recusa caractere não imprimível", () => {
    render(<ComTags />);
    digitar("pix\u{200b}");
    tecla("Enter");
    expect(tags()).toBe("");
    expect(descricao()).toContain("A tag não pode ter caracteres não imprimíveis.");
  });

  it("liga o erro vindo de fora ao campo", () => {
    render(<ComTags erro="Tag inválida." />);
    expect(campo().getAttribute("aria-invalid")).toBe("true");
    expect(descricao()).toContain("Tag inválida.");
  });
});
