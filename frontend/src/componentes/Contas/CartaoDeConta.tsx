import type { Conta } from "../../api/tipos";
import type { SituacaoDoCartao } from "../../contas/situacaoDosCartoes";
import { resumoDoSaldo } from "../../contas/resumoDoSaldo";
import { Badge } from "../Badge/Badge";
import { ValorAnimado } from "../ValorAnimado/ValorAnimado";
import estilos from "./Contas.module.css";
import { IdentificacaoDaConta } from "./IdentificacaoDaConta";
import { IconeDeBanco, IconeDeCartao, IconeDeSaldoNegativo } from "./IconesDaCarteira";

type Propriedades = {
  conta: Conta;
  selecionada: boolean;
  /** Clicar seleciona a conta como filtro; clicar de novo limpa. Sem ele, o cartão não é clicável. */
  aoAlternar?: () => void;
  /** Das faturas do cartão (só com a importação bancária): muda o rótulo e traz o selo "Vencida". */
  situacaoDoCartao?: SituacaoDoCartao;
  /** A pessoa não distingue esta conta das outras: sugere o apelido (a ação é o menu "Mais ações da conta"). */
  sugerirApelido?: boolean;
};

/**
 * Cartão de carteira de uma conta: nome, rótulo do valor ("Saldo", "Fatura aberta", "Fatura fechada" ou
 * "Saldo a favor"), valor e selos em Badge. O saldo negativo da conta corrente traz sinal, ícone e texto
 * (nunca só a cor); o valor conta até o novo quando muda e, enquanto conta, o cartão destaca (CSS,
 * pelo `data-animando` do ValorAnimado; sem destaque com `prefers-reduced-motion`, que não anima).
 */
export function CartaoDeConta({ conta, selecionada, aoAlternar, situacaoDoCartao, sugerirApelido = false }: Propriedades) {
  const resumo = resumoDoSaldo(conta, situacaoDoCartao?.recente ?? undefined);
  const vencida = conta.tipo === "cartao" && situacaoDoCartao?.temVencida === true;
  const conteudo = (
    <>
      <IdentificacaoDaConta conta={conta} semTipo={conta.tipo === "cartao"} reservarMenu />
      {sugerirApelido && <span className={estilos.sugestao}>Dê um apelido para diferenciar</span>}
      {(resumo.saldoNegativo || vencida || conta.tipo === "cartao" || conta.origem === "open_finance") && (
        <span className={estilos.selos}>
          {resumo.saldoNegativo && (
            <Badge tom="negativo" icone={<IconeDeSaldoNegativo tamanho={14} />}>
              Saldo negativo
            </Badge>
          )}
          {vencida && (
            <span data-selo="vencida">
              <Badge tom="negativo">Vencida</Badge>
            </span>
          )}
          {conta.tipo === "cartao" && (
            <span data-selo="cartao">
              <Badge icone={<IconeDeCartao tamanho={14} />}>Cartão de crédito</Badge>
            </span>
          )}
          {conta.origem === "open_finance" && (
            <span data-selo="banco">
              <Badge icone={<IconeDeBanco tamanho={14} />}>Banco conectado</Badge>
            </span>
          )}
        </span>
      )}
      <span className={estilos.baseDoCartao}>
        <span className={estilos.rotuloDoSaldo}>{resumo.rotulo}</span>
        <ValorAnimado
          valor={resumo.valor}
          className={resumo.tom === "negativo" ? `${estilos.saldo} ${estilos.saldoNegativo}` : estilos.saldo}
        />
      </span>
    </>
  );
  if (!aoAlternar)
    return (
      <div className={estilos.cartao} data-tom={resumo.tom}>
        {conteudo}
      </div>
    );
  return (
    <button
      type="button"
      className={estilos.cartao}
      data-tom={resumo.tom}
      aria-pressed={selecionada}
      onClick={aoAlternar}
    >
      {conteudo}
    </button>
  );
}
