import type {CorDaDestinacao} from "../api/tipos";
import {HEX_DA_COR} from "../investimentos/cores";
export {corDaCategoria} from "../categorias/cores";
const PALETA=Object.values(HEX_DA_COR);
export function corDaDestinacao(tag:string,corEscolhida:CorDaDestinacao|null=null):string {if(corEscolhida)return HEX_DA_COR[corEscolhida];let hash=0;for(const letra of tag)hash=(Math.imul(hash,31)+letra.codePointAt(0)!)>>>0;return PALETA[hash%PALETA.length];}
