import {expect,it} from "vitest";
import {leituraDaMeta,ordenarPorRelevancia} from "./semanticaDaMeta";
import {paraCentavos,deCentavos} from "../dinheiro/dinheiro";
import type {ProgressoDaMeta} from "../api/tipos";
const meta=(categoria:string,gasto:string,limite="100.00"):ProgressoDaMeta=>({nome:categoria,categoria,percentual:20,gasto,limite,restante:deCentavos(paraCentavos(limite)-paraCentavos(gasto)),percentual_usado:paraCentavos(limite)>0n?Number(paraCentavos(gasto)*100n/paraCentavos(limite)):null,situacao:paraCentavos(gasto)>paraCentavos(limite)?"estourou":"dentro",gasto_bruto:gasto,limite_adicional:"0.00",caixinhas:[],rentabilidade:null});
it("guardar superada é positiva e gastar ultrapassada é negativa",()=>{expect(leituraDaMeta(meta("liberdade_financeira","120.00"))).toMatchObject({tom:"positivo",rotulo:"Superou em"});expect(leituraDaMeta(meta("lazer","120.00"))).toMatchObject({tom:"negativo",rotulo:"Passou"});});
it("meta de guardar abaixo do alvo é neutra e no alvo é batida",()=>{expect(leituraDaMeta(meta("liberdade_financeira","20.00")).rotulo).toBe("Faltam");expect(leituraDaMeta(meta("liberdade_financeira","100.00")).rotulo).toBe("Meta batida");});
it("sem renda prevalece e limite zero com gasto é excesso",()=>{expect(leituraDaMeta({...meta("lazer","0.00","0.00"),situacao:"sem_renda"}).rotulo).toBe("Sem renda no mês");expect(leituraDaMeta({...meta("lazer","1.00","0.00"),percentual_usado:null}).tom).toBe("negativo");});
it("ordena sem mudar a lista original",()=>{const lista=[meta("liberdade_financeira","120.00"),meta("lazer","120.00")];expect(ordenarPorRelevancia(lista)[0].categoria).toBe("lazer");expect(lista[0].categoria).toBe("liberdade_financeira");});
