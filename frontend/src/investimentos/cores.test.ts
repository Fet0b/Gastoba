import {it,expect} from "vitest";
import {corDaDestinacao,HEX_DA_COR} from "./cores";
it("mapeia os oito códigos da paleta e automática",()=>{
 expect(Object.values(HEX_DA_COR)).toEqual(["#8B5CF6","#5BD6B0","#E879F9","#60A5FA","#FBBF24","#FF7A90","#B7A8E8","#34D399"]);
 expect(corDaDestinacao(null)).toBeNull();expect(corDaDestinacao("menta")).toBe("#5BD6B0");
});
