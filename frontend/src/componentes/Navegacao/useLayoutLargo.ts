import { useEffect, useState } from "react";

/** A barra lateral (recolhida ou não) aparece a partir de 45rem (720px); abaixo, a barra de abas. */
const CONSULTA_LAYOUT_LARGO = "(min-width: 45rem)";
/** A barra lateral completa, com os nomes, só a partir de 64rem (1024px). */
const CONSULTA_LAYOUT_COMPLETO = "(min-width: 64rem)";

/** Acompanha uma media query de largura (ex.: "(min-width: 37.5rem)"); `true` sem `matchMedia`. */
export function useConsultaDeMidia(consulta: string): boolean {
  const corresponde = () =>
    typeof window.matchMedia === "function" ? window.matchMedia(consulta).matches : true;
  const [valor, definirValor] = useState(corresponde);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const lista = window.matchMedia(consulta);
    const aoMudar = (evento: MediaQueryListEvent) => definirValor(evento.matches);
    definirValor(lista.matches);
    lista.addEventListener("change", aoMudar);
    return () => lista.removeEventListener("change", aoMudar);
  }, [consulta]);

  return valor;
}

/** `true` no layout com barra lateral (a partir de 45rem) e acompanha mudanças de largura. */
export function useLayoutLargo(): boolean {
  return useConsultaDeMidia(CONSULTA_LAYOUT_LARGO);
}

/** `true` quando a barra lateral cabe inteira, com os nomes (a partir de 64rem). */
export function useLayoutCompleto(): boolean {
  return useConsultaDeMidia(CONSULTA_LAYOUT_COMPLETO);
}
