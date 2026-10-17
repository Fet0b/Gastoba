import { useEffect, useRef, useState } from "react";

import { formatar, interpolar } from "../../dinheiro/dinheiro";
import { prefereMenosMovimento } from "../movimento";
import estilos from "./ValorAnimado.module.css";

/** Duração da contagem até o novo valor, em ms. */
export const DURACAO_DA_CONTAGEM = 400;

type Propriedades = {
  /** Valor em string decimal, como chega da API ("974.10"). */
  valor: string;
  className?: string;
};

/** Desaceleração no fim da contagem (os números "assentam"). */
function suavizar(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * Mostra um valor monetário que conta até o novo valor quando muda. O valor
 * final fica no DOM desde o primeiro instante, para leitores de tela e testes;
 * os dígitos que contam ficam em `aria-hidden`. A conta é toda em BigInt
 * (`interpolar`); com `prefers-reduced-motion` o valor troca direto.
 */
export function ValorAnimado({ valor, className }: Propriedades) {
  const [exibido, definirExibido] = useState(valor);
  const [animando, definirAnimando] = useState(false);
  // Valor na tela neste instante: ponto de partida se o valor mudar no meio
  // de uma contagem.
  const exibidoAgora = useRef(valor);

  useEffect(() => {
    const inicio = exibidoAgora.current;
    if (inicio === valor || prefereMenosMovimento()) {
      exibidoAgora.current = valor;
      definirExibido(valor);
      definirAnimando(false);
      return;
    }

    definirAnimando(true);
    let comeco: number | null = null;
    let quadro = requestAnimationFrame(function passo(instante: number) {
      comeco ??= instante;
      const t = (instante - comeco) / DURACAO_DA_CONTAGEM;
      if (t >= 1) {
        exibidoAgora.current = valor;
        definirExibido(valor);
        definirAnimando(false);
        return;
      }
      const intermediario = interpolar(inicio, valor, suavizar(t));
      exibidoAgora.current = intermediario;
      definirExibido(intermediario);
      quadro = requestAnimationFrame(passo);
    });

    return () => cancelAnimationFrame(quadro);
  }, [valor]);

  const classes = ["valor", estilos.valorAnimado, className].filter(Boolean).join(" ");

  return (
    <span className={classes} data-animando={animando ? "" : undefined}>
      <span className="visualmente-oculto">{formatar(valor)}</span>
      <span aria-hidden="true">{formatar(exibido)}</span>
    </span>
  );
}
