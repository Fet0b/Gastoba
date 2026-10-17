import { deCentavos, formatar, paraCentavos } from "../../dinheiro/dinheiro";
import { Destaque } from "../Destaque/Destaque";
import estilos from "./Inicio.module.css";

type Propriedades = {
  /** A renda do mês (a soma dos ganhos); `undefined` enquanto não chegou. */
  renda: string | undefined;
  /** O gasto do mês; `undefined` enquanto não chegou. */
  gasto: string | undefined;
  /** Só as contas correntes; `undefined` enquanto não chegou. */
  dinheiroTotal: string | undefined;
  momento: "passado" | "atual" | "futuro";
  /** Leva a registrar um ganho (nas Transações). */
  aoRegistrarGanho: () => void;
};

/**
 * Os dois destaques do Início: quanto ainda dá para gastar no mês (renda menos gastos) e o
 * dinheiro total. Sem ganhos no mês a conta não tem sentido, então o principal vira o gasto
 * do mês e um convite leva a registrar um ganho.
 */
export function ResumoDoMes({ renda, gasto, dinheiroTotal, momento, aoRegistrarGanho }: Propriedades) {
  const semGanhos = renda !== undefined && paraCentavos(renda) <= 0n;

  let principal;
  if (semGanhos) {
    principal = <Destaque rotulo="Gasto no mês" valor={gasto === undefined ? "—" : formatar(gasto)} />;
  } else {
    const sobra =
      renda !== undefined && gasto !== undefined
        ? deCentavos(paraCentavos(renda) - paraCentavos(gasto))
        : undefined;
    principal = (
      <Destaque
        rotulo={momento === "passado" ? "Sobrou no mês" : "Pode gastar este mês"}
        valor={sobra === undefined ? "—" : formatar(sobra)}
        tom={sobra !== undefined && paraCentavos(sobra) < 0n ? "negativo" : "neutro"}
      />
    );
  }

  return (
    <div className={estilos.resumo}>
      <div className={estilos.principal}>
        {principal}
        {semGanhos && (
          <div className={estilos.convite}>
            <p>Sem ganhos neste mês, não dá para saber quanto ainda pode gastar.</p>
            <button type="button" className={estilos.acao} onClick={aoRegistrarGanho}>
              Registrar um ganho
            </button>
          </div>
        )}
      </div>
      <Destaque
        rotulo="Dinheiro total"
        valor={dinheiroTotal === undefined ? "—" : formatar(dinheiroTotal)}
      />
    </div>
  );
}
