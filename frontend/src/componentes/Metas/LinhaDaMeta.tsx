import { type CSSProperties, type ReactNode, useId } from "react";

import type { ProgressoDaMeta } from "../../api/tipos";
import { corDaCategoria } from "../../categorias/cores";
import { deCentavos, formatar, paraCentavos } from "../../dinheiro/dinheiro";
import { AnelDeProgresso } from "../AnelDeProgresso/AnelDeProgresso";
import { Dica } from "../Dica/Dica";
import { frasesDasCaixinhas, gastoDoCartao } from "./caixinhasDaMeta";
import { EXPLICACAO_DA_LIBERDADE_FINANCEIRA } from "./liberdadeFinanceira";
import { rotuloDaRentabilidade } from "../../investimentos/destinacoes";
import estilos from "./Metas.module.css";

type Propriedades = {
  progresso: ProgressoDaMeta;
  nome: string;
  /** Abre o painel dos lançamentos; sem ele, a linha não é clicável (Início). */
  aoAbrir?: () => void;
  /** Início: sem "R$ x de R$ y". */
  compacta?: boolean;
  /** Posição na lista, para o anel encher em sequência. */
  indice?: number;
  /** Ações à direita (o menu no modo de edição). */
  acoes?: ReactNode;
  /** Id da Dica da Liberdade financeira; o anel a usa como descrição. */
  idDaExplicacao?: string;
};

/** O restante em texto: a cor nunca é a única pista. */
export function textoDoRestante(progresso: ProgressoDaMeta): string {
  switch (progresso.situacao) {
    case "dentro":
    case "alerta":
      return `Restam ${formatar(progresso.restante)}`;
    case "estourou":
      return `Estourou ${formatar(deCentavos(-paraCentavos(progresso.restante)))}`;
    case "sem_renda":
      return "Sem renda";
  }
}

/**
 * Uma meta do mês em uma linha: anel de progresso, nome e percentual da renda, gasto
 * contra o limite e o que resta (cada dado uma vez). Com `aoAbrir`, o nome abre os
 * lançamentos da meta e a área clicável se estende à linha toda. O layout segue a largura da
 * própria linha (container query), não a da tela: larga, tudo numa linha; estreita, anel e nome
 * em cima e, embaixo, os valores à esquerda e o que resta à direita.
 */
export function LinhaDaMeta({
  progresso,
  nome,
  aoAbrir,
  compacta = false,
  indice = 0,
  acoes,
  idDaExplicacao,
}: Propriedades) {
  const idDoNome = useId();
  const idGerado = useId();
  const liberdade = progresso.categoria === "liberdade_financeira";
  const idDaDica = idDaExplicacao ?? idGerado;
  const valores = `${formatar(gastoDoCartao(progresso))} de ${formatar(progresso.limite)}`;
  const caixinhas = frasesDasCaixinhas(progresso);
  const usado = progresso.percentual_usado;
  const rotuloDoAnel = `${nome}: ${usado === null ? "sem renda" : `${usado}% usado`}, ${valores}${caixinhas.map((c) => ` ${c}`).join("")}`;

  const rotuloDoNome = (
    <span id={idDoNome} className={estilos.nomeDaMeta}>
      <span
        className={estilos.ponto}
        style={{ backgroundColor: corDaCategoria(progresso.categoria) }}
        aria-hidden="true"
      />
      <span>{nome}</span>
    </span>
  );

  return (
    <li
      className={estilos.linha}
      data-linha-da-meta=""
      data-situacao={progresso.situacao}
      data-compacta={compacta ? "" : undefined}
      aria-labelledby={idDoNome}
      style={{ "--indice": indice } as CSSProperties}
    >
      <div className={estilos.grade}>
        <div className={estilos.anelDaMeta}>
          <AnelDeProgresso
            rotulo={rotuloDoAnel}
            usado={usado}
            situacao={progresso.situacao}
            cor={corDaCategoria(progresso.categoria)}
            idDaDescricao={liberdade ? idDaDica : undefined}
            indice={indice}
            compacto={compacta}
          />
        </div>
        <div className={estilos.identificacao}>
          <span className={estilos.nomeEDica}>
            {aoAbrir ? (
              <button
                type="button"
                className={estilos.abrirMeta}
                aria-label={`Ver lançamentos de ${nome}`}
                onClick={(evento) => {
                  // Alguns navegadores não focam o botão ao clicar; o painel devolve o foco a ele.
                  evento.currentTarget.focus();
                  aoAbrir();
                }}
              >
                {rotuloDoNome}
              </button>
            ) : (
              rotuloDoNome
            )}
            {liberdade && (
              <span className={estilos.dicaDaMeta}>
                <Dica assunto="a Liberdade financeira" id={idDaDica}>
                  {EXPLICACAO_DA_LIBERDADE_FINANCEIRA}
                </Dica>
              </span>
            )}
          </span>
          <span className={estilos.percentualDaMeta}>{progresso.percentual}% da renda</span>
        {!compacta && caixinhas.length > 0 && (
          <span className={estilos.caixinhasDaMeta} data-caixinhas-da-meta="">
            {caixinhas.map((frase) => (
              <span key={frase}>{frase}</span>
            ))}
          </span>
        )}
        {!compacta && progresso.rentabilidade !== null && (
          <span className={estilos.rentabilidadeDaMeta} data-rentabilidade-da-meta="">
            {liberdade ? "Rentabilidade das destinações" : "Rentabilidade das caixinhas"}{" "}
            {rotuloDaRentabilidade(progresso.rentabilidade)}
          </span>
        )}
        </div>
        <div className={estilos.rodapeDaMeta}>
          {!compacta && <span className={estilos.valoresDaMeta}>{valores}</span>}
          <span className={estilos.restanteDaMeta} data-restante="">
            {textoDoRestante(progresso)}
          </span>
        </div>
        {acoes !== undefined && <div className={estilos.acoesDaMeta} data-acoes-da-meta="">{acoes}</div>}
      </div>
    </li>
  );
}
