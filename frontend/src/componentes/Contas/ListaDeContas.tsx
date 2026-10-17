import { useEffect, useId, useRef } from "react";

import type { Conta } from "../../api/tipos";
import { EstadoVazio } from "../EstadoVazio/EstadoVazio";
import { CartaoDeConta } from "./CartaoDeConta";
import estilos from "./Contas.module.css";
import { FormularioDeConta } from "./FormularioDeConta";

type Propriedades = {
  /** `undefined` enquanto a primeira busca não respondeu (ou se ela falhou). */
  contas: Conta[] | undefined;
  carregando: boolean;
  contaSelecionada?: string | null;
  /** `null` limpa a seleção. Sem ele, os cartões não são clicáveis. */
  aoSelecionar?: (contaId: string | null) => void;
  formularioAberto: boolean;
  aoMudarFormulario: (aberto: boolean) => void;
  aoCriar: (conta: Conta) => void;
  aoFalhar: (erro: unknown) => void;
};

/**
 * Coluna de contas: os cartões (clicar filtra pela conta), o estado vazio e o
 * botão "Nova conta", que abre o formulário no lugar dele. O painel controla
 * se o formulário está aberto.
 */
export function ListaDeContas({
  contas,
  carregando,
  contaSelecionada = null,
  aoSelecionar,
  formularioAberto,
  aoMudarFormulario,
  aoCriar,
  aoFalhar,
}: Propriedades) {
  const idTitulo = useId();
  const raiz = useRef<HTMLElement>(null);
  const botaoNovaConta = useRef<HTMLButtonElement>(null);

  // Ao fechar o formulário, o foco volta ao botão que o abriu.
  const estavaAberto = useRef(formularioAberto);
  useEffect(() => {
    if (estavaAberto.current && !formularioAberto) {
      // O botão é o do rodapé ou, sem contas, a ação do estado vazio.
      const botao = botaoNovaConta.current ?? raiz.current?.querySelector("button");
      botao?.focus();
    }
    estavaAberto.current = formularioAberto;
  }, [formularioAberto]);

  let conteudo;
  if (contas === undefined) {
    conteudo = (
      <p className={estilos.estado}>
        {carregando ? "Carregando contas…" : "Não foi possível carregar as contas."}
      </p>
    );
  } else if (contas.length === 0) {
    conteudo = formularioAberto ? (
      <p className={estilos.estado}>Nenhuma conta ainda. Crie a primeira.</p>
    ) : (
      <EstadoVazio
        icone="contas"
        titulo="Nenhuma conta ainda. Crie a primeira."
        texto="Uma conta guarda o saldo e recebe os gastos e ganhos."
        acao={{ rotulo: "Nova conta", aoClicar: () => aoMudarFormulario(true) }}
      />
    );
  } else {
    conteudo = (
      <ul className={estilos.lista}>
        {contas.map((conta) => {
          const selecionada = conta.id === contaSelecionada;
          return (
            <li key={conta.id}>
              <CartaoDeConta
                conta={conta}
                selecionada={selecionada}
                aoAlternar={aoSelecionar && (() => aoSelecionar(selecionada ? null : conta.id))}
              />
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section ref={raiz} className={estilos.contas} aria-labelledby={idTitulo}>
      <h2 id={idTitulo} className={estilos.titulo}>
        Contas
      </h2>
      {conteudo}
      {formularioAberto ? (
        <FormularioDeConta
          aoCriar={(conta) => {
            aoMudarFormulario(false);
            aoCriar(conta);
          }}
          aoCancelar={() => aoMudarFormulario(false)}
          aoFalhar={aoFalhar}
        />
      ) : contas !== undefined && contas.length === 0 ? null : (
        <button
          ref={botaoNovaConta}
          type="button"
          className={estilos.novaConta}
          onClick={() => aoMudarFormulario(true)}
        >
          <span aria-hidden="true">+ </span>
          Nova conta
        </button>
      )}
    </section>
  );
}
