import { type Ref, useId } from "react";

import type { Categoria } from "../../api/tipos";
import { corDaCategoria } from "../../categorias/cores";
import estilos from "./SeletorDeCategoria.module.css";

type Propriedades = {
  /** Categorias de GET /categorias; `undefined` enquanto não chegam. */
  categorias: readonly Categoria[] | undefined;
  /** Código escolhido; `null` enquanto nenhum foi escolhido (não há padrão). */
  valor: string | null;
  aoMudar: (codigo: string) => void;
  erro?: string;
  /** Recebe a primeira opção (para levar o foco ao grupo). */
  ref?: Ref<HTMLInputElement>;
};

/**
 * Grupo de opções (radio) com as categorias fixas do backend: ponto colorido e
 * nome em texto, porque a cor nunca substitui o nome. Obrigatório e sem opção
 * marcada por padrão; as setas trocam de opção, como em todo grupo de radio.
 */
export function SeletorDeCategoria({ categorias, valor, aoMudar, erro, ref }: Propriedades) {
  const id = useId();
  const idRotulo = `${id}-rotulo`;
  const idErro = `${id}-erro`;

  return (
    <div className={estilos.campo}>
      <span id={idRotulo} className={estilos.rotulo}>
        Categoria
      </span>
      <div
        role="radiogroup"
        className={estilos.opcoes}
        aria-labelledby={idRotulo}
        aria-required="true"
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? idErro : undefined}
      >
        {categorias === undefined ? (
          <p className={estilos.carregando}>Carregando categorias…</p>
        ) : (
          categorias.map((categoria, indice) => {
            const cor = corDaCategoria(categoria.codigo);
            return (
              <label key={categoria.codigo} className={estilos.opcao}>
                <input
                  ref={indice === 0 ? ref : undefined}
                  type="radio"
                  name={id}
                  value={categoria.codigo}
                  checked={valor === categoria.codigo}
                  onChange={() => aoMudar(categoria.codigo)}
                  className={estilos.radio}
                />
                <span
                  className={estilos.ponto}
                  style={{ backgroundColor: cor }}
                  data-cor={cor}
                  aria-hidden="true"
                />
                <span>{categoria.nome}</span>
              </label>
            );
          })
        )}
      </div>
      {erro && (
        <p id={idErro} className={estilos.erro}>
          {erro}
        </p>
      )}
    </div>
  );
}
