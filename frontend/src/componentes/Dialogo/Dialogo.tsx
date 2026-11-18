import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { Titulo } from "../Titulo/Titulo";
import estilos from "./Dialogo.module.css";
type Props = {
    titulo: string;
    aberto: boolean;
    aoFechar: () => void;
    rodape?: ReactNode;
    children?: ReactNode;
    className?: string;
    descricaoId?: string;
    bloqueado?: boolean;
    focoInicial?: RefObject<HTMLElement | null>;
    devolverFocoPara?: RefObject<HTMLElement | null>;
};
export function Dialogo({ titulo, aberto, aoFechar, rodape, children, className, descricaoId, bloqueado = false, focoInicial, devolverFocoPara }: Props) { const id = useId(); const ref = useRef<HTMLDialogElement>(null); const foco = useRef({ focoInicial, devolverFocoPara }); foco.current = { focoInicial, devolverFocoPara }; useEffect(() => { const elemento = ref.current; if (!elemento || !aberto)
    return; const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null; if (!elemento.open)
    elemento.showModal(); foco.current.focoInicial?.current?.focus(); return () => { if (elemento.open)
    elemento.close(); const alvo = foco.current.devolverFocoPara?.current ?? anterior; if (alvo?.isConnected)
    alvo.focus(); }; }, [aberto]); return <dialog ref={ref} className={[estilos.dialogo, className].filter(Boolean).join(" ")} aria-labelledby={id} aria-describedby={descricaoId} onCancel={e => { e.preventDefault(); if (!bloqueado)
    aoFechar(); }}><Titulo nivel="secao" id={id}>{titulo}</Titulo><div className={estilos.conteudo}>{children}</div>{rodape && <div className={estilos.rodape}>{rodape}</div>}</dialog>; }
