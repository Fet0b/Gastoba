import { useRef, useState } from "react";

import { ErroDaApiCliente, MENSAGEM_SEM_RESPOSTA } from "../../api/cliente";
import { useConsultarImpactoDaReversao, useInvestimentos, useMovimentosDeInvestimento, useReclassificarTransacaoImportada } from "../../api/consultas";
import type { ImpactoDaReversao, RotuloDeReclassificacao } from "../../api/tipos";
import { normalizarNomeDaInstituicao } from "../../texto/nomeDaInstituicao";
import { Botao } from "../Botao/Botao";
import { Seletor } from "../Campo/Seletor";
import { Dialogo } from "../Dialogo/Dialogo";
import type { ItemDoMenu } from "../MenuDeAcoes/MenuDeAcoes";

const OPCOES: Record<"saida" | "entrada", { valor: RotuloDeReclassificacao; rotulo: string; exigeInvestimento: boolean }[]> = {
  saida: [{ valor: "transferencia_para_investimento", rotulo: "Transferência para investimento", exigeInvestimento: false }, { valor: "imposto", rotulo: "Imposto da posição", exigeInvestimento: true }, { valor: "custo", rotulo: "Custo da posição", exigeInvestimento: true }],
  entrada: [
    { valor: "rendimento_da_posicao", rotulo: "Rendimento da posição", exigeInvestimento: true },
    { valor: "transferencia_para_investimento", rotulo: "Resgate de investimento", exigeInvestimento: false },
  ],
};

/** "Reclassificar" no menu de uma transação importada: troca o rótulo numa só ação, sem relançar. */
export function useAcaoDeReclassificar(transacaoId: string | null | undefined, descricao: string, sentido: "saida" | "entrada", aoConcluir?: () => void) {
  const [aberto, definirAberto] = useState(false);
  const [impacto, definirImpacto] = useState<ImpactoDaReversao>();
  const [rotulo, definirRotulo] = useState<RotuloDeReclassificacao>(OPCOES[sentido][0].valor);
  const [investimentoId, definirInvestimentoId] = useState("");
  const [relacionado, mudarRelacionado] = useState("");
  const exigeRelacao = rotulo === "imposto" || rotulo === "custo";
  const movimentos = useMovimentosDeInvestimento("1900-01-01", "2100-12-31", aberto && exigeRelacao);
  const acionador = useRef<HTMLElement | null>(null);
  const investimentos = useInvestimentos();
  const previa = useConsultarImpactoDaReversao();
  const reclassificar = useReclassificarTransacaoImportada();
  const erro = previa.erro ?? reclassificar.erro;
  const mensagem = erro ? (erro instanceof ErroDaApiCliente ? erro.mensagem : MENSAGEM_SEM_RESPOSTA) : null;
  const opcao = OPCOES[sentido].find(o => o.valor === rotulo) ?? OPCOES[sentido][0];
  const faltaInvestimento = opcao.exigeInvestimento && investimentoId === "";

  const item: ItemDoMenu | null = !transacaoId ? null : {
    rotulo: "Reclassificar",
    desabilitado: previa.pendente || reclassificar.pendente,
    aoEscolher: async () => {
      acionador.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const resultado = await previa.executar(transacaoId);
      if (resultado) { definirImpacto(resultado); definirRotulo(OPCOES[sentido][0].valor); definirInvestimentoId(""); mudarRelacionado(""); definirAberto(true); }
    },
  };
  const fechar = () => { definirAberto(false); window.setTimeout(() => acionador.current?.focus(), 0); };
  return {
    item,
    dialogo: transacaoId ? <>
      {mensagem && !aberto && <p role="alert">{mensagem}</p>}
      <Dialogo
        aberto={aberto}
        titulo={`Reclassificar ${descricao}`}
        aoFechar={fechar}
        bloqueado={reclassificar.pendente}
        rodape={<>
          <Botao variante="secundario" onClick={fechar}>Cancelar</Botao>
          <Botao variante="primario" disabled={faltaInvestimento || (exigeRelacao && (!relacionado || movimentos.carregando || !!movimentos.erro)) || reclassificar.pendente} onClick={async () => {
            if (!impacto) return;
            const feito = await reclassificar.executar({
              transacaoId, rotulo, versaoEsperada: impacto.versao, investimentoId: investimentoId || null, movimentoRelacionadoId: exigeRelacao ? relacionado : undefined,
              desfazerDivisaoInteira: impacto.divisao_inteira, desfazerDependencias: impacto.coberturas_removidas > 0,
            });
            if (feito) { definirAberto(false); aoConcluir?.(); }
          }}>Reclassificar</Botao>
        </>}
      >
        <p>Troque a classificação sem apagar nem relançar nada: a classificação atual é desfeita e a nova é aplicada de uma vez. Dá para desfazer depois.</p>
        <Seletor rotulo="Nova classificação" valor={rotulo} aoMudar={v => { definirRotulo(v as RotuloDeReclassificacao); mudarRelacionado(""); }} opcoes={OPCOES[sentido].map(o => ({ valor: o.valor, rotulo: o.rotulo }))} />
        <Seletor
          rotulo="Investimento"
          valor={investimentoId}
          aoMudar={v => { definirInvestimentoId(v); mudarRelacionado(""); }}
          vazio={opcao.exigeInvestimento ? "Escolha o investimento" : "Escolher depois"}
          opcoes={(investimentos.dados ?? []).map(i => ({ valor: i.id, rotulo: i.rotulo ?? normalizarNomeDaInstituicao(i.nome) }))}
        />
        {exigeRelacao && <Seletor rotulo="Operação relacionada" valor={relacionado} aoMudar={mudarRelacionado} vazio="Escolha a operação" opcoes={(movimentos.dados ?? []).filter(m => m.investimento_id === investimentoId && m.transacao_importada_id !== transacaoId && (m.tipo === "aporte" || m.tipo === "resgate")).map(m => ({ valor: m.id, rotulo: `${m.descricao} (${m.data})` }))} />}
        {exigeRelacao && !relacionado && <p>Escolha a operação relacionada ao imposto ou custo.</p>}
        {!!movimentos.erro && exigeRelacao && <p role="alert">Não foi possível carregar as operações relacionadas.</p>}
        {faltaInvestimento && <p>Escolha o investimento para continuar.</p>}
        {mensagem && aberto && <p role="alert">{mensagem}</p>}
      </Dialogo>
    </> : null,
  };
}
