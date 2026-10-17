import type { Categoria } from "../../api/tipos";
import { corDaCategoria } from "../../categorias/cores";
import estilos from "./Gastos.module.css";

type Propriedades = {
  /** Categorias de GET /categorias, na ordem do backend; `undefined` enquanto não chegam. */
  categorias: Categoria[] | undefined;
  /** Código da categoria ativa. */
  ativa: string | null;
  /** Clicar numa categoria filtra por ela; clicar na ativa limpa. */
  aoAlternar: (codigo: string) => void;
  aoLimpar: () => void;
};

/**
 * Chips das categorias: ponto colorido + nome em texto (a cor nunca aparece
 * sozinha), com a ativa em Lavanda. "Limpar" só aparece com uma categoria ativa.
 */
export function FiltroDeCategorias({ categorias, ativa, aoAlternar, aoLimpar }: Propriedades) {
  if (!categorias?.length) return null;

  return (
    <div className={estilos.filtro} role="group" aria-label="Filtrar por categoria">
      <span className={estilos.rotuloDoFiltro} aria-hidden="true">
        Categorias
      </span>
      <ul className={estilos.chips}>
        {categorias.map((categoria) => (
          <li key={categoria.codigo}>
            <button
              type="button"
              className={estilos.chip}
              aria-pressed={categoria.codigo === ativa}
              onClick={() => aoAlternar(categoria.codigo)}
            >
              <span
                className={estilos.ponto}
                style={{ backgroundColor: corDaCategoria(categoria.codigo) }}
                aria-hidden="true"
              />
              {categoria.nome}
            </button>
          </li>
        ))}
      </ul>
      {ativa !== null && (
        <button
          type="button"
          className={estilos.limpar}
          aria-label="Limpar filtro de categoria"
          onClick={aoLimpar}
        >
          Limpar
        </button>
      )}
    </div>
  );
}
