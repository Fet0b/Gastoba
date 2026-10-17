import { type CSSProperties, useState } from "react";

import type { Categoria, Conta, Ganho } from "../../api/tipos";
import { rotuloDoDia } from "../../periodo/periodo";
import {
  agruparPorDia,
  fatiaDaPagina,
  type TransacaoDaLinha,
} from "../../transacoes/linhaDoTempo";
import { AcaoDeExcluirGanho } from "./AcaoDeExcluirGanho";
import { LinhaDeTransacao } from "./LinhaDeTransacao";
import estilos from "./LinhaDoTempo.module.css";

type Propriedades = {
  /** Já unidas, filtradas e ordenadas (mais recentes primeiro). */
  transacoes: readonly TransacaoDaLinha[];
  contas: Conta[] | undefined;
  categorias: Categoria[] | undefined;
  /** Exclui o ganho; devolve `true` se deu certo. */
  aoExcluirGanho: (ganho: Ganho) => Promise<boolean>;
  /** Quando este texto muda (mês, filtros, busca), a paginação volta às 100 primeiras. */
  reiniciarQuando?: string;
  /** Clicar na categoria ou numa tag da linha filtra por ela (a ativa limpa). */
  aoAlternarCategoria?: (codigo: string) => void;
  aoAlternarTag?: (tag: string) => void;
  categoriaAtiva?: string | null;
  tagAtiva?: string | null;
};

/**
 * A linha do tempo única: gastos e ganhos agrupados por dia ("Hoje", "Ontem", "sexta, 3 de
 * outubro"), de 100 em 100 com "Mostrar mais". Quem usa muda `reiniciarQuando` quando os filtros
 * mudam, para a paginação voltar ao começo sem remontar a lista.
 */
export function LinhaDoTempo({
  transacoes,
  contas,
  categorias,
  aoExcluirGanho,
  aoAlternarCategoria,
  aoAlternarTag,
  categoriaAtiva,
  tagAtiva,
  reiniciarQuando = "",
}: Propriedades) {
  const [paginas, definirPaginas] = useState(1);
  // Sem remontar a lista (os dias que continuam não animam de novo): zera durante a renderização.
  const [chaveAnterior, definirChaveAnterior] = useState(reiniciarQuando);
  if (chaveAnterior !== reiniciarQuando) {
    definirChaveAnterior(reiniciarQuando);
    definirPaginas(1);
  }
  const nomesDasContas = new Map(contas?.map((conta) => [conta.id, conta.nome]));
  const nomesDasCategorias = new Map(categorias?.map((categoria) => [categoria.codigo, categoria.nome]));
  const { itens, restantes } = fatiaDaPagina(transacoes, paginas);

  return (
    <div className={estilos.linhaDoTempo}>
      <ol className={estilos.dias}>
        {agruparPorDia(itens).map((dia, posicao) => (
          <li
            key={dia.data}
            className={estilos.dia}
            style={{ "--atraso": `${Math.min(posicao, 8) * 40}ms` } as CSSProperties}
          >
            <h3 className={estilos.rotuloDoDia}>{rotuloDoDia(dia.data)}</h3>
            <ul className={estilos.linhas}>
              {dia.transacoes.map((transacao) => (
                <LinhaDeTransacao
                  key={`${transacao.tipo}-${transacao.id}`}
                  transacao={transacao}
                  nomeDaConta={nomesDasContas.get(transacao.conta_id)}
                  nomeDaCategoria={
                    transacao.tipo === "gasto" ? nomesDasCategorias.get(transacao.categoria) : undefined
                  }
                  aoAlternarCategoria={aoAlternarCategoria}
                  aoAlternarTag={aoAlternarTag}
                  categoriaAtiva={categoriaAtiva}
                  tagAtiva={tagAtiva}
                  categoriaConhecida={
                    transacao.tipo === "gasto" && nomesDasCategorias.has(transacao.categoria)
                  }
                  acao={
                    transacao.tipo === "ganho" ? (
                      <AcaoDeExcluirGanho ganho={transacao} aoExcluir={aoExcluirGanho} />
                    ) : undefined
                  }
                />
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {restantes > 0 && (
        <button type="button" className={estilos.maisLinhas} onClick={() => definirPaginas(paginas + 1)}>
          Mostrar mais ({restantes} {restantes === 1 ? "restante" : "restantes"})
        </button>
      )}
    </div>
  );
}
