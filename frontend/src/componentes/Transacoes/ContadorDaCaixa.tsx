import { useTransacoesImportadas } from "../../api/consultas";
import { Badge } from "../Badge/Badge";

/**
 * O número de transações pendentes na caixa de entrada, em um selo de atenção. Só existe com a
 * importação ligada (o componente é montado só então); sem pendência ou sem resposta, não mostra nada.
 */
export function ContadorDaCaixa() {
  const pendentes = useTransacoesImportadas("pendente");
  const quantidade = pendentes.dados?.length ?? 0;
  if (quantidade === 0) return null;
  return <Badge tom="atencao">{`${quantidade} ${quantidade === 1 ? "pendente" : "pendentes"}`}</Badge>;
}
