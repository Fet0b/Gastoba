import { formatar } from "../../dinheiro/dinheiro";
import {
  lerPercentual,
  type LinhaDeDestinacao,
  type RestanteDaDistribuicao,
  somaDosPercentuais,
} from "../../investimentos/destinacoes";
import { normalizarTag } from "../../tags/tags";
import estilos from "./EditorDeDestinacoes.module.css";

type Propriedades = {
  linhas: readonly LinhaDeDestinacao[];
  /** Saída de valoresEmAndamento; lista vazia sem valor a dividir. */
  valores: readonly (string | null)[];
  cores: readonly string[];
  restante: RestanteDaDistribuicao;
};

type Item = { rotulo: string; percentual: number; valor: string | null; cor: string };

/** A divisão inteira numa barra empilhada, com o que ainda falta distribuir e a legenda em texto. */
export function BarraDaDistribuicao({ linhas, valores, cores, restante }: Propriedades) {
  const itens: Item[] = [];
  linhas.forEach((linha, posicao) => {
    const percentual = lerPercentual(linha.percentual);
    if (percentual === null) return;
    const tag = normalizarTag(linha.tag);
    itens.push({
      rotulo: tag === "" ? `Destinação ${posicao + 1}` : tag,
      percentual,
      valor: valores[posicao] ?? null,
      cor: cores[posicao],
    });
  });
  const soma = somaDosPercentuais(linhas);
  const base = Math.max(100, soma);
  const largura = (percentual: number) => `${Math.round((percentual / base) * 1e6) / 1e4}%`;
  const falta = restante.situacao === "falta";
  const descricao = (rotulo: string, percentual: number, valor: string | null) =>
    `${rotulo} ${percentual}%${valor === null ? "" : `, ${formatar(valor)}`}`;
  const rotulo = [
    ...itens.map((i) => descricao(i.rotulo, i.percentual, i.valor)),
    ...(falta ? [descricao("A distribuir", restante.percentual, restante.valor)] : []),
  ].join("; ");

  return (
    <figure className={estilos.figura} data-barra-da-distribuicao="">
      <div className={estilos.faixa} role="img" aria-label={`Distribuição: ${rotulo}`}>
        {itens.map((item, i) => (
          <span
            key={i}
            className={estilos.segmento}
            data-segmento=""
            style={{ width: largura(item.percentual), backgroundColor: item.cor }}
          />
        ))}
        {falta && (
          <span
            className={estilos.segmento}
            data-segmento="a-distribuir"
            style={{ width: largura(restante.percentual) }}
          />
        )}
      </div>
      <ul className={estilos.legendaDaFaixa} aria-label="Legenda da distribuição">
        {itens.map((item, i) => (
          <li key={i} className={estilos.itemDaLegenda}>
            <span className={estilos.ponto} aria-hidden="true" style={{ backgroundColor: item.cor }} />
            <span>{item.rotulo}</span>
            <span>{item.percentual}%</span>
            {item.valor !== null && <span className="valor">{formatar(item.valor)}</span>}
          </li>
        ))}
        {falta && (
          <li className={estilos.itemDaLegenda}>
            <span>A distribuir</span>
            <span>{restante.percentual}%</span>
            {restante.valor !== null && <span className="valor">{formatar(restante.valor)}</span>}
          </li>
        )}
      </ul>
    </figure>
  );
}
