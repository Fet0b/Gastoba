import { useEffect, useId, useRef } from "react";

import type { ProgressoDaMeta } from "../../api/tipos";
import { formatar } from "../../dinheiro/dinheiro";
import type { LancamentoDaMeta } from "../../metas/lancamentosDaMeta";
import { dataParaExibicao } from "../../periodo/periodo";
import { Botao } from "../Botao/Botao";
import { EstadoVazio } from "../EstadoVazio/EstadoVazio";
import { Titulo } from "../Titulo/Titulo";
import { Esqueleto } from "../Esqueleto/Esqueleto";
import estilos from "./PainelDaMeta.module.css";

type Propriedades = {
  aberto: boolean;
  nome: string;
  /** "novembro de 2026". */
  rotuloDoMes: string;
  progresso: ProgressoDaMeta | undefined;
  /** `undefined` enquanto as consultas não responderam. */
  lancamentos: readonly LancamentoDaMeta[] | undefined;
  nomesDasContas: ReadonlyMap<string, string>;
  aoFechar: () => void;
  aoVerTransacoes: () => void;
};

/**
 * Folha lateral com os lançamentos que contam numa meta no mês (gastos líquidos e
 * aportes), a partir dos dados que a página já carregou. Esc e "Fechar" fecham e o
 * foco volta a quem abriu.
 */
export function PainelDaMeta({
  aberto,
  nome,
  rotuloDoMes,
  progresso,
  lancamentos,
  nomesDasContas,
  aoFechar,
  aoVerTransacoes,
}: Propriedades) {
  const idDoTitulo = useId();
  const dialogo = useRef<HTMLDialogElement | null>(null);
  const focadoAoAbrir = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const elemento = dialogo.current;
    if (!elemento || !aberto) return;
    focadoAoAbrir.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!elemento.open) elemento.showModal();
    return () => {
      if (elemento.open) elemento.close();
      const alvo = focadoAoAbrir.current;
      if (alvo && alvo.isConnected) alvo.focus();
    };
  }, [aberto]);

  let conteudo;
  if (lancamentos === undefined) {
    conteudo = <Esqueleto rotulo="Carregando os lançamentos…" />;
  } else if (lancamentos.length === 0) {
    conteudo = (
      <EstadoVazio
        icone="orcamento"
        titulo="Nenhum lançamento nesta meta no mês"
        descricao="Os gastos desta categoria aparecem aqui conforme você os registra."
        acao={{ rotulo: "Ver Transações", aoClicar: aoVerTransacoes }}
      />
    );
  } else {
    conteudo = (
      <ul className={estilos.lancamentos}>
        {lancamentos.map((lancamento) => {
          const conta = lancamento.conta_id === null ? undefined : nomesDasContas.get(lancamento.conta_id);
          return (
            <li key={`${lancamento.origem}-${lancamento.id}`} className={estilos.lancamento}>
              <span className={estilos.descricao}>{lancamento.descricao}</span>
              <span className={`valor ${estilos.valor}`}>{formatar(lancamento.valor)}</span>
              <span className={estilos.detalhe}>
                {conta !== undefined && <span>{conta}</span>}
                <span>{dataParaExibicao(lancamento.data)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <dialog
      ref={dialogo}
      className={estilos.painel}
      aria-labelledby={idDoTitulo}
      onCancel={(evento) => {
        evento.preventDefault();
        aoFechar();
      }}
      onClick={(evento) => {
        // Clique no fundo (fora da folha) fecha.
        if (evento.target === dialogo.current) aoFechar();
      }}
    >
      <div className={estilos.corpo}>
        <div className={estilos.cabecalho}>
          <Titulo nivel="secao" como="h2" id={idDoTitulo} className={estilos.titulo}>
            {nome} em {rotuloDoMes}
          </Titulo>
          <Botao variante="terciario" onClick={aoFechar}>
            Fechar
          </Botao>
        </div>
        {progresso !== undefined && (
          <p className={estilos.resumo}>
            {formatar(progresso.gasto)} de {formatar(progresso.limite)}
          </p>
        )}
        {conteudo}
      </div>
    </dialog>
  );
}
