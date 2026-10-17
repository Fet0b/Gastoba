import { type ReactNode, useId } from "react";

import { anterior, type Periodo, proximo, rotulo } from "../../periodo/periodo";
import { Aviso, type MensagemDoAviso } from "../Aviso/Aviso";
import { Navegacao } from "../Navegacao/Navegacao";
import type { Navegacao as DadosDaNavegacao } from "../Navegacao/telas";
import { useLayoutLargo } from "../Navegacao/useLayoutLargo";
import type { EstadoDoOlho } from "../Olho/Olho";
import estilos from "./Pagina.module.css";

/** Controles de quem tem período: o seletor de mês e, só em Transações, "Novo gasto". */
export type ControlesDaPagina = {
  periodo: Periodo;
  aoMudarPeriodo: (periodo: Periodo) => void;
  aoNovoGasto?: () => void;
};

type Propriedades = {
  navegacao: DadosDaNavegacao;
  estadoDoOlho: EstadoDoOlho;
  mensagem: MensagemDoAviso | null;
  aoDispensarMensagem: () => void;
  controles?: ControlesDaPagina;
  children: ReactNode;
};

/**
 * A moldura de toda tela: o link "Pular para o conteúdo", a navegação (barra lateral no
 * computador, barra de abas no celular), o `<main>` com a barra fina de controles e o conteúdo,
 * e o `Aviso` (uma região `aria-live` por página). No celular não há barra lateral, então a
 * marca "Gastoba" (o único `h1`) fica num título visível só para leitores de tela.
 */
export function Pagina({
  navegacao,
  estadoDoOlho,
  mensagem,
  aoDispensarMensagem,
  controles,
  children,
}: Propriedades) {
  const idDoConteudo = useId();
  const largo = useLayoutLargo();

  return (
    <div className={estilos.pagina}>
      <a
        className={estilos.pular}
        href={`#${idDoConteudo}`}
        onClick={(evento) => {
          // O foco vai ao main mesmo onde o hash não o move (SPA, jsdom).
          evento.preventDefault();
          document.getElementById(idDoConteudo)?.focus();
        }}
      >
        Pular para o conteúdo
      </a>

      {/* Barra lateral antes do conteúdo; a barra de abas (fixa) vem depois, para o Tab
          percorrer o conteúdo antes dela. */}
      {largo && <Navegacao navegacao={navegacao} estadoDoOlho={estadoDoOlho} />}

      <main id={idDoConteudo} tabIndex={-1} className={estilos.principal}>
        {!largo && <h1 className={estilos.apenasLeitor}>Gastoba</h1>}

        {controles && (
          <div className={estilos.controles}>
            <div className={estilos.periodo} role="group" aria-label="Período">
              <button
                type="button"
                className={estilos.seta}
                aria-label="Mês anterior"
                onClick={() => controles.aoMudarPeriodo(anterior(controles.periodo))}
              >
                ‹
              </button>
              <span className={estilos.rotulo} aria-live="polite">
                {rotulo(controles.periodo)}
              </span>
              <button
                type="button"
                className={estilos.seta}
                aria-label="Próximo mês"
                onClick={() => controles.aoMudarPeriodo(proximo(controles.periodo))}
              >
                ›
              </button>
            </div>

            {controles.aoNovoGasto && (
              <button
                type="button"
                className={largo ? estilos.novoGasto : estilos.flutuante}
                aria-keyshortcuts="N"
                onClick={controles.aoNovoGasto}
              >
                Novo gasto
                <kbd className={estilos.tecla} aria-hidden="true">
                  N
                </kbd>
              </button>
            )}
          </div>
        )}

        <div className={estilos.conteudo}>{children}</div>
      </main>

      {!largo && <Navegacao navegacao={navegacao} estadoDoOlho={estadoDoOlho} />}

      <Aviso mensagem={mensagem} aoDispensar={aoDispensarMensagem} />
    </div>
  );
}
