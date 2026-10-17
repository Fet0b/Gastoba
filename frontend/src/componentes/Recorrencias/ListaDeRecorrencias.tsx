import { useEffect, useId, useRef, useState } from "react";

import type { Categoria, Conta, Recorrencia } from "../../api/tipos";
import { deCentavos, formatar, paraCentavos } from "../../dinheiro/dinheiro";
import { dataParaExibicao } from "../../periodo/periodo";
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
};

/** Uma recorrência: dados e o botão "Encerrar", que pede confirmação na própria linha. */
function ItemDeRecorrencia({
  recorrencia,
  nomeDaConta,
  nomeDaCategoria,
  categorias,
  sugestoesDeTags,
  aoEncerrar,
  aoAlterada,
  aoFalhar,
}: PropriedadesDoItem) {
  const [editando, definirEditando] = useState(false);
  const [confirmando, definirConfirmando] = useState(false);
  const [encerrando, definirEncerrando] = useState(false);
  const id = useId();
  const botaoEncerrar = useRef<HTMLButtonElement>(null);
  const botaoAlterar = useRef<HTMLButtonElement>(null);
  const botaoCancelar = useRef<HTMLButtonElement>(null);
  const devolverFoco = useRef(false);

  useEffect(() => {
    if (confirmando) {
      botaoCancelar.current?.focus();
    } else if (devolverFoco.current) {
      devolverFoco.current = false;
      botaoEncerrar.current?.focus();
    }
  }, [confirmando]);

  function cancelar(): void {
    devolverFoco.current = true;
    definirConfirmando(false);
  }

  async function confirmar(): Promise<void> {
    definirEncerrando(true);
    const encerrada = await aoEncerrar(recorrencia);
    definirEncerrando(false);
    if (!encerrada) cancelar();
  }

  function fecharEdicao(): void {
    definirEditando(false);
    // O botão volta a existir no próximo quadro.
    queueMicrotask(() => botaoAlterar.current?.focus());
  }

  const ganho = recorrencia.tipo === "ganho";
  const valor = formatar(deCentavos(ganho ? paraCentavos(recorrencia.valor) : -paraCentavos(recorrencia.valor)));
  const idTitulo = `${id}-titulo`;
  const idPergunta = `${id}-pergunta`;

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
        {ganho ? "Ganho" : `Gasto${nomeDaCategoria ? ` · ${nomeDaCategoria}` : ""}`} · todo dia{" "}
        {recorrencia.dia_do_mes} · {nomeDaConta || "conta removida"}
      </p>
      {recorrencia.tags.length > 0 && (
        <p className={estilos.detalhe}>Tags: {recorrencia.tags.join(", ")}</p>
      )}
      <p className={estilos.detalhe}>
        Desde {dataParaExibicao(recorrencia.inicio)}
        {recorrencia.fim ? ` até ${dataParaExibicao(recorrencia.fim)}` : ""} ·{" "}
        <span className={estilos.situacao}>{recorrencia.ativa ? "Ativa" : "Encerrada"}</span>
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

      {recorrencia.ativa &&
        !editando &&
        (confirmando ? (
          <div className={estilos.confirmacao} role="group" aria-labelledby={idPergunta}>
            <p id={idPergunta}>
              Encerrar {recorrencia.descricao}? Ela deixa de gerar novos meses; o que já foi criado
              continua.
            </p>
            <div className={estilos.acoes}>
              <button
                type="button"
                className={estilos.perigo}
                disabled={encerrando}
                onClick={() => void confirmar()}
              >
                Confirmar encerramento
              </button>
              <button
                ref={botaoCancelar}
                type="button"
                className={estilos.secundario}
                disabled={encerrando}
                onClick={cancelar}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className={estilos.acoes}>
            <button
              ref={botaoAlterar}
              type="button"
              className={estilos.encerrar}
              aria-label={`Alterar a recorrência ${recorrencia.descricao}`}
              onClick={() => definirEditando(true)}
            >
              Alterar
            </button>
            <button
              ref={botaoEncerrar}
              type="button"
              className={estilos.encerrar}
              aria-label={`Encerrar a recorrência ${recorrencia.descricao}`}
              onClick={() => definirConfirmando(true)}
            >
              Encerrar
            </button>
          </div>
        ))}
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
}: Propriedades) {
  if (recorrencias === undefined) {
    return (
      <p className={estilos.estado}>
        {carregando ? "Carregando as recorrências…" : "Não foi possível carregar as recorrências."}
      </p>
    );
  }
  if (recorrencias.length === 0) {
    return <p className={estilos.estado}>Nenhuma recorrência ainda. Crie o seu salário ou um gasto fixo.</p>;
  }
  const contasPorId = new Map(contas?.map((conta) => [conta.id, conta.nome]));
  const categoriasPorCodigo = new Map(categorias?.map((categoria) => [categoria.codigo, categoria.nome]));
  return (
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
        />
      ))}
    </ul>
  );
}
