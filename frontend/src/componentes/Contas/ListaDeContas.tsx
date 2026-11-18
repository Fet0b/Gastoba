import { useEffect, useId, useRef } from "react";

import type { Conta } from "../../api/tipos";
import type { SituacaoDoCartao } from "../../contas/situacaoDosCartoes";
import { Botao } from "../Botao/Botao";
import { EstadoVazio } from "../EstadoVazio/EstadoVazio";
import { CartaoDeConta } from "./CartaoDeConta";
import estilos from "./Contas.module.css";
import { FormularioDeConta } from "./FormularioDeConta";
import { MenuDaConta } from "./MenuDaConta";

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
  /** Exclui a conta; devolve `true` se deu certo. Sem ele, não há a ação de excluir. */
  aoExcluir?: (conta: Conta) => Promise<boolean>;
  /** Situação das faturas de cada cartão, pelo id da conta (só com a importação bancária). */
  situacaoDosCartoes?: ReadonlyMap<string, SituacaoDoCartao>;
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
  aoExcluir,
  situacaoDosCartoes,
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
        titulo="Nenhuma conta ainda"
        descricao="Cadastre uma conta para reunir seus saldos e lançamentos."
        acao={{ rotulo: "Nova conta", aoClicar: () => aoMudarFormulario(true) }}
      />
    );
  } else {
    conteudo = (
      <ul className={estilos.lista}>
        {contas.map((conta) => {
          const selecionada = conta.id === contaSelecionada;
          return (
            <li key={conta.id} className={estilos.item}>
              <CartaoDeConta
                conta={conta}
                selecionada={selecionada}
                aoAlternar={aoSelecionar && (() => aoSelecionar(selecionada ? null : conta.id))}
                situacaoDoCartao={situacaoDosCartoes?.get(conta.id)}
              />
              {aoExcluir && (
                <span className={estilos.menuDaConta}>
                  <MenuDaConta conta={conta} aoExcluir={aoExcluir} />
                </span>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section ref={raiz} className={estilos.contas} aria-labelledby={idTitulo}>
      <h3 id={idTitulo} className={estilos.titulo}>
        Suas contas
      </h3>
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
        <Botao
          ref={botaoNovaConta}
          variante="secundario"
          icone="adicionar"
          className={estilos.novaConta}
          onClick={() => aoMudarFormulario(true)}
        >
          Nova conta
        </Botao>
      )}
    </section>
  );
}
