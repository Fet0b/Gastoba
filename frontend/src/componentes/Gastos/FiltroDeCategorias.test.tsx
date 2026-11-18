import {fireEvent,render,screen} from "@testing-library/react";
import {it,expect,vi} from "vitest";
import {FiltroDeCategorias} from "./FiltroDeCategorias";
import {FiltroDeTags} from "./FiltroDeTags";

it("omite a categoria legada do filtro", () => {
  render(<FiltroDeCategorias categorias={[{codigo:"investimentos",nome:"Investimentos (antiga)",legada:true},{codigo:"conforto",nome:"Conforto",legada:false}]} ativa={null} aoAlternar={() => {}} aoLimpar={() => {}} />);
  expect(screen.queryByRole("button",{name:"Investimentos (antiga)"})).toBeNull();
  expect(screen.getByRole("button",{name:"Conforto"})).toBeTruthy();
});

const CATEGORIAS = [
  { codigo: "lazer", nome: "Lazer", legada: false },
  { codigo: "conforto", nome: "Conforto", legada: false },
];

it("as categorias são Chips: a ativa fica pressionada com o ícone de selecionado e Limpar é terciário", () => {
  const aoLimpar = vi.fn();
  render(<FiltroDeCategorias categorias={CATEGORIAS} ativa="lazer" aoAlternar={() => {}} aoLimpar={aoLimpar} />);

  const lazer = screen.getByRole("button", { name: "Lazer" });
  const conforto = screen.getByRole("button", { name: "Conforto" });
  expect(lazer.hasAttribute("data-chip")).toBe(true);
  expect(lazer.getAttribute("aria-pressed")).toBe("true");
  expect(lazer.querySelector("svg")).not.toBeNull();
  expect(conforto.getAttribute("aria-pressed")).toBe("false");
  expect(conforto.querySelector("svg")).toBeNull();
  expect(conforto.querySelector("[data-ponto]")).not.toBeNull();

  const limpar = screen.getByRole("button", { name: "Limpar filtro de categoria" });
  expect(limpar.getAttribute("data-papel")).toBe("terciaria");
  fireEvent.click(limpar);
  expect(aoLimpar).toHaveBeenCalledTimes(1);
});

it("as tags são Chips e Limpar é terciário", () => {
  render(<FiltroDeTags tags={["pix", "mercado"]} ativa="pix" aoAlternar={() => {}} aoLimpar={() => {}} />);

  const pix = screen.getByRole("button", { name: "pix" });
  expect(pix.hasAttribute("data-chip")).toBe(true);
  expect(pix.getAttribute("aria-pressed")).toBe("true");
  expect(pix.querySelector("svg")).not.toBeNull();
  expect(screen.getByRole("button", { name: "Limpar filtro de tag" }).getAttribute("data-papel")).toBe("terciaria");
});
