import type { SituacaoDaFatura } from "../../api/tipos";
import { Badge } from "../Badge/Badge";

const SELOS: Readonly<Record<SituacaoDaFatura, { texto: string; tom: "neutro" | "positivo" | "negativo" | "atencao" }>> = {
  aberta: { texto: "Aberta", tom: "neutro" },
  fechada: { texto: "Fechada", tom: "atencao" },
  paga: { texto: "Paga", tom: "positivo" },
  vencida: { texto: "Vencida", tom: "negativo" },
};

/** A situação da fatura sempre em texto (a cor só reforça). */
export function SeloDeSituacao({ situacao }: { situacao: SituacaoDaFatura }) {
  const { texto, tom } = SELOS[situacao];
  return <Badge tom={tom}>{texto}</Badge>;
}
