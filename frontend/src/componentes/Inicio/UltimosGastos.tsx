import { useId } from "react";

import type { Categoria, Conta, Gasto } from "../../api/tipos";
import { corDaCategoria } from "../../categorias/cores";
import { deCentavos, formatar, paraCentavos } from "../../dinheiro/dinheiro";
import { juntarTransacoes } from "../../transacoes/linhaDoTempo";
import { Badge } from "../Badge/Badge";
import { Botao } from "../Botao/Botao";
import { EstadoVazio } from "../EstadoVazio/EstadoVazio";
import estilos from "./Inicio.module.css";

const QUANTIDADE = 5;

/** "AAAA-MM-DD" como "dd/mm", sem passar por `Date` (que usaria UTC). */
function dataCurta(data: string): string {
  const [, mes, dia] = data.split("-");
  return `${dia}/${mes}`;
}

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
      <>
        <div className={estilos.cabecalhoDaLista} data-cabecalho="" aria-hidden="true">
          <span>Descrição</span>
          <span>Categoria</span>
          <span>Conta</span>
          <span>Data</span>
          <span className={estilos.colunaDireita}>Valor</span>
        </div>
        <ul className={estilos.listaDeGastos}>
          {juntarTransacoes(gastos, [])
            .slice(0, QUANTIDADE)
            .map((transacao) => {
              if (transacao.tipo !== "gasto") return null;
              const categoria = nomesDasCategorias.get(transacao.categoria) ?? transacao.categoria;
              const conta = nomesDasContas.get(transacao.conta_id);
              const temTags = transacao.tags.length > 0;
              const rotuloDasTags = transacao.tags.join(", ");
              const nome = [
                `Saída de ${formatar(transacao.valor)}`,
                temTags ? `${rotuloDasTags}, ${transacao.descricao}` : transacao.descricao,
                categoria,
                conta,
              ]
                .filter((parte) => parte)
                .join(", ");
              return (
                <li key={transacao.id} className={estilos.gasto} aria-label={nome}>
                  <div className={estilos.gastoTexto}>
                    <p className={estilos.gastoDescricao} data-descricao="">{transacao.descricao}</p>
                    {(temTags || transacao.recorrencia_id !== null) && <p className={estilos.gastoSecundaria} data-secundaria="" title={temTags ? rotuloDasTags : undefined}>
                      {transacao.tags.map(tag => <Badge key={tag}>{tag}</Badge>)}
                      {transacao.recorrencia_id !== null && <Badge>Recorrente</Badge>}
                    </p>}
                  </div>
                  <div className={estilos.gastoDetalhe}>
                    <span className={estilos.selo} data-selo="">
                      <Badge
                        icone={
                          <span
                            className={estilos.pontoDaCategoria}
                            style={{ backgroundColor: corDaCategoria(transacao.categoria) }}
                            aria-hidden="true"
                          />
                        }
                      >
                        {categoria}
                      </Badge>
                    </span>
                    <span className={estilos.gastoConta} data-conta="">
                      {conta}
                    </span>
                    <span className={estilos.gastoData} data-data="">
                      {dataCurta(transacao.data)}
                    </span>
                  </div>
                  <p className={estilos.gastoValor} data-valor="">
                    {formatar(deCentavos(-paraCentavos(transacao.valor)))}
                  </p>
                </li>
              );
            })}
        </ul>
      </>
    );
  }

  return (
    <section className={estilos.bloco} aria-labelledby={idTitulo}>
      <div className={estilos.cabecalho}>
        <h2 id={idTitulo} className={estilos.titulo}>
          Últimos gastos
        </h2>
        <Botao variante="terciario" seta onClick={aoVerTodas}>
          Ver todas
        </Botao>
      </div>
      <div aria-busy={carregando}>{conteudo}</div>
    </section>
  );
}
