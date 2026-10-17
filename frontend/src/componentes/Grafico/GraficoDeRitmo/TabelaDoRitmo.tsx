import { deCentavos, formatar, paraCentavos } from "../../../dinheiro/dinheiro";
import estilos from "./GraficoDeRitmo.module.css";

type Propriedades = {
  /** O gasto acumulado de cada dia, do dia 1 até o último dia desenhado. */
  acumulado: readonly string[];
  /** O ritmo ideal de cada dia do mês; `undefined` quando não há renda. */
  ideal: readonly string[] | undefined;
};

/** A mesma informação do gráfico em texto: um dia por linha. */
export function TabelaDoRitmo({ acumulado, ideal }: Propriedades) {
  return (
    <table className={estilos.tabela}>
      <caption className={estilos.legendaDaTabela}>Gasto acumulado por dia</caption>
      <thead>
        <tr>
          <th scope="col">Dia</th>
          <th scope="col">Gasto do dia</th>
          <th scope="col">Acumulado</th>
          {ideal && <th scope="col">Ritmo ideal</th>}
        </tr>
      </thead>
      <tbody>
        {acumulado.map((total, indice) => {
          const anterior = indice === 0 ? 0n : paraCentavos(acumulado[indice - 1]);
          return (
            <tr key={indice}>
              <th scope="row">{indice + 1}</th>
              <td>{formatar(deCentavos(paraCentavos(total) - anterior))}</td>
              <td>{formatar(total)}</td>
              {ideal && <td>{formatar(ideal[indice])}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
