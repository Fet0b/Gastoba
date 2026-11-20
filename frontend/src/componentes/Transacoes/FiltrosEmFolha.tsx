import { type KeyboardEvent, type SyntheticEvent, useId, useLayoutEffect, useRef, useState } from "react";

import type { Categoria, Conta } from "../../api/tipos";
import { corDaCategoria } from "../../categorias/cores";
import {
  contarFiltros,
  type FiltrosDeTransacoes,
  filtrosAtivos,
  type GrupoDeFiltro,
} from "../../transacoes/filtros";
import { Botao } from "../Botao/Botao";
import { Titulo } from "../Titulo/Titulo";
import estilos from "./FiltrosEmFolha.module.css";
import { FiltrosAtivos } from "./FiltrosAtivos";
import { GrupoDeFiltroEmChips } from "./GrupoDeFiltroEmChips";
import { textoDaConta } from "../../contas/identificacao";

type Propriedades = {
  contas: Conta[] | undefined;
  categorias: Categoria[] | undefined;
  tags: string[] | undefined;
  filtros: FiltrosDeTransacoes;
  /** Liga ou desliga um valor de um dos grupos (várias escolhas por grupo). */
  aoAlternar: (grupo: GrupoDeFiltro, valor: string) => void;
  aoLimparTudo: () => void;
};

/**
 * Os filtros de Transações no celular: em vez de três grupos de chips que ocupam a primeira tela,
 * um botão "Filtros (N)" que abre uma folha (`<dialog>` modal) com os grupos, e os filtros ativos
 * como botões removíveis logo abaixo.
 */
export function FiltrosEmFolha({ contas, categorias, tags, filtros, aoAlternar, aoLimparTudo }: Propriedades) {
  const [aberta, definirAberta] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  const ativos = filtrosAtivos(filtros, contas, categorias);
  const quantidade = contarFiltros(filtros);

  function fechar(): void {
    definirAberta(false);
    // O foco volta ao botão de forma explícita, sem depender do navegador.
    botao.current?.focus();
  }

  return (
    <div className={estilos.filtros}>
      <Botao
        ref={botao}
        variante="secundario"
        icone="filtro"
        aria-haspopup="dialog"
        onClick={() => definirAberta(true)}
      >
        {quantidade > 0 ? `Filtros (${quantidade})` : "Filtros"}
      </Botao>

      <FiltrosAtivos ativos={ativos} aoRemover={(filtro) => aoAlternar(filtro.grupo, filtro.valor)} />

      {aberta && (
        <Folha aoFechar={fechar} temFiltro={quantidade > 0} aoLimparTudo={aoLimparTudo}>
          <GrupoDeFiltroEmChips
            legenda="conta"
            titulo="Contas"
            opcoes={contas?.map((conta) => ({ valor: conta.id, rotulo: textoDaConta(conta) }))}
            selecionados={filtros.contas}
            aoAlternar={(valor) => aoAlternar("contas", valor)}
          />
          <GrupoDeFiltroEmChips
            legenda="categoria"
            titulo="Categorias"
            opcoes={categorias
              ?.filter((categoria) => !categoria.legada)
              .map((categoria) => ({ valor: categoria.codigo, rotulo: categoria.nome, cor: corDaCategoria(categoria.codigo) }))}
            selecionados={filtros.categorias}
            aoAlternar={(valor) => aoAlternar("categorias", valor)}
          />
          <GrupoDeFiltroEmChips
            legenda="tag"
            titulo="Tags"
            opcoes={tags?.map((tag) => ({ valor: tag, rotulo: tag }))}
            selecionados={filtros.tags}
            aoAlternar={(valor) => aoAlternar("tags", valor)}
          />
        </Folha>
      )}
    </div>
  );
}

type PropriedadesDaFolha = {
  aoFechar: () => void;
  temFiltro: boolean;
  aoLimparTudo: () => void;
  children: React.ReactNode;
};

function Folha({ aoFechar, temFiltro, aoLimparTudo, children }: PropriedadesDaFolha) {
  const id = useId();
  const dialogo = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const elemento = dialogo.current;
    if (!elemento) return;
    if (!elemento.open) elemento.showModal();
    elemento.querySelector<HTMLElement>("button")?.focus();
    return () => {
      if (elemento.open) elemento.close();
    };
  }, []);

  function aoTeclar(evento: KeyboardEvent<HTMLDialogElement>): void {
    if (evento.key !== "Escape" || evento.defaultPrevented) return;
    evento.preventDefault();
    aoFechar();
  }

  function aoCancelar(evento: SyntheticEvent<HTMLDialogElement>): void {
    // O navegador fecharia o diálogo sozinho; quem fecha é o componente (e devolve o foco).
    evento.preventDefault();
    aoFechar();
  }

  return (
    <dialog
      ref={dialogo}
      className={estilos.folha}
      aria-labelledby={`${id}-titulo`}
      onKeyDown={aoTeclar}
      onCancel={aoCancelar}
    >
      <div className={estilos.conteudo}>
        <div className={estilos.cabecalho}>
          <Titulo nivel="secao" como="h2" id={`${id}-titulo`} className={estilos.titulo}>
            Filtros
          </Titulo>
          {temFiltro && (
            <Botao variante="terciario" onClick={aoLimparTudo}>
              Limpar filtros
            </Botao>
          )}
        </div>
        <div className={estilos.grupos}>{children}</div>
        <div className={estilos.acoes}>
          <Botao variante="primario" onClick={aoFechar}>
            Concluir
          </Botao>
        </div>
      </div>
    </dialog>
  );
}
