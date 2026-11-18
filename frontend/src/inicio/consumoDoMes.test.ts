import {expect,it} from "vitest";
import {consumoDoMes} from "./consumoDoMes";
it("limita a fração, trata sem renda e posiciona mês passado",()=>{const base={periodo:{ano:2026,mes:10},hoje:"2026-11-09"};expect(consumoDoMes({...base,gasto:"25.00",disponivel:"100.00"})).toEqual({fracao:250,dia:31,diasNoMes:31});expect(consumoDoMes({...base,gasto:"120.00",disponivel:"100.00"}).fracao).toBe(1000);expect(consumoDoMes({...base,gasto:"0.00",disponivel:"0.00"}).fracao).toBe(0);});
