import { useId } from "react";
import estilos from "./Campo.module.css";
export function Opcao({ nome, valor, titulo, descricao, selecionada, aoMudar, desabilitada = false, variante = "linha" }: {
    nome: string;
    valor: string;
    titulo: string;
    descricao?: string;
    selecionada: boolean;
    aoMudar: (valor: string) => void;
    desabilitada?: boolean;
    variante?: "linha" | "cartao";
}) { const id = useId(); return <label className={`${estilos.linha} ${variante === "cartao" ? estilos.cartao : ""}`} htmlFor={id}><input className={estilos.opcao} type="radio" id={id} name={nome} value={valor} checked={selecionada} disabled={desabilitada} onChange={() => aoMudar(valor)} aria-describedby={descricao ? id + "-descricao" : undefined}/><span className={estilos.texto}>{titulo}{descricao && <span id={id + "-descricao"} className={estilos.ajuda}>{descricao}</span>}</span></label>; }
