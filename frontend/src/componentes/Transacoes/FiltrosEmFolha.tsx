import { type KeyboardEvent, type SyntheticEvent, useId, useLayoutEffect, useRef, useState } from "react";

import type { Categoria, Conta } from "../../api/tipos";
import { FiltroDeCategorias } from "../Gastos/FiltroDeCategorias";
import { FiltroDeTags } from "../Gastos/FiltroDeTags";
import { Botao } from "../Botao/Botao";
import { Icone } from "../Icone/Icone";
import estilos from "./FiltrosEmFolha.module.css";
import { FiltroDeContasEmChips } from "./FiltroDeContasEmChips";

type Propriedades = {
  contas: Conta[] | undefined;
  categorias: Categoria[] | undefined;
  tags: string[] | undefined;
  contaSelecionada: string | null;
  categoria: string | null;
  tag: string | null;
  aoMudarConta: (contaId: string | null) => void;
  aoAlternarCategoria: (codigo: string) => void;
  aoLimparCategoria: () => void;
  aoAlternarTag: (tag: string) => void;
  aoLimparTag: () => void;
  aoLimparTudo: () => void;
};

/**
 * Os filtros de Transações no celular: em vez de três grupos de chips que ocupam a primeira tela,
 * um botão "Filtros (N)" que abre uma folha (`<dialog>` modal) com os grupos, e os filtros ativos
 * como chips removíveis logo abaixo.
 */
export function FiltrosEmFolha({
  contas,
  categorias,
  tags,
  contaSelecionada,
  categoria,
  tag,
  aoMudarConta,
  aoAlternarCategoria,
  aoLimparCategoria,
  aoAlternarTag,
  aoLimparTag,
  aoLimparTudo,
}: Propriedades) {
  const [aberta, definirAberta] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);

  const ativos: { chave: string; rotulo: string; remover: () => void }[] = [];
  if (contaSelecionada !== null) {
    const conta = contas?.find((c) => c.id === contaSelecionada);
    ativos.push({ chave: "conta", rotulo: conta?.nome ?? "Conta", remover: () => aoMudarConta(null) });
  }
  if (categoria !== null) {
    const nome = categorias?.find((c) => c.codigo === categoria)?.nome ?? categoria;
    ativos.push({ chave: "categoria", rotulo: nome, remover: aoLimparCategoria });
  }
  if (tag !== null) ativos.push({ chave: "tag", rotulo: tag, remover: aoLimparTag });

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
        {ativos.length > 0 ? `Filtros (${ativos.length})` : "Filtros"}
      </Botao>

      {ativos.length > 0 && (
        <ul className={estilos.ativos} aria-label="Filtros ativos">
          {ativos.map((filtro) => (
            <li key={filtro.chave}>
              <Botao
                variante="secundario"
                aria-label={`Remover filtro: ${filtro.rotulo}`}
                onClick={filtro.remover}
              >
                {filtro.rotulo}
                <Icone nome="fechar" tamanho={14} />
              </Botao>
            </li>
          ))}
        </ul>
      )}

      {aberta && (
        <Folha aoFechar={fechar} temFiltro={ativos.length > 0} aoLimparTudo={aoLimparTudo}>
          <FiltroDeContasEmChips contas={contas} ativa={contaSelecionada} aoMudar={aoMudarConta} />
          <FiltroDeCategorias
            categorias={categorias}
            ativa={categoria}
            aoAlternar={aoAlternarCategoria}
            aoLimpar={aoLimparCategoria}
          />
          <FiltroDeTags tags={tags} ativa={tag} aoAlternar={aoAlternarTag} aoLimpar={aoLimparTag} />
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
          <h2 id={`${id}-titulo`} className={estilos.titulo}>
            Filtros
          </h2>
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
