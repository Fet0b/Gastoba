import { type ReactNode, useId } from "react";
import { Icone } from "../Icone/Icone";
import estilos from "./Campo.module.css";
export function Opcao({ nome, valor, titulo, descricao, amostra, selecionada, aoMudar, desabilitada = false, variante = "linha" }: {
    nome: string;
    valor: string;
    titulo: string;
    descricao?: string;
    /** Desenho decorativo (textura, logo) mostrado antes do texto; o nome continua sendo o título. */
    amostra?: ReactNode;
    selecionada: boolean;
    aoMudar: (valor: string) => void;
    desabilitada?: boolean;
    variante?: "linha" | "cartao" | "compacta";
}) { const id = useId(); if (variante === "compacta") return <label className={estilos.compacta} data-variante="compacta" title={titulo} htmlFor={id}><input className={estilos.opcaoCompacta} type="radio" id={id} name={nome} value={valor} checked={selecionada} disabled={desabilitada} onChange={() => aoMudar(valor)}/>{amostra && <span className={estilos.amostraCompacta} aria-hidden="true">{amostra}</span>}{selecionada && <span className={estilos.selo} data-selo="" aria-hidden="true"><Icone nome="verificado" tamanho={16}/></span>}<span className="visualmente-oculto">{titulo}</span></label>; return <label className={`${estilos.linha} ${variante === "cartao" ? estilos.cartao : ""}`} htmlFor={id}><input className={estilos.opcao} type="radio" id={id} name={nome} value={valor} checked={selecionada} disabled={desabilitada} onChange={() => aoMudar(valor)} aria-describedby={descricao ? id + "-descricao" : undefined}/>{amostra && <span className={estilos.amostra} aria-hidden="true">{amostra}</span>}<span className={estilos.texto}>{titulo}{descricao && <span id={id + "-descricao"} className={estilos.ajuda}>{descricao}</span>}</span></label>; }
