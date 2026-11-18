import { anterior, proximo, rotulo, type Periodo } from "../../periodo/periodo";
import { Botao } from "../Botao/Botao";
import estilos from "./Pagina.module.css";

export function SeletorDeMes({periodo, aoMudarPeriodo}: {periodo: Periodo; aoMudarPeriodo: (periodo: Periodo) => void}) {
  return <div className={estilos.periodo} role="group" aria-label="Período">
    <Botao variante="terciario" aria-label="Mês anterior" onClick={() => aoMudarPeriodo(anterior(periodo))}>‹</Botao>
    <span className={estilos.rotulo} aria-live="polite">{rotulo(periodo)}</span>
    <Botao variante="terciario" aria-label="Próximo mês" onClick={() => aoMudarPeriodo(proximo(periodo))}>›</Botao>
  </div>;
}
