import { useId } from "react";
import { Opcao } from "./Opcao";
import estilos from "./Campo.module.css";
export function GrupoDeOpcoes({ legenda, valor, aoMudar, opcoes, variante = "linha", desabilitado = false }: {
    legenda: string;
    valor: string;
    aoMudar: (valor: string) => void;
    opcoes: readonly {
        valor: string;
        titulo: string;
        descricao?: string;
    }[];
    variante?: "linha" | "cartao";
    desabilitado?: boolean;
}) { const nome = useId(); return <fieldset className={estilos.grupo} disabled={desabilitado}><legend className={estilos.legenda}>{legenda}</legend>{opcoes.map(o => <Opcao key={o.valor} {...o} nome={nome} selecionada={o.valor === valor} aoMudar={aoMudar} variante={variante}/>)}</fieldset>; }
