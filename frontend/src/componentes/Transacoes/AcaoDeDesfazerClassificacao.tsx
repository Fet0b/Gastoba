import { useState } from "react";

import { ErroDaApiCliente, MENSAGEM_SEM_RESPOSTA } from "../../api/cliente";
import { useConsultarImpactoDaReversao, useDesfazerClassificacaoImportada } from "../../api/consultas";
import { DialogoDeConfirmacao } from "../DialogoDeConfirmacao/DialogoDeConfirmacao";
import type { ItemDoMenu } from "../MenuDeAcoes/MenuDeAcoes";

export function useAcaoDeDesfazerClassificacao(transacaoId: string | null | undefined, descricao: string, aoConcluir?: () => void) {
  const [impacto, definirImpacto] = useState<import("../../api/tipos").ImpactoDaReversao>();
  const [aberto, definirAberto] = useState(false);
  const previa = useConsultarImpactoDaReversao();
  const desfazer = useDesfazerClassificacaoImportada();
  const erro = previa.erro ?? desfazer.erro;
  const mensagem = erro ? erro instanceof ErroDaApiCliente ? erro.mensagem : MENSAGEM_SEM_RESPOSTA : null;
  const item: ItemDoMenu | null = !transacaoId ? null : {
    rotulo: "Desfazer classificação",
    destrutivo: true,
    desabilitado: previa.pendente || desfazer.pendente,
    aoEscolher: async () => {
      const resultado = await previa.executar(transacaoId);
      if (resultado) { definirImpacto(resultado); definirAberto(true); }
    },
  };
  return {
    item,
    dialogo: transacaoId ? <>
      {mensagem && !aberto && <p role="alert">{mensagem}</p>}
      <DialogoDeConfirmacao
        aberto={aberto}
        titulo={`Desfazer classificação de ${descricao}?`}
        descricao={(impacto && impacto.transacoes_reabertas > 1 ? "As duas pontas da transferência voltarão à caixa de entrada. " : "") + (impacto?.coberturas_removidas ? `${impacto.coberturas_removidas} cobertura(s) de compra também serão removidas. ` : "") + (impacto?.divisao_inteira ? `A divisão inteira será desfeita: ${impacto.lancamentos_removidos} lançamentos. A transação volta à caixa de entrada.` : "A transação volta à caixa de entrada, sem categoria, tags ou vínculo com investimento.")}
        rotuloDaAcao={impacto?.divisao_inteira ? "Desfazer a divisão inteira" : "Sim, desfazer"}
        pendente={desfazer.pendente}
        erro={mensagem ?? undefined}
        aoCancelar={() => definirAberto(false)}
        aoConfirmar={async () => {
          if (!transacaoId || !impacto) return;
          if (await desfazer.executar({ transacaoId, versaoEsperada: impacto.versao, desfazerDivisaoInteira: impacto.divisao_inteira, desfazerDependencias: impacto.coberturas_removidas > 0 })) {
            definirAberto(false);
            aoConcluir?.();
          }
        }}
      />
    </> : null,
  };
}
