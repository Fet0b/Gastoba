import { useId, type ComponentProps, type ReactNode } from "react";
import estilos from "./Campo.module.css";
type Props = Omit<ComponentProps<"input">, "type" | "checked" | "onChange"> & {
    rotulo: ReactNode;
    marcada: boolean;
    aoMudar: (marcada: boolean) => void;
    ajuda?: string;
};
export function Caixa({ rotulo, marcada, aoMudar, ajuda, id, className, ...resto }: Props) { const gerado = useId(); const campo = id ?? gerado; return <label htmlFor={campo} className={[estilos.linha, className].filter(Boolean).join(" ")}><input {...resto} id={campo} className={estilos.opcao} type="checkbox" checked={marcada} onChange={e => aoMudar(e.target.checked)} aria-describedby={ajuda ? campo + "-ajuda" : undefined}/><span className={estilos.texto}>{rotulo}{ajuda && <span id={campo + "-ajuda"} className={estilos.ajuda}>{ajuda}</span>}</span></label>; }
