import type {Conta} from "../api/tipos";
import {deCentavos,paraCentavos} from "../dinheiro/dinheiro";
export function resumirPatrimonio(contas:readonly Conta[]){let correntes=0n,investimentos=0n,faturas=0n;for(const conta of contas){const saldo=paraCentavos(conta.saldo);if(conta.tipo==="cartao")faturas-=saldo;else if(conta.tipo==="remunerada"||conta.papel==="investimento")investimentos+=saldo;else correntes+=saldo;}return {correntes:deCentavos(correntes),investimentos:deCentavos(investimentos),faturas:deCentavos(faturas),liquido:deCentavos(correntes+investimentos-faturas)};}
