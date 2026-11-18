import {fireEvent,render,screen} from "@testing-library/react";
import {it,expect,vi} from "vitest";
import {ListaDeRecorrencias} from "./ListaDeRecorrencias";

it("exige revisão dedicada e permite encerrar recorrência legada",()=>{
  render(<ListaDeRecorrencias recorrencias={[{id:"r",conta_id:"c",tipo:"gasto",valor:"10.00",descricao:"Recorrência fictícia",dia_do_mes:10,inicio:"2026-10-10",fim:null,categoria:"investimentos",tags:[],ativa:true}]} carregando={false} contas={[]} categorias={[]} sugestoesDeTags={[]} aoEncerrar={async()=>true} aoAlterada={vi.fn()} aoFalhar={vi.fn()} aoRevisar={vi.fn()}/>);
  const alterar=screen.getByRole("button",{name:/Alterar a recorrência/}) as HTMLButtonElement;
  expect(alterar.disabled).toBe(true);
  expect(document.getElementById(alterar.getAttribute("aria-describedby") ?? "")?.textContent).toContain("Categoria antiga: revise em Investimentos");
  fireEvent.click(screen.getByRole("button",{name:/Mais ações da recorrência/}));
  expect((screen.getByRole("menuitem",{name:/Encerrar a recorrência/}) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.getByRole("button",{name:"Revisar em Investimentos"})).toBeTruthy();
});
