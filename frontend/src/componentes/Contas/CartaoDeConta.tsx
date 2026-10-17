import type { Conta } from "../../api/tipos";
import { ValorAnimado } from "../ValorAnimado/ValorAnimado";
import estilos from "./Contas.module.css";
import { IconeDeBanco, IconeDeCartao, IconeDeSaldoNegativo } from "./IconesDaCarteira";

type Propriedades = {
  conta: Conta;
  selecionada: boolean;
  /** Clicar seleciona a conta como filtro; clicar de novo limpa. Sem ele, o cartão não é clicável. */
  aoAlternar?: () => void;
};

/**
 * Cartão de carteira de uma conta: nome, saldo, selos em texto e tom do saldo (ícone e texto, nunca só a cor), que conta até o novo valor quando muda.
 * Enquanto conta, o cartão destaca (CSS, pelo `data-animando` do
 * ValorAnimado; sem destaque com `prefers-reduced-motion`, que não anima).
 */
export function CartaoDeConta({ conta, selecionada, aoAlternar }: Propriedades) {
  const negativo = conta.saldo.startsWith("-");
  const zero = !negativo && /^0+(\.0+)?$/.test(conta.saldo);
  const tom = negativo ? "negativo" : zero ? "neutro" : "positivo";
  const conteudo = (
    <>
      <span className={estilos.nomeDaConta}>{conta.nome}</span>
      <ValorAnimado
        valor={conta.saldo}
        className={negativo ? `${estilos.saldo} ${estilos.saldoNegativo}` : estilos.saldo}
      />
      {negativo && (
        <span className={estilos.tomNegativo}>
          <IconeDeSaldoNegativo />
          Saldo negativo
        </span>
      )}
      {(conta.tipo === "cartao" || conta.origem === "open_finance") && (
        <span className={estilos.selos}>
          {conta.tipo === "cartao" && (
            <span className={estilos.selo} data-selo="cartao">
              <IconeDeCartao tamanho={14} />
              Cartão de crédito
            </span>
          )}
          {conta.origem === "open_finance" && (
            <span className={estilos.selo} data-selo="banco">
              <IconeDeBanco tamanho={14} />
              Banco conectado
            </span>
          )}
        </span>
      )}
    </>
  );
  if (!aoAlternar)
    return (
      <div className={estilos.cartao} data-tom={tom}>
        {conteudo}
      </div>
    );
  return (
    <button
      type="button"
      className={estilos.cartao}
      data-tom={tom}
      aria-pressed={selecionada}
      onClick={aoAlternar}
    >
      {conteudo}
    </button>
  );
}
