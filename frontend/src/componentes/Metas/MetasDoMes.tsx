import type { AlvoDaMeta, ResumoDasMetas } from "../../api/tipos";
import { Botao } from "../Botao/Botao";
import { LinhaDaMeta } from "./LinhaDaMeta";
import estilos from "./Metas.module.css";

type Propriedades = {
  /** `undefined` enquanto a primeira busca não respondeu (ou se ela falhou). */
  resumo: ResumoDasMetas | undefined;
  carregando: boolean;
  categorias: AlvoDaMeta[] | undefined;
  /** Leva à aba de orçamento. */
  aoAbrirOrcamento: () => void;
};

/**
 * "Metas do mês" na tela inicial: uma linha compacta por categoria que tem meta (barra,
 * percentual da renda e o que resta), para ver de relance quão dentro ou fora da meta a pessoa
 * está. Sem metas, um convite para defini-las. A renda do mês fica no resumo, não aqui.
 */
export function MetasDoMes({ resumo, carregando, categorias, aoAbrirOrcamento }: Propriedades) {
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
      <ul className={estilos.linhasDoInicio}>
        {resumo.metas.map((progresso, indice) => (
          <LinhaDaMeta
            key={progresso.categoria}
            progresso={progresso}
            nome={progresso.nome ?? nomes.get(progresso.categoria) ?? progresso.categoria}
            indice={indice}
            compacta
          />
        ))}
      </ul>
    );
  }

  return (
    <div className={estilos.metasDoMes} aria-busy={carregando}>
      <div className={estilos.cabecalhoDoBloco}>
        <h2 className={estilos.tituloDoBloco}>Metas do mês</h2>
        <Botao variante="terciario" seta onClick={aoAbrirOrcamento}>
          Ver orçamento
        </Botao>
      </div>
      {conteudo}
    </div>
  );
}
