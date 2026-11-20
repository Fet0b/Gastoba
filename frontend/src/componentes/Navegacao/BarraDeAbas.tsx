import { type SyntheticEvent, useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { Badge } from "../Badge/Badge";
import { Icone } from "../Icone/Icone";
import { LinkDaTela } from "./LinkDaTela";
import { Titulo } from "../Titulo/Titulo";
import estilos from "./Navegacao.module.css";
import { dividirTelas, type Navegacao } from "./telas";

type Propriedades = {
  navegacao: Navegacao;
};

/**
 * Barra de abas do celular: as quatro telas principais e "Mais", que abre uma folha
 * (`<dialog>` modal) com as outras.
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
          <LinkDaTela
            key={tela}
            tela={tela}
            navegacao={navegacao}
            className={estilos.aba}
            aria-current={navegacao.tela === tela ? "page" : undefined}
          >
            <Icone nome={icone} tamanho={22} />
            <span className={estilos.rotuloDaAba}>{nome}</span>
          </LinkDaTela>
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
          <Titulo nivel="secao" como="h2" id={`${id}-titulo`} className={estilos.tituloDaFolha}>
            Mais telas
          </Titulo>
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
          {emMais.map(({ tela, nome, icone, emBreve }) => (
            <li key={tela}>
              <LinkDaTela
                tela={tela}
                navegacao={navegacao}
                aoNavegar={aoFechar}
                className={estilos.itemDaFolha}
                aria-label={emBreve ? nome : undefined}
                aria-describedby={emBreve ? `em-breve-folha-${tela}` : undefined}
                aria-current={navegacao.tela === tela ? "page" : undefined}
              >
                <Icone nome={icone} tamanho={22} />
                {nome}
                {emBreve && (
                  <span id={`em-breve-folha-${tela}`} className={estilos.emBreve}>
                    <Badge>em breve</Badge>
                  </span>
                )}
              </LinkDaTela>
            </li>
          ))}
        </ul>
      </div>
    </dialog>
  );
}
