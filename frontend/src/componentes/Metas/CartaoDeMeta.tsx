import { type CSSProperties, type FormEvent, useEffect, useId, useRef, useState } from "react";

import type { Categoria, ProgressoDaMeta } from "../../api/tipos";
import { corDaCategoria } from "../../categorias/cores";
import { formatar, percentualDe } from "../../dinheiro/dinheiro";
import { Medidor } from "./Medidor";
import estilos from "./Metas.module.css";

type Propriedades = {
  categoria: Categoria;
  /** O percentual da meta atual; `undefined` se a categoria não tem meta. */
  percentual: number | undefined;
  /** O progresso no mês; `undefined` enquanto não chega (ou se a categoria não tem meta). */
  progresso: ProgressoDaMeta | undefined;
  /** A renda do mês ("5000.00"), para mostrar quanto o percentual digitado representa. */
  renda: string;
  /** A soma dos percentuais das outras categorias. */
  somaDasOutras: number;
  editando: boolean;
  aoEditar: () => void;
  aoCancelar: () => void;
  /** Salva; o painel fecha o formulário se der certo e mostra `erro` se não. */
  aoSalvar: (percentual: number) => Promise<void>;
  /** Remove; devolve `true` se deu certo. */
  aoRemover: () => Promise<boolean>;
  /** Mensagem da API para o campo (ex.: soma acima de 100% recusada pelo servidor). */
  erro?: string;
  salvando: boolean;
  /** Posição na grade, para os anéis acenderem em sequência (`--indice`). */
  indice?: number;
};

/** O percentual digitado, se for um inteiro de 1 a 100. */
export function lerPercentual(texto: string): number | null {
  if (!/^\d{1,3}$/.test(texto.trim())) return null;
  const numero = Number.parseInt(texto, 10);
  return numero >= 1 && numero <= 100 ? numero : null;
}

export const MENSAGEM_PERCENTUAL_INVALIDO = "Informe um número inteiro de 1 a 100.";

export function mensagemDaSomaExcedida(soma: number): string {
  return `A soma das metas está em ${soma}%: passa de 100% da renda.`;
}

/**
 * Uma categoria na aba Metas: com meta, o medidor do mês e os botões Alterar e
 * Remover (confirmada na própria linha); sem meta, "Definir meta". O formulário
 * mostra quanto o percentual digitado vale neste mês e, se a soma das metas
 * passar de 100%, avisa e não deixa salvar.
 */
export function CartaoDeMeta({
  categoria,
  percentual,
  progresso,
  renda,
  somaDasOutras,
  editando,
  aoEditar,
  aoCancelar,
  aoSalvar,
  aoRemover,
  erro,
  salvando,
  indice = 0,
}: Propriedades) {
  const [texto, definirTexto] = useState(percentual === undefined ? "" : String(percentual));
  const [confirmando, definirConfirmando] = useState(false);
  const [removendo, definirRemovendo] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const botaoDeEditar = useRef<HTMLButtonElement>(null);
  const botaoCancelarRemocao = useRef<HTMLButtonElement>(null);
  const devolverFoco = useRef(false);
  const id = useId();

  // Ao abrir o formulário, o texto parte do percentual atual e o foco vai ao campo.
  useEffect(() => {
    if (editando) {
      definirTexto(percentual === undefined ? "" : String(percentual));
      campo.current?.focus();
    } else if (devolverFoco.current) {
      devolverFoco.current = false;
      botaoDeEditar.current?.focus();
    }
  }, [editando]);

  useEffect(() => {
    if (confirmando) botaoCancelarRemocao.current?.focus();
  }, [confirmando]);

  const digitado = lerPercentual(texto);
  const soma = digitado === null ? null : somaDasOutras + digitado;
  const extrapola = soma !== null && soma > 100;
  const motivos: string[] = [];
  if (digitado === null) motivos.push(MENSAGEM_PERCENTUAL_INVALIDO);
  if (soma !== null && extrapola) motivos.push(mensagemDaSomaExcedida(soma));

  function cancelar(): void {
    devolverFoco.current = true;
    aoCancelar();
  }

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (digitado === null || extrapola || salvando) return;
    devolverFoco.current = true;
    await aoSalvar(digitado);
  }

  async function confirmarRemocao(): Promise<void> {
    definirRemovendo(true);
    const removida = await aoRemover();
    definirRemovendo(false);
    if (!removida) definirConfirmando(false);
  }

  const idTitulo = `${id}-titulo`;
  const idCampo = `${id}-percentual`;
  const idMotivos = `${id}-motivos`;
  const idPergunta = `${id}-pergunta`;

  return (
    <li
      className={estilos.cartao}
      aria-labelledby={idTitulo}
      style={{ "--indice": indice } as CSSProperties}
    >
      <h3 id={idTitulo} className={estilos.nomeDaCategoria}>
        <span
          className={estilos.ponto}
          style={{ backgroundColor: corDaCategoria(categoria.codigo) }}
          aria-hidden="true"
        />
        {categoria.nome}
      </h3>

      {editando ? (
        <form className={estilos.formulario} onSubmit={enviar} noValidate>
          <div className={estilos.campo}>
            <label htmlFor={idCampo}>Percentual da renda para {categoria.nome}</label>
            <input
              ref={campo}
              id={idCampo}
              className={estilos.entrada}
              inputMode="numeric"
              autoComplete="off"
              value={texto}
              onChange={(evento) => definirTexto(evento.target.value)}
              aria-invalid={texto !== "" && (digitado === null || extrapola) ? true : undefined}
              aria-describedby={motivos.length > 0 || erro ? idMotivos : undefined}
            />
          </div>
          <input
            type="range"
            className={estilos.deslizante}
            min={1}
            max={100}
            step={1}
            value={digitado ?? 1}
            onChange={(evento) => definirTexto(evento.target.value)}
            aria-label={`Ajustar o percentual de ${categoria.nome}`}
            aria-valuetext={`${digitado ?? 1}% da renda, ${formatar(percentualDe(renda, digitado ?? 1))}`}
            style={{ "--preenchido": `${digitado ?? 1}%` } as CSSProperties}
          />
          {digitado !== null && (
            <p className={estilos.equivale}>
              {digitado}% equivale a <span className="valor">{formatar(percentualDe(renda, digitado))}</span>{" "}
              neste mês.
            </p>
          )}
          <p className={estilos.soma}>
            Soma das metas: {somaDasOutras + (digitado ?? 0)}% de 100%.
          </p>
          <div id={idMotivos} aria-live="polite">
            {(texto !== "" || extrapola) &&
              motivos.map((motivo) => (
                <p key={motivo} className={estilos.erro} role={extrapola ? "alert" : undefined}>
                  {motivo}
                </p>
              ))}
            {erro && <p className={estilos.erro}>{erro}</p>}
          </div>
          <div className={estilos.acoes}>
            <button
              type="submit"
              className={estilos.botaoPrimario}
              disabled={motivos.length > 0 || salvando}
            >
              {salvando ? "Salvando…" : "Salvar meta"}
            </button>
            <button type="button" className={estilos.botao} onClick={cancelar}>
              Cancelar
            </button>
          </div>
        </form>
      ) : percentual === undefined ? (
        <>
          <p className={estilos.semMeta}>Sem meta</p>
          <div className={estilos.acoes}>
            <button
              ref={botaoDeEditar}
              type="button"
              className={estilos.botao}
              aria-label={`Definir meta de ${categoria.nome}`}
              onClick={aoEditar}
            >
              Definir meta
            </button>
          </div>
        </>
      ) : (
        <>
          {progresso ? (
            <Medidor progresso={progresso} nomeDaCategoria={categoria.nome} />
          ) : (
            <p className={estilos.equivale}>{percentual}% da renda</p>
          )}
          <p className={estilos.equivale}>
            Meta de <span className="valor">{formatar(percentualDe(renda, percentual))}</span> neste
            mês.
          </p>
          {confirmando ? (
            <div className={estilos.formulario} role="group" aria-labelledby={idPergunta}>
              <p id={idPergunta}>Remover a meta de {categoria.nome}?</p>
              <div className={estilos.acoes}>
                <button
                  type="button"
                  className={estilos.botaoPerigo}
                  disabled={removendo}
                  onClick={() => void confirmarRemocao()}
                >
                  Confirmar remoção
                </button>
                <button
                  ref={botaoCancelarRemocao}
                  type="button"
                  className={estilos.botao}
                  disabled={removendo}
                  onClick={() => definirConfirmando(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className={estilos.acoes}>
              <button
                ref={botaoDeEditar}
                type="button"
                className={estilos.botao}
                aria-label={`Alterar a meta de ${categoria.nome}`}
                onClick={aoEditar}
              >
                Alterar
              </button>
              <button
                type="button"
                className={estilos.botao}
                aria-label={`Remover a meta de ${categoria.nome}`}
                onClick={() => definirConfirmando(true)}
              >
                Remover
              </button>
            </div>
          )}
        </>
      )}
    </li>
  );
}
