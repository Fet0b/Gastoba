import { useMovimentosDeInvestimento } from "../../api/consultas";
import type { Investimento, TipoDeMovimento } from "../../api/tipos";
import { formatar } from "../../dinheiro/dinheiro";

export function EditorDeOperacaoDoInvestimento({ tipo, investimentos, investimentoId, aoMudarInvestimento, relacionado, aoMudarRelacionado }: {
 tipo: TipoDeMovimento; investimentos: readonly Investimento[]; investimentoId: string;
 aoMudarInvestimento: (id: string) => void; relacionado: string; aoMudarRelacionado: (id: string) => void;
}) {
 const movimentos = useMovimentosDeInvestimento("0001-01-01", "9999-12-31");
 return <div>
  <label>Investimento<select value={investimentoId} onChange={e => aoMudarInvestimento(e.target.value)}>
   <option value="">Escolha o investimento</option>{investimentos.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
  </select></label>
  {tipo !== "rendimento" && <label>Operação relacionada<select value={relacionado} onChange={e => aoMudarRelacionado(e.target.value)}>
   <option value="">Escolha a compra ou venda</option>
   {movimentos.dados?.filter(m => m.investimento_id === investimentoId && m.origem !== "saldo_inicial" && (m.tipo === "aporte" || m.tipo === "resgate")).map(m => <option key={m.id} value={m.id}>{m.data} {m.descricao} {formatar(m.valor)}</option>)}
  </select></label>}
  <p>{tipo === "rendimento" ? "Rendimento pertence ao investimento; não cria ganho nem dinheiro novo." : "O custo fica ligado à operação, sem contar como aporte ou gasto do orçamento."}</p>
 </div>;
}
