import { type SyntheticEvent, useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { Icone } from "../Icone/Icone";
import estilos from "./Navegacao.module.css";
import { dividirTelas, type Navegacao } from "./telas";

type Propriedades = {
  navegacao: Navegacao;
};

/**
 * Barra de abas do celular: as quatro telas principais e "Mais", que abre uma folha
 * (`<dialog>` modal) com as outras quatro.
 */
export function BarraDeAbas({ navegacao }: Propriedades) {
  const { principais, emMais } = dividirTelas();
  const [folhaAberta, definirFolhaAberta] = useState(false);
  const botaoMais = useRef<HTMLButtonElement>(null);
  const atualEmMais = emMais.some((t) => t.tela === navegacao.tela);

  function fecharFolha(): void {
    definirFolhaAberta(false);
    // O foco volta ao "Mais" de forma explícita, sem depender do navegador.
    botaoMais.current?.focus();
  }

  return (
    <>
      <nav className={estilos.abas} aria-label="Telas">
        {principais.map(({ tela, nome, icone }) => (
          <button
            key={tela}
            type="button"
            className={estilos.aba}
            aria-current={navegacao.tela === tela ? "page" : undefined}
            onClick={() => navegacao.aoIrPara(tela)}
          >
            <Icone nome={icone} tamanho={22} />
            <span className={estilos.rotuloDaAba}>{nome}</span>
          </button>
        ))}
        <button
          ref={botaoMais}
          type="button"
          className={estilos.aba}
          aria-current={atualEmMais ? "page" : undefined}
          aria-haspopup="dialog"
          onClick={() => definirFolhaAberta(true)}
        >
          <Icone nome="mais" tamanho={22} />
          <span className={estilos.rotuloDaAba}>Mais</span>
        </button>
      </nav>

      {folhaAberta && (
        <FolhaMais
          navegacao={navegacao}
          aoFechar={fecharFolha}
        />
      )}
    </>
  );
}

type PropriedadesDaFolha = {
  navegacao: Navegacao;
  aoFechar: () => void;
};

function FolhaMais({ navegacao, aoFechar }: PropriedadesDaFolha) {
  const { emMais } = dividirTelas();
  const id = useId();
  const dialogo = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const elemento = dialogo.current;
    if (!elemento) return;
    if (!elemento.open) elemento.showModal();
    const atual = elemento.querySelector<HTMLElement>('[aria-current="page"]');
    (atual ?? elemento.querySelector<HTMLElement>("button"))?.focus();
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
    // O navegador fecharia o diálogo sozinho; quem fecha é a barra.
    evento.preventDefault();
    aoFechar();
  }

  function escolher(tela: (typeof emMais)[number]["tela"]): void {
    navegacao.aoIrPara(tela);
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
      <div className={estilos.conteudoDaFolha}>
        <div className={estilos.cabecalhoDaFolha}>
          <h2 id={`${id}-titulo`} className={estilos.tituloDaFolha}>
            Mais telas
          </h2>
          <button
            type="button"
            className={estilos.fecharDaFolha}
            aria-label="Fechar"
            onClick={aoFechar}
          >
            <Icone nome="fechar" tamanho={20} />
          </button>
        </div>
        <ul className={estilos.listaDaFolha}>
          {emMais.map(({ tela, nome, icone }) => (
            <li key={tela}>
              <button
                type="button"
                className={estilos.itemDaFolha}
                aria-current={navegacao.tela === tela ? "page" : undefined}
                onClick={() => escolher(tela)}
              >
                <Icone nome={icone} tamanho={22} />
                {nome}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </dialog>
  );
}
