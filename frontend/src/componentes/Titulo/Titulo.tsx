import { type ComponentProps } from "react";
import estilos from "./Titulo.module.css";
/**
 * O título do sistema de design (XI.3): o nível define tamanho, peso e altura de linha. A classe do
 * chamador serve só para margem e posição; uma classe que mude `font-size`, `font-weight` ou
 * `line-height` reabre o defeito dos tamanhos de título soltos e é recusada na revisão.
 */
export function Titulo({ nivel, como, className, ...resto }: ComponentProps<"h2"> & {
    nivel: "pagina" | "secao" | "cartao";
    como?: "h1" | "h2" | "h3" | "h4";
}) { const Elemento = como ?? (nivel === "cartao" ? "h3" : "h2"); return <Elemento {...resto} data-nivel={nivel} className={[estilos.titulo, className].filter(Boolean).join(" ")}/>; }
