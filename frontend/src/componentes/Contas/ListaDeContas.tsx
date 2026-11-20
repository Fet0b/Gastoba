import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { Conta } from "../../api/tipos";
import { contasParecidas } from "../../contas/identificacao";
import { paraCentavos } from "../../dinheiro/dinheiro";
import type { SituacaoDoCartao } from "../../contas/situacaoDosCartoes";
import { Botao } from "../Botao/Botao";
import { Dialogo } from "../Dialogo/Dialogo";
import { Recolhivel } from "../Recolhivel/Recolhivel";
import { EstadoVazio } from "../EstadoVazio/EstadoVazio";
import { ApelidoDaConta } from "./ApelidoDaConta";
import { CartaoDeConta } from "./CartaoDeConta";
import { Titulo } from "../Titulo/Titulo";
import { Esqueleto } from "../Esqueleto/Esqueleto";
import { EstadoDeErro } from "../EstadoDeErro/EstadoDeErro";
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
  /** Aviso de confirmação do apelido ("Apelido salvo."). */
  aoAvisar?: (texto: string) => void;
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
  aoAvisar,
  situacaoDosCartoes,
}: Propriedades) {
  const [contaDoApelido, definirContaDoApelido] = useState<Conta | null>(null);
  const parecidas = useMemo(() => contasParecidas(contas ?? []), [contas]);
  const idTitulo = useId();
  const raiz = useRef<HTMLElement>(null);
  const botaoNovaConta = useRef<HTMLButtonElement>(null);

  // Ao fechar o formulário o diálogo devolve o foco a quem o abriu; sem ninguém com foco (a ação do estado
  // vazio foi acionada sem foco), ele vai ao primeiro botão da seção.
  const estavaAberto = useRef(formularioAberto);
  useEffect(() => {
    if (estavaAberto.current && !formularioAberto && (document.activeElement === null || document.activeElement === document.body)) {
      (botaoNovaConta.current ?? raiz.current?.querySelector("button"))?.focus();
    }
    estavaAberto.current = formularioAberto;
  }, [formularioAberto]);

  function cartaoDaConta(conta: Conta) {
    const selecionada = conta.id === contaSelecionada;
    return (
      <li key={conta.id} className={estilos.item}>
        <CartaoDeConta
          conta={conta}
          selecionada={selecionada}
          aoAlternar={aoSelecionar && (() => aoSelecionar(selecionada ? null : conta.id))}
          situacaoDoCartao={situacaoDosCartoes?.get(conta.id)}
          sugerirApelido={parecidas.has(conta.id)}
        />
        <span className={estilos.menuDaConta}>
          <MenuDaConta conta={conta} aoDarApelido={definirContaDoApelido} aoExcluir={aoExcluir} />
        </span>
      </li>
    );
  }

  let conteudo;
  if (contas === undefined) {
    conteudo = (
      carregando ? <Esqueleto rotulo="Carregando contas…" /> : <EstadoDeErro mensagem="Não foi possível carregar as contas." />
    );
  } else if (contas.length === 0) {
    conteudo = (
      <EstadoVazio
        icone="contas"
        titulo="Nenhuma conta ainda"
        descricao="Cadastre uma conta para reunir seus saldos e lançamentos."
        acao={{ rotulo: "Nova conta", aoClicar: () => aoMudarFormulario(true) }}
      />
    );
  } else {
    // Contas sem saldo ficam recolhidas no fim, para as que têm dinheiro aparecerem primeiro.
    const comSaldo = contas.filter((conta) => paraCentavos(conta.saldo) !== 0n);
    const semSaldo = contas.filter((conta) => paraCentavos(conta.saldo) === 0n);
    conteudo = (
      <>
        {comSaldo.length > 0 && <ul className={estilos.lista}>{comSaldo.map(cartaoDaConta)}</ul>}
        {semSaldo.length > 0 && (
          <Recolhivel resumo={`${semSaldo.length} ${semSaldo.length === 1 ? "conta sem saldo" : "contas sem saldo"}`}>
            <ul className={estilos.lista}>{semSaldo.map(cartaoDaConta)}</ul>
          </Recolhivel>
        )}
      </>
    );
  }

  return (
    <section ref={raiz} className={estilos.contas} aria-labelledby={idTitulo}>
      <div className={estilos.cabecalhoDaSecao}>
        <Titulo nivel="secao" como="h3" id={idTitulo}>
          Suas contas
        </Titulo>
        {contas !== undefined && contas.length > 0 && (
          <Botao
            ref={botaoNovaConta}
            variante="secundario"
            icone="adicionar"
            onClick={() => aoMudarFormulario(true)}
          >
            Nova conta
          </Botao>
        )}
      </div>
      {conteudo}
      {contaDoApelido !== null && (
        <ApelidoDaConta
          key={contaDoApelido.id}
          conta={contas?.find((outra) => outra.id === contaDoApelido.id) ?? contaDoApelido}
          aberto
          aoFechar={() => definirContaDoApelido(null)}
          aoAvisar={(texto) => aoAvisar?.(texto)}
        />
      )}
      {formularioAberto && (
        <Dialogo
          titulo="Nova conta"
          aberto
          aoFechar={() => aoMudarFormulario(false)}
          devolverFocoPara={botaoNovaConta}
        >
          <FormularioDeConta
            aoCriar={(conta) => {
              aoMudarFormulario(false);
              aoCriar(conta);
            }}
            aoCancelar={() => aoMudarFormulario(false)}
            aoFalhar={aoFalhar}
          />
        </Dialogo>
      )}
    </section>
  );
}
