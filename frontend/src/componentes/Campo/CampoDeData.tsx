import { useId } from "react";
import { type PropriedadesDoCampo } from "./CampoDeTexto";
import { Icone } from "../Icone/Icone";
import estilos from "./Campo.module.css";
export function CampoDeData({ rotulo, valor, aoMudar, erro, ajuda, className, id, ...resto }: PropriedadesDoCampo & {
    valor: string;
    aoMudar: (valor: string) => void;
}) {
    const gerado = useId();
    const campo = id ?? gerado;
    const mensagem = erro;
    return <div className={[estilos.campo, className].filter(Boolean).join(" ")}><label htmlFor={campo} className={estilos.rotulo}>{rotulo}</label><div className={estilos.moldura}><input {...resto} id={campo} className={`${estilos.entrada} ${estilos.data}`} type="date" value={valor} onChange={e => aoMudar(e.target.value)} aria-invalid={mensagem ? true : undefined} aria-describedby={[ajuda ? campo + "-ajuda" : "", mensagem ? campo + "-erro" : ""].filter(Boolean).join(" ") || undefined}/><span className={estilos.chevron} aria-hidden="true"><Icone nome="calendario" tamanho={20}/></span></div>{ajuda && <p id={campo + "-ajuda"} className={estilos.ajuda}>{ajuda}</p>}{mensagem && <p id={campo + "-erro"} role="alert" className={estilos.erro}>{mensagem}</p>}</div>;
}
