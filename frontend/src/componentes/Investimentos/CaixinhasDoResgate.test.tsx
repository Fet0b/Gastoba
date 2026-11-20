import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { chamar } from "../../api/cliente";
import type { Investimento, MovimentoDeInvestimento } from "../../api/tipos";
import { limparCache } from "../../api/useConsulta";
import { prepararCenarioDasCaixinhasDoResgate } from "../../simulacao/manipuladores";
import { MovimentosDeInvestimento } from "./MovimentosDeInvestimento";

beforeEach(() => { prepararCenarioDasCaixinhasDoResgate(); limparCache(); });

async function montar(podeDesfazer = false) {
  const parametros = { inicio: "2000-01-01", fim: "2999-12-31" };
  const movimentos = await chamar<MovimentoDeInvestimento[]>("/movimentos-de-investimento", { parametros });
  const investimentos = await chamar<Investimento[]>("/investimentos");
  const aoAvisar = vi.fn(), aoFalhar = vi.fn();
  render(<MovimentosDeInvestimento movimentos={movimentos} investimentos={investimentos} aoAvisar={aoAvisar} aoFalhar={aoFalhar} podeDesfazerClassificacao={podeDesfazer} />);
  return { aoAvisar, aoFalhar, parametros };
}
const menu = (descricao: string) => screen.getByRole("button", { name: `Mais ações de classificação de ${descricao}` });

it("resgate sem caixinhas oferece só 'Definir caixinhas'; com caixinhas, só 'Remover caixinhas'", async () => {
  await montar();
  fireEvent.click(menu("Resgate sem caixinhas"));
  expect(screen.getByRole("menuitem", { name: "Definir caixinhas" })).toBeTruthy();
  expect(screen.queryByRole("menuitem", { name: "Remover caixinhas" })).toBeNull();
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  fireEvent.click(menu("Resgate com caixinhas"));
  expect(screen.getByRole("menuitem", { name: "Remover caixinhas" })).toBeTruthy();
  expect(screen.queryByRole("menuitem", { name: "Definir caixinhas" })).toBeNull();
});

it("aporte e resgate sem investimento não têm o menu das caixinhas", async () => {
  await montar();
  expect(screen.queryByRole("button", { name: /Mais ações de classificação de Aporte/ })).toBeNull();
});

it("define as caixinhas: envia a divisão, avisa e o resgate passa a mostrar a parte", async () => {
  const { aoAvisar, parametros } = await montar();
  fireEvent.click(menu("Resgate sem caixinhas"));
  fireEvent.click(screen.getByRole("menuitem", { name: "Definir caixinhas" }));
  const dialogo = await screen.findByRole("dialog", { name: "Definir caixinhas do resgate" });
  const confirmar = within(dialogo).getByRole("button", { name: /Definir caixinhas/ });
  expect((confirmar as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(within(dialogo).getByLabelText("Tag da caixinha 1"), { target: { value: "computador" } });
  fireEvent.click(confirmar);
  await waitFor(() => expect(aoAvisar).toHaveBeenCalledWith("Caixinhas do resgate definidas."));
  const movimentos = await chamar<MovimentoDeInvestimento[]>("/movimentos-de-investimento", { parametros });
  expect(movimentos.find(m => m.descricao === "Resgate sem caixinhas")!.destinacoes.map(d => d.tag)).toEqual(["computador"]);
});

it("remover pede confirmação, foca Cancelar e só então apaga as partes", async () => {
  const { aoAvisar, parametros } = await montar();
  fireEvent.click(menu("Resgate com caixinhas"));
  fireEvent.click(screen.getByRole("menuitem", { name: "Remover caixinhas" }));
  const botaoCancelar = await screen.findByRole("button", { name: "Cancelar" });
  expect(document.activeElement).toBe(botaoCancelar);
  fireEvent.click(botaoCancelar);
  expect(aoAvisar).not.toHaveBeenCalled();
  fireEvent.click(menu("Resgate com caixinhas"));
  fireEvent.click(screen.getByRole("menuitem", { name: "Remover caixinhas" }));
  fireEvent.click(await screen.findByRole("button", { name: "Sim, remover" }));
  await waitFor(() => expect(aoAvisar).toHaveBeenCalledWith("Caixinhas do resgate removidas."));
  const movimentos = await chamar<MovimentoDeInvestimento[]>("/movimentos-de-investimento", { parametros });
  expect(movimentos.find(m => m.descricao === "Resgate com caixinhas")!.destinacoes).toEqual([]);
});

it("remover resgate que paga uma compra mostra o 409 junto ao diálogo", async () => {
  const cenario = prepararCenarioDasCaixinhasDoResgate();
  limparCache();
  const gasto = await chamar<{ id: string }>("/gastos", { metodo: "POST", corpo: { conta_id: cenario.contaId, valor: "10.00", descricao: "Compra", data: "2026-11-09", categoria: "conforto" } });
  await chamar(`/gastos/${gasto.id}/coberturas`, { metodo: "POST", corpo: { tag: "computador", valor: "10.00", movimento_id: cenario.resgateComCaixinhasId } });
  const { aoFalhar } = await montar();
  fireEvent.click(menu("Resgate com caixinhas"));
  fireEvent.click(screen.getByRole("menuitem", { name: "Remover caixinhas" }));
  fireEvent.click(await screen.findByRole("button", { name: "Sim, remover" }));
  const alerta = await screen.findByRole("alert");
  expect(alerta.textContent).toMatch(/paga uma compra/);
  expect(aoFalhar).not.toHaveBeenCalled();
});

it("o diálogo de definir usa o vocabulário de caixinha e explica o botão com texto próprio", async () => {
  await montar();
  fireEvent.click(menu("Resgate sem caixinhas"));
  fireEvent.click(screen.getByRole("menuitem", { name: "Definir caixinhas" }));
  const dialogo = await screen.findByRole("dialog", { name: "Definir caixinhas do resgate" });
  expect(within(dialogo).getByText("De quais caixinhas saiu")).toBeTruthy();
  expect(within(dialogo).getByRole("button", { name: "Adicionar caixinha" })).toBeTruthy();
  expect(dialogo.textContent).not.toMatch(/destinaç/i);
  const explicacao = within(dialogo).getByText("Escolha de quais caixinhas saiu o resgate.");
  const confirmar = within(dialogo).getByRole("button", { name: /Definir caixinhas/ });
  expect(confirmar.getAttribute("aria-describedby")).toBe(explicacao.id);
  expect(dialogo.textContent).not.toMatch(/A tag deve ter de 1 a 30 caracteres/);
  expect(dialogo.querySelector('[role="alert"]')).toBeNull();
});

it("o foco que o diálogo e o menu movem sozinhos não faz o erro aparecer; só a interação da pessoa", async () => {
  await montar();
  fireEvent.click(menu("Resgate sem caixinhas"));
  fireEvent.click(screen.getByRole("menuitem", { name: "Definir caixinhas" }));
  const dialogo = await screen.findByRole("dialog", { name: "Definir caixinhas do resgate" });
  const campo = within(dialogo).getByLabelText("Tag da caixinha 1") as HTMLInputElement;
  // O diálogo foca o campo, o menu devolve o foco ao botão e o foco volta ao campo (sem a pessoa).
  act(() => { campo.focus(); });
  act(() => { (menu("Resgate sem caixinhas") as HTMLButtonElement).focus(); });
  act(() => { campo.focus(); });
  act(() => { campo.blur(); });
  expect(dialogo.textContent).not.toMatch(/A tag deve ter de 1 a 30 caracteres/);
  // Agora a pessoa mexe no campo e sai dele: um só erro, ligado ao campo.
  fireEvent.keyDown(campo, { key: "Tab" });
  fireEvent.blur(campo);
  const erros = within(dialogo).getAllByText(/A tag deve ter de 1 a 30 caracteres/);
  expect(erros).toHaveLength(1);
  expect(campo.getAttribute("aria-describedby")).toContain(erros[0].id);
});

it("movimento antigo sem vínculo: uma linha, um menu, com 'Desfazer classificação' em dois passos", async () => {
  const { aoAvisar } = await montar(true);
  const linha = screen.getByRole("listitem", { name: "Resgate com caixinhas" });
  expect(within(linha).getAllByRole("button", { name: /^Mais ações/ })).toHaveLength(1);
  fireEvent.click(within(linha).getByRole("button", { name: /^Mais ações/ }));
  expect(screen.getByRole("menuitem", { name: "Remover caixinhas" })).toBeTruthy();
  fireEvent.click(screen.getByRole("menuitem", { name: /Desfazer classificação/ }));
  expect(document.activeElement?.textContent).toBe("Cancelar");
  expect(aoAvisar).not.toHaveBeenCalled();
});

it("a confirmação de remover lista as caixinhas que saem, com o valor", async () => {
  await montar();
  fireEvent.click(menu("Resgate com caixinhas"));
  fireEvent.click(screen.getByRole("menuitem", { name: "Remover caixinhas" }));
  const dialogo = await screen.findByRole("dialog");
  expect(dialogo.textContent).toContain("Computador");
  expect(dialogo.textContent?.replace(/\u00a0/g, " ")).toContain("R$ 200,00");
  expect(dialogo.textContent).toContain("volta às caixinhas");
  expect(dialogo.textContent).not.toContain("volta a elas");
});

it("há um só menu por linha: com 'Desfazer classificação' as caixinhas entram no mesmo menu", async () => {
  const cenario = prepararCenarioDasCaixinhasDoResgate();
  limparCache();
  const parametros = { inicio: "2000-01-01", fim: "2999-12-31" };
  const movimentos = (await chamar<MovimentoDeInvestimento[]>("/movimentos-de-investimento", { parametros }))
    .map((m) => (m.id === cenario.resgateComCaixinhasId ? { ...m, transacao_importada_id: "00000000-0000-4000-8000-0000000000a9" } : m));
  const investimentos = await chamar<Investimento[]>("/investimentos");
  render(<MovimentosDeInvestimento movimentos={movimentos} investimentos={investimentos} aoAvisar={vi.fn()} aoFalhar={vi.fn()} podeDesfazerClassificacao />);
  const linha = screen.getByRole("listitem", { name: "Resgate com caixinhas" });
  expect(within(linha).getAllByRole("button", { name: /^Mais ações/ })).toHaveLength(1);
  fireEvent.click(within(linha).getByRole("button", { name: /^Mais ações/ }));
  expect(screen.getByRole("menuitem", { name: "Desfazer classificação" })).toBeTruthy();
  expect(screen.getByRole("menuitem", { name: "Remover caixinhas" })).toBeTruthy();
});
