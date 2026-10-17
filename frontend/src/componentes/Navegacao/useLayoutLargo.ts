import { useEffect, useState } from "react";

const CONSULTA_LAYOUT_LARGO = "(min-width: 48rem)";

function corresponde(): boolean {
  return typeof window.matchMedia === "function"
    ? window.matchMedia(CONSULTA_LAYOUT_LARGO).matches
    : true;
}

/** `true` no layout de computador (a partir de 48rem) e acompanha mudanças de largura. */
export function useLayoutLargo(): boolean {
  const [largo, definirLargo] = useState(corresponde);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const lista = window.matchMedia(CONSULTA_LAYOUT_LARGO);
    const aoMudar = (evento: MediaQueryListEvent) => definirLargo(evento.matches);
    definirLargo(lista.matches);
    lista.addEventListener("change", aoMudar);
    return () => lista.removeEventListener("change", aoMudar);
  }, []);

  return largo;
}
