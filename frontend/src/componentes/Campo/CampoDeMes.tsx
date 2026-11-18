import { useId } from "react";
import { type PropriedadesDoCampo } from "./CampoDeTexto";
import { Icone } from "../Icone/Icone";
import estilos from "./Campo.module.css";
export function CampoDeMes({ rotulo, valor, aoMudar, erro, ajuda, className, id, ...resto }: PropriedadesDoCampo & {
    valor: string;
    aoMudar: (valor: string) => void;
}) {
    const gerado = useId();
    const campo = id ?? gerado;
    const mensagem = erro ?? (valor && !/^(?!0000)[0-9]{4}-(0[1-9]|1[0-2])$/.test(valor) ? "Informe um mês no formato AAAA-MM." : undefined);
    return <div className={[estilos.campo, className].filter(Boolean).join(" ")}><label htmlFor={campo} className={estilos.rotulo}>{rotulo}</label><div className={estilos.moldura}><input {...resto} id={campo} className={`${estilos.entrada} ${estilos.data}`} type="month" value={valor} onChange={e => aoMudar(e.target.value)} aria-invalid={mensagem ? true : undefined} aria-describedby={[ajuda ? campo + "-ajuda" : "", mensagem ? campo + "-erro" : ""].filter(Boolean).join(" ") || undefined}/><span className={estilos.chevron} aria-hidden="true"><Icone nome="calendario" tamanho={20}/></span></div>{ajuda && <p id={campo + "-ajuda"} className={estilos.ajuda}>{ajuda}</p>}{mensagem && <p id={campo + "-erro"} role="alert" className={estilos.erro}>{mensagem}</p>}</div>;
}
