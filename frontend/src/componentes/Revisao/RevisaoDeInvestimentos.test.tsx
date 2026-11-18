import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {it,expect,vi} from "vitest";
import {prepararCenarioLiberdadeFinanceira} from "../../simulacao/manipuladores";
import {RevisaoDeInvestimentos} from "./RevisaoDeInvestimentos";
it("revisa em dois passos com foco em Cancelar e sem API antes de confirmar",async()=>{
 prepararCenarioLiberdadeFinanceira({pendente:true});
 const pedidos=vi.spyOn(window,"fetch");
 render(<RevisaoDeInvestimentos/>);
 const revisar=await screen.findByRole("button",{name:"Revisar Aporte para revisar"});
 fireEvent.click(revisar);
 expect(document.activeElement).toBe(screen.getByRole("button",{name:"Cancelar revisão"}));
 expect(pedidos.mock.calls.filter(([,o])=>o?.method==="POST")).toHaveLength(0);
 fireEvent.click(screen.getByRole("button",{name:"Confirmar revisão"}));
 await waitFor(()=>expect(screen.queryByText("Aporte para revisar")).toBeNull());
 expect(pedidos.mock.calls.filter(([url,o])=>String(url).includes("revisao-de-investimentos/aportes")&&o?.method==="POST")).toHaveLength(1);
});
