import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, expect, it } from "vitest";

import { chamar } from "../../api/cliente";
import type { Sincronizacao, TransferenciaEntreContas } from "../../api/tipos";
import { entrarNaSimulacao } from "../../simulacao/fetchSimulado";
import { semearCasosDaCaixa } from "../../simulacao/manipuladores";
import { Aviso, type MensagemDoAviso } from "../Aviso/Aviso";
import { CaixaDeEntrada } from "./CaixaDeEntrada";

beforeEach(() => { entrarNaSimulacao(); semearCasosDaCaixa(); });

function Pagina() {
  const [mensagem, definirMensagem] = useState<MensagemDoAviso | null>(null);
  return <><CaixaDeEntrada aoAvisar={(tipo, texto) => definirMensagem({ tipo, texto })} aoSinalizarOlho={() => {}} /><Aviso mensagem={mensagem} aoDispensar={() => definirMensagem(null)} /></>;
}
async function abrir() {
  await chamar<Sincronizacao>("/sincronizacoes", { metodo: "POST" });
  render(<Pagina />);
  await screen.findByRole("button", { name: "Sincronizar agora" });
}
const ponta = () => screen.findByRole("listitem", { name: "Transferência recebida da conta corrente" });

it("a ponta que chegou depois oferece 'Completar a transferência' e as outras não", async () => {
  await abrir();
  const cartao = await ponta();
  expect(within(cartao).getByRole("button", { name: /^Completar a transferência/ })).toBeTruthy();
  const outro = await screen.findByRole("listitem", { name: "Mercado Extra" });
  expect(within(outro).queryByRole("button", { name: /Completar a transferência/ })).toBeNull();
});

it("completar chama a rota existente, avisa e a ponta sai da caixa", async () => {
  await abrir();
  fireEvent.click(within(await ponta()).getByRole("button", { name: /^Completar a transferência/ }));
  expect(await screen.findByText("Transferência completada.")).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole("listitem", { name: "Transferência recebida da conta corrente" })).toBeNull());
  const hoje = new Date();
  const lista = await chamar<TransferenciaEntreContas[]>("/transferencias-entre-contas", { parametros: { inicio: "2000-01-01", fim: `${hoje.getFullYear() + 1}-01-01` } });
  expect(lista).toHaveLength(1);
  expect(lista[0].transacao_origem_id && lista[0].transacao_destino_id).toBeTruthy();
});
