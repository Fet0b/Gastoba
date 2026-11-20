import type { Ref } from "react";

import type { Categoria } from "../../api/tipos";
import { corDaCategoria } from "../../categorias/cores";
import { GrupoDeChips } from "./GrupoDeChips";

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
 * Grupo de opções (radio) com as categorias ativas do backend: ponto colorido e nome em texto,
 * porque a cor nunca substitui o nome. Obrigatório e sem opção marcada por padrão; as setas
 * trocam de opção, como em todo grupo de radio. A categoria legada nunca é oferecida.
 */
export function SeletorDeCategoria({ categorias, valor, aoMudar, erro, ref }: Propriedades) {
  return (
    <GrupoDeChips
      rotulo="Categoria"
      carregando="Carregando categorias…"
      opcoes={categorias
        ?.filter((categoria) => !categoria.legada)
        .map((categoria) => ({
          valor: categoria.codigo,
          nome: categoria.nome,
          cor: corDaCategoria(categoria.codigo),
        }))}
      valor={valor}
      aoMudar={aoMudar}
      erro={erro}
      ref={ref}
    />
  );
}
