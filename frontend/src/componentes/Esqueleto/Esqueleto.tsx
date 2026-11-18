import estilos from "./Esqueleto.module.css";
export function Esqueleto({ linhas = 3, rotulo = "Carregando", className }: {
    linhas?: number;
    rotulo?: string;
    className?: string;
}) { return <div className={[estilos.esqueleto, className].filter(Boolean).join(" ")} role="status" aria-label={rotulo} aria-busy="true"><span className="visualmente-oculto">{rotulo}</span>{Array.from({ length: linhas }, (_, i) => <span key={i} className={estilos.linha} aria-hidden="true"/>)}</div>; }
