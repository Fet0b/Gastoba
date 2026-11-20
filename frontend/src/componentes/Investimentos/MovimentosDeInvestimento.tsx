import { useReaplicacoesDeResgates } from "../../api/consultas";
import { useAcaoDeCaixinhas } from "./CaixinhasDoResgate";
import { NaturezaDoResgate } from "./NaturezaDoResgate";
import { ReaplicacaoDoMovimento } from "./ReaplicacaoDoMovimento";
import { useEffect, useState } from "react";
import { type ItemDoMenu, MenuDeAcoes } from "../MenuDeAcoes/MenuDeAcoes";
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
  posicaoSemCaixinhas,
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
  movimento: Pick<MovimentoDeInvestimento, "id" | "valor" | "descricao"> & { tipo?: MovimentoDeInvestimento["tipo"] };
  investimentos: readonly Investimento[];
  aoAssociar: () => void;
  aoFalhar: (erro: unknown) => void;
}) {
  const formularioId = useId();
  const associar = useAssociarMovimento();
  const [investimentoId, definirInvestimentoId] = useState("");
  const [linhas, definirLinhas] = useState<LinhaDeDestinacao[]>([{ ...LINHA_INICIAL }]);
  const posicao = investimentos.find((i) => i.id === investimentoId);
  const semCaixinhas = movimento.tipo === "resgate" && posicao !== undefined && posicaoSemCaixinhas(posicao);
  const motivo = investimentoId === "" ? "Escolha o investimento." : semCaixinhas ? null : motivoDasDestinacoes(linhas);

  async function enviar(): Promise<void> {
    if (motivo !== null || associar.pendente) return;
    const feito = await associar.executar({
      movimentoId: movimento.id,
      investimentoId,
      destinacoes: semCaixinhas ? [] : destinacoesParaEnvio(linhas),
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
      <p>Associe este {movimento.tipo === "resgate" ? "resgate" : "aporte"} de {formatar(movimento.valor)} a uma posição. O valor e a data permanecem iguais.</p>
      <EditorDeDestinacoes
        investimentos={investimentos}
        investimentoId={investimentoId}
        aoMudarInvestimento={definirInvestimentoId}
        linhas={linhas}
        aoMudarLinhas={definirLinhas}
        valor={movimento.valor}
        semCaixinhas={semCaixinhas}
      />
      {motivo && <p className={estilos.apoio}>{motivo}</p>}
      {associar.erro instanceof ErroDaApiCliente && <p role="alert">{associar.erro.mensagem}</p>}
      {!aoCancelar && acoes}
    </form>
  );
  return aoCancelar ? <Dialogo aberto titulo={movimento.tipo === "resgate" ? "Associar resgate" : "Associar aporte"} aoFechar={aoCancelar} rodape={acoes}>{formulario}</Dialogo> : formulario;
}

/** O desfazer do movimento antigo, sem vínculo à transação: item do menu único da linha, com a confirmação em dois passos. */
function useAcaoDeDesfazerLegado(movimento: MovimentoDeInvestimento, ativo: boolean, aoAvisar: (texto: string) => void, aoFalhar: (erro: unknown) => void) {
  const desfazer = useDesfazerClassificacao();
  const [confirmando, definirConfirmando] = useState(false);
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
  const item: ItemDoMenu | null = !ativo ? null : {
    rotulo: "Desfazer classificação",
    nomeAcessivel: `Desfazer classificação de ${movimento.descricao}`,
    destrutivo: true,
    desabilitado: desfazer.pendente,
    aoEscolher: () => definirConfirmando(true),
  };
  const dialogo = ativo ? <>
    {mensagem && <p className={estilos.erro} role="alert">{mensagem}</p>}
    <DialogoDeConfirmacao
      aberto={confirmando}
      titulo={`Desfazer classificação de ${movimento.descricao}?`}
      rotuloDaAcao="Sim, desfazer"
      pendente={desfazer.pendente}
      aoConfirmar={() => { definirConfirmando(false); void enviar(); }}
      aoCancelar={() => definirConfirmando(false)}
    />
    <DialogoDeConfirmacao
      aberto={divisao}
      titulo={`Desfazer a divisão inteira de ${movimento.descricao}?`}
      descricao="Todas as partes dessa transação voltam juntas para a caixa de entrada."
      rotuloDaAcao="Desfazer a divisão inteira"
      pendente={desfazer.pendente}
      aoConfirmar={() => { definirDivisao(false); void enviar(true); }}
      aoCancelar={() => { definirDivisao(false); definirMensagem(null); }}
    />
  </> : null;
  return { item, dialogo };
}

/** Um só menu "Mais ações" por linha: desfazer/reclassificar (com prévia) e as caixinhas do resgate. */
function AcoesDoMovimento({ movimento, investimento, podeDesfazerClassificacao, aoAvisar, aoFalhar }: {
  movimento: MovimentoDeInvestimento; investimento: Investimento | undefined; podeDesfazerClassificacao: boolean;
  aoAvisar: (texto: string) => void; aoFalhar: (erro: unknown) => void;
}) {
  const desfazivel = podeDesfazerClassificacao && movimento.origem === "open_finance";
  const comPrevia = desfazivel ? movimento.transacao_importada_id : null;
  const acao = useAcaoDeDesfazerClassificacao(
    comPrevia, movimento.descricao,
    () => aoAvisar("A transação voltou para a caixa de entrada."),
  );
  const reclassificar = useAcaoDeReclassificar(
    comPrevia, movimento.descricao,
    movimento.tipo === "resgate" || movimento.tipo === "rendimento" ? "entrada" : "saida",
    () => aoAvisar("Classificação atualizada."),
  );
  const caixinhas = useAcaoDeCaixinhas({ movimento, investimento, aoAvisar, aoFalhar });
  const legado = useAcaoDeDesfazerLegado(movimento, desfazivel && !movimento.transacao_importada_id, aoAvisar, aoFalhar);
  const itens = [...(caixinhas.item ? [caixinhas.item] : []), ...(acao.item ? [acao.item] : []), ...(legado.item ? [legado.item] : []), ...(reclassificar.item ? [reclassificar.item] : [])];
  return <>
    {itens.length > 0 && <div className={estilos.acoesDoMovimento}><MenuDeAcoes rotulo={`Mais ações de classificação de ${movimento.descricao}`} itens={itens} /></div>}
    {acao.dialogo}{reclassificar.dialogo}{caixinhas.dialogo}{legado.dialogo}
  </>;
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
        const posicaoDoMovimento = investimentos.find((i) => i.id === movimento.investimento_id);
        const usaAlocacaoPorFracao = posicaoDoMovimento?.alocacao_por_fracao === true;
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
            <AcoesDoMovimento movimento={movimento} investimento={posicaoDoMovimento} podeDesfazerClassificacao={podeDesfazerClassificacao} aoAvisar={aoAvisar} aoFalhar={aoFalhar} />
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
