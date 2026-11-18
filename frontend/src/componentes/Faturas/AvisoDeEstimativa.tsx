import estilos from "./Faturas.module.css";

/** Avisa que a fatura foi calculada pelas compras, e não lida do banco. */
export function AvisoDeEstimativa() {
  return (
    <p className={estilos.aviso} data-aviso="estimativa">
      Fatura estimada pelas suas compras. As datas de fechamento e de vencimento podem diferir do
      banco.
    </p>
  );
}
