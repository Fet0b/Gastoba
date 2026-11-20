import { useState } from "react";

import { useCompletarParDaTransferencia, useContas, useTransferencias, useTransacoesImportadas } from "../../api/consultas";
import { ErroDaApiCliente, MENSAGEM_SEM_RESPOSTA } from "../../api/cliente";
import type { TransferenciaEntreContas } from "../../api/tipos";
import { formatar, paraCentavos } from "../../dinheiro/dinheiro";
import { dataParaExibicao } from "../../periodo/periodo";
import { Badge } from "../Badge/Badge";
import { Botao } from "../Botao/Botao";
import { Seletor } from "../Campo/Seletor";
import { Esqueleto } from "../Esqueleto/Esqueleto";
import { EstadoDeErro } from "../EstadoDeErro/EstadoDeErro";
import { EstadoVazio } from "../EstadoVazio/EstadoVazio";
import { MenuDeAcoes } from "../MenuDeAcoes/MenuDeAcoes";
import { Recolhivel } from "../Recolhivel/Recolhivel";
import { Tabela } from "../Tabela/Tabela";
import { Titulo } from "../Titulo/Titulo";
import { useAcaoDeDesfazerClassificacao } from "./AcaoDeDesfazerClassificacao";
import estilos from "./ListaDeTransferencias.module.css";
import { textoDaConta } from "../../contas/identificacao";

/** Escolher a transação do outro lado quando só uma ponta da transferência chegou. */
function CompletarPar({ transferencia }: { transferencia: TransferenciaEntreContas }) {
  const pendentes = useTransacoesImportadas("pendente");
  const ignoradas = useTransacoesImportadas("ignorada");
  const completar = useCompletarParDaTransferencia();
  const [par, definirPar] = useState("");
  const faltaEntrada = transferencia.transacao_destino_id === null;
  const conta = faltaEntrada ? transferencia.conta_destino_id : transferencia.conta_origem_id;
  const candidatos = [...(pendentes.dados ?? []), ...(ignoradas.dados ?? [])].filter(
    (t) =>
      t.conta_id === conta &&
      t.sentido === (faltaEntrada ? "entrada" : "saida") &&
      paraCentavos(t.valor) === paraCentavos(transferencia.valor),
  );
  return (
    <div className={estilos.completar}>
      <Seletor
        rotulo={`Par de ${transferencia.data}`}
        valor={par}
        aoMudar={definirPar}
        opcoes={[
          { valor: "", rotulo: "Escolha o outro lado" },
          ...candidatos.map((t) => ({ valor: t.id, rotulo: `${t.data} ${t.descricao}` })),
        ]}
      />
      <Botao
        variante="secundario"
        disabled={!par || completar.pendente}
        onClick={() => void completar.executar({ id: transferencia.id, transacao_id: par })}
      >
        Completar par
      </Botao>
      {!par && <p className={estilos.apoio}>Escolha a transação do outro lado para completar.</p>}
      {completar.erro instanceof ErroDaApiCliente && <p role="alert" className={estilos.erro}>{completar.erro.mensagem}</p>}
    </div>
  );
}

/** O menu da transferência: desfazer devolve as duas pontas à caixa de entrada. */
function AcoesDaTransferencia({ transferencia: t, aoAvisar }: { transferencia: TransferenciaEntreContas; aoAvisar: (texto: string) => void }) {
  const reabrir = useAcaoDeDesfazerClassificacao(
    t.transacao_origem_id ?? t.transacao_destino_id,
    "transferência entre suas contas",
    () => aoAvisar("Transferência desfeita; as pontas voltaram à caixa de entrada."),
  );
  return (
    <>
      <MenuDeAcoes rotulo={`Mais ações da transferência de ${t.data}`} itens={reabrir.item ? [reabrir.item] : []} />
      {reabrir.dialogo}
    </>
  );
}

type Propriedades = {
  inicio: string;
  fim: string;
  /** Vazio é "todas as contas"; com contas, só as transferências que passam por alguma delas. */
  contasSelecionadas: readonly string[];
  aoAvisar: (texto: string) => void;
};

/** As transferências entre as contas da própria pessoa no mês: não são gasto nem ganho. */
export function ListaDeTransferencias({ inicio, fim, contasSelecionadas, aoAvisar }: Propriedades) {
  const transferencias = useTransferencias(inicio, fim);
  const contas = useContas();
  const nomes = new Map(contas.dados?.map((c) => [c.id, textoDaConta(c)]));
  const lista = transferencias.dados?.filter(
    (t) => contasSelecionadas.length === 0 || [t.conta_origem_id, t.conta_destino_id].some((c) => contasSelecionadas.includes(c)),
  );

  return (
    <section className={estilos.secao} aria-label="Transferências entre minhas contas">
      <Titulo nivel="cartao">Transferências entre minhas contas</Titulo>
      <p className={estilos.apoio}>
        Não entram nos gastos ou ganhos. O fluxo líquido entre corrente e investimento conta uma vez em Liberdade financeira.
      </p>
      {transferencias.erro ? (
        <EstadoDeErro
          mensagem={transferencias.erro instanceof ErroDaApiCliente ? transferencias.erro.mensagem : MENSAGEM_SEM_RESPOSTA}
        />
      ) : lista === undefined ? (
        <Esqueleto rotulo="Carregando transferências" />
      ) : lista.length === 0 ? (
        <EstadoVazio
          icone="transacoes"
          titulo="Nenhuma transferência neste mês"
          descricao="Quando você classificar uma transferência entre suas contas na caixa de entrada, ela aparece aqui."
        />
      ) : (
        <Tabela
          legenda="Transferências entre minhas contas"
          colunas={[
            { chave: "data", titulo: "Data" },
            { chave: "contas", titulo: "Contas" },
            { chave: "valor", titulo: "Valor", numerica: true },
            { chave: "liquido", titulo: "Liberdade financeira", numerica: true },
            { chave: "acoes", titulo: "Ações" },
          ]}
          linhas={lista.map((t) => ({
            data: dataParaExibicao(t.data),
            contas: (
              <div className={estilos.contas}>
                <span className={estilos.nome}>
                  {nomes.get(t.conta_origem_id)} → {nomes.get(t.conta_destino_id)}
                </span>
                {t.competencia_provisoria && <Badge tom="atencao">Competência provisória</Badge>}
                {(!t.transacao_destino_id || !t.transacao_origem_id) && (
                  <Recolhivel resumo="Completar o par">
                    <CompletarPar transferencia={t} />
                  </Recolhivel>
                )}
              </div>
            ),
            valor: formatar(t.valor),
            liquido: formatar(t.aporte_liquido),
            acoes: <AcoesDaTransferencia transferencia={t} aoAvisar={aoAvisar} />,
          }))}
        />
      )}
    </section>
  );
}
