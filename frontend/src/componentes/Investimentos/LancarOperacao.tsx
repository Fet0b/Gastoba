import { normalizarNomeDaInstituicao } from "../../texto/nomeDaInstituicao";
import { useId, useState } from "react";
import { ErroDaApiCliente, MENSAGEM_SEM_RESPOSTA } from "../../api/cliente";
import { useSalvarOperacao } from "../../api/consultas";
import type { Investimento, Operacao, TipoDeOperacao } from "../../api/tipos";
import { hojeLocal } from "../../periodo/periodo";
import { Botao } from "../Botao/Botao";
import { CampoDeData } from "../Campo/CampoDeData";
import { CampoDeTexto } from "../Campo/CampoDeTexto";
import { CampoDeValor } from "../Campo/CampoDeValor";
import { Seletor } from "../Campo/Seletor";
import { Dialogo } from "../Dialogo/Dialogo";
import { DialogoDeConfirmacao } from "../DialogoDeConfirmacao/DialogoDeConfirmacao";
import estilos from "./Investimentos.module.css";

export const rotulosDasOperacoes: Record<TipoDeOperacao, string> = {
  COMPRA: "Compra", VENDA: "Venda", PROVENTO: "Provento", TAXA: "Taxa", IMPOSTO: "Imposto", VENCIMENTO: "Vencimento", ABERTURA: "Abertura",
};
type Props = {
  investimento: Investimento; operacoes: Operacao[]; operacao?: Operacao;
  aoCancelar: () => void; aoSalvar: () => void;
};
/** Formulário compartilhado para completar o histórico e corrigir operações editáveis. */
export function LancarOperacao({ investimento, operacoes, operacao, aoCancelar, aoSalvar }: Props) {
  const id = useId();
  const salvar = useSalvarOperacao();
  const [tipo, mudarTipo] = useState<TipoDeOperacao>(operacao?.tipo ?? "COMPRA");
  const [data, mudarData] = useState(operacao?.data ?? hojeLocal());
  const [quantidade, mudarQuantidade] = useState(operacao?.quantidade ?? "");
  const [valor, mudarValor] = useState(operacao?.valor ?? "0.00");
  const [custos, mudarCustos] = useState(operacao?.custos ?? "0.00");
  const [relacionada, mudarRelacionada] = useState(operacao?.operacao_relacionada_id ?? "");
  const [confirmandoDuplicidade, mudarConfirmacao] = useState(false);
  const exigeRelacao = tipo === "TAXA" || tipo === "IMPOSTO";
  const motivos = [];
  if (!/^\d+(?:[.,]\d+)?$/.test(quantidade.trim())) motivos.push("Informe uma quantidade decimal válida, sem sinal negativo.");
  if (!data) motivos.push("Informe a data da operação.");
  if (exigeRelacao && !relacionada) motivos.push("Escolha a operação relacionada ao custo ou imposto.");
  const erro = salvar.erro instanceof ErroDaApiCliente ? salvar.erro.mensagem : salvar.erro ? MENSAGEM_SEM_RESPOSTA : undefined;
  async function enviar(confirmarDuplicidade = false) {
    if (motivos.length || salvar.pendente) return;
    const feita = await salvar.executar({ investimentoId: investimento.id, operacaoId: operacao?.id, dados: {
      tipo, data, quantidade: quantidade.trim().replace(",", "."), valor, custos,
      ...(exigeRelacao ? { operacao_relacionada_id: relacionada } : {}), confirmar_duplicidade: confirmarDuplicidade,
    } });
    if (feita) aoSalvar();
  }
  return <>
    <Dialogo aberto titulo={operacao ? "Editar operação" : "Lançar operação"} aoFechar={aoCancelar} bloqueado={salvar.pendente} rodape={<>
      <Botao variante="secundario" disabled={salvar.pendente} onClick={aoCancelar}>Cancelar</Botao>
      <Botao variante="primario" type="submit" form={id} disabled={motivos.length > 0 || salvar.pendente} aria-describedby={motivos.length ? `${id}-motivos` : undefined}>{operacao ? "Salvar operação" : "Lançar operação"}</Botao>
    </>}>
      <form id={id} className={estilos.formulario} onSubmit={e => { e.preventDefault(); void enviar(); }}>
        <p>Complete o histórico de {normalizarNomeDaInstituicao(investimento.rotulo ?? investimento.nome)} sem alterar o saldo bancário nem as caixinhas.</p>
        {operacao?.quantidade_estimada && <p>Quantidade estimada: ao salvar, você confirma a quantidade da abertura.</p>}
        <Seletor rotulo="Tipo de operação" valor={tipo} aoMudar={t => { mudarTipo(t as TipoDeOperacao); mudarRelacionada(""); }} disabled={!!operacao} opcoes={Object.entries(rotulosDasOperacoes).filter(([t]) => t !== "ABERTURA" || operacao?.tipo === "ABERTURA").map(([valor, rotulo]) => ({ valor, rotulo }))} />
        <CampoDeData rotulo="Data da operação" valor={data} aoMudar={mudarData} />
        <CampoDeTexto rotulo="Quantidade" inputMode="decimal" valor={quantidade} aoMudar={mudarQuantidade} ajuda="Informe as cotas da operação; provento, taxa e imposto podem ter quantidade zero." />
        <CampoDeValor rotulo="Valor bruto (R$)" valor={valor} aoMudar={mudarValor} />
        <CampoDeValor rotulo="Custos (R$)" valor={custos} aoMudar={mudarCustos} />
        {exigeRelacao && <Seletor rotulo="Operação relacionada" valor={relacionada} aoMudar={mudarRelacionada} disabled={!!operacao} vazio="Escolha a operação" opcoes={operacoes.filter(o => o.id !== operacao?.id).map(o => ({ valor: o.id, rotulo: `${rotulosDasOperacoes[o.tipo]} em ${o.data} (${o.valor})` }))} />}
        {motivos.length > 0 && <ul id={`${id}-motivos`} className={estilos.motivos}>{motivos.map(m => <li key={m}>{m}</li>)}</ul>}
        {erro && <p role="alert" className={estilos.erro}>{erro}</p>}
        {salvar.erro instanceof ErroDaApiCliente && salvar.erro.codigo === "operacao_possivelmente_duplicada" && <Botao variante="secundario" onClick={() => mudarConfirmacao(true)}>Confirmar que é outra operação</Botao>}
      </form>
    </Dialogo>
    {confirmandoDuplicidade && <DialogoDeConfirmacao aberto titulo="Lançar outra operação igual?" descricao="Já há uma operação igual vinda da corretora. Confirme apenas se são operações diferentes." rotuloDaAcao="Confirmar outra operação" pendente={salvar.pendente} erro={erro} aoCancelar={() => mudarConfirmacao(false)} aoConfirmar={() => void enviar(true)} />}
  </>;
}
