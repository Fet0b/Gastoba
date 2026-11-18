import { type ReactNode } from "react";
import estilos from "./Tabela.module.css";
type Coluna = {
    chave: string;
    titulo: ReactNode;
    numerica?: boolean;
};
export function Tabela({ legenda, colunas, linhas, children, className }: {
    legenda: string;
    colunas?: readonly Coluna[];
    linhas?: readonly Record<string, ReactNode>[];
    children?: ReactNode;
    className?: string;
}) { return <div className={estilos.rolagem}><table className={[estilos.tabela, className].filter(Boolean).join(" ")}><caption className="visualmente-oculto">{legenda}</caption>{colunas && <thead><tr>{colunas.map(c => <th key={c.chave} scope="col" data-numerica={c.numerica || undefined}>{c.titulo}</th>)}</tr></thead>}{linhas && colunas ? <tbody>{linhas.map((linha, i) => <tr key={i}>{colunas.map(c => <td key={c.chave} data-numerica={c.numerica || undefined}>{linha[c.chave]}</td>)}</tr>)}</tbody> : children}</table></div>; }
