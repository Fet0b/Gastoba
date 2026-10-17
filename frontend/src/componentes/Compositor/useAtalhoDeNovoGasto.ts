import { useEffect, useRef } from "react";

/** Elementos em que a tecla N é texto, não atalho. */
const CAMPO_DE_TEXTO = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

/** A tecla é o atalho N de "Novo gasto"? */
function ehAtalho(evento: KeyboardEvent): boolean {
  if (evento.key !== "n" && evento.key !== "N") return false;
  if (evento.ctrlKey || evento.metaKey || evento.altKey) return false;
  if (evento.repeat || evento.isComposing || evento.defaultPrevented) return false;
  // Com qualquer diálogo aberto (o compositor, a folha "Mais"), N não abre outro por cima.
  if (document.querySelector("dialog[open]") !== null) return false;
  const alvo = evento.target;
  return !(alvo instanceof Element && alvo.closest(CAMPO_DE_TEXTO) !== null);
}

/**
 * Atalho global N para abrir o compositor de gasto (`keydown` na `window`).
 * Ignorado com Ctrl, Meta ou Alt, com o foco num campo (`input`, `textarea`,
 * `select`, `contenteditable`) e enquanto `ativo` for falso (o painel passa
 * `false` com o diálogo aberto). Impede o padrão, para o "n" não ser digitado
 * no campo que recebe o foco ao abrir.
 */
export function useAtalhoDeNovoGasto(aoAcionar: () => void, ativo = true): void {
  // A função mais recente numa ref: o ouvinte só muda quando `ativo` muda.
  const acionar = useRef(aoAcionar);
  useEffect(() => {
    acionar.current = aoAcionar;
  });

  useEffect(() => {
    if (!ativo) return;
    function aoTeclar(evento: KeyboardEvent): void {
      if (!ehAtalho(evento)) return;
      evento.preventDefault();
      acionar.current();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [ativo]);
}
