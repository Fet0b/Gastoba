import { useId, type ComponentProps } from "react";
import estilos from "./Campo.module.css";
type Propriedades = Omit<ComponentProps<"input">,"type"|"min"|"max"|"value"|"onChange"> & {rotulo:string;valor:number;minimo:number;maximo:number;aoMudar:(valor:number)=>void;passo?:number;desabilitado?:boolean};
export function CampoDeFaixa({rotulo,valor,minimo,maximo,aoMudar,passo=1,desabilitado=false,className,id,...resto}:Propriedades){
  const gerado=useId();const campo=id??gerado;
  return <div className={[estilos.campo,className].filter(Boolean).join(" ")}><label className={estilos.rotulo} htmlFor={campo}>{rotulo}</label><input {...resto} className={`${estilos.entrada} ${estilos.faixa}`} id={campo} type="range" value={valor} min={minimo} max={maximo} step={passo} disabled={desabilitado||resto.disabled} onChange={e=>aoMudar(Number(e.target.value))}/></div>;
}
