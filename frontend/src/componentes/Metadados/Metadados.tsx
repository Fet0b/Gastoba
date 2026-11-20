import { Children, type ReactNode } from "react";
import estilos from "./Metadados.module.css";
export function Metadados({ children, className }: {
    children: ReactNode;
    className?: string;
}) { return <div data-metadados="" className={[estilos.metadados, className].filter(Boolean).join(" ")}>{Children.toArray(children).map((filho, i) => <span key={i} className={estilos.item}>{filho}</span>)}</div>; }
