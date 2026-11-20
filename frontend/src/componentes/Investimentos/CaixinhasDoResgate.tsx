import { type ReactNode, useEffect, useId, useState } from "react";
import { useDefinirCaixinhasDoResgate, useRemoverCaixinhasDoResgate } from "../../api/consultas";
import { ErroDaApiCliente } from "../../api/cliente";
import type { Investimento, MovimentoDeInvestimento } from "../../api/tipos";
import { formatar } from "../../dinheiro/dinheiro";
import { caixinhaUnica, destinacoesParaEnvio, type LinhaDeDestinacao, motivoDasDestinacoes, posicaoSemCaixinhas } from "../../investimentos/destinacoes";
import { rotuloDeExibicao } from "../../texto/rotulo";
import { Botao } from "../Botao/Botao";
import { Dialogo } from "../Dialogo/Dialogo";
import { DialogoDeConfirmacao } from "../DialogoDeConfirmacao/DialogoDeConfirmacao";
import type { ItemDoMenu } from "../MenuDeAcoes/MenuDeAcoes";
import { EditorDeDestinacoes, LINHA_INICIAL } from "./EditorDeDestinacoes";
import estilos from "./Investimentos.module.css";

type Props = {
  movimento: MovimentoDeInvestimento;
  investimento: Investimento;
  aoAvisar: (texto: string) => void;
  aoFalhar: (erro: unknown) => void;
};

const mensagem = (erro: unknown) => (erro instanceof ErroDaApiCliente ? erro.mensagem : undefined);
const e409ou422 = (erro: unknown) => erro instanceof ErroDaApiCliente && (erro.status === 409 || erro.status === 422);

/**
 * Caixinhas de um resgate já ligado à posição (069, D4). Não tem menu próprio: entrega o item do
 * menu "Mais ações" da linha ("Definir caixinhas" quando o resgate não tem partes e a posição tem
 * principal; "Remover caixinhas" quando tem) e o diálogo que ele abre.
 */
export function useAcaoDeCaixinhas({ movimento, investimento, aoAvisar, aoFalhar }: Omit<Props, "investimento"> & { investimento: Investimento | undefined }): { item: ItemDoMenu | null; dialogo: ReactNode } {
  const temPartes = movimento.destinacoes.length > 0;
  const aplicavel = movimento.tipo === "resgate" && investimento !== undefined;
  const podeDefinir = aplicavel && !temPartes && !posicaoSemCaixinhas(investimento);
  const [aberto, mudarAberto] = useState<"definir" | "remover" | null>(null);
  const item: ItemDoMenu | null = !aplicavel
    ? null
    : temPartes
      ? { rotulo: "Remover caixinhas", aoEscolher: () => mudarAberto("remover") }
      : podeDefinir ? { rotulo: "Definir caixinhas", aoEscolher: () => mudarAberto("definir") } : null;
  const dialogo = <>
    {aberto === "definir" && investimento && <Definir movimento={movimento} investimento={investimento} aoFechar={() => mudarAberto(null)} aoAvisar={aoAvisar} aoFalhar={aoFalhar} />}
    {aberto === "remover" && <Remover movimento={movimento} aoFechar={() => mudarAberto(null)} aoAvisar={aoAvisar} aoFalhar={aoFalhar} />}
  </>;
  return { item, dialogo };
}

function Definir({ movimento, investimento, aoFechar, aoAvisar, aoFalhar }: Props & { aoFechar: () => void }) {
  const formularioId = useId();
  const definir = useDefinirCaixinhasDoResgate();
  const unica = caixinhaUnica(investimento);
  const [linhas, mudarLinhas] = useState<LinhaDeDestinacao[]>([unica === null ? { ...LINHA_INICIAL } : { tag: unica, percentual: "100" }]);
  const motivo = motivoDasDestinacoes(linhas);
  const idDaExplicacao = useId();
  // O que falta para habilitar o botão, em texto próprio (o erro do campo, se houver, é outro).
  const oQueFalta = motivo === null ? null
    : linhas.some((l) => l.tag.trim() === "") ? "Escolha de quais caixinhas saiu o resgate."
    : "Ajuste os percentuais para somarem 100%.";
  useEffect(() => { if (definir.erro && !e409ou422(definir.erro)) aoFalhar(definir.erro); }, [definir.erro]);
  async function enviar() {
    if (motivo !== null || definir.pendente) return;
    const feito = await definir.executar({ movimentoId: movimento.id, investimento_id: investimento.id, destinacoes: destinacoesParaEnvio(linhas) });
    if (feito) { aoFechar(); aoAvisar("Caixinhas do resgate definidas."); }
  }
  const acoes = <>
    <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
    <Botao variante="primario" type="submit" form={formularioId} disabled={motivo !== null || definir.pendente} aria-describedby={oQueFalta ? idDaExplicacao : undefined}>{definir.pendente ? "Definindo…" : "Definir caixinhas"}</Botao>
  </>;
  return <Dialogo aberto titulo="Definir caixinhas do resgate" aoFechar={aoFechar} rodape={acoes}>
    <form id={formularioId} className={estilos.formulario} onSubmit={e => { e.preventDefault(); void enviar(); }}>
      <p>Diga de quais caixinhas saiu o resgate de {formatar(movimento.valor)}. O principal de cada caixinha é abatido pelo custo médio; valor, data e saldo não mudam.</p>
      <EditorDeDestinacoes investimentos={[investimento]} investimentoId={investimento.id} aoMudarInvestimento={() => {}} linhas={linhas} aoMudarLinhas={mudarLinhas}
        valor={movimento.valor} escolherInvestimento={false} legenda="De quais caixinhas saiu" termo="caixinha" errosAoSair />
      {oQueFalta && <p id={idDaExplicacao} className={estilos.apoio}>{oQueFalta}</p>}
      {mensagem(definir.erro) && <p role="alert">{mensagem(definir.erro)}</p>}
    </form>
  </Dialogo>;
}

function Remover({ movimento, aoFechar, aoAvisar, aoFalhar }: Omit<Props, "investimento"> & { aoFechar: () => void }) {
  const remover = useRemoverCaixinhasDoResgate();
  useEffect(() => { if (remover.erro && !e409ou422(remover.erro)) aoFalhar(remover.erro); }, [remover.erro]);
  const saem = movimento.destinacoes.map((d) => `${rotuloDeExibicao(d.tag)}, ${formatar(d.valor)}`).join("; ");
  return <DialogoDeConfirmacao aberto titulo={`Remover as caixinhas de ${movimento.descricao}?`}
    descricao={`Saem do resgate: ${saem}. O principal abatido volta às caixinhas. O resgate continua ligado à posição, sem caixinhas; nada muda em saldo, valor ou data.`}
    rotuloDaAcao="Sim, remover" pendente={remover.pendente} erro={e409ou422(remover.erro) ? mensagem(remover.erro) : undefined}
    aoCancelar={aoFechar}
    aoConfirmar={async () => { if (await remover.executar(movimento.id)) { aoFechar(); aoAvisar("Caixinhas do resgate removidas."); } }} />;
}
