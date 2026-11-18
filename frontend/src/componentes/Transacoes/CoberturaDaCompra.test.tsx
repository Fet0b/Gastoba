import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {it,expect} from "vitest";
import {chamar} from "../../api/cliente";
import type {Gasto} from "../../api/tipos";
import {prepararCenarioDeCaixinha,prepararCenarioLiberdadeFinanceira} from "../../simulacao/manipuladores";
import {CoberturaDaCompra} from "./CoberturaDaCompra";

it("exige escolha explícita, sugere valor editável e conserva o bruto",async()=>{
 prepararCenarioLiberdadeFinanceira();
 const [g]=await chamar<Gasto[]>("/gastos",{parametros:{inicio:"2026-11-01",fim:"2026-11-30"}});
 render(<CoberturaDaCompra gasto={g} aoFechar={()=>{}}/>);
 const tag=await screen.findByRole("radio",{name:/celular/});
 expect((tag as HTMLInputElement).checked).toBe(false);
 expect((screen.getByRole("button",{name:"Confirmar cobertura"}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(tag);
 expect((screen.getByLabelText("Valor coberto") as HTMLInputElement).value).toContain("80,00");
 fireEvent.change(screen.getByLabelText("Valor coberto"),{target:{value:"30,00"}});
 fireEvent.click(screen.getByRole("button",{name:"Confirmar cobertura"}));
 await waitFor(async()=>expect((await chamar<Gasto[]>("/gastos",{parametros:{inicio:"2026-11-01",fim:"2026-11-30"}}))[0].valor_coberto).toBe("30.00"));
 expect(g.valor).toBe("80.00");
});

it("não usa o ponto do meio e os botões são Botao: confirmar principal, fechar secundário",async()=>{
 prepararCenarioLiberdadeFinanceira();
 const [g]=await chamar<Gasto[]>("/gastos",{parametros:{inicio:"2026-11-01",fim:"2026-11-30"}});
 const {container}=render(<CoberturaDaCompra gasto={g} aoFechar={()=>{}}/>);
 await screen.findByRole("radio",{name:/celular/});
 expect(container.textContent).not.toContain("\u{b7}");
 expect(screen.getByRole("button",{name:"Confirmar cobertura"}).getAttribute("data-papel")).toBe("principal");
 expect(screen.getByRole("button",{name:"Fechar cobertura"}).getAttribute("data-papel")).toBe("secundaria");
});

it("caixinha pede o resgate tagueado sem vínculo de categoria, sugere o valor livre e explica o excedente",async()=>{
 const {gastoId,resgateId}=prepararCenarioDeCaixinha();
 const [g]=await chamar<Gasto[]>("/gastos",{parametros:{inicio:"2026-11-01",fim:"2026-11-30"}});
 expect(g.id).toBe(gastoId);
 render(<CoberturaDaCompra gasto={g} aoFechar={()=>{}}/>);
 fireEvent.click(await screen.findByRole("radio",{name:/computador/}));
 const confirmar=screen.getByRole("button",{name:"Confirmar cobertura"}) as HTMLButtonElement;
 expect(confirmar.disabled).toBe(true);
 expect((screen.getByLabelText("Valor coberto") as HTMLInputElement).value).toContain("0,00");
 const resgate=await screen.findByRole("radio",{name:/Resgate de/});
 expect(resgate.getAttribute("value")).toBe(resgateId);
 fireEvent.click(resgate);
 expect((screen.getByLabelText("Valor coberto") as HTMLInputElement).value).toContain("3.700,00");
 screen.getByText("O que passar do valor da caixinha conta normalmente na categoria.");
 expect(confirmar.disabled).toBe(false);
 fireEvent.click(confirmar);
 await waitFor(async()=>expect((await chamar<Gasto[]>("/gastos",{parametros:{inicio:"2026-11-01",fim:"2026-11-30"}}))[0].coberturas[0]?.movimento_id).toBe(resgateId));
 const metas=await chamar<{metas:{limite_adicional:string;gasto_bruto:string;gasto:string}[]}>("/metas/progresso",{parametros:{mes:"2026-11"}});
 expect([metas.metas[0].limite_adicional,metas.metas[0].gasto_bruto,metas.metas[0].gasto]).toEqual(["3700.00","4200.00","500.00"]);
});

it("reserva histórica ainda permite cobertura métrica sem resgate",async()=>{
 prepararCenarioDeCaixinha();
 // A data consultada fica fora da janela do resgate; resta a reserva histórica.
 const [g]=await chamar<Gasto[]>("/gastos",{parametros:{inicio:"2026-11-01",fim:"2026-11-30"}});
 const movimentos=await chamar<{id:string;tipo:string}[]>("/movimentos-de-investimento",{parametros:{inicio:"2026-11-01",fim:"2026-11-30"}});
 expect(movimentos.some(m=>m.tipo==="resgate")).toBe(true);
 render(<CoberturaDaCompra gasto={{...g,data:"2026-01-05"}} aoFechar={()=>{}}/>);
 fireEvent.click(await screen.findByRole("radio",{name:/computador/}));
 expect((screen.getByRole("button",{name:"Confirmar cobertura"}) as HTMLButtonElement).disabled).toBe(false);
 fireEvent.click(screen.getByRole("button",{name:"Confirmar cobertura"}));
 await waitFor(async()=>expect((await chamar<Gasto[]>("/gastos",{parametros:{inicio:"2026-11-01",fim:"2026-11-30"}}))[0].valor_coberto).toBe("3500.00"));
});
