import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { TransacaoImportada } from "../../api/tipos";
import { PainelDaTransferencia } from "./ClassificarTransferencia";

const TRANSACAO: TransacaoImportada = { id: "t1", conta_id: "c1", data: "2026-11-04", descricao: "Transferência", valor: "300.00", sentido: "saida", estado: "pendente", tipo_de_operacao: null, sugerir_descarte: false, possivel_duplicado: false, investimento_sugerido_id: null };

it("exige papéis confirmados e par escolhido, e registra a transferência uma vez", async () => {
 const chamadas: { url: string; metodo: string; corpo: Record<string, unknown> }[] = [];
 vi.stubGlobal("fetch", async (url: RequestInfo | URL, opcoes?: RequestInit) => {
  const caminho = String(url), metodo = opcoes?.method ?? "GET";
  if (metodo !== "GET") chamadas.push({ url: caminho, metodo, corpo: JSON.parse(String(opcoes?.body)) });
  if (caminho.endsWith("/contas")) return new Response(JSON.stringify([
   { id: "c1", nome: "Corrente", rotulo: "Corrente", apelido: null, nome_no_banco: null, final_do_numero: null, saldo: "100.00", tipo: "corrente", origem: "open_finance", papel: null },
   { id: "c2", nome: "Corretora", rotulo: "Corretora", apelido: null, nome_no_banco: null, final_do_numero: null, saldo: "300.00", tipo: "corrente", origem: "open_finance", papel: null },
  ]));
  if (caminho.endsWith("/transacoes-importadas")) return new Response(JSON.stringify([{ ...TRANSACAO, id: "t2", conta_id: "c2", sentido: "entrada" }]));
  if (metodo === "GET") return new Response("[]");
  return new Response(JSON.stringify({ id: "transferencia" }));
 });
 const concluir = vi.fn();
 render(<PainelDaTransferencia transacao={TRANSACAO} aoConcluir={concluir} ignorar={<button type="button">Ignorar</button>} />);
 const confirmar = screen.getByRole("button", { name: /^Confirmar transferência/ }) as HTMLButtonElement;
 expect(confirmar.disabled).toBe(false);
 fireEvent.click(confirmar);
 expect(screen.getByText("Escolha uma conta")).toBeTruthy();
 fireEvent.click(await screen.findByLabelText("Corretora, Conta corrente"));
 const conta = await screen.findByLabelText("Função da conta Corrente, Conta corrente");
 fireEvent.click(confirmar);
 expect(screen.getByText("Confirme a função das duas contas")).toBeTruthy();
 expect(chamadas).toEqual([]);
 fireEvent.change(conta, { target: { value: "corrente" } });
 fireEvent.change(screen.getByLabelText("Função da conta Corretora, Conta corrente"), { target: { value: "investimento" } });
 await screen.findByRole("option", { name: "2026-11-04 Transferência" });
 fireEvent.change(screen.getByLabelText("Outro lado da transferência"), { target: { value: "t2" } });
 expect(chamadas).toEqual([]);
 fireEvent.click(confirmar);
 await waitFor(() => expect(concluir).toHaveBeenCalledOnce());
 expect(chamadas.map(c => c.metodo)).toEqual(["PUT", "PUT", "POST"]);
 expect(chamadas[2].corpo).toEqual({ conta_contraparte_id: "c2", par_transacao_id: "t2" });
});
