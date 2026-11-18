import {expect,it} from "vitest";
import {corDaDestinacao} from "./mapaDeCores";
it("mantém cor estável e prioriza escolha explícita",()=>{expect(corDaDestinacao("viagem",null)).toBe(corDaDestinacao("viagem",null));expect(corDaDestinacao("viagem","menta")).toBe("#5BD6B0");});
