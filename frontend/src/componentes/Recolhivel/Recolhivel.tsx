import { type ComponentProps, type ReactNode } from "react";
import { Icone } from "../Icone/Icone";
import estilos from "./Recolhivel.module.css";

type Propriedades = Omit<ComponentProps<"details">, "children" | "open"> & {
  resumo: ReactNode;
  abertoDeInicio?: boolean;
  children: ReactNode;
};
export function Recolhivel({ resumo, abertoDeInicio = false, children, className, ...resto }: Propriedades) {
  return <details {...resto} open={abertoDeInicio} className={[estilos.recolhivel, className].filter(Boolean).join(" ")}>
    <summary className={estilos.resumo}>{resumo}<span className={estilos.chevron} aria-hidden="true"><Icone nome="chevron" tamanho={16} /></span></summary>
    <div className={estilos.conteudo}>{children}</div>
  </details>;
}
