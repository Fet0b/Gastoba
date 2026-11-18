import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CampoDeTexto } from "./CampoDeTexto";
import { CampoDeData } from "./CampoDeData";
import { CampoDeMes } from "./CampoDeMes";
import { Seletor } from "./Seletor";
import { Caixa } from "./Caixa";
import { GrupoDeOpcoes } from "./GrupoDeOpcoes";
import { CampoDeFaixa } from "./CampoDeFaixa";
describe("campos do sistema de design", () => {
    it("liga rótulo, ajuda e erro ao texto e entrega o valor digitado", () => {
        const mudar = vi.fn();
        render(<CampoDeTexto rotulo="Nome" valor="" aoMudar={mudar} ajuda="Como aparece" erro="Informe o nome"/>);
        const campo = screen.getByLabelText("Nome");
        expect(campo.getAttribute("aria-invalid")).toBe("true");
        expect(campo.getAttribute("aria-describedby")?.split(" ").every(id => document.getElementById(id))).toBe(true);
        fireEvent.change(campo, { target: { value: "Maria" } });
        expect(mudar).toHaveBeenCalledWith("Maria");
        expect(screen.getByRole("alert").textContent).toBe("Informe o nome");
    });
    it("mantém datas em texto e valida mês sem suporte nativo", () => {
        const mudar = vi.fn();
        render(<><CampoDeData rotulo="Data" valor="2026-11-09" aoMudar={mudar}/><CampoDeMes rotulo="Mês" valor="2026-13" aoMudar={mudar}/></>);
        expect((screen.getByLabelText("Data") as HTMLInputElement).value).toBe("2026-11-09");
        expect(screen.getByLabelText("Mês").getAttribute("aria-invalid")).toBe("true");
    });
    it("expõe seleção, caixa e faixa pelos controles acessíveis", () => {
        const mudar = vi.fn();
        render(<><Seletor rotulo="Conta" valor="" vazio="Escolha" opcoes={[{ valor: "a", rotulo: "Principal" }]} aoMudar={mudar}/><Caixa rotulo="Incluir" marcada={false} aoMudar={mudar}/><CampoDeFaixa rotulo="Percentual" valor={25} minimo={0} maximo={100} aoMudar={mudar}/></>);
        fireEvent.change(screen.getByLabelText("Conta"), { target: { value: "a" } });
        expect(mudar).toHaveBeenCalledWith("a");
        fireEvent.click(screen.getByRole("checkbox"));
        expect(mudar).toHaveBeenCalledWith(true);
        fireEvent.change(screen.getByRole("slider"), { target: { value: "40" } });
        expect(mudar).toHaveBeenCalledWith(40);
    });
    it("o seletor agrupa opções por categoria sem perder as avulsas", () => {
        const mudar = vi.fn();
        render(<Seletor rotulo="Investimento" valor="todos" aoMudar={mudar} opcoes={[{ valor: "todos", rotulo: "Todos" }]} grupos={[{ nome: "Renda fixa", opcoes: [{ valor: "a", rotulo: "CDB" }] }]}/>);
        const campo = screen.getByLabelText("Investimento") as HTMLSelectElement;
        expect(Array.from(campo.options).map(o => o.textContent)).toEqual(["Todos", "CDB"]);
        expect(campo.querySelector('optgroup[label="Renda fixa"]')?.querySelectorAll("option")).toHaveLength(1);
        fireEvent.change(campo, { target: { value: "a" } });
        expect(mudar).toHaveBeenCalledWith("a");
    });
    it("oferece grupo com legenda e descrição sem selecionar sozinho", () => {
        const mudar = vi.fn();
        render(<GrupoDeOpcoes legenda="Escopo" valor="" aoMudar={mudar} variante="cartao" opcoes={[{ valor: "leitura", titulo: "Leitura", descricao: "Só consulta" }]}/>);
        expect(screen.getByRole("group", { name: "Escopo" })).toBeTruthy();
        const opcao = screen.getByRole("radio", { name: /Leitura/ }) as HTMLInputElement;
        expect(opcao.checked).toBe(false);
        fireEvent.click(opcao);
        expect(mudar).toHaveBeenCalledWith("leitura");
    });
});
it("permite senha não controlada lida pela ref sem estado React", () => { const ref = { current: null as HTMLInputElement | null }; render(<CampoDeTexto rotulo="Senha privada" tipo="password" ref={ref}/>); fireEvent.change(screen.getByLabelText("Senha privada"), { target: { value: "segredo-de-teste" } }); expect(ref.current?.value).toBe("segredo-de-teste"); });
