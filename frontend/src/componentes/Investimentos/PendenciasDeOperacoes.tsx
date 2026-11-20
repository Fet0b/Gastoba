import type { PendenciaDeOperacao } from "../../api/tipos";
import { Banner } from "../Banner/Banner";
import { Metadados } from "../Metadados/Metadados";
import { Recolhivel } from "../Recolhivel/Recolhivel";

const MOTIVOS: Record<string, string> = { tipo_sem_traducao: "O evento não foi traduzido em operação. Confira o histórico antes de lançar à mão.", resgate_sem_historico: "Falta saldo anterior para calcular a quantidade do resgate parcial.", possivel_duplicidade: "Já existe uma operação manual igual. Confira a possível duplicidade antes de registrar outra." };
export function PendenciasDeOperacoes({ pendencias }: { pendencias: PendenciaDeOperacao[] }) {
  if (!pendencias.length) return null;
  return <Recolhivel resumo={`Pendências de operações (${pendencias.length})`}>
    {pendencias.map((p, i) => <div key={`${p.tipo}-${p.data}-${i}`}><Metadados><span>{p.tipo}</span><span>{p.data}</span></Metadados><Banner tom="atencao" titulo="Confira esta operação" texto={MOTIVOS[p.motivo] ?? "Confira o histórico desta posição."} /></div>)}
  </Recolhivel>;
}
