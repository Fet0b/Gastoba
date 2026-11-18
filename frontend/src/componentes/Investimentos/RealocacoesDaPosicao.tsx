import { useEffect } from "react";
import { useDesfazerRealocacao, useRealocacoes } from "../../api/consultas";
import { formatar } from "../../dinheiro/dinheiro";
import { dataParaExibicao } from "../../periodo/periodo";
import { EstadoDeErro } from "../EstadoDeErro/EstadoDeErro";
import { Esqueleto } from "../Esqueleto/Esqueleto";
import { EstadoVazio } from "../EstadoVazio/EstadoVazio";
import { DesfazerComConfirmacao } from "./DesfazerComConfirmacao";
import estilos from "./Investimentos.module.css";
export function RealocacoesDaPosicao({
  investimentoId,
  aoAvisar,
  aoFalhar,
}: {
  investimentoId: string;
  aoAvisar: (texto: string) => void;
  aoFalhar: (erro: unknown) => void;
}) {
  const realocacoes = useRealocacoes(investimentoId);
  const desfazer = useDesfazerRealocacao();

  async function desfazerUma(realocacaoId: string): Promise<void> {
    if (desfazer.pendente) return;
    const feito = await desfazer.executar({ investimentoId, realocacaoId });
    if (feito) aoAvisar("Realocação desfeita.");
  }
  useEffect(() => {
    if (desfazer.erro !== null && desfazer.erro !== undefined) aoFalhar(desfazer.erro);
  }, [desfazer.erro]);

  if (realocacoes.erro) return <EstadoDeErro mensagem="Não foi possível carregar as realocações." />;
  if (realocacoes.dados === undefined) return <Esqueleto rotulo="Carregando realocações" />;
  if (realocacoes.dados.length === 0) return <EstadoVazio icone="investimentos" titulo="Nenhuma realocação ainda." descricao="As mudanças entre destinações aparecem aqui." />;
  return (
    <ul className={estilos.realocacoes}>
      {realocacoes.dados.map((r) => (
        <li key={r.id} className={estilos.linhaDesfazivel}>
          <span>
            {dataParaExibicao(r.data)}: {formatar(r.valor)} de <strong>{r.origem}</strong> para{" "}
            <strong>{r.destino}</strong>
          </span>
          <DesfazerComConfirmacao
            descricao={`realocação de ${formatar(r.valor)} de ${r.origem} para ${r.destino}`}
            pendente={desfazer.pendente}
            aoConfirmar={() => void desfazerUma(r.id)}
          />
        </li>
      ))}
    </ul>
  );
}

