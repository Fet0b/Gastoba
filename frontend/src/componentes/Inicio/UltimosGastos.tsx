import { useId } from "react";

import type { Categoria, Conta, Gasto } from "../../api/tipos";
import { juntarTransacoes } from "../../transacoes/linhaDoTempo";
import { EstadoVazio } from "../EstadoVazio/EstadoVazio";
import { LinhaDeTransacao } from "../Transacoes/LinhaDeTransacao";
import estilos from "./Inicio.module.css";

const QUANTIDADE = 5;

type Propriedades = {
  /** `undefined` enquanto a primeira busca não respondeu (ou se ela falhou). */
  gastos: Gasto[] | undefined;
  carregando: boolean;
  contas: Conta[] | undefined;
  categorias: Categoria[] | undefined;
  /** Leva à lista completa, nas Transações. */
  aoVerTodas: () => void;
};

/** Os 5 gastos mais recentes do mês, com o ícone da categoria, e o link para ver todos. */
export function UltimosGastos({ gastos, carregando, contas, categorias, aoVerTodas }: Propriedades) {
  const idTitulo = useId();
  const nomesDasContas = new Map(contas?.map((conta) => [conta.id, conta.nome]));
  const nomesDasCategorias = new Map(categorias?.map((categoria) => [categoria.codigo, categoria.nome]));

  let conteudo;
  if (gastos === undefined) {
    conteudo = (
      <p className={estilos.estado}>
        {carregando ? "Carregando os gastos…" : "Não foi possível carregar os gastos."}
      </p>
    );
  } else if (gastos.length === 0) {
    conteudo = <EstadoVazio icone="transacoes" titulo="Nenhum gasto neste mês" />;
  } else {
    conteudo = (
      <ul className={estilos.ultimos}>
        {juntarTransacoes(gastos, [])
          .slice(0, QUANTIDADE)
          .map((transacao) => (
            <LinhaDeTransacao
              key={transacao.id}
              transacao={transacao}
              nomeDaConta={nomesDasContas.get(transacao.conta_id)}
              nomeDaCategoria={
                transacao.tipo === "gasto" ? nomesDasCategorias.get(transacao.categoria) : undefined
              }
            />
          ))}
      </ul>
    );
  }

  return (
    <section className={estilos.bloco} aria-labelledby={idTitulo}>
      <div className={estilos.cabecalho}>
        <h2 id={idTitulo} className={estilos.titulo}>
          Últimos gastos
        </h2>
        <button type="button" className={estilos.link} onClick={aoVerTodas}>
          Ver todas
        </button>
      </div>
      <div aria-busy={carregando}>{conteudo}</div>
    </section>
  );
}
