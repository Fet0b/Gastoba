import {expect,it} from "vitest";
import {subtotalDoDia} from "./subtotalDoDia";
it("soma entradas menos saídas e aceita dia vazio",()=>{expect(subtotalDoDia([])).toBe("0.00");expect(subtotalDoDia([{tipo:"ganho",valor:"0.30"},{tipo:"gasto",valor:"0.10"}])).toBe("0.20");expect(subtotalDoDia([{tipo:"gasto",valor:"10.00"}])).toBe("-10.00");});
