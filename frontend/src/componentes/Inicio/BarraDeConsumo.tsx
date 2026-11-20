import type { Periodo } from "../../periodo/periodo";
import { consumoDoMes } from "../../inicio/consumoDoMes";
import { formatar } from "../../dinheiro/dinheiro";
import estilos from "./BarraDeConsumo.module.css";

export function BarraDeConsumo({ gasto, disponivel, hoje, periodo }: {
  gasto: string;
  disponivel: string;
  hoje: string;
  periodo: Periodo;
}) {
  const consumo = consumoDoMes({ gasto, disponivel, hoje, periodo });
  return (
    <div className={estilos.consumo}>
      <div
        className={estilos.trilho}
        role="img"
        aria-label={`Gasto ${formatar(gasto)} de ${formatar(disponivel)}; dia ${consumo.dia} de ${consumo.diasNoMes}`}
        data-fracao={consumo.fracao}
      >
        <span className={estilos.preenchimento} style={{ width: `${consumo.fracao / 10}%` }} />
      </div>
      <div className={estilos.legenda}>
        <span>Gasto {formatar(gasto)} de {formatar(disponivel)}</span>
        <span>dia {consumo.dia} de {consumo.diasNoMes}</span>
      </div>
    </div>
  );
}
