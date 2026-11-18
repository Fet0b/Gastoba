import { type ReactNode } from "react";
import { Dica } from "../Dica/Dica";
import estilos from "./Indicador.module.css";
export function Indicador({ rotulo, valor, tom = "neutro", dica, nota, acoes, className }: {
    rotulo: string;
    valor: ReactNode;
    tom?: "neutro" | "positivo" | "negativo" | "atencao";
    dica?: ReactNode;
    nota?: ReactNode;
    acoes?: ReactNode;
    className?: string;
}) { return <div className={[estilos.indicador, className].filter(Boolean).join(" ")} data-tom={tom}><div className={estilos.rotulo}>{rotulo}{dica && <Dica assunto={rotulo}>{dica}</Dica>}{acoes}</div><div className={estilos.valor}>{valor}</div>{nota && <div className={estilos.nota}>{nota}</div>}</div>; }
