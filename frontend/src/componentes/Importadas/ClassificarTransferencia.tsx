import { type ReactNode, useState } from "react";

import { ErroDaApiCliente, MENSAGEM_SEM_RESPOSTA } from "../../api/cliente";
import { useClassificarTransferencia, useContas, useDefinirPapelDaConta, useTransacoesImportadas } from "../../api/consultas";
import type { TransacaoImportada } from "../../api/tipos";
import { paraCentavos } from "../../dinheiro/dinheiro";
import { GrupoDeChips } from "../Compositor/GrupoDeChips";
import { Botao } from "../Botao/Botao";
import estilos from "./Importadas.module.css";

type Papel = "corrente" | "investimento";

export const MENSAGEM_ESCOLHA_A_CONTA = "Escolha uma conta";
export const MENSAGEM_CONFIRME_AS_FUNCOES = "Confirme a função das duas contas";

/** O estado e as ações da transferência entre as contas da pessoa (o cartão renderiza o rodapé). */
export function useTransferencia(transacao: TransacaoImportada, aoConcluir: () => void) {
 const contas = useContas();
 const pendentes = useTransacoesImportadas("pendente");
 const ignoradas = useTransacoesImportadas("ignorada");
 const definirPapel = useDefinirPapelDaConta();
 const classificar = useClassificarTransferencia();
 const [contraparte, definirContraparte] = useState("");
 const [papel, escolherPapel] = useState<Papel | "">("");
 const [papelOutra, escolherPapelOutra] = useState<Papel | "">("");
 const [par, definirPar] = useState("");
 const [tentou, definirTentou] = useState(false);
 const conta = contas.dados?.find(c => c.id === transacao.conta_id);
 const outra = contas.dados?.find(c => c.id === contraparte);
 const papelConfirmado = papel || conta?.papel;
 const papelConfirmadoOutra = papelOutra || outra?.papel;
 const candidatas = [...(pendentes.dados ?? []), ...(ignoradas.dados ?? [])].filter(t => t.conta_id === contraparte && t.sentido !== transacao.sentido && paraCentavos(t.valor) === paraCentavos(transacao.valor));
 const erro = classificar.erro ?? definirPapel.erro ?? contas.erro ?? pendentes.erro ?? ignoradas.erro;
 const ocupado = classificar.pendente || definirPapel.pendente;
 const faltando = !contraparte ? MENSAGEM_ESCOLHA_A_CONTA : !papelConfirmado || !papelConfirmadoOutra ? MENSAGEM_CONFIRME_AS_FUNCOES : null;
 async function confirmar() {
  if (ocupado) return;
  if (faltando !== null || !conta || !outra || !papelConfirmado || !papelConfirmadoOutra) { definirTentou(true); return; }
  if (conta.papel !== papelConfirmado && !await definirPapel.executar({ id: conta.id, papel: papelConfirmado })) return;
  if (outra.papel !== papelConfirmadoOutra && !await definirPapel.executar({ id: outra.id, papel: papelConfirmadoOutra })) return;
  if (await classificar.executar({ id: transacao.id, conta_contraparte_id: outra.id, par_transacao_id: par || null })) aoConcluir();
 }
 return {
  contas: contas.dados, conta, outra, contraparte, papelConfirmado, papelConfirmadoOutra, par, candidatas,
  escolherContraparte: (id: string) => { definirContraparte(id); definirPar(""); escolherPapelOutra(""); },
  escolherPapel, escolherPapelOutra, definirPar, confirmar, ocupado,
  faltando: tentou ? faltando : null,
  erro: erro == null ? null : erro instanceof ErroDaApiCliente ? erro.mensagem : MENSAGEM_SEM_RESPOSTA,
 };
}

export type Transferencia = ReturnType<typeof useTransferencia>;

/** Para qual conta foi o dinheiro: chips das contas; as funções e o outro lado só quando precisam de decisão. */
export function CamposDaTransferencia({ transferencia: t, transacao }: { transferencia: Transferencia; transacao: TransacaoImportada }) {
 const opcoes = t.contas?.filter(c => c.id !== transacao.conta_id && c.origem === "open_finance" && c.tipo !== "cartao").map(c => ({ valor: c.id, nome: c.nome }));
 const erroDaConta = t.faltando === MENSAGEM_ESCOLHA_A_CONTA ? t.faltando : undefined;
 return <div className={estilos.transferencia} role="group" aria-label="Transferência entre minhas contas">
  <GrupoDeChips rotulo="Para qual conta?" carregando="Carregando contas…" opcoes={opcoes} valor={t.contraparte || null} aoMudar={t.escolherContraparte} erro={erroDaConta} />
  {t.contraparte !== "" && <>
   <label className={estilos.campoDeTransferencia}>Função da conta {t.conta?.nome}<select value={t.papelConfirmado ?? ""} onChange={e => t.escolherPapel(e.target.value as Papel)}>
    <option value="">Confirme a função</option><option value="corrente">Conta corrente</option><option value="investimento">Conta de investimento</option>
   </select></label>
   <label className={estilos.campoDeTransferencia}>Função da conta {t.outra?.nome}<select value={t.papelConfirmadoOutra ?? ""} onChange={e => t.escolherPapelOutra(e.target.value as Papel)}>
    <option value="">Confirme a função</option><option value="corrente">Conta corrente</option><option value="investimento">Conta de investimento</option>
   </select></label>
   <label className={estilos.campoDeTransferencia}>Outro lado da transferência<select value={t.par} onChange={e => t.definirPar(e.target.value)}>
    <option value="">Ainda não importado — confirmar apenas este lado</option>
    {t.candidatas.map(c => <option key={c.id} value={c.id}>{c.data} {c.descricao}</option>)}
   </select></label>
   {t.candidatas.length > 1 && <p className={estilos.sugestao}>Há mais de um candidato. Confira o extrato para escolher o par.</p>}
  </>}
  {t.faltando === MENSAGEM_CONFIRME_AS_FUNCOES && <p className={estilos.erro}>{t.faltando}</p>}
  <p className={estilos.sugestao}>Não cria gasto nem ganho. Só o dinheiro que cruza entre conta corrente e investimento conta em Liberdade financeira.</p>
  {t.erro !== null && <p role="alert" className={estilos.erro}>{t.erro}</p>}
 </div>;
}

/** O modo Transferência do cartão: campos e rodapé (confirmar + o Ignorar que o cartão entrega). */
export function PainelDaTransferencia({ transacao, aoConcluir, ignorar }: {
 transacao: TransacaoImportada; aoConcluir: () => void; ignorar: ReactNode;
}) {
 const transferencia = useTransferencia(transacao, aoConcluir);
 return <>
  <CamposDaTransferencia transferencia={transferencia} transacao={transacao} />
  <div className={estilos.acoes}>
   <Botao variante="primario" data-principal="true" className={estilos.principal} disabled={transferencia.ocupado}
    aria-label={`Confirmar transferência: ${transacao.descricao}`} onClick={() => void transferencia.confirmar()}>
    {transferencia.ocupado ? "Confirmando…" : "Confirmar transferência"}
   </Botao>
   {ignorar}
  </div>
 </>;
}
