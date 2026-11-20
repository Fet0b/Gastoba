import type { AlvoDaMeta, ResumoDasMetas } from "../../api/tipos";
import { ordenarPorRelevancia } from "../../metas/semanticaDaMeta";
import { Botao } from "../Botao/Botao";
import { Dica } from "../Dica/Dica";
import { algumGuardado, EXPLICACAO_DO_GUARDADO } from "./guardadoDaMeta";
import { Recolhivel } from "../Recolhivel/Recolhivel";
import { Titulo } from "../Titulo/Titulo";
import { LinhaDaMeta } from "./LinhaDaMeta";
import { Esqueleto } from "../Esqueleto/Esqueleto";
import { EstadoDeErro } from "../EstadoDeErro/EstadoDeErro";
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
      carregando ? <Esqueleto rotulo="Carregando as metas…" /> : <EstadoDeErro mensagem="Não foi possível carregar as metas." />
    );
  } else if (resumo.metas.length === 0) {
    conteudo = (
      <p className={estilos.estado}>
        Defina uma meta para acompanhar quanto ainda pode gastar em cada categoria.
      </p>
    );
  } else {
    const ordenadas = ordenarPorRelevancia(resumo.metas);
    const principais = ordenadas.slice(0, 3);
    const restantes = ordenadas.slice(3);
    const linhas = (metas: typeof ordenadas, deslocamento = 0) => (
      <ul className={estilos.linhasDoInicio}>
        {metas.map((progresso, indice) => (
          <LinhaDaMeta
            key={progresso.categoria}
            progresso={progresso}
            nome={progresso.nome ?? nomes.get(progresso.categoria) ?? progresso.categoria}
            indice={indice + deslocamento}
            compacta
          />
        ))}
      </ul>
    );
    conteudo = <>
      {linhas(principais)}
      {restantes.length > 0 && (
        <Recolhivel resumo={`+ ${restantes.length} metas`}>
          {linhas(restantes, principais.length)}
        </Recolhivel>
      )}
    </>;
  }

  return (
    <div className={estilos.metasDoMes} aria-busy={carregando}>
      <div className={estilos.cabecalhoDoBloco}>
        <Titulo nivel="secao" className={estilos.tituloDoBloco}>Metas do mês</Titulo>
        {resumo !== undefined && algumGuardado(resumo.metas) && (
          <Dica assunto="o guardado para comprar">{EXPLICACAO_DO_GUARDADO}</Dica>
        )}
        <Botao variante="terciario" seta onClick={aoAbrirOrcamento}>
          Ver orçamento
        </Botao>
      </div>
      {conteudo}
    </div>
  );
}
