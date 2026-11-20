import type { AlvoDaMeta, Meta } from "../../api/tipos";
import { corDaCategoria } from "../../categorias/cores";
import { formatar, percentualDe } from "../../dinheiro/dinheiro";
import estilos from "./Metas.module.css";

type Propriedades = {
  categorias: readonly AlvoDaMeta[];
  metas: readonly Meta[];
  /** A renda do mês ("5000.00"), base dos valores em reais. */
  renda: string;
  comRendaBase?: boolean;
};

/**
 * Gráfico da aba Metas: uma barra com a renda do mês dividida entre as metas
 * (a largura de cada fatia é o percentual) e o que sobra sem destino. A legenda
 * traz o nome e o percentual de cada fatia, então a cor nunca é a única pista; o
 * valor em reais está no rótulo acessível da faixa e no balão do ponteiro.
 */
export function DivisaoDaRenda({ categorias, metas, renda, comRendaBase = false }: Propriedades) {
  const fatias = categorias
    .map((categoria) => ({
      categoria,
      percentual: metas.find((meta) => meta.categoria === categoria.codigo)?.percentual ?? 0,
    }))
    .filter((fatia) => fatia.percentual > 0);
  const soma = fatias.reduce((total, fatia) => total + fatia.percentual, 0);
  const sobra = Math.max(0, 100 - soma);

  const descricao = (nome: string, percentual: number) =>
    `${nome} ${percentual}% (${formatar(percentualDe(renda, percentual))})`;
  const rotuloDaFaixa = fatias
    .map((fatia) => descricao(fatia.categoria.nome, fatia.percentual))
    .concat(sobra > 0 ? [descricao("sem destino", sobra)] : [])
    .join(", ");

  return (
    <figure className={estilos.divisao}>
      <figcaption className={estilos.legendaDoGrafico}>{comRendaBase ? "Divisão da renda-base" : "Divisão da renda do mês"}</figcaption>
      <div className={estilos.faixa} role="img" aria-label={`Divisão da renda: ${rotuloDaFaixa}`}>
        {fatias.map((fatia) => (
          <span
            key={fatia.categoria.codigo}
            className={estilos.fatia}
            aria-hidden="true"
            data-valor={percentualDe(renda, fatia.percentual)}
            data-rotulo={`${fatia.categoria.nome} ${fatia.percentual}%, ${formatar(percentualDe(renda, fatia.percentual))}`}
            style={{
              width: `${fatia.percentual}%`,
              backgroundColor: corDaCategoria(fatia.categoria.codigo),
            }}
          />
        ))}
      </div>
      <ul className={estilos.legenda} aria-label="Legenda da divisão da renda">
        {fatias.map((fatia) => (
          <li key={fatia.categoria.codigo}>
            <span
              className={estilos.ponto}
              style={{ backgroundColor: corDaCategoria(fatia.categoria.codigo) }}
              aria-hidden="true"
            />
            <span>{fatia.categoria.nome}</span> <span>{fatia.percentual}%</span>
          </li>
        ))}
        {sobra > 0 && (
          <li>
            <span className={`${estilos.ponto} ${estilos.pontoVazio}`} aria-hidden="true" />
            <span>Sem destino</span> <span>{sobra}%</span>
          </li>
        )}
      </ul>
    </figure>
  );
}
