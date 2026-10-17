import { type RefObject, useEffect } from "react";

import { CONSULTA_MENOS_MOVIMENTO } from "../movimento";

/** Deslocamento máximo da íris e da pupila, em unidades do viewBox do olho. */
export const RAIO_DO_OLHAR = 4;

/** Distância do cursor (em px) a partir da qual o olhar chega ao raio máximo. */
export const ALCANCE_DO_OLHAR = 240;

type Ponto = { x: number; y: number };

/**
 * Faz o olho seguir o cursor: escreve `--olho-x`/`--olho-y` (em unidades do
 * viewBox, sem unidade CSS) no elemento, dentro de `requestAnimationFrame`.
 * Ignora o toque (fica centrado sem cursor).
 * Volta ao centro quando o cursor sai da janela ou ela perde o foco; não faz
 * nada com `prefers-reduced-motion: reduce` e reage à mudança da preferência.
 */
export function useSeguirCursor(ref: RefObject<HTMLElement | SVGElement | null>): void {
  useEffect(() => {
    const midia = window.matchMedia(CONSULTA_MENOS_MOVIMENTO);
    let cursor: Ponto | null = null;
    let quadro: number | null = null;
    let ligado = false;

    function escrever(elemento: HTMLElement | SVGElement, { x, y }: Ponto): void {
      elemento.style.setProperty("--olho-x", x.toFixed(2));
      elemento.style.setProperty("--olho-y", y.toFixed(2));
    }

    function centralizar(): void {
      const elemento = ref.current;
      if (!elemento) return;
      elemento.style.removeProperty("--olho-x");
      elemento.style.removeProperty("--olho-y");
    }

    function cancelarQuadro(): void {
      if (quadro !== null) cancelAnimationFrame(quadro);
      quadro = null;
    }

    function desenhar(): void {
      quadro = null;
      const elemento = ref.current;
      if (!elemento) return;
      if (!cursor) {
        centralizar();
        return;
      }
      const caixa = elemento.getBoundingClientRect();
      const dx = cursor.x - (caixa.left + caixa.width / 2);
      const dy = cursor.y - (caixa.top + caixa.height / 2);
      const distancia = Math.hypot(dx, dy);
      if (distancia === 0) {
        escrever(elemento, { x: 0, y: 0 });
        return;
      }
      const alcance = (RAIO_DO_OLHAR * Math.min(distancia, ALCANCE_DO_OLHAR)) / ALCANCE_DO_OLHAR;
      escrever(elemento, { x: (dx / distancia) * alcance, y: (dy / distancia) * alcance });
    }

    function agendar(): void {
      cancelarQuadro();
      quadro = requestAnimationFrame(desenhar);
    }

    function aoMover(evento: PointerEvent): void {
      // Toque não é cursor: o dedo arrastando a página não move o olhar.
      if (evento.pointerType === "touch") return;
      cursor = { x: evento.clientX, y: evento.clientY };
      agendar();
    }

    function aoSair(evento: PointerEvent): void {
      // `relatedTarget` nulo: o cursor saiu da janela.
      if (evento.relatedTarget !== null) return;
      cursor = null;
      agendar();
    }

    function aoPerderFoco(): void {
      cursor = null;
      agendar();
    }

    function ligar(): void {
      if (ligado) return;
      ligado = true;
      window.addEventListener("pointermove", aoMover);
      window.addEventListener("pointerout", aoSair);
      window.addEventListener("blur", aoPerderFoco);
    }

    function desligar(): void {
      if (!ligado) return;
      ligado = false;
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("pointerout", aoSair);
      window.removeEventListener("blur", aoPerderFoco);
      cancelarQuadro();
      cursor = null;
    }

    function aoMudarPreferencia(evento: MediaQueryListEvent): void {
      if (evento.matches) {
        desligar();
        centralizar();
      } else {
        ligar();
      }
    }

    if (!midia.matches) ligar();
    midia.addEventListener("change", aoMudarPreferencia);

    return () => {
      midia.removeEventListener("change", aoMudarPreferencia);
      desligar();
    };
  }, [ref]);
}
