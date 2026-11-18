import { type CSSProperties, type ReactNode } from "react";
import estilos from "./GradeDeIndicadores.module.css";
export function GradeDeIndicadores({ colunas = 3, children, className }: {
    colunas?: 2 | 3 | 4;
    children: ReactNode;
    className?: string;
}) { return <div className={[estilos.moldura, className].filter(Boolean).join(" ")}><div className={estilos.grade} style={{ "--colunas": colunas } as CSSProperties}>{children}</div></div>; }
