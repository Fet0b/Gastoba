import { Recolhivel } from "../Recolhivel/Recolhivel";
import { Tabela } from "../Tabela/Tabela";
import { type KeyboardEvent, useRef, useState } from "react";

import { formatar } from "../../dinheiro/dinheiro";
import { type PontoDaEvolucao, pontosDoGrafico } from "../../investimentos/evolucao";
import { rotuloDoDia } from "../../periodo/periodo";
import estilos from "./GraficoDeEvolucao.module.css";

type Propriedades = {
  titulo: string;
  serie: readonly PontoDaEvolucao[];
};

const LARGURA = 320;
const ALTURA = 120;
const MARGEM = 12;

/**
 * A linha do saldo ao longo dos dias guardados. O cursor segue o ponteiro, o toque e o teclado
 * (setas, Início e Fim) e a leitura em texto mostra o dia e o saldo; há uma tabela equivalente.
 * Com um ponto só, mostra o ponto e explica que a linha começa a se formar.
 */
export function GraficoDeEvolucao({ titulo, serie }: Propriedades) {
  const quadro = useRef<SVGSVGElement | null>(null);
  const [cursor, definirCursor] = useState<number | null>(null);
  const pontos = pontosDoGrafico(serie, LARGURA, ALTURA, MARGEM);
  const indice = cursor === null ? pontos.length - 1 : Math.min(cursor, pontos.length - 1);
  const atual = pontos[indice];

  function aoMoverPonteiro(evento: { clientX: number }): void {
    const caixa = quadro.current?.getBoundingClientRect();
    if (!caixa || caixa.width === 0 || pontos.length === 0) return;
    const fracao = Math.min(1, Math.max(0, (evento.clientX - caixa.left) / caixa.width));
    definirCursor(Math.round(fracao * (pontos.length - 1)));
  }

  function aoTeclar(evento: KeyboardEvent<SVGSVGElement>): void {
    const ultimo = pontos.length - 1;
    const passos: Record<string, number> = {
      ArrowLeft: Math.max(0, indice - 1),
      ArrowRight: Math.min(ultimo, indice + 1),
      Home: 0,
      End: ultimo,
    };
    if (!(evento.key in passos)) return;
    evento.preventDefault();
    definirCursor(passos[evento.key]);
  }

  if (!atual) return null;
  const linha = pontos.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className={estilos.grafico}>
      <p className={estilos.leitura} role="status" aria-live="polite">
        <span>{rotuloDoDia(atual.data)}</span>
        <span className={`valor ${estilos.saldo}`}>{formatar(atual.saldo)}</span>
      </p>
      {pontos.length > 1 ? (
        <svg
          ref={quadro}
          viewBox={`0 0 ${LARGURA} ${ALTURA}`}
          className={estilos.svg}
          role="group"
          aria-label={`${titulo}. Use as setas para percorrer os dias.`}
          tabIndex={0}
          onPointerMove={aoMoverPonteiro}
          onPointerDown={aoMoverPonteiro}
          onKeyDown={aoTeclar}
        >
          <polyline points={linha} className={estilos.linha} fill="none" pathLength={1} />
          <line x1={atual.x} x2={atual.x} y1={MARGEM / 2} y2={ALTURA - MARGEM / 2} className={estilos.cursor} />
          <circle cx={atual.x} cy={atual.y} r={4} className={estilos.marca} />
        </svg>
      ) : (
        <p className={estilos.primeiroDia}>
          Primeiro dia guardado. A linha se forma a cada nova sincronização.
        </p>
      )}
      <Recolhivel className={estilos.tabela} resumo="Ver como tabela">
        <Tabela legenda={titulo}>
          <thead>
            <tr>
              <th scope="col">Dia</th>
              <th scope="col">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {serie.map((ponto) => (
              <tr key={ponto.data}>
                <th scope="row">{rotuloDoDia(ponto.data)}</th>
                <td data-numerica="true">{formatar(ponto.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      </Recolhivel>
    </div>
  );
}
