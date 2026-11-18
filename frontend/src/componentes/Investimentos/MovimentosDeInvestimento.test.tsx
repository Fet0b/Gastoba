import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { chamar, URL_BASE } from "../../api/cliente";
import type { MovimentoDeInvestimento, TransacaoImportada } from "../../api/tipos";
import { entrarNaSimulacao, fetchSimulado } from "../../simulacao/fetchSimulado";
import { MovimentosDeInvestimento } from "./MovimentosDeInvestimento";

beforeEach(() => entrarNaSimulacao());
async function preparar(dividido = false) {
  await chamar("/sincronizacoes", { metodo: "POST" });
  const caixa = await chamar<TransacaoImportada[]>("/transacoes-importadas");
  const t = caixa.find((t) => t.descricao === "Farmácia")!;
  await chamar(`/transacoes-importadas/${t.id}/${dividido ? "dividir" : "aceitar"}`, { metodo: "POST", corpo: dividido ? { partes: [{ categoria: "lazer", percentual: 50 }, { como_investimento:true, percentual: 50 }] } : { como_investimento: true } });
  const movimentos = await chamar<MovimentoDeInvestimento[]>("/movimentos-de-investimento", { parametros: { inicio: "2000-01-01", fim: "2999-12-31" } });
  // Exercita o adaptador legado; o teste de prévia abaixo fornece a FK explícita.
  return movimentos.map(m => ({ ...m, transacao_importada_id: null }));
}
function mostrar(movimentos: MovimentoDeInvestimento[], pode = true) {
  const aoAvisar = vi.fn(), aoFalhar = vi.fn();
  const props = { movimentos, investimentos: [], aoAvisar, aoFalhar, podeDesfazerClassificacao: pode };
  return { ...render(<MovimentosDeInvestimento {...props} />), aoAvisar, aoFalhar };
}
/** Abre o menu "Mais ações" da classificação e escolhe "Desfazer classificação"; o diálogo abre. */
function pedirDesfazer(): void {
  fireEvent.click(screen.getByRole("button", { name: /Mais ações de classificação/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: /Desfazer classificação/ }));
}

it("só oferece desfazer classificação com permissão e origem open_finance", async () => {
  const movimentos = await preparar();
  const vista = mostrar(movimentos, false);
  expect(screen.queryByRole("button", { name: /Mais ações de classificação/ })).toBeNull();
  vista.rerender(<MovimentosDeInvestimento movimentos={movimentos} investimentos={[]} aoAvisar={vista.aoAvisar} aoFalhar={vista.aoFalhar} podeDesfazerClassificacao />);
  expect(screen.getByRole("button", { name: /Mais ações de classificação/ })).toBeTruthy();
  vista.rerender(<MovimentosDeInvestimento movimentos={movimentos.map((m) => ({ ...m, origem: "manual" }))} investimentos={[]} aoAvisar={vista.aoAvisar} aoFalhar={vista.aoFalhar} podeDesfazerClassificacao />);
  expect(screen.queryByRole("button", { name: /Mais ações de classificação/ })).toBeNull();
});
it("pede confirmação, foca cancelar, cancela sem chamada e avisa o sucesso", async () => {
  const movimentos = await preparar();
  const vista = mostrar(movimentos);
  pedirDesfazer();
  expect(document.activeElement?.textContent).toBe("Cancelar");
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(document.activeElement).toBe(screen.getByRole("button", { name: /Mais ações de classificação/ }));
  expect(vista.aoAvisar).not.toHaveBeenCalled();
  pedirDesfazer();
  fireEvent.click(screen.getByRole("button", { name: "Sim, desfazer" }));
  await waitFor(() => expect(vista.aoAvisar).toHaveBeenCalledWith("A transação voltou para a caixa de entrada."));
});
it("a divisão exige um segundo consentimento e só o botão próprio envia a flag", async () => {
  const movimentos = await preparar(true);
  const chamadas: unknown[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url, opcoes) => {
    if (String(url).includes("desfazer-classificacao")) chamadas.push(JSON.parse(String(opcoes?.body ?? "{}")));
    return fetchSimulado(url, opcoes);
  }));
  const vista = mostrar(movimentos);
  pedirDesfazer();
  fireEvent.click(screen.getByRole("button", { name: "Sim, desfazer" }));
  const confirmar = await screen.findByRole("button", { name: "Desfazer a divisão inteira" });
  expect(screen.getByRole("alert").textContent).toContain("2 partes");
  expect(document.activeElement?.textContent).toBe("Cancelar");
  expect(chamadas).toEqual([{ desfazer_divisao_inteira: false }]);
  expect(vista.aoFalhar).not.toHaveBeenCalled();
  expect(vista.aoAvisar).not.toHaveBeenCalled();
  fireEvent.click(confirmar);
  await waitFor(() => expect(vista.aoAvisar).toHaveBeenCalled());
  expect(chamadas).toEqual([{ desfazer_divisao_inteira: false }, { desfazer_divisao_inteira: true }]);
});
it.each([409, 422])("mostra a mensagem HTTP %s junto ao movimento", async (status) => {
  const movimentos = await preparar();
  vi.stubGlobal("fetch", async (url: RequestInfo | URL, opcoes?: RequestInit) => String(url).startsWith(URL_BASE) && String(url).includes("desfazer-classificacao") ? new Response(JSON.stringify({ erro: { codigo: status === 409 ? "movimento_nao_desfazivel" : "principal_insuficiente", mensagem: "Nada foi alterado: exemplo." } }), { status }) : fetchSimulado(url, opcoes));
  const vista = mostrar(movimentos);
  pedirDesfazer();
  fireEvent.click(screen.getByRole("button", { name: "Sim, desfazer" }));
  expect((await within(screen.getByRole("listitem", { name: movimentos[0].descricao })).findByRole("alert")).textContent).toBe("Nada foi alterado: exemplo.");
  expect(vista.aoFalhar).not.toHaveBeenCalled();
});
it("cancelar a confirmação da divisão mantém as partes e devolve o foco", async () => {
  const movimentos = await preparar(true);
  mostrar(movimentos);
  pedirDesfazer();
  fireEvent.click(screen.getByRole("button", { name: "Sim, desfazer" }));
  await screen.findByRole("button", { name: "Desfazer a divisão inteira" });
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(document.activeElement).toBe(screen.getByRole("button", { name: /Mais ações de classificação/ }));
  expect(screen.queryByRole("button", { name: "Desfazer a divisão inteira" })).toBeNull();
  expect(await chamar<MovimentoDeInvestimento[]>("/movimentos-de-investimento", { parametros: { inicio: "2000-01-01", fim: "2999-12-31" } })).toHaveLength(1);
});

it("consulta a prévia do movimento importado e confirma versão e coberturas derivadas", async () => {
  const [movimento] = await preparar();
  const chamadas: { caminho: string; corpo?: unknown }[] = [];
  vi.stubGlobal("fetch", async (url: RequestInfo | URL, opcoes?: RequestInit) => {
    const caminho = String(url);
    chamadas.push({ caminho, corpo: opcoes?.body ? JSON.parse(String(opcoes.body)) : undefined });
    if (caminho.endsWith("/impacto-da-reversao")) return new Response(JSON.stringify({
      transacao_id: "origem", versao: "previa-v1", lancamentos_removidos: 1,
      divisao_inteira: false, coberturas_removidas: 2, transacoes_reabertas: 1,
    }));
    if (caminho.endsWith("/desfazer-classificacao")) return new Response(JSON.stringify({ estado: "pendente" }));
    return fetchSimulado(url, opcoes);
  });
  const vista = mostrar([{ ...movimento, transacao_importada_id: "origem" }]);
  pedirDesfazer();
  await screen.findByRole("dialog");
  expect(screen.getByRole("dialog").textContent).toContain("2 cobertura(s)");
  expect(document.activeElement?.textContent).toBe("Cancelar");
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(document.activeElement).toBe(screen.getByRole("button", { name: /Mais ações de classificação/ }));
  expect(chamadas.filter(c => c.corpo)).toEqual([]);
  pedirDesfazer();
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "Sim, desfazer" }));
  await waitFor(() => expect(vista.aoAvisar).toHaveBeenCalled());
  expect(chamadas.filter(c => c.corpo)).toEqual([{
    caminho: `${URL_BASE}/transacoes-importadas/origem/desfazer-classificacao`,
    corpo: { versao_esperada: "previa-v1", desfazer_divisao_inteira: false, desfazer_dependencias: true },
  }]);
});

const semInvestimento = (natureza: MovimentoDeInvestimento["natureza"]): MovimentoDeInvestimento => ({ id: "m", natureza, casamento_id: null, categoria: null, revisao_pendente: false, transacao_importada_id: null, conta_id: "c", investimento_id: null, tipo: "aporte", origem: "open_finance", descricao: "Movimento", valor: "10.00", data: "2026-10-01", destinacoes: [] });
it.each(["liquidacao_de_bolsa", "imposto_ou_taxa"] as const)("não oferece associar à mão quando a natureza é %s", (natureza) => {
  mostrar([semInvestimento(natureza)]);
  expect(screen.queryByRole("button", { name: "Associar a um investimento" })).toBeNull();
  expect(screen.getByText("Ligue na Revisão da bolsa.")).toBeTruthy();
});
it("conta remunerada oferece 'Ligar à conta investimentos' e outra mantém 'Associar a um investimento'", () => {
  const vista = mostrar([semInvestimento("conta_remunerada")]);
  expect(screen.getByRole("button", { name: "Ligar à conta investimentos" })).toBeTruthy();
  vista.unmount();
  mostrar([semInvestimento("outra")]);
  expect(screen.getByRole("button", { name: "Associar a um investimento" })).toBeTruthy();
});

it("a linha mostra o rótulo pela natureza, a descrição do banco em segundo plano e o valor com sinal", () => {
  const base = semInvestimento("outra");
  const liquidacao: MovimentoDeInvestimento = { ...base, id: "l", natureza: "liquidacao_de_bolsa", descricao: "LIQ BOLSA - VISTA BRUTO - PREGÃO: 03/11/2026", valor: "2789.30", investimento_id: "i" };
  const resgate: MovimentoDeInvestimento = { ...base, id: "r", tipo: "resgate", natureza: "outra", descricao: "Resgate CDB", valor: "5000.00", investimento_id: "i" };
  mostrar([liquidacao, resgate]);
  const linhaDaLiquidacao = screen.getByRole("listitem", { name: liquidacao.descricao });
  expect(within(linhaDaLiquidacao).getByText("Liquidação da bolsa")).toBeTruthy();
  expect(within(linhaDaLiquidacao).getByText(liquidacao.descricao).getAttribute("title")).toBe(liquidacao.descricao);
  expect(within(linhaDaLiquidacao).getByText("−R$ 2.789,30")).toBeTruthy();
  const linhaDoResgate = screen.getByRole("listitem", { name: "Resgate CDB" });
  expect(within(linhaDoResgate).getByText("+R$ 5.000,00")).toBeTruthy();
  expect(within(linhaDoResgate).getAllByText("Resgate CDB")).toHaveLength(1);
});
