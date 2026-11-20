import { useMovimentosDeInvestimento } from "../../api/consultas";
import type { Investimento, TipoDeMovimento } from "../../api/tipos";
import { formatar } from "../../dinheiro/dinheiro";
import { Seletor } from "../Campo/Seletor";

export function EditorDeOperacaoDoInvestimento({ tipo, investimentos, investimentoId, aoMudarInvestimento, relacionado, aoMudarRelacionado }: {
 tipo: TipoDeMovimento; investimentos: readonly Investimento[]; investimentoId: string;
 aoMudarInvestimento: (id: string) => void; relacionado: string; aoMudarRelacionado: (id: string) => void;
}) {
 const movimentos = useMovimentosDeInvestimento("0001-01-01", "9999-12-31");
 return <div>
  <Seletor rotulo="Investimento" valor={investimentoId} vazio="Escolha o investimento" opcoes={investimentos.map(i => ({ valor: i.id, rotulo: i.nome }))} aoMudar={aoMudarInvestimento} />
  {tipo !== "rendimento" && <Seletor rotulo="Operação relacionada" valor={relacionado} vazio="Escolha a compra ou venda" opcoes={(movimentos.dados ?? []).filter(m => m.investimento_id === investimentoId && m.origem !== "saldo_inicial" && (m.tipo === "aporte" || m.tipo === "resgate")).map(m => ({ valor: m.id, rotulo: `${m.data} ${m.descricao} ${formatar(m.valor)}` }))} aoMudar={aoMudarRelacionado} />}
  <p>{tipo === "rendimento" ? "Rendimento pertence ao investimento; não cria ganho nem dinheiro novo." : "O custo fica ligado à operação, sem contar como aporte ou gasto do orçamento."}</p>
 </div>;
}
