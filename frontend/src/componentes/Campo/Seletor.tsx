import { useId, type ComponentProps } from "react";
import { Icone } from "../Icone/Icone";
import estilos from "./Campo.module.css";
type Props = Omit<ComponentProps<"select">, "value" | "onChange"> & {
    rotulo: string;
    valor: string;
    aoMudar: (valor: string) => void;
    opcoes: readonly {
        valor: string;
        rotulo: string;
        desabilitada?: boolean;
    }[];
    /** Grupos de opções (`optgroup`), depois das opções avulsas. */
    grupos?: readonly {
        nome: string;
        opcoes: readonly {
            valor: string;
            rotulo: string;
            desabilitada?: boolean;
        }[];
    }[];
    vazio?: string;
    erro?: string;
};
export function Seletor({ rotulo, valor, aoMudar, opcoes, grupos, vazio, erro, className, id, ...resto }: Props) { const gerado = useId(); const campo = id ?? gerado; return <div className={[estilos.campo, className].filter(Boolean).join(" ")}><label htmlFor={campo} className={estilos.rotulo}>{rotulo}</label><div className={estilos.moldura}><select {...resto} id={campo} className={`${estilos.entrada} ${estilos.seletor}`} value={valor} onChange={e => aoMudar(e.target.value)} aria-invalid={erro ? true : undefined} aria-describedby={erro ? campo + "-erro" : undefined}>{vazio !== undefined && <option value="">{vazio}</option>}{opcoes.map(o => <option key={o.valor} value={o.valor} disabled={o.desabilitada}>{o.rotulo}</option>)}{grupos?.map(g => <optgroup key={g.nome} label={g.nome}>{g.opcoes.map(o => <option key={o.valor} value={o.valor} disabled={o.desabilitada}>{o.rotulo}</option>)}</optgroup>)}</select><span className={estilos.chevron} aria-hidden="true"><Icone nome="chevron" tamanho={16}/></span></div>{erro && <p id={campo + "-erro"} role="alert" className={estilos.erro}>{erro}</p>}</div>; }
