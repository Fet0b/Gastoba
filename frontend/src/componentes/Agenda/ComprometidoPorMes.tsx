import { comprometidoPorMes } from "../../agenda/agenda";
import type { Recorrencia } from "../../api/tipos";
import { deCentavos, formatar, paraCentavos } from "../../dinheiro/dinheiro";
import { Icone } from "../Icone/Icone";
import { ValorAnimado } from "../ValorAnimado/ValorAnimado";
import { Titulo } from "../Titulo/Titulo";
import estilos from "./Agenda.module.css";

type Propriedades = {
  recorrencias: readonly Recorrencia[] | undefined;
  /** "AAAA-MM-DD"; a página passa `hojeLocal()`. */
  hoje: string;
  carregando?: boolean;
};

/** O que as recorrências vigentes movimentam por mês: ganhos fixos, gastos fixos e a diferença. */
export function ComprometidoPorMes({ recorrencias, hoje, carregando }: Propriedades) {
  if (recorrencias === undefined) {
    return (
      <div className={estilos.comprometido}>
        <Titulo nivel="cartao" como="h3" className={estilos.titulo}>Comprometido por mês</Titulo>
        <p className={estilos.nota}>{carregando ? "Calculando…" : "Não foi possível calcular"}</p>
      </div>
    );
  }

  const total = comprometidoPorMes(recorrencias, hoje);
  const saldo = paraCentavos(total.saldo);
  const gastos = paraCentavos(total.gastos);
  const tom = saldo > 0n ? "positivo" : saldo < 0n ? "negativo" : "neutro";
  let frase: string;
  if (saldo > 0n) frase = `Sobram ${formatar(total.saldo)} por mês`;
  else if (saldo < 0n) frase = "Gastos fixos passam dos ganhos fixos";
  else if (gastos === 0n) frase = "Nada comprometido por mês";
  else frase = "Ganhos e gastos fixos se igualam";

  const nome =
    `Comprometido por mês: ganhos fixos ${formatar(total.ganhos)}, ` +
    `gastos fixos ${formatar(total.gastos)}, diferença ${formatar(total.saldo)}`;

  return (
    <div className={estilos.comprometido}>
      <Titulo nivel="cartao" como="h3" className={estilos.titulo}>Comprometido por mês</Titulo>
      <div role="group" aria-label={nome} data-tom={tom} className={estilos.grupo}>
        <dl className={estilos.totais}>
          <div className={estilos.total}>
            <dt className={estilos.rotulo}>Ganhos fixos</dt>
            <dd className={estilos.valorDoTotal} data-lado="ganho">
              <span aria-hidden="true">+</span>
              <ValorAnimado valor={total.ganhos} />
            </dd>
          </div>
          <div className={estilos.total}>
            <dt className={estilos.rotulo}>Gastos fixos</dt>
            <dd className={estilos.valorDoTotal} data-lado="gasto">
              <ValorAnimado valor={deCentavos(-gastos)} />
            </dd>
          </div>
          <div className={estilos.total} data-principal="">
            <dt className={estilos.rotulo}>Diferença</dt>
            <dd className={estilos.valorDoTotal} data-lado="diferenca">
              <ValorAnimado valor={total.saldo} />
              <span className={estilos.situacao}>
                {tom === "positivo" && <Icone nome="ok" tamanho={16} />}
                {tom === "negativo" && <Icone nome="alerta" tamanho={16} />}
                <span>{frase}</span>
              </span>
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
