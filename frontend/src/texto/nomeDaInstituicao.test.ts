import {expect,it} from "vitest";
import {normalizarNomeDaInstituicao} from "./nomeDaInstituicao";
it.each([
 ["CDB - BANCO BTG PACTUAL S.A.","CDB BTG Pactual"],
 ["OXXO LARGO DO AROUCHE SAO PAULO","Oxxo Largo Do Arouche Sao Paulo"],
 ["MariaBernadete","MariaBernadete"],
 ["ITUB4","ITUB4"],
 ["BANCO","BANCO"],
 ["XP INVESTIMENTOS LTDA","XP Investimentos"],
 ["CDB BANCO INTER S.A. 104% CDI vence 03/2027","CDB Inter 104% CDI vence 03/2027"],
 ["LCA BANCO DO BRASIL SA IPCA+ vence 01/2030","LCA Banco Do Brasil IPCA+ vence 01/2030"],
 ["Livro de TS","Livro de TS"],
 ["Pagamento PIX","Pagamento PIX"],
 ["Tesouro Selic 2029","Tesouro Selic 2029"],
 ["TESOURO IPCA+ 2035","Tesouro IPCA+ 2035"],
 ["FII HGLG11 CSHG","FII HGLG11 Cshg"],
])("normaliza %s",(entrada,esperado)=>expect(normalizarNomeDaInstituicao(entrada)).toBe(esperado));
