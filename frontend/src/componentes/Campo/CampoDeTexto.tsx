import { useId, type ComponentProps, type Ref } from "react";
import estilos from "./Campo.module.css";
export type PropriedadesDoCampo = Omit<ComponentProps<"input">, "value" | "onChange" | "type"> & {
    ref?: Ref<HTMLInputElement>;
    rotulo: string;
    valor?: string;
    aoMudar?: (valor: string) => void;
    ajuda?: string;
    erro?: string;
};
export function CampoDeTexto({ rotulo, valor, aoMudar, ajuda, erro, tipo = "text", className, id, ref, ...resto }: PropriedadesDoCampo & {
    tipo?: "text" | "email" | "password" | "search";
}) {
    const gerado = useId();
    const campo = id ?? gerado;
    const descricoes = [resto["aria-describedby"], ajuda ? campo + "-ajuda" : "", erro ? campo + "-erro" : ""].filter(Boolean).join(" ") || undefined;
    return <div className={[estilos.campo, className].filter(Boolean).join(" ")}><label className={estilos.rotulo} htmlFor={campo}>{rotulo}</label><input {...resto} ref={ref} id={campo} className={estilos.entrada} type={tipo} aria-label={resto["aria-label"] ?? rotulo} value={valor} onChange={e => aoMudar?.(e.target.value)} aria-invalid={erro ? true : resto["aria-invalid"]} aria-describedby={descricoes}/>{ajuda && <p id={campo + "-ajuda"} className={estilos.ajuda}>{ajuda}</p>}{erro && <p id={campo + "-erro"} role="alert" className={estilos.erro}>{erro}</p>}</div>;
}
