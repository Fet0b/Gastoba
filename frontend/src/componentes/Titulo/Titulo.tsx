import { type ComponentProps } from "react";
import estilos from "./Titulo.module.css";
export function Titulo({ nivel, como, className, ...resto }: ComponentProps<"h2"> & {
    nivel: "pagina" | "secao" | "cartao";
    como?: "h1" | "h2" | "h3" | "h4";
}) { const Elemento = como ?? (nivel === "cartao" ? "h3" : "h2"); return <Elemento {...resto} data-nivel={nivel} className={[estilos.titulo, className].filter(Boolean).join(" ")}/>; }
