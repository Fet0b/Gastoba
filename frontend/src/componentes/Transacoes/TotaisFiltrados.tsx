import { paraCentavos } from "../../dinheiro/dinheiro";
import { totaisDasTransacoes, type TransacaoDaLinha } from "../../transacoes/linhaDoTempo";
import { GradeDeIndicadores } from "../GradeDeIndicadores/GradeDeIndicadores";
import { Indicador } from "../Indicador/Indicador";
import { ValorAnimado } from "../ValorAnimado/ValorAnimado";

type Propriedades = {
  transacoes: readonly TransacaoDaLinha[];
  /** Com busca ou filtro, o saldo é o da lista e não o do mês inteiro. */
  filtrada?: boolean;
};

/**
 * Entradas, saídas e saldo do que está na lista (já filtrada), em três indicadores, com os valores
 * contando até o novo. O saldo ganha o tom do sinal (positivo, negativo ou neutro no zero).
 */
export function TotaisFiltrados({ transacoes, filtrada = false }: Propriedades) {
  const totais = totaisDasTransacoes(transacoes);
  const saldo = paraCentavos(totais.saldo);

  return (
    <GradeDeIndicadores colunas={3}>
      <Indicador rotulo="Entradas" tom="positivo" valor={<ValorAnimado valor={totais.entradas} />} />
      <Indicador rotulo="Saídas" tom="negativo" valor={<ValorAnimado valor={totais.saidas} />} />
      <Indicador
        rotulo={filtrada ? "Saldo da lista" : "Saldo do mês"}
        tom={saldo > 0n ? "positivo" : saldo < 0n ? "negativo" : "neutro"}
        valor={<ValorAnimado valor={totais.saldo} />}
      />
    </GradeDeIndicadores>
  );
}
