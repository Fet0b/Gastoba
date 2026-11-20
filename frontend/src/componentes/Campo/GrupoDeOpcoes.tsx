import { type ReactNode, useId } from "react";
import { Opcao } from "./Opcao";
import estilos from "./Campo.module.css";
export function GrupoDeOpcoes({ legenda, valor, aoMudar, opcoes, variante = "linha", desabilitado = false, escolhida }: {
    legenda: string;
    valor: string;
    aoMudar: (valor: string) => void;
    opcoes: readonly {
        valor: string;
        titulo: string;
        descricao?: string;
        amostra?: ReactNode;
        desabilitada?: boolean;
    }[];
    variante?: "linha" | "cartao" | "compacta";
    desabilitado?: boolean;
    /** Nome do escolhido, mostrado ao lado da legenda (só enfeite: o grupo mantém o nome da legenda). */
    escolhida?: string;
}) { const nome = useId(); return <fieldset className={variante === "compacta" ? `${estilos.grupo} ${estilos.grupoCompacto}` : estilos.grupo} disabled={desabilitado}><legend className={estilos.legenda}>{legenda}{escolhida!==undefined&&<span aria-hidden="true">{`: ${escolhida}`}</span>}</legend>{opcoes.map(o => <Opcao key={o.valor} {...o} nome={nome} selecionada={o.valor === valor} aoMudar={aoMudar} variante={variante}/>)}</fieldset>; }
