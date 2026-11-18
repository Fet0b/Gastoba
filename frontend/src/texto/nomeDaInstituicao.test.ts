import {expect,it} from "vitest";
import {normalizarNomeDaInstituicao} from "./nomeDaInstituicao";
it.each([["CDB - BANCO BTG PACTUAL S.A.","CDB BTG Pactual"],["OXXO LARGO DO AROUCHE SAO PAULO","Oxxo Largo Do Arouche Sao Paulo"],["MariaBernadete","MariaBernadete"],["ITUB4","ITUB4"],["BANCO","BANCO"],["XP INVESTIMENTOS LTDA","XP Investimentos"]])("normaliza %s",(entrada,esperado)=>expect(normalizarNomeDaInstituicao(entrada)).toBe(esperado));
