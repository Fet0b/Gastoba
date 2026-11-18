import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {it,expect} from "vitest";
import {CorDaDestinacao} from "./CorDaDestinacao";
import {prepararCenarioLiberdadeFinanceira} from "../../simulacao/manipuladores";
import {chamar} from "../../api/cliente";
import type {ReservaDaDestinacao} from "../../api/tipos";
it("salva a cor imediatamente e Automática remove",async()=>{
 prepararCenarioLiberdadeFinanceira();
 render(<CorDaDestinacao tag="celular" cor={null}/>);
 fireEvent.click(screen.getByRole("button",{name:"Cor de «celular»"}));
 expect(screen.getAllByRole("radio")).toHaveLength(9);
 fireEvent.click(screen.getByRole("radio",{name:"Menta"}));
 await waitFor(async()=>expect((await chamar<ReservaDaDestinacao[]>("/reservas-das-destinacoes",{parametros:{categoria:"conforto"}}))[0].cor).toBe("menta"));
 fireEvent.click(screen.getByRole("radio",{name:"Automática"}));
 await waitFor(async()=>expect((await chamar<ReservaDaDestinacao[]>("/reservas-das-destinacoes",{parametros:{categoria:"conforto"}}))[0].cor).toBeNull());
});

it("reflete a cor atualizada em outra posição da mesma destinação",()=>{
 const {rerender}=render(<CorDaDestinacao tag="celular" cor={null}/>);
 fireEvent.click(screen.getByRole("button",{name:"Cor de «celular»"}));
 rerender(<CorDaDestinacao tag="celular" cor="menta"/>);
 expect((screen.getByRole("radio",{name:"Menta"}) as HTMLInputElement).checked).toBe(true);
});
