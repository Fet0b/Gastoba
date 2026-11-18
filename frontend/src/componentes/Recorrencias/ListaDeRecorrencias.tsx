import { useId, useRef, useState } from "react";

import type { Categoria, Conta, Recorrencia } from "../../api/tipos";
import { deCentavos, formatar, paraCentavos } from "../../dinheiro/dinheiro";
import { dataParaExibicao } from "../../periodo/periodo";
import { Badge } from "../Badge/Badge";
import { Botao } from "../Botao/Botao";
import { DialogoDeConfirmacao } from "../DialogoDeConfirmacao/DialogoDeConfirmacao";
import { MenuDeAcoes } from "../MenuDeAcoes/MenuDeAcoes";
import { EdicaoDeRecorrencia } from "./EdicaoDeRecorrencia";
import estilos from "./Recorrencias.module.css";

type PropriedadesDoItem = {
  recorrencia: Recorrencia;
  nomeDaConta: string;
  nomeDaCategoria: string | null;
  categorias: readonly Categoria[] | undefined;
  sugestoesDeTags: readonly string[];
  /** Encerra; devolve `true` se deu certo. */
  aoEncerrar: (recorrencia: Recorrencia) => Promise<boolean>;
  aoAlterada: (recorrencia: Recorrencia) => void;
  aoFalhar: (erro: unknown) => void;
  aoRevisar?: () => void;
};

/**
 * Uma recorrência: dados, "Alterar" (edição na própria linha) e o menu "Mais ações", cujo item
 * "Encerrar" abre a confirmação num diálogo (foco em Cancelar; o foco volta ao gatilho do menu).
 */
function ItemDeRecorrencia({
  recorrencia,
  nomeDaConta,
  nomeDaCategoria,
  categorias,
  sugestoesDeTags,
  aoEncerrar,
  aoAlterada,
  aoFalhar,
  aoRevisar,
}: PropriedadesDoItem) {
  const [editando, definirEditando] = useState(false);
  const [confirmando, definirConfirmando] = useState(false);
  const [encerrando, definirEncerrando] = useState(false);
  const id = useId();
  const botaoAlterar = useRef<HTMLButtonElement>(null);

  async function confirmar(): Promise<void> {
    definirEncerrando(true);
    await aoEncerrar(recorrencia);
    definirEncerrando(false);
    definirConfirmando(false);
  }

  function fecharEdicao(): void {
    definirEditando(false);
    // O botão volta a existir no próximo quadro.
    queueMicrotask(() => botaoAlterar.current?.focus());
  }

  const ganho = recorrencia.tipo === "ganho";
  const valor = formatar(deCentavos(ganho ? paraCentavos(recorrencia.valor) : -paraCentavos(recorrencia.valor)));
  const idTitulo = `${id}-titulo`;
  const legada = recorrencia.categoria === "investimentos";

  return (
    <li
      className={estilos.item}
      aria-labelledby={idTitulo}
      data-ativa={recorrencia.ativa}
      data-tipo={recorrencia.tipo}
    >
      <div className={estilos.topoDoItem}>
        <h3 id={idTitulo} className={estilos.nome}>
          {recorrencia.descricao}
        </h3>
        <span className={`valor ${estilos.valor}`}>
          {ganho ? "+" : ""}
          {valor}
        </span>
      </div>
      <p className={estilos.detalhe}>
        <span>{ganho ? "Ganho" : "Gasto"}</span>
        {!ganho && nomeDaCategoria && <span>{nomeDaCategoria}</span>}
        <span>todo dia {recorrencia.dia_do_mes}</span>
        <span>{nomeDaConta || "conta removida"}</span>
      </p>
      {recorrencia.tags.length > 0 && (
        <p className={estilos.detalhe}>Tags: {recorrencia.tags.join(", ")}</p>
      )}
      <p className={estilos.detalhe}>
        <span>
          Desde {dataParaExibicao(recorrencia.inicio)}
          {recorrencia.fim ? ` até ${dataParaExibicao(recorrencia.fim)}` : ""}
        </span>
        <Badge tom={recorrencia.ativa ? "positivo" : "neutro"}>
          {recorrencia.ativa ? "Ativa" : "Encerrada"}
        </Badge>
      </p>

      {editando && (
        <EdicaoDeRecorrencia
          recorrencia={recorrencia}
          categorias={categorias}
          sugestoesDeTags={sugestoesDeTags}
          aoAlterar={(alterada) => {
            fecharEdicao();
            aoAlterada(alterada);
          }}
          aoCancelar={fecharEdicao}
          aoFalhar={aoFalhar}
        />
      )}

      {recorrencia.ativa && !editando && (
        <div className={estilos.acoes}>
          {legada && (
            <div>
              <p id={`${id}-revisao`}>Categoria antiga: revise em Investimentos</p>
              <Botao variante="terciario" seta onClick={aoRevisar}>
                Revisar em Investimentos
              </Botao>
            </div>
          )}
          <Botao
            ref={botaoAlterar}
            variante="secundario"
            disabled={legada}
            aria-describedby={legada ? `${id}-revisao` : undefined}
            aria-label={`Alterar a recorrência ${recorrencia.descricao}`}
            onClick={() => definirEditando(true)}
          >
            Alterar
          </Botao>
          <MenuDeAcoes
            rotulo={`Mais ações da recorrência ${recorrencia.descricao}`}
            itens={[
              {
                rotulo: "Encerrar",
                nomeAcessivel: `Encerrar a recorrência ${recorrencia.descricao}`,
                destrutivo: true,
                aoEscolher: () => definirConfirmando(true),
              },
            ]}
          />
          <DialogoDeConfirmacao
            aberto={confirmando}
            titulo={`Encerrar ${recorrencia.descricao}?`}
            descricao="Ela deixa de gerar novos meses; o que já foi criado continua."
            rotuloDaAcao="Confirmar encerramento"
            pendente={encerrando}
            aoConfirmar={() => void confirmar()}
            aoCancelar={() => definirConfirmando(false)}
          />
        </div>
      )}
    </li>
  );
}

type Propriedades = {
  recorrencias: Recorrencia[] | undefined;
  carregando: boolean;
  contas: Conta[] | undefined;
  categorias: Categoria[] | undefined;
  sugestoesDeTags: readonly string[];
  aoEncerrar: (recorrencia: Recorrencia) => Promise<boolean>;
  aoAlterada: (recorrencia: Recorrencia) => void;
  aoFalhar: (erro: unknown) => void;
  aoRevisar?: () => void;
};

/** As recorrências, ativas e encerradas, na ordem da API (por descrição). */
export function ListaDeRecorrencias({
  recorrencias,
  carregando,
  contas,
  categorias,
  sugestoesDeTags,
  aoEncerrar,
  aoAlterada,
  aoFalhar,
  aoRevisar,
}: Propriedades) {
  if (recorrencias === undefined) {
    return (
      <p className={estilos.estado}>
        {carregando ? "Carregando as recorrências…" : "Não foi possível carregar as recorrências."}
      </p>
    );
  }
  if (recorrencias.length === 0) {
    return null;
  }
  const contasPorId = new Map(contas?.map((conta) => [conta.id, conta.nome]));
  const categoriasPorCodigo = new Map(categorias?.map((categoria) => [categoria.codigo, categoria.nome]));
  return (
    <>
    <div className={estilos.cabecalhoDaLista} data-cabecalho-da-lista="" aria-hidden="true">
      <span>Recorrência</span>
      <span>Valor</span>
    </div>
    <ul className={estilos.lista} aria-label="Recorrências">
      {recorrencias.map((recorrencia) => (
        <ItemDeRecorrencia
          key={recorrencia.id}
          recorrencia={recorrencia}
          nomeDaConta={contasPorId.get(recorrencia.conta_id) ?? ""}
          nomeDaCategoria={
            recorrencia.categoria
              ? (categoriasPorCodigo.get(recorrencia.categoria) ?? recorrencia.categoria)
              : null
          }
          categorias={categorias}
          sugestoesDeTags={sugestoesDeTags}
          aoEncerrar={aoEncerrar}
          aoAlterada={aoAlterada}
          aoFalhar={aoFalhar}
          aoRevisar={aoRevisar}
        />
      ))}
    </ul>
    </>
  );
}
