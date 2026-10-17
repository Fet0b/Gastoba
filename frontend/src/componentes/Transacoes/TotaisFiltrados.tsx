import { totaisDasTransacoes, type TransacaoDaLinha } from "../../transacoes/linhaDoTempo";
import { ValorAnimado } from "../ValorAnimado/ValorAnimado";
import estilos from "./TotaisFiltrados.module.css";

/** Entradas, saídas e saldo do que está na lista (já filtrada), com os valores contando até o novo. */
export function TotaisFiltrados({ transacoes }: { transacoes: readonly TransacaoDaLinha[] }) {
  const totais = totaisDasTransacoes(transacoes);

  return (
    <dl className={estilos.totais} aria-label="Totais do que está na lista">
      <div className={estilos.total}>
        <dt>Entradas</dt>
        <dd>
          <ValorAnimado valor={totais.entradas} />
        </dd>
      </div>
      <div className={estilos.total}>
        <dt>Saídas</dt>
        <dd>
          <ValorAnimado valor={totais.saidas} />
        </dd>
      </div>
      <div className={`${estilos.total} ${estilos.saldo}`}>
        <dt>Saldo</dt>
        <dd>
          <ValorAnimado valor={totais.saldo} />
        </dd>
      </div>
    </dl>
  );
}
