import type { CSSProperties } from "react";

import type { Categoria, ResumoDasMetas } from "../../api/tipos";
import { formatar } from "../../dinheiro/dinheiro";
import { Medidor } from "./Medidor";
import estilos from "./Metas.module.css";

type Propriedades = {
  /** `undefined` enquanto a primeira busca não respondeu (ou se ela falhou). */
  resumo: ResumoDasMetas | undefined;
  carregando: boolean;
  categorias: Categoria[] | undefined;
  /** Leva à aba de orçamento. */
  aoAbrirOrcamento: () => void;
  /** Filtra a lista de gastos pela categoria (clicar na ativa limpa); sem ele, não há o botão. */
  aoAlternarCategoria?: (codigo: string) => void;
  categoriaAtiva?: string | null;
};

/**
 * "Metas do mês" na tela inicial: a renda do mês e uma barra por categoria que
 * tem meta, para ver de relance quão dentro ou fora da meta a pessoa está. O
 * nome da categoria filtra os gastos; sem metas, um convite para defini-las.
 */
export function MetasDoMes({
  resumo,
  carregando,
  categorias,
  aoAbrirOrcamento,
  aoAlternarCategoria,
  categoriaAtiva = null,
}: Propriedades) {
  const nomes = new Map(categorias?.map((categoria) => [categoria.codigo, categoria.nome]));

  let conteudo;
  if (resumo === undefined) {
    conteudo = (
      <p className={estilos.estado}>
        {carregando ? "Carregando as metas…" : "Não foi possível carregar as metas."}
      </p>
    );
  } else if (resumo.metas.length === 0) {
    conteudo = (
      <p className={estilos.estado}>
        Defina uma meta para acompanhar quanto ainda pode gastar em cada categoria.
      </p>
    );
  } else {
    conteudo = (
      <ul className={estilos.lista}>
        {resumo.metas.map((progresso, indice) => {
          const nome = nomes.get(progresso.categoria) ?? progresso.categoria;
          return (
            <li
              key={progresso.categoria}
              className={estilos.itemDoPainel}
              style={{ "--indice": indice } as CSSProperties}
            >
              <Medidor progresso={progresso} nomeDaCategoria={nome} />
              {aoAlternarCategoria && (
                <button
                  type="button"
                  className={estilos.filtrar}
                  aria-pressed={categoriaAtiva === progresso.categoria}
                  onClick={() => aoAlternarCategoria(progresso.categoria)}
                >
                  {categoriaAtiva === progresso.categoria ? "Limpar filtro" : `Ver gastos de ${nome}`}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className={estilos.metasDoMes} aria-busy={carregando}>
      <div className={estilos.cabecalhoDoBloco}>
        {resumo !== undefined && (
          <p className={estilos.renda}>
            Renda do mês <strong className="valor">{formatar(resumo.renda)}</strong>
          </p>
        )}
        <button type="button" className={estilos.abrir} onClick={aoAbrirOrcamento}>
          Ver orçamento
        </button>
      </div>
      {conteudo}
    </div>
  );
}
