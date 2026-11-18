import { Botao } from "../Botao/Botao";
import { Chip } from "../Chip/Chip";
import estilos from "./Gastos.module.css";

type Propriedades = {
  /** Tags de GET /tags; `undefined` enquanto não chegam. */
  tags: string[] | undefined;
  ativa: string | null;
  /** Clicar numa tag filtra por ela; clicar na ativa limpa. */
  aoAlternar: (tag: string) => void;
  aoLimpar: () => void;
};

/**
 * Chips das tags usadas nos gastos. Tags não têm cor: chips neutros, com a
 * ativa preenchida e com ✓. "Limpar" só aparece com uma tag ativa.
 */
export function FiltroDeTags({ tags, ativa, aoAlternar, aoLimpar }: Propriedades) {
  if (!tags?.length && ativa === null) return null;

  return (
    <div className={estilos.filtro} role="group" aria-label="Filtrar por tag">
      <span className={estilos.rotuloDoFiltro} aria-hidden="true">
        Tags
      </span>
      <ul className={estilos.chips}>
        {tags?.map((tag) => (
          <li key={tag}>
            <Chip selecionado={tag === ativa} aoAlternar={() => aoAlternar(tag)}>
              {tag}
            </Chip>
          </li>
        ))}
      </ul>
      {ativa !== null && (
        <Botao variante="terciario" aria-label="Limpar filtro de tag" onClick={aoLimpar}>
          Limpar
        </Botao>
      )}
    </div>
  );
}
