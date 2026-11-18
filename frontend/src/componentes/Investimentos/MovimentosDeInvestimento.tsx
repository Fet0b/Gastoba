import { useReaplicacoesDeResgates } from "../../api/consultas";
import { NaturezaDoResgate } from "./NaturezaDoResgate";
import { ReaplicacaoDoMovimento } from "./ReaplicacaoDoMovimento";
import { useEffect, useState } from "react";
import { MenuDeAcoes } from "../MenuDeAcoes/MenuDeAcoes";
import { useAcaoDeReclassificar } from "../Transacoes/AcaoDeReclassificar";
import { useAcaoDeDesfazerClassificacao } from "../Transacoes/AcaoDeDesfazerClassificacao";

import { useAssociarMovimento, useDesfazerClassificacao, useDesfazerSaldoInicial } from "../../api/consultas";
import { ErroDaApiCliente, MENSAGEM_SEM_RESPOSTA } from "../../api/cliente";
import type { Investimento, MovimentoDeInvestimento } from "../../api/tipos";
import { formatar } from "../../dinheiro/dinheiro";
import { rotuloDoMovimento, valorComSinal } from "../../investimentos/rotuloDoMovimento";
import { normalizarNomeDaInstituicao } from "../../texto/nomeDaInstituicao";
import {
  destinacoesParaEnvio,
  type LinhaDeDestinacao,
  motivoDasDestinacoes,
} from "../../investimentos/destinacoes";
import { dataParaExibicao } from "../../periodo/periodo";
import { DesfazerComConfirmacao } from "./DesfazerComConfirmacao";
import { EditorDeDestinacoes, LINHA_INICIAL } from "./EditorDeDestinacoes";
import { Botao } from "../Botao/Botao";
import { Dialogo } from "../Dialogo/Dialogo";
import { useId } from "react";
import { DialogoDeConfirmacao } from "../DialogoDeConfirmacao/DialogoDeConfirmacao";
import estilos from "./Investimentos.module.css";

export function Associar({
  movimento,
  investimentos,
  aoAssociar,
  aoFalhar,
  aoCancelar,
}: {
  aoCancelar?: () => void;
  movimento: Pick<MovimentoDeInvestimento, "id" | "valor" | "descricao">;
  investimentos: readonly Investimento[];
  aoAssociar: () => void;
  aoFalhar: (erro: unknown) => void;
}) {
  const formularioId = useId();
  const associar = useAssociarMovimento();
  const [investimentoId, definirInvestimentoId] = useState("");
  const [linhas, definirLinhas] = useState<LinhaDeDestinacao[]>([{ ...LINHA_INICIAL }]);
  const motivo = investimentoId === "" ? "Escolha o investimento." : motivoDasDestinacoes(linhas);

  async function enviar(): Promise<void> {
    if (motivo !== null || associar.pendente) return;
    const feito = await associar.executar({
      movimentoId: movimento.id,
      investimentoId,
      destinacoes: destinacoesParaEnvio(linhas),
    });
    if (feito) aoAssociar();
  }
  useEffect(() => {
    if (associar.erro !== null && associar.erro !== undefined) aoFalhar(associar.erro);
  }, [associar.erro]);

  const acoes = <>
      {aoCancelar && <Botao variante="secundario" onClick={aoCancelar}>Cancelar</Botao>}
      <Botao variante="primario" type="submit" form={formularioId} disabled={motivo !== null || associar.pendente}>
        {associar.pendente ? "Associando…" : `Associar: ${movimento.descricao}`}
      </Botao>
  </>;
  const formulario = (
    <form id={formularioId} className={estilos.formulario} onSubmit={e => { e.preventDefault(); void enviar(); }}>
      <p>Associe este aporte de {formatar(movimento.valor)} a uma posição. O valor e a data permanecem iguais.</p>
      <EditorDeDestinacoes
        investimentos={investimentos}
        investimentoId={investimentoId}
        aoMudarInvestimento={definirInvestimentoId}
        linhas={linhas}
        aoMudarLinhas={definirLinhas}
        valor={movimento.valor}
      />
      {motivo && <p className={estilos.apoio}>{motivo}</p>}
      {associar.erro instanceof ErroDaApiCliente && <p role="alert">{associar.erro.mensagem}</p>}
      {!aoCancelar && acoes}
    </form>
  );
  return aoCancelar ? <Dialogo aberto titulo="Associar aporte" aoFechar={aoCancelar} rodape={acoes}>{formulario}</Dialogo> : formulario;
}

function DesfazerClassificacaoLegada({ movimento, aoAvisar, aoFalhar }: {
  movimento: MovimentoDeInvestimento; aoAvisar: (texto: string) => void; aoFalhar: (erro: unknown) => void;
}) {
  const desfazer = useDesfazerClassificacao();
  const [divisao, definirDivisao] = useState(false);
  const [mensagem, definirMensagem] = useState<string | null>(null);
  useEffect(() => {
    if (!desfazer.erro) return;
    const erro = desfazer.erro;
    definirMensagem(erro instanceof ErroDaApiCliente ? erro.mensagem : MENSAGEM_SEM_RESPOSTA);
    if (erro instanceof ErroDaApiCliente && erro.codigo === "divisao_exige_confirmacao") definirDivisao(true);
    // Os bloqueios de negócio ficam na linha: o aviso fixo duplicado pode cobrir
    // a confirmação no celular. Falhas de rede e demais erros seguem para a página.
    if (!(erro instanceof ErroDaApiCliente) || (erro.status !== 409 && erro.status !== 422)) {
      aoFalhar(erro);
    }
  }, [desfazer.erro]);
  async function enviar(inteira = false) {
    definirMensagem(null);
    const feito = await desfazer.executar({ movimentoId: movimento.id, desfazerDivisaoInteira: inteira });
    if (feito) aoAvisar("A transação voltou para a caixa de entrada.");
  }
  return <div>
    {mensagem && <p className={estilos.erro} role="alert">{mensagem}</p>}
    <DesfazerComConfirmacao descricao={`classificação de ${movimento.descricao}`} texto="Desfazer classificação" pendente={desfazer.pendente} aoConfirmar={() => void enviar()} />
    <DialogoDeConfirmacao
      aberto={divisao}
      titulo={`Desfazer a divisão inteira de ${movimento.descricao}?`}
      descricao="Todas as partes dessa transação voltam juntas para a caixa de entrada."
      rotuloDaAcao="Desfazer a divisão inteira"
      pendente={desfazer.pendente}
      aoConfirmar={() => { definirDivisao(false); void enviar(true); }}
      aoCancelar={() => { definirDivisao(false); definirMensagem(null); }}
    />
  </div>;
}

function DesfazerClassificacaoComPrevia({ movimento, aoAvisar }: {
  movimento: MovimentoDeInvestimento; aoAvisar: (texto: string) => void;
}) {
  const acao = useAcaoDeDesfazerClassificacao(
    movimento.transacao_importada_id, movimento.descricao,
    () => aoAvisar("A transação voltou para a caixa de entrada."),
  );
  const reclassificar = useAcaoDeReclassificar(
    movimento.transacao_importada_id, movimento.descricao,
    movimento.tipo === "resgate" || movimento.tipo === "rendimento" ? "entrada" : "saida",
    () => aoAvisar("Classificação atualizada."),
  );
  return <div>
    <MenuDeAcoes rotulo={`Mais ações de classificação de ${movimento.descricao}`} itens={[...(acao.item ? [acao.item] : []), ...(reclassificar.item ? [reclassificar.item] : [])]} />
    {acao.dialogo}{reclassificar.dialogo}
  </div>;
}

function DesfazerClassificacao(props: {
  movimento: MovimentoDeInvestimento; aoAvisar: (texto: string) => void; aoFalhar: (erro: unknown) => void;
}) {
  return props.movimento.transacao_importada_id
    ? <DesfazerClassificacaoComPrevia {...props} />
    : <DesfazerClassificacaoLegada {...props} />;
}

type Propriedades = {
  podeDesfazerClassificacao?: boolean;
  movimentos: readonly MovimentoDeInvestimento[];
  investimentos: readonly Investimento[];
  aoAvisar: (texto: string) => void;
  aoFalhar: (erro: unknown) => void;
  /** Nome acessível da lista, para duas listas na mesma tela não repetirem o nome. */
  rotuloDaLista?: string;
};

/**
 * Os aportes e resgates do período (o saldo inicial de uma posição aparece com esse rótulo). Os
 * que ainda não têm investimento (os gastos antigos convertidos, ou os aceitos com "escolher
 * depois") oferecem associar a um investimento e dividir entre destinações.
 */
export function MovimentosDeInvestimento({ movimentos, investimentos, aoAvisar, aoFalhar, podeDesfazerClassificacao = false, rotuloDaLista = "Aportes e resgates" }: Propriedades) {
  const reaplicacoes = useReaplicacoesDeResgates();
  const [associando, definirAssociando] = useState<string | null>(null);
  const desfazer = useDesfazerSaldoInicial();
  useEffect(() => {
    if (desfazer.erro !== null && desfazer.erro !== undefined) aoFalhar(desfazer.erro);
  }, [desfazer.erro]);

  async function desfazerSaldoInicial(movimentoId: string): Promise<void> {
    if (desfazer.pendente) return;
    const feito = await desfazer.executar(movimentoId);
    if (feito) aoAvisar("Saldo inicial desfeito.");
  }
  const nomes = new Map(investimentos.map((investimento) => [investimento.id, investimento.nome]));

  return (
    <ul className={estilos.movimentos} aria-label={rotuloDaLista}>
      {movimentos.map((movimento) => {
        const entrada = movimento.tipo === "resgate" || movimento.tipo === "rendimento";
        const rotulo =
          movimento.origem === "saldo_inicial" ? "Saldo inicial" : movimento.vencimento_confirmado ? "Vencimento" : { aporte: "Aporte", resgate: "Resgate", rendimento: "Rendimento", custo: "Custo de negociação", imposto: "Imposto" }[movimento.tipo];
        const nomeDoMovimento = movimento.origem === "saldo_inicial" ? movimento.descricao : rotuloDoMovimento(movimento);
        const descricaoDoBanco = movimento.origem !== "saldo_inicial" && nomeDoMovimento !== normalizarNomeDaInstituicao(movimento.descricao);
        const usaAlocacaoPorFracao = investimentos.find((i) => i.id === movimento.investimento_id)?.alocacao_por_fracao === true;
        return (
          <li key={movimento.id} className={estilos.movimento} aria-label={movimento.descricao}>
            <div className={estilos.topoDaPosicao}>
              <div className={estilos.identificacaoDoMovimento}>
                <p className={estilos.nomeDoMovimento} title={nomeDoMovimento}>{nomeDoMovimento}</p>
                {descricaoDoBanco && <p className={`${estilos.apoio} ${estilos.descricaoDoBanco}`} title={movimento.descricao}>{movimento.descricao}</p>}
                <p className={`${estilos.apoio} ${estilos.dadosEmLinha}`}>
                  <span>{dataParaExibicao(movimento.data)}</span>
                  <span>{rotulo}</span>
                  <span>
                    {movimento.investimento_id
                      ? (nomes.get(movimento.investimento_id) ?? "investimento")
                      : "sem investimento"}
                  </span>
                </p>
                {movimento.revisao_contabil_pendente && <p>Revisar origem do dinheiro: classificação anterior à regra de aporte líquido.</p>}
                {movimento.destinacoes.length > 0 && (
                  <p className={`${estilos.apoio} ${estilos.dadosEmLinha}`}>
                    {movimento.destinacoes.map((d) => (
                      <span key={d.tag}>{`${d.tag}: ${formatar(d.valor)}`}</span>
                    ))}
                  </p>
                )}
              </div>
              <span className={`valor ${estilos.saldoDaPosicao}`} data-sentido={entrada ? "entrada" : "saida"}>
                {valorComSinal(movimento.tipo, movimento.valor)}
              </span>
            </div>
            {movimento.tipo === "resgate" && <NaturezaDoResgate movimento={movimento} />}
            {movimento.tipo === "aporte" && movimento.origem !== "saldo_inicial" && movimento.investimento_id !== null && investimentos.find(i=>i.id===movimento.investimento_id)?.tipo !== "CAIXINHA" && <ReaplicacaoDoMovimento movimento={movimento} reaplicacao={reaplicacoes.dados?.find(r=>r.aporte_id===movimento.id)} carregando={reaplicacoes.carregando} aoAvisar={aoAvisar}/>}
            {movimento.tipo === "resgate" && reaplicacoes.dados?.some(r=>r.resgate_id===movimento.id) && <p>Reaplicação confirmada de {formatar(reaplicacoes.dados.find(r=>r.resgate_id===movimento.id)!.valor)}. Para desfazer, abra o aporte correspondente.</p>}
            {podeDesfazerClassificacao && movimento.origem === "open_finance" && <DesfazerClassificacao movimento={movimento} aoAvisar={aoAvisar} aoFalhar={aoFalhar} />}
            {movimento.origem === "saldo_inicial" && usaAlocacaoPorFracao && <p className={estilos.apoio}>Substituído pelas operações da posição.</p>}
            {movimento.origem === "saldo_inicial" && !usaAlocacaoPorFracao && (
              <DesfazerComConfirmacao
                descricao={`saldo inicial de ${formatar(movimento.valor)}`}
                pendente={desfazer.pendente}
                aoConfirmar={() => void desfazerSaldoInicial(movimento.id)}
              />
            )}
            {movimento.investimento_id === null && movimento.casamento_id == null && (movimento.natureza === "liquidacao_de_bolsa" || movimento.natureza === "imposto_ou_taxa") && <p className={estilos.apoio}>Ligue na Revisão da bolsa.</p>}
            {movimento.investimento_id === null && movimento.casamento_id == null && movimento.natureza !== "liquidacao_de_bolsa" && movimento.natureza !== "imposto_ou_taxa" &&
              (associando === movimento.id ? (
                <Associar
                  movimento={movimento}
                  investimentos={investimentos}
                  aoFalhar={aoFalhar}
                  aoAssociar={() => {
                    definirAssociando(null);
                    aoAvisar("Movimento associado ao investimento.");
                  }}
                />
              ) : (
                <Botao variante="secundario"
                 
                  onClick={() => definirAssociando(movimento.id)}
                >
                  {movimento.natureza === "conta_remunerada" ? "Ligar à conta investimentos" : "Associar a um investimento"}
                </Botao>
              ))}
          </li>
        );
      })}
    </ul>
  );
}
