import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Tabela } from "./Tabela";
it("descreve a tabela e preserva colunas numéricas", () => { render(<Tabela legenda="Saldos" colunas={[{ chave: "nome", titulo: "Nome" }, { chave: "saldo", titulo: "Saldo", numerica: true }]} linhas={[{ nome: "Principal", saldo: "R$ 20,00" }]}/>); expect(screen.getByRole("table", { name: "Saldos" })).toBeTruthy(); expect(screen.getByRole("cell", { name: "R$ 20,00" }).getAttribute("data-numerica")).toBe("true"); });
