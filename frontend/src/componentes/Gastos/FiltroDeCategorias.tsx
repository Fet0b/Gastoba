import type { Categoria } from "../../api/tipos";
import { corDaCategoria } from "../../categorias/cores";
import { Botao } from "../Botao/Botao";
import { Chip } from "../Chip/Chip";
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
 * sozinha), com a ativa preenchida e com ✓. "Limpar" só aparece com uma categoria ativa.
 */
export function FiltroDeCategorias({ categorias, ativa, aoAlternar, aoLimpar }: Propriedades) {
  if (!categorias?.length) return null;

  return (
    <div className={estilos.filtro} role="group" aria-label="Filtrar por categoria">
      <span className={estilos.rotuloDoFiltro} aria-hidden="true">
        Categorias
      </span>
      <ul className={estilos.chips}>
        {categorias.filter(c => !c.legada).map((categoria) => (
          <li key={categoria.codigo}>
            <Chip
              selecionado={categoria.codigo === ativa}
              cor={corDaCategoria(categoria.codigo)}
              aoAlternar={() => aoAlternar(categoria.codigo)}
            >
              {categoria.nome}
            </Chip>
          </li>
        ))}
      </ul>
      {ativa !== null && (
        <Botao variante="terciario" aria-label="Limpar filtro de categoria" onClick={aoLimpar}>
          Limpar
        </Botao>
      )}
    </div>
  );
}
