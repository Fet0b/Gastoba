import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { chamar } from "../../api/cliente";
import type { GuardadoNasMetas as Configuracao } from "../../api/tipos";
import { entrarNaSimulacao } from "../../simulacao/fetchSimulado";
import { prepararCenarioDoGuardado } from "../../simulacao/manipuladores";
import { limparCache } from "../../api/useConsulta";
import { GuardadoNasMetas } from "./GuardadoNasMetas";

function renderizar(props: Partial<Parameters<typeof GuardadoNasMetas>[0]> = {}) {
  const aoVerInvestimentos = vi.fn();
  const aoAvisar = vi.fn();
  const resultado = render(
    <GuardadoNasMetas gestaoDeInvestimentos aoVerInvestimentos={aoVerInvestimentos} aoAvisar={aoAvisar} {...props} />,
  );
  return { ...resultado, aoVerInvestimentos, aoAvisar };
}

async function aguardarCartao() {
  return screen.findByRole("checkbox", { name: "Mostrar nas metas o que guardei para comprar" });
}

async function configuracao() {
  return chamar<Configuracao>("/guardado-nas-metas");
}

describe("GuardadoNasMetas", () => {
  beforeEach(() => {
    prepararCenarioDoGuardado();
  });

  it("sem gestão de investimentos, mostra o estado vazio e nenhum controle", () => {
    const { aoVerInvestimentos } = renderizar({ gestaoDeInvestimentos: false });
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver investimentos" }));
    expect(aoVerInvestimentos).toHaveBeenCalledTimes(1);
  });

  it("sem nenhuma caixinha, mostra o estado vazio com o caminho para Investimentos", async () => {
    entrarNaSimulacao();
    // outra pessoa, sem investimentos: reinicia a simulação vazia
    const { reiniciarSimulacao } = await import("../../simulacao/manipuladores");
    reiniciarSimulacao();
    entrarNaSimulacao();
    renderizar();
    expect(await screen.findByRole("button", { name: "Ver investimentos" })).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("finalidade cadastrada sem posição não vira guardado nem marcação de meta", async () => {
    const { reiniciarSimulacao } = await import("../../simulacao/manipuladores");
    reiniciarSimulacao();
    entrarNaSimulacao();
    await chamar("/destinacoes-cadastradas", { metodo: "POST", corpo: { nome: "estudos" } });
    limparCache();
    renderizar();
    fireEvent.click(await aguardarCartao());
    fireEvent.click(await screen.findByRole("button", { name: "Conforto: nenhuma" }));
    expect(await screen.findByRole("checkbox", { name: "Estudos" })).toBeTruthy();
    expect(await configuracao()).toEqual({ ativo: false, marcacoes: [] });
    expect(screen.queryByText(/guardado neste mês/i)).toBeNull();
  });

  it("explica o que conta e o que ainda não entra", async () => {
    renderizar();
    await aguardarCartao();
    expect(
      screen.getByText(
        /Conta o que você classificou como aporte ou resgate com esta caixinha\. Posições divididas por fração e ligações da Revisão da bolsa ainda não entram\./,
      ),
    ).toBeTruthy();
  });

  it("desligado, não oferece categorias; Salvar fica desabilitado com o motivo", async () => {
    renderizar();
    const opcao = (await aguardarCartao()) as HTMLInputElement;
    expect(opcao.checked).toBe(false);
    expect(screen.queryByRole("button", { name: /^Conforto:/ })).toBeNull();
    const salvar = screen.getByRole("button", { name: "Salvar" }) as HTMLButtonElement;
    expect(salvar.disabled).toBe(true);
    expect(screen.getByText("Nenhuma mudança para salvar.")).toBeTruthy();
  });

  it("liga, marca a caixinha em Conforto e salva; a configuração persiste", async () => {
    const { aoAvisar } = renderizar();
    fireEvent.click(await aguardarCartao());
    fireEvent.click(screen.getByRole("button", { name: "Conforto: nenhuma" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Computador" }));
    const salvar = screen.getByRole("button", { name: "Salvar" }) as HTMLButtonElement;
    expect(salvar.disabled).toBe(false);
    fireEvent.click(salvar);
    await waitFor(() => expect(aoAvisar).toHaveBeenCalledWith("confirmacao", "Configuração salva."));
    expect(await configuracao()).toEqual({ ativo: true, marcacoes: [{ categoria: "conforto", tag: "computador" }] });
  });

  it("caixinha em uso noutra categoria fica desabilitada com o texto do motivo", async () => {
    await chamar("/guardado-nas-metas", {
      metodo: "PUT",
      corpo: { ativo: true, marcacoes: [{ categoria: "conforto", tag: "computador" }] },
    });
    renderizar();
    await aguardarCartao();
    fireEvent.click(await screen.findByRole("button", { name: "Lazer: nenhuma" }));
    const grupo = screen.getByRole("group", { name: "Lazer" });
    const caixa = within(grupo).getByRole("checkbox", { name: /Computador/ }) as HTMLInputElement;
    expect(caixa.disabled).toBe(true);
    expect(within(grupo).getByText("Em uso em Conforto")).toBeTruthy();
    expect((within(grupo).getByRole("checkbox", { name: /Reserva/ }) as HTMLInputElement).disabled).toBe(false);
  });

  it("desligar preserva as marcações e liga de novo com elas", async () => {
    await chamar("/guardado-nas-metas", {
      metodo: "PUT",
      corpo: { ativo: true, marcacoes: [{ categoria: "conforto", tag: "computador" }] },
    });
    renderizar();
    const opcao = await aguardarCartao();
    await waitFor(() => expect((opcao as HTMLInputElement).checked).toBe(true));
    fireEvent.click(opcao);
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(async () => expect((await configuracao()).ativo).toBe(false));
    expect((await configuracao()).marcacoes).toEqual([{ categoria: "conforto", tag: "computador" }]);
    fireEvent.click(opcao);
    expect(await screen.findByRole("button", { name: "Conforto: 1" })).toBeTruthy();
  });

  it("mostra a mensagem da API quando salvar falha", async () => {
    renderizar();
    fireEvent.click(await aguardarCartao());
    fireEvent.click(screen.getByRole("button", { name: "Conforto: nenhuma" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Computador" }));
    // a caixinha some entre abrir a tela e salvar
    const { reiniciarSimulacao } = await import("../../simulacao/manipuladores");
    reiniciarSimulacao();
    entrarNaSimulacao();
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});
