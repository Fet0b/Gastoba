import { useEffect, useLayoutEffect, useRef } from "react";

/** Elementos em que a tecla N é texto, não atalho. */
const CAMPO_DE_TEXTO = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

/** A tecla é o atalho N de "Novo gasto"? */
function ehAtalho(evento: KeyboardEvent): boolean {
  if (evento.key !== "n" && evento.key !== "N") return false;
  if (evento.ctrlKey || evento.metaKey || evento.altKey) return false;
  if (evento.repeat || evento.isComposing || evento.defaultPrevented) return false;

  const alvo = evento.target instanceof Element ? evento.target : null;
  const foco = document.activeElement instanceof Element ? document.activeElement : null;

  const dentroDeCampo =
    (alvo !== null && alvo.closest(CAMPO_DE_TEXTO) !== null) ||
    (foco !== null && foco.closest(CAMPO_DE_TEXTO) !== null);
  if (dentroDeCampo) return false;

  // Qualquer diálogo aberto (o compositor, a folha "Mais") não recebe outro N por cima.
  const dentroDeDialogoAberto =
    (alvo !== null && alvo.closest("dialog[open]") !== null) ||
    (foco !== null && foco.closest("dialog[open]") !== null) ||
    document.querySelector("dialog[open]") !== null;
  if (dentroDeDialogoAberto) return false;

  return true;
}

/**
 * Atalho global N para abrir o compositor de gasto (`keydown` na `window`).
 * Ignorado com Ctrl, Meta ou Alt, com o foco num campo (`input`, `textarea`,
 * `select`, `contenteditable`) e enquanto `ativo` for falso (o painel passa
 * `false` com o diálogo aberto). Impede o padrão, para o "n" não ser digitado
 * no campo que recebe o foco ao abrir.
 */
export function useAtalhoDeNovoGasto(aoAcionar: () => void, ativo = true): void {
  // Atualiza antes de receber eventos sobre o DOM recém-renderizado (contas carregadas).
  // O ouvinte só muda quando `ativo` muda.
  const acionar = useRef(aoAcionar);
  useLayoutEffect(() => {
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
