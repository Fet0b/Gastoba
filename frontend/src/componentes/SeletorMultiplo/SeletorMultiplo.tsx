import { useEffect, useId, useRef, useState } from "react";
import { Botao } from "../Botao/Botao";
import { Caixa } from "../Campo/Caixa";
import { CampoDeTexto } from "../Campo/CampoDeTexto";
import estilos from "./SeletorMultiplo.module.css";
export function SeletorMultiplo({ rotulo, opcoes, selecionados, aoMudar, className }: {
    rotulo: string;
    opcoes: readonly {
        valor: string;
        rotulo: string;
        cor?: string;
    }[];
    selecionados: readonly string[];
    aoMudar: (valores: string[]) => void;
    className?: string;
}) { const [aberto, mudar] = useState(false); const [busca, buscar] = useState(""); const ref = useRef<HTMLDivElement>(null); const botao = useRef<HTMLButtonElement>(null); const id = useId(); function fechar() { mudar(false); botao.current?.focus(); } useEffect(() => { if (!aberto)
    return; const fora = (e: PointerEvent) => { if (e.target instanceof Node && !ref.current?.contains(e.target))
    mudar(false); }; document.addEventListener("pointerdown", fora); return () => document.removeEventListener("pointerdown", fora); }, [aberto]); return <div ref={ref} className={[estilos.seletor, className].filter(Boolean).join(" ")} onKeyDown={e => { if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    fechar();
} }}><Botao ref={botao} variante="secundario" aria-expanded={aberto} aria-controls={id} onClick={() => mudar(!aberto)}>{rotulo}: {selecionados.length || "Todas"}</Botao>{aberto && <div id={id} role="group" aria-label={rotulo} className={estilos.opcoes}>{opcoes.length > 20 && <CampoDeTexto rotulo={`Buscar ${rotulo.toLowerCase()}`} valor={busca} aoMudar={buscar} tipo="search"/>}{opcoes.filter(o => o.rotulo.toLocaleLowerCase("pt-BR").includes(busca.toLocaleLowerCase("pt-BR"))).map(o => <Caixa key={o.valor} rotulo={o.rotulo} marcada={selecionados.includes(o.valor)} aoMudar={marcada => aoMudar(marcada ? [...selecionados, o.valor] : selecionados.filter(v => v !== o.valor))}/>)}</div>}</div>; }
