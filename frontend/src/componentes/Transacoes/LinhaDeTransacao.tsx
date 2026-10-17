import type { ReactNode } from "react";

import { deCentavos, formatar, paraCentavos } from "../../dinheiro/dinheiro";
import type { TransacaoDaLinha } from "../../transacoes/linhaDoTempo";
import { IconeDeCategoria } from "./IconeDeCategoria";
import estilos from "./Transacoes.module.css";

type Propriedades = {
  transacao: TransacaoDaLinha;
  /** Nome da conta (vazio ou ausente se a conta não está na lista). */
  nomeDaConta?: string;
  /** Nome da categoria do gasto; o próprio código quando ela é desconhecida. */
  nomeDaCategoria?: string;
  /** Uma ação da linha (por exemplo, excluir um ganho). */
  acao?: ReactNode;
  /**
   * Filtros opcionais (só as Transações os passam): clicar na categoria ou numa tag da linha
   * filtra por ela; clicar na ativa limpa. Sem o callback, são só texto (como no Início).
   */
  aoAlternarCategoria?: (codigo: string) => void;
  aoAlternarTag?: (tag: string) => void;
  categoriaAtiva?: string | null;
  tagAtiva?: string | null;
  /**
   * A categoria está em GET /categorias. Só então ela vira filtro: o backend recusa um código
   * desconhecido no filtro com 422.
   */
  categoriaConhecida?: boolean;
};

/**
 * Uma transação: ícone, descrição, conta, categoria em texto, marca "Recorrente", tags e o
 * valor com sinal (saída com sinal de menos em Brasa, entrada com sinal de mais). O sinal e o
 * ícone dizem o sentido; a cor nunca está sozinha. Compartilhada pelo Início e pelas Transações.
 */
export function LinhaDeTransacao({
  transacao,
  nomeDaConta,
  nomeDaCategoria,
  acao,
  aoAlternarCategoria,
  aoAlternarTag,
  categoriaAtiva = null,
  tagAtiva = null,
  categoriaConhecida = false,
}: Propriedades) {
  const saida = transacao.tipo === "gasto";
  const valor = saida
    ? formatar(deCentavos(-paraCentavos(transacao.valor)))
    : `+${formatar(transacao.valor)}`;
  const categoria = saida ? (nomeDaCategoria ?? transacao.categoria) : undefined;
  const nome = [
    `${saida ? "Saída" : "Entrada"} de ${formatar(transacao.valor)}`,
    transacao.descricao,
    categoria,
    nomeDaConta,
  ]
    .filter((parte) => parte)
    .join(", ");

  return (
    <li className={estilos.linha} data-sentido={saida ? "saida" : "entrada"} aria-label={nome}>
      <IconeDeCategoria categoria={saida ? transacao.categoria : null} />
      <div className={estilos.principal}>
        <p className={estilos.descricao} data-descricao="">
          {transacao.descricao}
        </p>
        <p className={estilos.detalhe}>
          {transacao.tipo === "gasto" && aoAlternarCategoria && categoriaConhecida ? (
            <>
              <button
                type="button"
                className={estilos.filtro}
                aria-pressed={categoriaAtiva === transacao.categoria}
                aria-label={`Filtrar por ${categoria}`}
                onClick={() => aoAlternarCategoria(transacao.categoria)}
              >
                {categoria}
              </button>
              {nomeDaConta ? ` · ${nomeDaConta}` : ""}
            </>
          ) : (
            [categoria, nomeDaConta].filter((parte) => parte).join(" · ")
          )}
          {transacao.recorrencia_id !== null && (
            <span className={estilos.recorrente}>Recorrente</span>
          )}
        </p>
        {transacao.tags.length > 0 && (
          <ul className={estilos.tags} aria-label="Tags">
            {transacao.tags.map((tag) => (
              <li key={tag} className={estilos.tag}>
                {aoAlternarTag ? (
                  <button
                    type="button"
                    className={estilos.filtro}
                    aria-pressed={tagAtiva === tag}
                    aria-label={`Filtrar pela tag ${tag}`}
                    onClick={() => aoAlternarTag(tag)}
                  >
                    {tag}
                  </button>
                ) : (
                  tag
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className={estilos.valor} data-valor="">
        {valor}
      </p>
      {acao}
    </li>
  );
}
