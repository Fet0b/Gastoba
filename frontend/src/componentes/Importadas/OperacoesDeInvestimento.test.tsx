import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { Investimento, TransacaoImportada } from "../../api/tipos";
import { CartaoDeImportada } from "./CartaoDeImportada";

const INVESTIMENTO: Investimento = {
 id: "i1", nome: "Posição fictícia", tipo: "EQUITY", subtipo: null, saldo: "2789.30", valor_aplicado: null,
 rendimento: null, rentabilidade: null, origem_da_rentabilidade: null, atualizado_em: null, destinacoes: [], taxa: null,
};
const TRANSACAO: TransacaoImportada = {
 id: "t1", conta_id: "c1", data: "2026-11-04", descricao: "LIQ BOLSA - VISTA TX CCP/EMOL/TTA B3", valor: "0.62",
 sentido: "saida", estado: "pendente", tipo_de_operacao: null, sugerir_descarte: false,
 possivel_duplicado: false, investimento_sugerido_id: null, tipo_de_movimento_sugerido: "custo",
};

it("custo exige posição e operação relacionada, sem categoria de despesa", async () => {
 const enviados: unknown[] = [];
 vi.stubGlobal("fetch", async (url: RequestInfo | URL, opcoes?: RequestInit) => {
  if (opcoes?.method === "POST") {
   enviados.push(JSON.parse(String(opcoes.body)));
   return new Response(JSON.stringify({tipo:"custo",id:"custo1"}));
  }
  if (String(url).includes("/movimentos-de-investimento")) return new Response(JSON.stringify([{
   id:"compra1",conta_id:"c1",investimento_id:"i1",tipo:"aporte",origem:"open_finance",data:"2026-11-04",
   valor:"2789.30",descricao:"Compra fictícia",categoria:null,revisao_pendente:false,transacao_importada_id:"compra",
   destinacoes:[],
  }]));
  return new Response("[]");
 });
 const tratar = vi.fn();
 render(<ul><CartaoDeImportada transacao={TRANSACAO} nomeDaConta="Corretora" categorias={[]} sugestoesDeTags={[]} investimentos={[INVESTIMENTO]} aoTratar={tratar} aoFalhar={() => {}} /></ul>);
 expect(screen.queryByLabelText("Categoria de despesa (opcional)")).toBeNull();
 const aceitar = screen.getByRole("button", {name:/Aceitar como custo/}) as HTMLButtonElement;
 expect(aceitar.disabled).toBe(true);
 fireEvent.change(screen.getByLabelText("Investimento"),{target:{value:"i1"}});
 await screen.findByRole("option",{name:/Compra fictícia/});
 fireEvent.change(screen.getByLabelText("Operação relacionada"),{target:{value:"compra1"}});
 expect(enviados).toEqual([]);
 fireEvent.click(aceitar);
 await waitFor(()=>expect(tratar).toHaveBeenCalledWith("Custo do investimento registrado.","t1"));
 expect(enviados).toEqual([{como_investimento:true,tipo_de_movimento:"custo",movimento_relacionado_id:"compra1",tags:[],investimento_id:"i1",destinacoes:[]}]);
});

it("rendimento da caixinha não recebe categoria, tags ou principal de destinação", async () => {
 const enviados: unknown[] = [];
 vi.stubGlobal("fetch", async (_url: RequestInfo | URL, opcoes?: RequestInit) => {
  if (opcoes?.method === "POST") {
   enviados.push(JSON.parse(String(opcoes.body)));
   return new Response(JSON.stringify({tipo:"rendimento",id:"r1"}));
  }
  return new Response("[]");
 });
 const tratar = vi.fn();
 render(<ul><CartaoDeImportada transacao={{...TRANSACAO,descricao:"CONTA REMUNERADA - RENDIMENTO",sentido:"entrada",tipo_de_movimento_sugerido:"rendimento",investimento_sugerido_id:"i1"}} nomeDaConta="Corretora" categorias={[]} sugestoesDeTags={[]} investimentos={[{...INVESTIMENTO,tipo:"CAIXINHA"}]} aoTratar={tratar} aoFalhar={() => {}} /></ul>);
 expect(screen.queryByLabelText("Operação relacionada")).toBeNull();
 expect(screen.queryByLabelText("Categoria de despesa (opcional)")).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:/Aceitar como rendimento/}));
 await waitFor(()=>expect(tratar).toHaveBeenCalledWith("Rendimento registrado no investimento.","t1"));
 expect(enviados).toEqual([{como_investimento:true,tipo_de_movimento:"rendimento",tags:[],investimento_id:"i1",destinacoes:[]}]);
});
