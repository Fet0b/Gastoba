import { Recolhivel } from "../Recolhivel/Recolhivel";
import { Tabela } from "../Tabela/Tabela";
import { useId, useState } from "react";

import { deCentavos, formatar, paraCentavos } from "../../dinheiro/dinheiro";
import {
  caminhoDaFatia,
  COR_NEUTRA_DA_PIZZA,
  CORES_DA_PIZZA,
  type EntradaDaPizza,
  prepararPizza,
} from "../../graficos/pizza";
import { Botao } from "../Botao/Botao";
import { EstadoVazio } from "../EstadoVazio/EstadoVazio";
import estilos from "./GraficoDePizza.module.css";
import { rotuloDeExibicao } from "../../texto/rotulo";

type Propriedades = {
  titulo: string;
  entradas: readonly EntradaDaPizza[];
  /** O valor no centro quando nada está selecionado. */
  total: string;
  /** A chave de uma fatia que usa a cor neutra (ex.: "sem destinação"). */
  chaveNeutra?: string;
};

const TAMANHO = 120;
const CENTRO = TAMANHO / 2;
const RAIO_EXTERNO = 54;
const RAIO_INTERNO = 38;

/**
 * A rosca com as partes do total. Cada parte é um botão da legenda (valor e percentual em texto,
 * foco por teclado); o ponteiro sobre a fatia ou o foco na legenda a destaca e mostra o valor no
 * centro. A cor só acompanha o nome. Há uma tabela equivalente. O movimento de entrada é desligado
 * com `prefers-reduced-motion`.
 */
export function GraficoDePizza({ titulo, entradas, total, chaveNeutra }: Propriedades) {
  const id = useId();
  const [destacada, definirDestacada] = useState<string | null>(null);
  const [fora, definirFora] = useState<ReadonlySet<string>>(new Set());
  // Todas as partes (legenda e cores) e só as que ficaram no gráfico (desenho, total e percentuais).
  const todas = prepararPizza([...entradas].sort((a,b) => paraCentavos(a.valor) > paraCentavos(b.valor) ? -1 : paraCentavos(a.valor) < paraCentavos(b.valor) ? 1 : 0));
  const fatias = prepararPizza(entradas.filter((entrada) => !fora.has(entrada.chave)));
  const filtrado = todas.some((fatia) => fora.has(fatia.chave));

  function alternar(chave: string): void {
    definirDestacada(null);
    definirFora((atuais) => {
      const novas = new Set(atuais);
      if (!novas.delete(chave)) novas.add(chave);
      return novas;
    });
  }

  if (todas.length === 0) {
    return (
      <EstadoVazio
        icone="investimentos"
        titulo="Nada para mostrar na distribuição"
        descricao="A distribuição aparece quando houver valores neste período."
      />
    );
  }

  const cores = new Map<string,string>();
  const escolhidas = new Set(todas.flatMap(f=>f.cor?[f.cor.toUpperCase()]:[]));
  const livres = CORES_DA_PIZZA.filter(c=>!escolhidas.has(c.toUpperCase()));
  const automaticas = livres.length>0 ? livres : CORES_DA_PIZZA;
  let proxima=0;
  for(const fatia of todas){
    const neutra=fatia.chave===chaveNeutra || /^Outras(?: \(|$)/.test(fatia.rotulo);
    cores.set(fatia.chave,neutra?COR_NEUTRA_DA_PIZZA:fatia.cor??automaticas[proxima++%automaticas.length]);
  }
  const ativa = fatias.find((fatia) => fatia.chave === destacada);
  const totalDoGrafico = filtrado
    ? deCentavos(fatias.reduce((soma, fatia) => soma + paraCentavos(fatia.valor), 0n))
    : total;

  const linhasDaLegenda = (itens: typeof todas) => itens.map((fatia) => {
            const tirada = fora.has(fatia.chave);
            const noGrafico = fatias.find((f) => f.chave === fatia.chave);
            return (
              <li key={fatia.chave} className={estilos.linha}>
                <button
                  type="button"
                  className={estilos.item}
                  data-destacada={destacada === fatia.chave || undefined}
                  data-fora={tirada || undefined}
                  aria-pressed={!tirada}
                  aria-label={`Mostrar no gráfico: ${fatia.rotulo}`}
                  aria-describedby={`${id}-${fatia.chave}`}
                  onClick={() => alternar(fatia.chave)}
                  onFocus={() => !tirada && definirDestacada(fatia.chave)}
                  onBlur={() => definirDestacada(null)}
                  onPointerEnter={() => !tirada && definirDestacada(fatia.chave)}
                  onPointerLeave={() => definirDestacada(null)}
                >
                  <span
                    className={estilos.ponto}
                    style={{ backgroundColor: cores.get(fatia.chave) }}
                    aria-hidden="true"
                  />
                  <span className={estilos.nome}>{rotuloDeExibicao(fatia.rotulo)}</span>
                  <span className={`valor ${estilos.valor}`}>{formatar(fatia.valor)}</span>
                  <span id={`${id}-${fatia.chave}`} className={estilos.percentual}>
                    {noGrafico ? noGrafico.percentual : "fora do gráfico"}
                  </span>
                </button>
              </li>
            );
          });

  return (
    <div className={estilos.pizza}>
      <div className={estilos.desenho}>
        <svg viewBox={`0 0 ${TAMANHO} ${TAMANHO}`} className={estilos.svg} aria-hidden="true">
          {fatias.map((fatia) => (
            <path
              data-fatia=""
              key={fatia.chave}
              d={caminhoDaFatia(CENTRO, RAIO_EXTERNO, RAIO_INTERNO, fatia.inicio, fatia.fim)}
              fill={cores.get(fatia.chave)}
              className={estilos.fatia}
              data-destacada={destacada === fatia.chave || undefined}
              data-esmaecida={(destacada !== null && destacada !== fatia.chave) || undefined}
              onPointerEnter={() => definirDestacada(fatia.chave)}
              onPointerLeave={() => definirDestacada(null)}
            />
          ))}
        </svg>
        <p className={estilos.centro} aria-hidden="true">
          <span className={estilos.centroRotulo}>
            {ativa ? ativa.rotulo : filtrado ? "Selecionado" : "Total"}
          </span>
          <span className={`valor ${estilos.centroValor}`}>
            {formatar(ativa ? ativa.valor : totalDoGrafico)}
          </span>
        </p>
      </div>

      <div className={estilos.coluna}>
        {filtrado && (
          <div className={estilos.filtro}>
            {fatias.length === 0 && <p className={estilos.vazio}>Nenhuma parte selecionada.</p>}
            <Botao variante="terciario" onClick={() => definirFora(new Set())}>
              Mostrar todas
            </Botao>
          </div>
        )}

        <ul className={estilos.legenda} aria-label={titulo}>
          {linhasDaLegenda(todas.slice(0, 4))}
        </ul>
        {todas.length > 4 && <Recolhivel resumo={`+ ${todas.length - 4} ${titulo.includes("tipo") ? "tipos" : "destinações"}`}><ul className={estilos.legenda} aria-label="Outras partes da distribuição">{linhasDaLegenda(todas.slice(4))}</ul></Recolhivel>}
      </div>

      <Recolhivel className={estilos.tabela} resumo="Ver como tabela">
        <Tabela legenda={titulo}>
          <thead>
            <tr>
              <th scope="col">Parte</th>
              <th scope="col">Valor</th>
              <th scope="col">Percentual</th>
            </tr>
          </thead>
          <tbody>
            {fatias.map((fatia) => (
              <tr key={fatia.chave}>
                <th scope="row"><span className={estilos.ponto} style={{backgroundColor:cores.get(fatia.chave)}} aria-hidden="true"/>{rotuloDeExibicao(fatia.rotulo)}</th>
                <td data-numerica="true">{formatar(fatia.valor)}</td>
                <td data-numerica="true">{fatia.percentual}</td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      </Recolhivel>
    </div>
  );
}
