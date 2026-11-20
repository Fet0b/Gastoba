import { useId, type ComponentProps, type ReactNode } from "react";
import { Icone } from "../Icone/Icone";
import estilos from "./Campo.module.css";
type Props = Omit<ComponentProps<"input">, "type" | "checked" | "onChange"> & {
    rotulo: ReactNode;
    marcada: boolean;
    aoMudar: (marcada: boolean) => void;
    ajuda?: string;
    /** Texto longo com reticências (o inteiro vai no title): em uma linha, ou em até duas ("duas-linhas", opção de lista de escolha). */
    truncar?: boolean | "duas-linhas";
};
/** Caixa de seleção: quadrada, com marca de verificação quando marcada (o rádio é redondo, com ponto). */
export function Caixa({ rotulo, marcada, aoMudar, ajuda, id, className, truncar, ...resto }: Props) { const gerado = useId(); const campo = id ?? gerado; return <label htmlFor={campo} className={[estilos.linha, className].filter(Boolean).join(" ")}><span className={estilos.caixa}><input {...resto} id={campo} className={estilos.opcao} type="checkbox" checked={marcada} onChange={e => aoMudar(e.target.checked)} aria-describedby={ajuda ? campo + "-ajuda" : undefined}/>{marcada && <span className={estilos.marca} data-marca="" aria-hidden="true"><Icone nome="ok" tamanho={16}/></span>}</span><span className={estilos.texto} data-truncar={truncar === "duas-linhas" ? "duas-linhas" : truncar ? "" : undefined} title={truncar && typeof rotulo === "string" ? rotulo : undefined}>{rotulo}{ajuda && <span id={campo + "-ajuda"} className={estilos.ajuda}>{ajuda}</span>}</span></label>; }
