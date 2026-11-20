import { Botao } from "../Botao/Botao";
import { Icone } from "../Icone/Icone";
import estilos from "./Banner.module.css";
export function Banner({ tom, titulo, texto, acao, className }: {
    tom: "atencao" | "positivo" | "negativo";
    titulo: string;
    texto?: string;
    acao?: {
        rotulo: string;
        aoClicar: () => void;
    };
    className?: string;
}) { return <div className={[estilos.banner, className].filter(Boolean).join(" ")} data-tom={tom}><Icone nome={tom === "positivo" ? "ok" : "alerta"}/><div className={estilos.textos}><strong>{titulo}</strong>{texto && <p>{texto}</p>}</div>{acao && <Botao variante="secundario" onClick={acao.aoClicar}>{acao.rotulo}</Botao>}</div>; }
