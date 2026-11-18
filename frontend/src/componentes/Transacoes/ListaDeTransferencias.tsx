import { useState } from "react";

import { useCompletarParDaTransferencia, useContas, useTransferencias, useTransacoesImportadas } from "../../api/consultas";
import { ErroDaApiCliente } from "../../api/cliente";
import type { TransferenciaEntreContas } from "../../api/tipos";
import { formatar, paraCentavos } from "../../dinheiro/dinheiro";
import { MenuDeAcoes } from "../MenuDeAcoes/MenuDeAcoes";
import { Botao } from "../Botao/Botao";
import { Seletor } from "../Campo/Seletor";
import { Titulo } from "../Titulo/Titulo";
import { useAcaoDeDesfazerClassificacao } from "./AcaoDeDesfazerClassificacao";

function CompletarPar({ transferencia }: { transferencia: TransferenciaEntreContas }) {
 const pendentes = useTransacoesImportadas("pendente"), ignoradas = useTransacoesImportadas("ignorada");
 const completar = useCompletarParDaTransferencia();
 const [par, definirPar] = useState("");
 const faltaEntrada = transferencia.transacao_destino_id === null;
 const conta = faltaEntrada ? transferencia.conta_destino_id : transferencia.conta_origem_id;
 const candidatos = [...(pendentes.dados ?? []), ...(ignoradas.dados ?? [])].filter(t => t.conta_id === conta && t.sentido === (faltaEntrada ? "entrada" : "saida") && paraCentavos(t.valor) === paraCentavos(transferencia.valor));
 return <div>
  <Seletor rotulo={`Par de ${transferencia.data}`} valor={par} aoMudar={definirPar}
   opcoes={[{ valor: "", rotulo: "Escolha o outro lado" }, ...candidatos.map(t => ({ valor: t.id, rotulo: `${t.data} ${t.descricao}` }))]} />
  <Botao variante="secundario" disabled={!par || completar.pendente} onClick={() => void completar.executar({ id: transferencia.id, transacao_id: par })}>Completar par</Botao>
  {completar.erro instanceof ErroDaApiCliente && <p role="alert">{completar.erro.mensagem}</p>}
 </div>;
}
function Linha({ transferencia: t, nomes, aoAvisar }: { transferencia: TransferenciaEntreContas; nomes: Map<string, string>; aoAvisar: (texto: string) => void }) {
 const reabrir = useAcaoDeDesfazerClassificacao(t.transacao_origem_id ?? t.transacao_destino_id, "transferência entre suas contas", () => aoAvisar("Transferência desfeita; as pontas voltaram à caixa de entrada."));
 return <li>
  <p>{nomes.get(t.conta_origem_id)} → {nomes.get(t.conta_destino_id)}</p>
  <p>{t.data} {formatar(t.valor)}</p>
  <p>Liberdade financeira: {formatar(t.aporte_liquido)}</p>
  {t.competencia_provisoria && <p>Competência provisória até chegar o outro lado.</p>}
  {(!t.transacao_destino_id || !t.transacao_origem_id) && <CompletarPar transferencia={t} />}
  <MenuDeAcoes rotulo={`Mais ações da transferência de ${t.data}`} itens={reabrir.item ? [reabrir.item] : []} />
  {reabrir.dialogo}
 </li>;
}
export function ListaDeTransferencias({ inicio, fim, contaSelecionada, aoAvisar }: { inicio: string; fim: string; contaSelecionada: string | null; aoAvisar: (texto: string) => void }) {
 const transferencias = useTransferencias(inicio, fim);
 const contas = useContas();
 const nomes = new Map(contas.dados?.map(c => [c.id, c.nome]));
 const lista = transferencias.dados?.filter(t => !contaSelecionada || [t.conta_origem_id, t.conta_destino_id].includes(contaSelecionada));
 return <section aria-label="Transferências entre minhas contas"><Titulo nivel="cartao">Transferências entre minhas contas</Titulo>
  <p>Não entram nos gastos ou ganhos. O fluxo líquido entre corrente e investimento conta uma vez em Liberdade financeira.</p>
  {transferencias.erro instanceof ErroDaApiCliente && <p role="alert">{transferencias.erro.mensagem}</p>}
  {lista?.length === 0 && <p>Nenhuma transferência classificada neste mês.</p>}
  <ul>{lista?.map(t => <Linha key={t.id} transferencia={t} nomes={nomes} aoAvisar={aoAvisar} />)}</ul>
 </section>;
}
