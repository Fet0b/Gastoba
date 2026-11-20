// Módulo puro da pizza dos investimentos: fatias com fração e percentual (BigInt para o dinheiro)
// e o caminho SVG de cada arco. Nenhum Number sobre dinheiro; os ângulos são só geometria.

import { paraCentavos } from "../dinheiro/dinheiro";
import { fracaoDe, rotuloDoPercentual } from "./fatias";

export type EntradaDaPizza = { cor?:string|null; chave: string; rotulo: string; valor: string };

export type FatiaDaPizza = EntradaDaPizza & {
  fracao: number;
  percentual: string;
  /** Início e fim do arco, em voltas (0 a 1), a partir do topo e no sentido horário. */
  inicio: number;
  fim: number;
};

/** As fatias de valor positivo, na ordem dada, com fração e posição no círculo. */
export function prepararPizza(entradas: readonly EntradaDaPizza[]): FatiaDaPizza[] {
  const positivas = entradas.filter((entrada) => paraCentavos(entrada.valor) > 0n);
  const total = positivas.reduce((soma, entrada) => soma + paraCentavos(entrada.valor), 0n);
  const totalTexto = `${total / 100n}.${(total % 100n).toString().padStart(2, "0")}`;
  let acumulado = 0;
  return positivas.map((entrada) => {
    const fracao = fracaoDe(entrada.valor, totalTexto);
    const fatia = {
      ...entrada,
      fracao,
      percentual: rotuloDoPercentual(fracao),
      inicio: acumulado,
      fim: Math.min(1, acumulado + fracao),
    };
    acumulado = fatia.fim;
    return fatia;
  });
}

function ponto(centro: number, raio: number, volta: number): [number, number] {
  const angulo = volta * 2 * Math.PI - Math.PI / 2;
  return [centro + raio * Math.cos(angulo), centro + raio * Math.sin(angulo)];
}

const arredondar = (n: number) => Math.round(n * 100) / 100;

/**
 * O caminho de uma fatia de rosca (anel entre `raioInterno` e `raioExterno`) num quadro
 * `2 * centro` de lado. Uma fatia que ocupa a volta toda vira dois semicírculos, porque um arco
 * SVG de 360 graus não desenha nada.
 */
export function caminhoDaFatia(
  centro: number,
  raioExterno: number,
  raioInterno: number,
  inicio: number,
  fim: number,
): string {
  const cheia = fim - inicio >= 0.9999;
  const fimEfetivo = cheia ? inicio + 0.5 : fim;
  const grande = fimEfetivo - inicio > 0.5 ? 1 : 0;
  const [x1, y1] = ponto(centro, raioExterno, inicio);
  const [x2, y2] = ponto(centro, raioExterno, fimEfetivo);
  const [x3, y3] = ponto(centro, raioInterno, fimEfetivo);
  const [x4, y4] = ponto(centro, raioInterno, inicio);
  const n = arredondar;
  const externo = `M ${n(x1)} ${n(y1)} A ${raioExterno} ${raioExterno} 0 ${grande} 1 ${n(x2)} ${n(y2)}`;
  const interno = `L ${n(x3)} ${n(y3)} A ${raioInterno} ${raioInterno} 0 ${grande} 0 ${n(x4)} ${n(y4)} Z`;
  if (!cheia) return `${externo} ${interno}`;
  const [x5, y5] = ponto(centro, raioExterno, inicio + 1);
  const [x6, y6] = ponto(centro, raioInterno, inicio + 1);
  return (
    `${externo} A ${raioExterno} ${raioExterno} 0 0 1 ${n(x5)} ${n(y5)} ` +
    `L ${n(x6)} ${n(y6)} A ${raioInterno} ${raioInterno} 0 0 0 ${n(x3)} ${n(y3)} ` +
    `A ${raioInterno} ${raioInterno} 0 0 0 ${n(x4)} ${n(y4)} Z`
  );
}

/** Cores categóricas da pizza; o cinza fica para "sem destinação" e "outras". */
export const CORES_DA_PIZZA: readonly string[] = [
  "#8B5CF6",
  "#5BD6B0",
  "#E879F9",
  "#60A5FA",
  "#FBBF24",
  "#FF7A90",
  "#B7A8E8",
  "#34D399",
];
export const COR_NEUTRA_DA_PIZZA = "#9A8FB8";
