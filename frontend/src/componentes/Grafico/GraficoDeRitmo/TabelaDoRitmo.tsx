import { deCentavos, formatar, paraCentavos } from "../../../dinheiro/dinheiro";
import { Tabela } from "../../Tabela/Tabela";

type Propriedades = {
  /** O gasto acumulado de cada dia, do dia 1 até o último dia desenhado. */
  acumulado: readonly string[];
  /** O ritmo ideal de cada dia do mês; `undefined` quando não há renda. */
  ideal: readonly string[] | undefined;
};

/** A mesma informação do gráfico em texto: um dia por linha. */
export function TabelaDoRitmo({ acumulado, ideal }: Propriedades) {
  return (
    <Tabela legenda="Gasto acumulado por dia">
      <thead>
        <tr>
          <th scope="col">Dia</th>
          <th scope="col" data-numerica>Gasto do dia</th>
          <th scope="col" data-numerica>Acumulado</th>
          {ideal && <th scope="col" data-numerica>Ritmo ideal</th>}
        </tr>
      </thead>
      <tbody>
        {acumulado.map((total, indice) => {
          const anterior = indice === 0 ? 0n : paraCentavos(acumulado[indice - 1]);
          return (
            <tr key={indice}>
              <th scope="row">{indice + 1}</th>
              <td data-numerica>{formatar(deCentavos(paraCentavos(total) - anterior))}</td>
              <td data-numerica>{formatar(total)}</td>
              {ideal && <td data-numerica>{formatar(ideal[indice])}</td>}
            </tr>
          );
        })}
      </tbody>
    </Tabela>
  );
}
