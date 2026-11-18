import { deCentavos, formatar, paraCentavos } from "../../dinheiro/dinheiro";
import { Botao } from "../Botao/Botao";
import { Destaque } from "../Destaque/Destaque";
import estilos from "./Inicio.module.css";

type Propriedades = {
  /** A renda do mês (a soma dos ganhos); `undefined` enquanto não chegou. */
  renda: string | undefined;
  /** O gasto do mês; `undefined` enquanto não chegou. */
  gasto: string | undefined;
  aportes?: string;
  /** Só as contas correntes; `undefined` enquanto não chegou. */
  dinheiroTotal: string | undefined;
  momento: "passado" | "atual" | "futuro";
  /** Leva a registrar um ganho (nas Transações). */
  aoRegistrarGanho: () => void;
};

/**
 * Os dois destaques do Início: quanto ainda dá para gastar no mês (renda menos gastos e aportes com dinheiro do mês) e o
 * dinheiro total. Sem ganhos no mês a conta não tem sentido, então o principal vira o gasto
 * do mês e um convite leva a registrar um ganho.
 */
export function ResumoDoMes({ renda, gasto, aportes, dinheiroTotal, momento, aoRegistrarGanho }: Propriedades) {
  const semGanhos = renda !== undefined && paraCentavos(renda) <= 0n;

  let principal;
  if (semGanhos) {
    principal = <Destaque
        rotulo="Gasto no mês"
        valor={gasto === undefined ? "—" : formatar(gasto)}
        tamanho="heroi"
      />;
  } else {
    const sobra =
      renda !== undefined && gasto !== undefined && aportes !== undefined
        ? deCentavos(paraCentavos(renda) - paraCentavos(gasto) - paraCentavos(aportes))
        : undefined;
    principal = (
      <Destaque
        rotulo={momento === "passado" ? "Sobrou no mês" : "Pode gastar este mês"}
        valor={sobra === undefined ? "—" : formatar(sobra)}
        tom={sobra !== undefined && paraCentavos(sobra) < 0n ? "negativo" : "neutro"}
        tamanho="heroi"
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
            <Botao variante="secundario" onClick={aoRegistrarGanho}>
              Registrar um ganho
            </Botao>
          </div>
        )}
      </div>
      <dl className={estilos.numeros}>
        <div className={estilos.numero}>
          <dt>Ganhos do mês</dt>
          <dd>{renda === undefined ? "—" : formatar(renda)}</dd>
        </div>
        <div className={estilos.numero}>
          <dt>{"\u{2212}"} Gastos do mês</dt>
          <dd>{gasto === undefined ? "—" : formatar(gasto)}</dd>
        </div>
        <div className={estilos.numero}>
          <dt>{"\u{2212}"} Aportes com dinheiro do mês</dt>
          <dd>{aportes === undefined ? "—" : formatar(aportes)}</dd>
        </div>
      </dl>
      <p>Aportes que só reaplicam resgates não entram na conta.</p>
      <Destaque
        rotulo="Dinheiro nas contas correntes"
        valor={dinheiroTotal === undefined ? "—" : formatar(dinheiroTotal)}
        tamanho="medio"
      />
    </div>
  );
}
