import type { Ref } from "react";
import { useCorDaDestinacao } from "../Investimentos/CoresDasDestinacoes";
import { formatar } from "../../dinheiro/dinheiro";
import { rotuloDoRendimento, type ResumoDaCaixinha } from "../../investimentos/caixinhas";
import { rotuloDeExibicao } from "../../texto/rotulo";
import { Cartao } from "../Cartao/Cartao";
import { Icone } from "../Icone/Icone";
import { MenuDeAcoes } from "../MenuDeAcoes/MenuDeAcoes";
import estilos from "./CartaoDaCaixinha.module.css";

type Propriedades = {
  resumo: ResumoDaCaixinha;
  aberto: boolean;
  /** O id do painel de detalhe que este cartão abre (`aria-controls`). */
  idDoPainel: string;
  aoAlternar: () => void;
  aoMudarAparencia: () => void;
  aoExcluir: () => void;
  /** Para a página devolver o foco ao cartão ao fechar o painel. */
  refDoBotao?: Ref<HTMLButtonElement>;
};

/**
 * Uma caixinha: ícone na cor dela, nome, o valor e o rendimento (sempre com sinal, além da cor).
 * O cartão é um botão que abre o detalhe; o menu "Mais ações" fica ao lado, fora do botão.
 */
export function CartaoDaCaixinha({ resumo, aberto, idDoPainel, aoAlternar, aoMudarAparencia, aoExcluir, refDoBotao }: Propriedades) {
  const corDaDestinacao = useCorDaDestinacao();
  const semInvestimentos = resumo.partes.length === 0;
  const rendimento = semInvestimentos ? { texto: "Sem investimentos", tom: "neutro" as const } : rotuloDoRendimento(resumo.rendimento);
  return (
    <Cartao como="div" className={estilos.cartao}>
      <button
        ref={refDoBotao}
        type="button"
        className={estilos.principal}
        aria-expanded={aberto}
        aria-controls={idDoPainel}
        onClick={aoAlternar}
      >
        <span
          className={estilos.icone}
          data-parte="icone"
          data-cor={resumo.cor ?? "automatica"}
          style={{ backgroundColor: corDaDestinacao(resumo.nome, resumo.cor) }}
        >
          <Icone nome={resumo.icone} tamanho={24} />
        </span>
        <span className={estilos.nome} data-parte="nome" title={resumo.nome}>
          {rotuloDeExibicao(resumo.nome)}
        </span>
        <span className={estilos.valor} data-parte="valor">{formatar(resumo.valor)}</span>
        <span className={estilos.rendimento} data-parte="rendimento" data-tom={rendimento.tom} data-vazio={semInvestimentos || undefined}>
          {rendimento.texto}
        </span>
      </button>
      <div className={estilos.menu} data-parte="menu">
        <MenuDeAcoes
          rotulo={`Mais ações de ${resumo.nome}`}
          itens={[
            { rotulo: "Mudar ícone e cor", aoEscolher: aoMudarAparencia },
            { rotulo: "Excluir caixinha", destrutivo: true, aoEscolher: aoExcluir },
          ]}
        />
      </div>
    </Cartao>
  );
}
