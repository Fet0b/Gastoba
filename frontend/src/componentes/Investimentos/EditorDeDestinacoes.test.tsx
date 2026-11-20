import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import type { Investimento } from "../../api/tipos";
import { formatar } from "../../dinheiro/dinheiro";
import { MENSAGEM_SOMA_DAS_DESTINACOES, type LinhaDeDestinacao } from "../../investimentos/destinacoes";
import { HEX_DA_COR } from "../../investimentos/cores";
import { EditorDeDestinacoes } from "./EditorDeDestinacoes";

function Editor(props: {
  valor?: string;
  linhas?: LinhaDeDestinacao[];
  investimentos?: Investimento[];
  termo?: "destinação" | "caixinha";
  errosAoSair?: boolean;
}) {
  const [linhas, definir] = useState<LinhaDeDestinacao[]>(props.linhas ?? []);
  return (
    <EditorDeDestinacoes
      investimentos={props.investimentos ?? []}
      investimentoId=""
      aoMudarInvestimento={() => {}}
      linhas={linhas}
      aoMudarLinhas={definir}
      valor={props.valor}
      escolherInvestimento={false}
      termo={props.termo}
      errosAoSair={props.errosAoSair}
    />
  );
}

const L = (...pares: [string, string][]) => pares.map(([tag, percentual]) => ({ tag, percentual }));
const campo = (n: number) =>
  screen.getByLabelText(`Percentual da destinação ${n}`) as HTMLInputElement;
const barra = (n: number) =>
  screen.getByRole("slider",{name:`Ajustar o percentual da destinação ${n}`}) as HTMLInputElement;
const linhasDoDom = () => Array.from(document.querySelectorAll("[role=group] > div"));

describe("EditorDeDestinacoes: valores e restante", () => {
  it("mostra o valor da linha válida e nada na vazia", () => {
    render(<Editor valor="2788.75" linhas={L(["casa", "40"], ["", ""])} />);
    const linhas = linhasDoDom().filter((l) => l.querySelector("input"));
    expect(linhas[0].textContent).toContain(formatar("1115.50"));
    expect(linhas[1].textContent).not.toContain("R$");
  });

  it("diz o que falta, mantendo a soma", () => {
    render(<Editor valor="2788.75" linhas={L(["casa", "40"], ["", ""])} />);
    expect(document.body.textContent).toContain("Soma: 40%");
    const restante = document.querySelector('[data-restante="falta"]') as HTMLElement;
    expect(restante.textContent).toContain("Falta distribuir: 60%");
    expect(restante.textContent).toContain(formatar("1673.25"));
  });

  it("soma 33/33/34 é exata e não mostra restante", () => {
    render(<Editor valor="100.01" linhas={L(["a", "33"], ["b", "33"], ["c", "34"])} />);
    const texto = document.querySelector("[role=group]")?.textContent ?? "";
    for (const v of ["33.01", "33.00", "34.00"]) expect(texto).toContain(formatar(v));
    expect(document.querySelector("[data-restante]")).toBeNull();
  });

  it("excesso", () => {
    render(<Editor valor="2788.75" linhas={L(["a", "60"], ["b", "50"])} />);
    const restante = document.querySelector('[data-restante="excede"]') as HTMLElement;
    expect(restante.textContent).toContain("Passa de 100% em: 10%");
    expect(restante.textContent).toContain(formatar("278.87"));
    expect(document.body.textContent).toContain(MENSAGEM_SOMA_DAS_DESTINACOES);
  });

  it("sem valor, restante só em porcentagem", () => {
    render(<Editor linhas={L(["a", "40"])} />);
    const restante = document.querySelector("[data-restante]") as HTMLElement;
    expect(restante.textContent).toContain("Falta distribuir: 60%");
    expect(restante.textContent).not.toContain("R$");
  });
});

describe("EditorDeDestinacoes: deslizante", () => {
  it("cada linha tem barra e o campo continua achável", () => {
    render(<Editor linhas={L(["a", "50"], ["b", "50"])} />);
    const b = barra(1);
    expect(b.type).toBe("range");
    expect(b.min).toBe("1");
    expect(b.max).toBe("100");
    expect(campo(1)).not.toBeNull();
  });

  it("mover a barra redistribui as outras (60/40 para 70/30)", () => {
    render(<Editor linhas={L(["casa", "60"], ["viagem", "40"])} />);
    fireEvent.change(barra(1), { target: { value: "70" } });
    expect([campo(1).value, campo(2).value]).toEqual(["70", "30"]);
    expect(document.body.textContent).toContain("Soma: 100%");
  });

  it("com três linhas só as outras mudam", () => {
    render(<Editor linhas={L(["a", "50"], ["b", "30"], ["c", "20"])} />);
    fireEvent.change(barra(1), { target: { value: "60" } });
    expect([campo(1).value, campo(2).value, campo(3).value]).toEqual(["60", "24", "16"]);
  });

  it("teclado", () => {
    render(<Editor linhas={L(["a", "50"], ["b", "50"])} />);
    const valores = () => [campo(1).value, campo(2).value];
    const tecla = (key: string) => fireEvent.keyDown(barra(1), { key });
    expect(tecla("ArrowUp")).toBe(false);
    expect(valores()).toEqual(["51", "49"]);
    tecla("PageUp");
    expect(valores()).toEqual(["61", "39"]);
    tecla("PageDown");
    expect(valores()).toEqual(["51", "49"]);
    tecla("ArrowLeft");
    expect(valores()).toEqual(["50", "50"]);
    tecla("Home");
    expect(valores()).toEqual(["1", "99"]);
    tecla("End");
    expect(valores()).toEqual(["99", "1"]);
  });

  it("não intercepta outras teclas", () => {
    render(<Editor linhas={L(["a", "50"], ["b", "50"])} />);
    expect(fireEvent.keyDown(barra(1), { key: "Tab" })).toBe(true);
  });

  it("aria-valuetext", () => {
    const { unmount } = render(<Editor valor="1000.00" linhas={L(["a", "40"], ["b", ""])} />);
    expect(barra(1).getAttribute("aria-valuetext")).toBe(`40%, ${formatar("400.00")}`);
    expect(barra(2).getAttribute("aria-valuetext")).toBe("Sem percentual");
    unmount();
    render(<Editor linhas={L(["a", "40"])} />);
    expect(barra(1).getAttribute("aria-valuetext")).toBe("40%");
  });

  it("digitar no campo move a barra e não mexe nas outras", () => {
    render(<Editor linhas={L(["a", "50"], ["b", "50"])} />);
    fireEvent.change(campo(1), { target: { value: "25" } });
    expect(barra(1).value).toBe("25");
    expect(campo(2).value).toBe("50");
  });

  it("uma linha só: barra desabilitada", () => {
    render(<Editor linhas={L(["a", "100"])} />);
    expect(barra(1).disabled).toBe(true);
  });

  it("adicionar e remover não mexem nas outras", () => {
    render(<Editor linhas={L(["a", "100"])} />);
    const botaoAdicionar = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Adicionar destinação",
    ) as HTMLElement;
    fireEvent.click(botaoAdicionar);
    expect(campo(1).value).toBe("100");
    expect(campo(2).value).toBe("");
    fireEvent.click(document.querySelector('[aria-label="Remover a destinação 2"]') as HTMLElement);
    expect(campo(1).value).toBe("100");
  });
});

describe("EditorDeDestinacoes: barra empilhada", () => {
  it("aparece e a bolinha tem a cor do segmento", () => {
    render(<Editor valor="1000.00" linhas={L(["casa", "60"], ["viagem", "40"])} />);
    expect(document.querySelector("[data-barra-da-distribuicao]")).not.toBeNull();
    const segmento = document.querySelector('[data-segmento=""]') as HTMLElement;
    const ponto = document.querySelector("[data-ponto]") as HTMLElement;
    expect(ponto.style.backgroundColor).toBe(segmento.style.backgroundColor);
  });

  it("usa a cor salva da tag", () => {
    const investimento = {
      id: "i",
      destinacoes: [{ tag: "casa", cor: "menta" }],
    } as unknown as Investimento;
    render(<Editor investimentos={[investimento]} linhas={L(["casa", "100"])} />);
    const auxiliar = document.createElement("span");
    auxiliar.style.backgroundColor = HEX_DA_COR.menta;
    const segmento = document.querySelector('[data-segmento=""]') as HTMLElement;
    expect(segmento.style.backgroundColor).toBe(auxiliar.style.backgroundColor);
  });
});

describe("vocabulário e erros ao sair", () => {
  it("recebe sugestões do catálogo por props sem fazer uma consulta própria", () => {
    render(<EditorDeDestinacoes
      investimentos={[]}
      investimentoId=""
      aoMudarInvestimento={() => {}}
      linhas={L(["", "100"])}
      aoMudarLinhas={() => {}}
      escolherInvestimento={false}
      destinacoesCadastradas={["estudos"]}
    />);
    expect(document.querySelector('datalist option[value="estudos"]')).toBeTruthy();
    expect(screen.getByLabelText("Tag da destinação 1").getAttribute("list")).toBeTruthy();
  });

  it("com o termo caixinha, todos os textos dizem caixinha", () => {
    render(<Editor termo="caixinha" linhas={L(["", "100"])} valor="100.00" />);
    expect(screen.getByLabelText("Tag da caixinha 1")).toBeTruthy();
    expect(screen.getByLabelText("Percentual da caixinha 1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Adicionar caixinha" })).toBeTruthy();
    expect(screen.getByText(/Uma única caixinha recebe 100%/)).toBeTruthy();
    expect(screen.getByRole("img", { name: /Caixinha 1 100%/ })).toBeTruthy();
    expect(screen.queryByText(/destinaç/i)).toBeNull();
  });
  it("sem o termo, os textos atuais continuam", () => {
    render(<Editor linhas={L(["", "100"])} valor="100.00" />);
    expect(screen.getByLabelText("Tag da destinação 1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Adicionar destinação" })).toBeTruthy();
  });
  it("com errosAoSair, o erro vermelho só aparece depois de sair do campo", () => {
    render(<Editor errosAoSair linhas={L(["", "100"])} valor="100.00" />);
    expect(screen.queryByText("A tag deve ter de 1 a 30 caracteres.")).toBeNull();
    fireEvent.blur(screen.getByLabelText("Tag da destinação 1"));
    expect(screen.queryByText("A tag deve ter de 1 a 30 caracteres.")).toBeNull();
    fireEvent.keyDown(screen.getByLabelText("Tag da destinação 1"), { key: "Tab" });
    fireEvent.blur(screen.getByLabelText("Tag da destinação 1"));
    expect(screen.getByText("A tag deve ter de 1 a 30 caracteres.")).toBeTruthy();
  });
  it("sem errosAoSair, o erro aparece de saída (comportamento atual)", () => {
    render(<Editor linhas={L(["", "100"])} valor="100.00" />);
    expect(screen.getByText("A tag deve ter de 1 a 30 caracteres.")).toBeTruthy();
  });
});
