import { useEffect, useId, useState } from "react";

import { ErroDaApiCliente, MENSAGEM_SEM_RESPOSTA } from "../../api/cliente";
import {
  useContas,
  useRestaurarTransacaoImportada,
  useTransacoesImportadas,
} from "../../api/consultas";
import type { TransacaoImportada } from "../../api/tipos";
import { rotuloDoDia } from "../../periodo/periodo";
import { EstadoVazio } from "../EstadoVazio/EstadoVazio";
import { valorComSinal } from "./CartaoDeImportada";
import { Badge } from "../Badge/Badge";
import { DialogoDeConfirmacao } from "../DialogoDeConfirmacao/DialogoDeConfirmacao";
import { Botao } from "../Botao/Botao";
import estilos from "./Importadas.module.css";

type Propriedades = {
  /** Depois de restaurar: a tela avisa. */
  aoRestaurar: (mensagem: string) => void;
  /** Falha ao consultar ou restaurar: a tela pisca o olho e avisa. */
  aoFalhar: (erro: unknown) => void;
};

function CartaoDeIgnorada({
  transacao,
  nomeDaConta,
  aoRestaurar,
  aoFalhar,
}: Propriedades & { transacao: TransacaoImportada; nomeDaConta: string }) {
  const restaurar = useRestaurarTransacaoImportada();
  const [confirmando, definirConfirmando] = useState(false);
  const idTitulo = useId();
  const saida = transacao.sentido === "saida";

  async function restaurarTransacao(): Promise<void> {
    if (await restaurar.executar(transacao.id)) {
      aoRestaurar("Transação restaurada para a caixa de entrada.");
    }
  }

  useEffect(() => {
    if (restaurar.erro !== null && restaurar.erro !== undefined) aoFalhar(restaurar.erro);
  }, [restaurar.erro]);

  const mensagem =
    restaurar.erro === null || restaurar.erro === undefined
      ? null
      : restaurar.erro instanceof ErroDaApiCliente && restaurar.erro.codigo !== "sem_resposta"
        ? restaurar.erro.mensagem
        : MENSAGEM_SEM_RESPOSTA;

  return (
    <li
      className={estilos.cartao}
      aria-labelledby={idTitulo}
      data-transacao={transacao.id}
      data-sentido={transacao.sentido}
      data-estado="ignorada"
    >
      <div className={estilos.topo}>
        <div className={estilos.identificacao}>
          <h3 id={idTitulo} className={estilos.nome}>
            {transacao.descricao}
          </h3>
          <p className={estilos.detalhe}>
            <span>{rotuloDoDia(transacao.data)}</span>
            <span>{nomeDaConta || "conta removida"}</span>
            <span>{saida ? "Saída" : "Entrada"}</span>
            <Badge>Ignorada</Badge>
            {transacao.motivo_ignorada === "transferencia_entre_contas" && <Badge>Transferência entre contas</Badge>}
          </p>
        </div>
        <span className={`valor ${estilos.valor}`}>{valorComSinal(transacao)}</span>
      </div>
      {mensagem !== null && (
        <p className={estilos.erro} role="alert">
          {mensagem}
        </p>
      )}
      <div className={estilos.acoes}>
        <Botao variante="secundario"
         
          disabled={restaurar.pendente}
          aria-label={`Desfazer classificação: ${transacao.descricao}`}
          onClick={() => definirConfirmando(true)}
        >
          {restaurar.pendente ? "Restaurando…" : "Desfazer classificação"}
        </Botao>
      </div>
      <DialogoDeConfirmacao aberto={confirmando} titulo={`Desfazer classificação de ${transacao.descricao}?`}
        descricao="A transação ignorada volta à caixa de entrada."
        rotuloDaAcao="Sim, desfazer" pendente={restaurar.pendente}
        aoCancelar={() => definirConfirmando(false)}
        aoConfirmar={() => { definirConfirmando(false); void restaurarTransacao(); }} />
    </li>
  );
}

/**
 * As transações ignoradas, só para consulta e restauração. Restaurar apenas devolve a transação à
 * caixa de entrada (pendente): não aceita, não classifica e não cria gasto, ganho nem muda saldo.
 */
export function ListaDeIgnoradas({ aoRestaurar, aoFalhar }: Propriedades) {
  const [filtrarTransferencias, definirFiltrarTransferencias] = useState(false);
  const ignoradas = useTransacoesImportadas("ignorada", filtrarTransferencias ? "transferencia_entre_contas" : undefined);
  const contas = useContas();
  const nomesDasContas = new Map(contas.dados?.map((conta) => [conta.id, conta.nome]));

  useEffect(() => {
    if (ignoradas.erro) aoFalhar(ignoradas.erro);
  }, [ignoradas.erro]);

  if (ignoradas.dados === undefined) {
    return (
      <p className={estilos.estado}>
        {ignoradas.carregando
          ? "Carregando as transações ignoradas…"
          : "Não foi possível carregar as transações ignoradas."}
      </p>
    );
  }
  return (
    <>
    <label><input type="checkbox" checked={filtrarTransferencias} onChange={e => definirFiltrarTransferencias(e.target.checked)} />Ignoradas: transferência entre contas</label>
    {ignoradas.dados.length === 0 && <EstadoVazio icone="ok" titulo="Nenhuma transação ignorada" />}
    <ul className={estilos.lista} aria-label="Transações ignoradas">
      {ignoradas.dados.map((transacao) => (
        <CartaoDeIgnorada
          key={transacao.id}
          transacao={transacao}
          nomeDaConta={nomesDasContas.get(transacao.conta_id) ?? ""}
          aoRestaurar={aoRestaurar}
          aoFalhar={aoFalhar}
        />
      ))}
    </ul>
    </>
  );
}
