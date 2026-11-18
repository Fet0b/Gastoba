import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { NaturezaDoResgate } from "./NaturezaDoResgate";
import type { MovimentoDeInvestimento } from "../../api/tipos";
it("só confirma vencimento por escolha explícita", async () => {
 const chamadas: unknown[] = [];
 vi.stubGlobal("fetch", async (_url:unknown, opcoes?:RequestInit)=>{chamadas.push(JSON.parse(String(opcoes?.body)));return new Response(null,{status:204});});
 render(<NaturezaDoResgate movimento={{id:"r",tipo:"resgate",vencimento_confirmado:false} as MovimentoDeInvestimento} />);
 expect(chamadas).toHaveLength(0);
 fireEvent.change(screen.getByLabelText("Natureza da entrada"),{target:{value:"vencimento"}});
 expect(chamadas).toHaveLength(0);
 fireEvent.click(screen.getByRole("button",{name:"Confirmar natureza da entrada"}));
 await waitFor(()=>expect(chamadas).toEqual([{tipo:"vencimento"}]));
});
