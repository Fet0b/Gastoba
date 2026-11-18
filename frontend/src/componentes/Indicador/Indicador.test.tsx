import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Indicador } from "./Indicador";
import { GradeDeIndicadores } from "../GradeDeIndicadores/GradeDeIndicadores";
import { Banner } from "../Banner/Banner";
import { Metadados } from "../Metadados/Metadados";
import { Esqueleto } from "../Esqueleto/Esqueleto";
import { EstadoDeErro } from "../EstadoDeErro/EstadoDeErro";
import { EstadoVazio } from "../EstadoVazio/EstadoVazio";
describe("indicadores e estados compartilhados", () => {
    it("liga a dica ao rótulo e mantém o tom explícito no indicador", () => { const { container } = render(<GradeDeIndicadores colunas={2}><Indicador rotulo="Rendimento" valor="+R$ 25,00" tom="positivo" dica="Variação no período" nota="Este mês"/></GradeDeIndicadores>); expect(container.querySelector('[data-tom="positivo"]')?.textContent).toContain("+R$ 25,00"); const dica = screen.getByRole("button", { name: "Sobre Rendimento" }); expect(document.getElementById(dica.getAttribute("aria-describedby")!)?.textContent).toBe("Variação no período"); });
    it("o banner explica a pendência antes de oferecer a ação", () => { const agir = vi.fn(); render(<Banner tom="atencao" titulo="Aportes sem destinação" texto="Associe os aportes para acompanhar seu dinheiro." acao={{ rotulo: "Definir destinações", aoClicar: agir }}/>); fireEvent.click(screen.getByRole("button", { name: "Definir destinações" })); expect(agir).toHaveBeenCalledOnce(); });
    it("metadados ignoram filhos vazios", () => { const { container } = render(<Metadados>{null}<span>Conta</span>{false}<span>Hoje</span></Metadados>); expect(container.firstElementChild?.children).toHaveLength(2); });
    it("carregamento é anunciado e erro oferece nova tentativa", () => { const tentar = vi.fn(); render(<><Esqueleto rotulo="Carregando posições" linhas={2}/><EstadoDeErro mensagem="Sem resposta" aoTentarDeNovo={tentar}/></>); expect(screen.getByRole("status", { name: "Carregando posições" }).getAttribute("aria-busy")).toBe("true"); expect(screen.getByRole("alert").textContent).toContain("Sem resposta"); fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" })); expect(tentar).toHaveBeenCalledOnce(); });
    it("vazio apresenta descrição sem exigir uma ação", () => { render(<EstadoVazio icone="chave" titulo="Nenhuma chave de API" descricao="As chaves criadas aparecem aqui."/>); expect(screen.getByText("As chaves criadas aparecem aqui.")).toBeTruthy(); expect(screen.queryByRole("button")).toBeNull(); });
});
