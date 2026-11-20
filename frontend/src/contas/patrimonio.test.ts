import {expect,it} from "vitest";
import {resumirPatrimonio} from "./patrimonio";
import type {Conta} from "../api/tipos";
it("soma centavos exatos, separa remunerada e desconta cartão",()=>{const conta=(tipo:Conta["tipo"],saldo:string):Conta=>({id:tipo,nome:tipo,tipo,saldo,origem:"manual",rotulo:tipo,apelido:null,nome_no_banco:null,final_do_numero:null});expect(resumirPatrimonio([conta("corrente","0.10"),conta("corrente","0.20"),conta("remunerada","10.00"),conta("cartao","-3.00")])).toEqual({correntes:"0.30",investimentos:"10.00",faturas:"3.00",liquido:"7.30"});});
