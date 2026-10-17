import type { Categoria, Meta } from "../../api/tipos";
import { corDaCategoria } from "../../categorias/cores";
import { formatar, percentualDe } from "../../dinheiro/dinheiro";
import estilos from "./Metas.module.css";

type Propriedades = {
  categorias: readonly Categoria[];
  metas: readonly Meta[];
  /** A renda do mês ("5000.00"), base dos valores em reais. */
  renda: string;
};

/**
 * Gráfico da aba Metas: uma barra com a renda do mês dividida entre as metas
 * (a largura de cada fatia é o percentual) e o que sobra sem destino. A legenda
 * traz o percentual e o valor em reais de cada fatia, então a cor nunca é a
 * única pista.
 */
export function DivisaoDaRenda({ categorias, metas, renda }: Propriedades) {
  const fatias = categorias
    .map((categoria) => ({
      categoria,
      percentual: metas.find((meta) => meta.categoria === categoria.codigo)?.percentual ?? 0,
    }))
    .filter((fatia) => fatia.percentual > 0);
  const soma = fatias.reduce((total, fatia) => total + fatia.percentual, 0);
  const sobra = Math.max(0, 100 - soma);

  return (
    <figure className={estilos.divisao}>
      <figcaption className={estilos.legendaDoGrafico}>Divisão da renda do mês</figcaption>
      <div
        className={estilos.faixa}
        role="img"
        aria-label={`Divisão da renda: ${fatias
          .map((f) => `${f.categoria.nome} ${f.percentual}%`)
          .concat(`sem destino ${sobra}%`)
          .join(", ")}`}
      >
        {fatias.map((fatia) => (
          <span
            key={fatia.categoria.codigo}
            className={estilos.fatia}
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
            {fatia.categoria.nome} · {fatia.percentual}% ·{" "}
            <span className="valor">{formatar(percentualDe(renda, fatia.percentual))}</span>
          </li>
        ))}
        <li>
          <span className={`${estilos.ponto} ${estilos.pontoVazio}`} aria-hidden="true" />
          Sem destino · {sobra}% · <span className="valor">{formatar(percentualDe(renda, sobra))}</span>
        </li>
      </ul>
    </figure>
  );
}
