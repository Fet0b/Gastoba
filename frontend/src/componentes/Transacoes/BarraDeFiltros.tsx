import type { RefObject } from "react";

import type { Categoria, Conta } from "../../api/tipos";
import { corDaCategoria } from "../../categorias/cores";
import { filtrosAtivos, type FiltrosDeTransacoes, type GrupoDeFiltro } from "../../transacoes/filtros";
import { SeletorMultiplo } from "../SeletorMultiplo/SeletorMultiplo";
import { BuscaDeTransacoes } from "./BuscaDeTransacoes";
import estilos from "./BarraDeFiltros.module.css";
import { FiltrosAtivos } from "./FiltrosAtivos";
import { FiltrosEmFolha } from "./FiltrosEmFolha";
import { textoDaConta } from "../../contas/identificacao";

type Propriedades = {
  busca: string;
  aoMudarBusca: (texto: string) => void;
  buscaRef?: RefObject<HTMLInputElement | null>;
  contas: Conta[] | undefined;
  categorias: Categoria[] | undefined;
  tags: string[] | undefined;
  filtros: FiltrosDeTransacoes;
  aoAlternar: (grupo: GrupoDeFiltro, valor: string) => void;
  aoLimparTudo: () => void;
  /** Abaixo de 45rem: os filtros viram o botão "Filtros (N)" com a folha. */
  celular: boolean;
};

/**
 * A barra de filtros de Transações: a busca e, ao lado, três seletores de várias escolhas (contas,
 * categorias e tags); embaixo, os filtros ativos removíveis com "Limpar filtros". No celular, a busca
 * e o botão que abre a folha.
 */
export function BarraDeFiltros({
  busca,
  aoMudarBusca,
  buscaRef,
  contas,
  categorias,
  tags,
  filtros,
  aoAlternar,
  aoLimparTudo,
  celular,
}: Propriedades) {
  if (celular) {
    return (
      <div className={estilos.barra}>
        <BuscaDeTransacoes valor={busca} aoMudar={aoMudarBusca} campoRef={buscaRef} />
        <FiltrosEmFolha
          contas={contas}
          categorias={categorias}
          tags={tags}
          filtros={filtros}
          aoAlternar={aoAlternar}
          aoLimparTudo={aoLimparTudo}
        />
      </div>
    );
  }

  return (
    <div className={estilos.barra}>
      <div className={estilos.linha}>
        <div className={estilos.busca}>
          <BuscaDeTransacoes valor={busca} aoMudar={aoMudarBusca} campoRef={buscaRef} />
        </div>
        <SeletorMultiplo
          rotulo="Contas"
          alinharAoFim
          opcoes={(contas ?? []).map((conta) => ({ valor: conta.id, rotulo: textoDaConta(conta) }))}
          selecionados={filtros.contas}
          aoMudar={(valores) => trocar("contas", filtros.contas, valores)}
        />
        <SeletorMultiplo
          rotulo="Categorias"
          opcoes={(categorias ?? [])
            .filter((categoria) => !categoria.legada)
            .map((categoria) => ({ valor: categoria.codigo, rotulo: categoria.nome, cor: corDaCategoria(categoria.codigo) }))}
          selecionados={filtros.categorias}
          aoMudar={(valores) => trocar("categorias", filtros.categorias, valores)}
        />
        <SeletorMultiplo
          rotulo="Tags"
          opcoes={(tags ?? []).map((tag) => ({ valor: tag, rotulo: tag }))}
          selecionados={filtros.tags}
          aoMudar={(valores) => trocar("tags", filtros.tags, valores)}
        />
      </div>
      <FiltrosAtivos
        ativos={filtrosAtivos(filtros, contas, categorias)}
        aoRemover={(filtro) => aoAlternar(filtro.grupo, filtro.valor)}
        aoLimparTudo={aoLimparTudo}
      />
    </div>
  );

  // O seletor entrega a lista nova; a página só sabe ligar ou desligar um valor por vez.
  function trocar(grupo: GrupoDeFiltro, antes: readonly string[], depois: readonly string[]): void {
    for (const valor of antes) if (!depois.includes(valor)) aoAlternar(grupo, valor);
    for (const valor of depois) if (!antes.includes(valor)) aoAlternar(grupo, valor);
  }
}
