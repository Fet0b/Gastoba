import { useEffect, useRef, useState } from "react";

import { ErroDaApiCliente } from "../../api/cliente";
import { useDefinirRendaBase, useRemoverRendaBase, useRendaBase } from "../../api/consultas";
import { deCentavos, formatar, paraCentavos } from "../../dinheiro/dinheiro";
import { Botao } from "../Botao/Botao";
import { CampoDeValor } from "../Campo/CampoDeValor";
import { DialogoDeConfirmacao } from "../DialogoDeConfirmacao/DialogoDeConfirmacao";
import { Indicador } from "../Indicador/Indicador";
import { MenuDeAcoes } from "../MenuDeAcoes/MenuDeAcoes";
import { ehSemResposta, MENSAGEM_SERVIDOR_FORA } from "../../paginas/mensagens";
import estilos from "./RendaBaseMensal.module.css";

function textoDoErro(erro: unknown): string {
  return ehSemResposta(erro) ? MENSAGEM_SERVIDOR_FORA : (erro as ErroDaApiCliente).mensagem;
}

type PropriedadesDaRendaBase = {
  aoAvisar: (texto: string) => void;
  /** Alterar e remover só existem no modo de edição das metas. */
  modoDeEdicao: boolean;
  /** A renda registrada no mês e a base que o progresso usou (`null` sem base). */
  renda: string;
  baseDoMes: string | null;
};

/** A linha única de contexto: sobre qual renda as metas são calculadas. */
function contextoDaRendaBase(renda: string, baseDoMes: string | null): string {
  if (baseDoMes === null) return "Metas calculadas sobre a renda registrada no mês";
  const acima = paraCentavos(renda) - paraCentavos(baseDoMes);
  if (acima > 0n) return `Renda real: +${formatar(deCentavos(acima))} acima`;
  if (acima < 0n) return `Renda real: ${formatar(deCentavos(-acima))} abaixo`;
  return "Renda real igual à renda-base";
}

export function RendaBaseMensal({ aoAvisar, modoDeEdicao, renda, baseDoMes }: PropriedadesDaRendaBase) {
  const base = useRendaBase();
  const salvar = useDefinirRendaBase();
  const remover = useRemoverRendaBase();
  const [editando, definirEditando] = useState(false);
  const [confirmando, definirConfirmando] = useState(false);
  const [tentouRemover, definirTentouRemover] = useState(false);
  const [valor, definirValor] = useState("0.00");
  const campo = useRef<HTMLInputElement>(null);
  const secao = useRef<HTMLElement>(null);
  const devolverFoco = useRef(false);
  const focarAcaoAoRemover = useRef(false);
  const valorAtual = base.dados?.valor ?? null;
  const pendente = salvar.pendente || remover.pendente;
  const emEdicao = modoDeEdicao && editando;

  // Sair do modo de edição das metas descarta o formulário aberto.
  useEffect(() => {
    if (!modoDeEdicao) {
      definirEditando(false);
      definirConfirmando(false);
    }
  }, [modoDeEdicao]);

  useEffect(() => {
    if (emEdicao) {
      devolverFoco.current = true;
      campo.current?.focus();
    } else if (devolverFoco.current) {
      devolverFoco.current = false;
      secao.current?.querySelector<HTMLButtonElement>("[data-menu-de-acoes]")?.focus();
    }
  }, [emEdicao]);

  // Removida a base, o menu some: o foco vai à ação "Definir renda-base".
  useEffect(() => {
    if (focarAcaoAoRemover.current && valorAtual === null) {
      focarAcaoAoRemover.current = false;
      secao.current?.querySelector<HTMLButtonElement>("[data-menu-de-acoes]")?.focus();
    }
  }, [valorAtual, modoDeEdicao]);

  async function aoSalvar(): Promise<void> {
    if (await salvar.executar(valor)) {
      definirEditando(false);
      aoAvisar("Renda-base salva.");
    }
  }

  async function aoRemover(): Promise<void> {
    definirTentouRemover(true);
    if (await remover.executar()) {
      definirConfirmando(false);
      focarAcaoAoRemover.current = true;
      aoAvisar("Renda-base removida.");
    }
  }

  return (
    <section ref={secao} className={estilos.base} aria-label="Renda-base mensal">
      <Indicador
        rotulo="Renda-base mensal"
        dica="Previsão usada só nos limites das metas. Não registra ganhos nem altera saldos."
        valor={base.dados === undefined
          ? base.carregando ? "Carregando renda-base…" : "Não foi possível carregar a renda-base."
          : valorAtual === null ? "Não definida" : formatar(valorAtual)}
        nota={base.dados !== undefined ? contextoDaRendaBase(renda, baseDoMes) : undefined}
        acoes={base.dados !== undefined && modoDeEdicao ? (
          <MenuDeAcoes
            rotulo="Mais ações da renda-base"
            itens={[
              { rotulo: valorAtual === null ? "Definir renda-base" : "Alterar renda-base", aoEscolher: () => { definirValor(valorAtual ?? "0.00"); definirEditando(true); } },
              ...(valorAtual === null ? [] : [{ rotulo: "Remover renda-base", destrutivo: true, aoEscolher: () => { definirTentouRemover(false); definirConfirmando(true); } }]),
            ]}
          />
        ) : undefined}
      />
      {base.erro != null && <p role="alert">{textoDoErro(base.erro)}</p>}
      {modoDeEdicao && emEdicao ? (
        <form
          aria-label="Definir renda-base mensal"
          onSubmit={(evento) => { evento.preventDefault(); void aoSalvar(); }}
        >
          <CampoDeValor
            ref={campo}
            rotulo="Valor da renda-base mensal"
            valor={valor}
            aoMudar={definirValor}
            erro={salvar.erro != null ? textoDoErro(salvar.erro) : undefined}
          />
          <div className={estilos.acoes}>
            <Botao type="submit" variante="primario" disabled={pendente || paraCentavos(valor) <= 0n}>
              Salvar renda-base
            </Botao>
            <Botao variante="secundario" disabled={pendente} onClick={() => definirEditando(false)}>
              Cancelar
            </Botao>
          </div>
        </form>
      ) : null}
      <DialogoDeConfirmacao
        aberto={confirmando}
        titulo="Remover a renda-base?"
        descricao="As metas voltarão a usar a renda registrada."
        rotuloDaAcao="Confirmar remoção da renda-base"
        pendente={remover.pendente}
        erro={tentouRemover && remover.erro != null ? textoDoErro(remover.erro) : undefined}
        aoConfirmar={() => void aoRemover()}
        aoCancelar={() => definirConfirmando(false)}
      />
    </section>
  );
}
