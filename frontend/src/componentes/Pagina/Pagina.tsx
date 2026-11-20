import { type ReactNode, useId } from "react";

import { type Periodo } from "../../periodo/periodo";
import { useAtalhoDeNovoGasto } from "../Compositor/useAtalhoDeNovoGasto";
import { Aviso, type MensagemDoAviso } from "../Aviso/Aviso";
import { Navegacao } from "../Navegacao/Navegacao";
import { Sininho } from "../Sininho/Sininho";
import type { Navegacao as DadosDaNavegacao } from "../Navegacao/telas";
import { useLayoutLargo } from "../Navegacao/useLayoutLargo";
import type { EstadoDoOlho } from "../Olho/Olho";
import { CabecalhoDaTela, type DadosDoCabecalho } from "./CabecalhoDaTela";
import { SeletorDeMes } from "./SeletorDeMes";
import { Botao } from "../Botao/Botao";
import { TELAS } from "../Navegacao/telas";
import estilos from "./Pagina.module.css";

/** Controles de quem tem período: o seletor de mês. */
export type ControlesDaPagina = {
  periodo: Periodo;
  aoMudarPeriodo: (periodo: Periodo) => void;
};

type Propriedades = {
  navegacao: DadosDaNavegacao;
  estadoDoOlho: EstadoDoOlho;
  mensagem: MensagemDoAviso | null;
  aoDispensarMensagem: () => void;
  controles?: ControlesDaPagina;
  /**
   * O que "Novo gasto" (botão e tecla N) faz. Sem ele, leva a Transações com o compositor aberto;
   * só Transações o define, porque o compositor mora nela.
   */
  aoNovoGasto?: () => void;
  /** Liga a tecla N (padrão: ligada). Transações a desliga com o compositor aberto. */
  atalhoDeNovoGasto?: boolean;
  /** Título da tela, à esquerda do seletor de mês (no celular, acima dele). */
  cabecalho?: DadosDoCabecalho;
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
  aoNovoGasto,
  atalhoDeNovoGasto = true,
  cabecalho,
  children,
}: Propriedades) {
  const idDoConteudo = useId();
  const largo = useLayoutLargo();
  const novoGasto =
    aoNovoGasto ?? (() => navegacao.aoIrPara("transacoes", { abrirCompositor: true }));
  useAtalhoDeNovoGasto(novoGasto, atalhoDeNovoGasto);

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
        {!largo && <h1 className={estilos.apenasLeitor}>{navegacao.nomeDoApp ?? "Gastoba"}</h1>}

        <div className={estilos.controles} data-com-cabecalho="">
          <CabecalhoDaTela
            {...(cabecalho ?? {titulo: TELAS.find(t => t.tela === navegacao.tela)?.nome ?? "Gastoba", subtitulo: ""})}
            acao={cabecalho?.acao}
            sininhoNaLinhaDoTitulo={navegacao.gestaoDeInvestimentos === true && !controles}
            acoes={<>
              {controles && <SeletorDeMes {...controles} />}
              <Botao variante="primario" className={largo ? estilos.novoGasto : estilos.flutuante} aria-keyshortcuts="N" onClick={novoGasto}>
                Novo gasto<kbd className={estilos.tecla} aria-hidden="true">N</kbd>
              </Botao>
              {navegacao.gestaoDeInvestimentos === true && <Sininho aoVerResgate={(data) => navegacao.aoIrPara("transacoes", { vistaDeTransacoes: "aportes", dataDoMovimento: data })} />}
            </>}
          />
        </div>

        <div className={estilos.conteudo}>{children}</div>
      </main>

      {!largo && <Navegacao navegacao={navegacao} estadoDoOlho={estadoDoOlho} />}

      <Aviso mensagem={mensagem} aoDispensar={aoDispensarMensagem} />
    </div>
  );
}
