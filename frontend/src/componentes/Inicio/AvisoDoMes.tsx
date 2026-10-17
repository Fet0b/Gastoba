import type { AvisoDoMes as AvisoDoMesCalculado } from "../../inicio/avisoDoMes";
import { Icone } from "../Icone/Icone";
import estilos from "./Inicio.module.css";

/** O aviso único do mês (a pior meta): um status com ícone e texto, nunca só cor. */
export function AvisoDoMes({ aviso }: { aviso: AvisoDoMesCalculado | null }) {
  if (aviso === null) return null;
  return (
    <p className={estilos.aviso} role="status" data-situacao={aviso.situacao}>
      <Icone nome="alerta" tamanho={18} />
      {aviso.texto}
    </p>
  );
}
