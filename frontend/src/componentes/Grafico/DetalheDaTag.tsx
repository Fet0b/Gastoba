import { useId, useState } from "react";

import { useCategorias } from "../../api/consultas";
import type { Gasto } from "../../api/tipos";
import { formatar } from "../../dinheiro/dinheiro";
import { type Barra } from "../../graficos/barras";
import { gastosDaBarra } from "../../graficos/detalheDaBarra";
import { dataParaExibicao } from "../../periodo/periodo";
import { corDaCategoria } from "../../categorias/cores";
import { Icone, type NomeDoIcone } from "../Icone/Icone";
import estilos from "./DetalheDaTag.module.css";

export const GASTOS_VISIVEIS_DE_INICIO = 10;

const ICONES_DE_CATEGORIA: ReadonlySet<string> = new Set([
  "investimentos",
  "lazer",
  "conhecimento",
  "conforto",
  "gasto_fixo",
]);

type Propriedades = {
  /** A tag fixada (uma barra, "Sem tag", "Outras" ou uma tag de dentro de "Outras"). */
  barra: Pick<Barra, "tipo" | "rotulo" | "valor" | "percentual" | "quantidade" | "membros">;
  /** Os gastos do mês; `undefined` enquanto carregam. */
  gastos: readonly Gasto[] | undefined;
  aoFechar: () => void;
};

/**
 * O painel da tag fixada: o total, o percentual e os gastos dela no mês, sem sair da tela. O
 * valor de cada gasto aparece inteiro; quando ele tem várias tags, a nota diz quanto conta aqui.
 */
export function DetalheDaTag({ barra, gastos, aoFechar }: Propriedades) {
  const idTitulo = useId();
  const [mostrarTodos, definirMostrarTodos] = useState(false);
  const categorias = useCategorias();
  const nomeDe = (codigo: string) =>
    categorias.dados?.find((categoria) => categoria.codigo === codigo)?.nome ?? codigo;

  const itens = gastos ? gastosDaBarra(barra, gastos) : undefined;
  const visiveis = itens && !mostrarTodos ? itens.slice(0, GASTOS_VISIVEIS_DE_INICIO) : itens;
  const quantidade = itens?.length ?? barra.quantidade;

  return (
    <section className={estilos.painel} aria-labelledby={idTitulo}>
      <div className={estilos.cabecalho}>
        <div>
          <h3 id={idTitulo} className={estilos.titulo}>
            {barra.rotulo}
          </h3>
          <p className={estilos.resumo}>
            <span className="valor">{formatar(barra.valor)}</span> · {barra.percentual} do total
            {quantidade !== undefined && ` · ${quantidade} ${quantidade === 1 ? "gasto" : "gastos"}`}
          </p>
        </div>
        <button type="button" className={estilos.fechar} onClick={aoFechar}>
          Fechar detalhe
        </button>
      </div>

      {visiveis === undefined ? (
        <p className={estilos.estado}>Carregando gastos…</p>
      ) : visiveis.length === 0 ? (
        <p className={estilos.estado}>Nenhum gasto desta tag neste mês</p>
      ) : (
        <>
          <ul className={estilos.lista} aria-label={`Gastos de ${barra.rotulo}`}>
            {visiveis.map(({ gasto, parte }) => (
              <li key={gasto.id} className={estilos.gasto}>
                <span className={estilos.data}>{dataParaExibicao(gasto.data)}</span>
                <span className={estilos.descricao}>{gasto.descricao}</span>
                <span className={estilos.categoria} style={{ color: corDaCategoria(gasto.categoria) }}>
                  {ICONES_DE_CATEGORIA.has(gasto.categoria) && (
                    <Icone nome={gasto.categoria as NomeDoIcone} tamanho={16} />
                  )}
                  <span className={estilos.nomeDaCategoria}>{nomeDe(gasto.categoria)}</span>
                </span>
                <span className={`valor ${estilos.valor}`}>{formatar(gasto.valor)}</span>
                {gasto.tags.length > 1 && (
                  <span className={estilos.parte}>{formatar(parte)} nesta tag</span>
                )}
              </li>
            ))}
          </ul>
          {itens && itens.length > visiveis.length && (
            <button type="button" className={estilos.maisGastos} onClick={() => definirMostrarTodos(true)}>
              Mostrar mais
            </button>
          )}
        </>
      )}
    </section>
  );
}
