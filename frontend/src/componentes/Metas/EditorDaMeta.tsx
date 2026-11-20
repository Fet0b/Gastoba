import { type CSSProperties, type FormEvent, useEffect, useId, useRef, useState } from "react";

import type { AlvoDaMeta } from "../../api/tipos";
import { formatar, percentualDe } from "../../dinheiro/dinheiro";
import { Botao } from "../Botao/Botao";
import { CampoDeFaixa } from "../Campo/CampoDeFaixa";
import { CampoDeTexto } from "../Campo/CampoDeTexto";
import estilos from "./Metas.module.css";

type Propriedades = {
  categoria: AlvoDaMeta;
  /** O percentual da meta atual; `undefined` se a categoria não tem meta. */
  percentual: number | undefined;
  /** A renda de referência das metas, para mostrar quanto o percentual digitado representa. */
  renda: string;
  /** A soma dos percentuais das outras categorias. */
  somaDasOutras: number;
  /** Salva o percentual; o editor continua aberto e mostra o novo valor salvo. */
  aoSalvar: (percentual: number) => Promise<void>;
  /** Mensagem da API para o campo (ex.: soma acima de 100% recusada pelo servidor). */
  erro?: string;
  salvando: boolean;
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
 * O editor do percentual de uma categoria, no modo de edição do Orçamento: campo e
 * barra deslizante sincronizados, quanto o percentual vale neste mês e, se a soma das
 * metas passar de 100%, o aviso (e nada de salvar). "Salvar meta" só aparece quando o
 * texto difere do percentual salvo; sair do modo de edição descarta o que não foi salvo.
 */
export function EditorDaMeta({
  categoria,
  percentual,
  renda,
  somaDasOutras,
  aoSalvar,
  erro,
  salvando,
}: Propriedades) {
  const textoSalvo = percentual === undefined ? "" : String(percentual);
  const [texto, definirTexto] = useState(textoSalvo);
  const campo = useRef<HTMLInputElement>(null);
  const id = useId();

  // Salvar ou remover muda o percentual salvo: o texto passa a ser o dele.
  useEffect(() => {
    definirTexto(textoSalvo);
  }, [textoSalvo]);

  const digitado = lerPercentual(texto);
  const soma = digitado === null ? null : somaDasOutras + digitado;
  const extrapola = soma !== null && soma > 100;
  const motivos: string[] = [];
  if (digitado === null) motivos.push(MENSAGEM_PERCENTUAL_INVALIDO);
  if (soma !== null && extrapola) motivos.push(mensagemDaSomaExcedida(soma));
  const alterado = texto.trim() !== textoSalvo;

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (!alterado || digitado === null || extrapola || salvando) return;
    await aoSalvar(digitado);
    // O botão some depois de salvar: o foco fica no campo.
    campo.current?.focus();
  }

  const idMotivos = `${id}-motivos`;

  return (
    <form className={estilos.editor} onSubmit={enviar} noValidate>
      <CampoDeTexto
        ref={campo}
        rotulo={`Percentual da renda para ${categoria.nome}`}
        valor={texto}
        aoMudar={definirTexto}
        data-campo-da-meta={categoria.codigo}
        inputMode="numeric"
        autoComplete="off"
        aria-invalid={texto !== "" && (digitado === null || extrapola) ? true : undefined}
        aria-describedby={motivos.length > 0 || erro ? idMotivos : undefined}
      />
      <CampoDeFaixa
        className={estilos.faixaSemRotulo}
        rotulo={`Ajustar o percentual de ${categoria.nome}`}
        minimo={1}
        maximo={100}
        valor={digitado ?? 1}
        aoMudar={(valor) => definirTexto(String(valor))}
        aria-valuetext={`${digitado ?? 1}% da renda, ${formatar(percentualDe(renda, digitado ?? 1))}`}
        style={{ "--preenchido": `${digitado ?? 1}%` } as CSSProperties}
      />
      {digitado !== null && (
        <p className={estilos.equivale}>
          {digitado}% equivale a <span className="valor">{formatar(percentualDe(renda, digitado))}</span>{" "}
          neste mês.
        </p>
      )}
      <div id={idMotivos} aria-live="polite">
        {(texto !== "" || extrapola) &&
          motivos.map((motivo) => (
            <p key={motivo} className={estilos.erro} role={extrapola ? "alert" : undefined}>
              {motivo}
            </p>
          ))}
        {erro && <p className={estilos.erro}>{erro}</p>}
      </div>
      {alterado && (
        <div className={estilos.acoes}>
          <Botao type="submit" variante="primario" disabled={motivos.length > 0 || salvando}>
            {salvando ? "Salvando…" : "Salvar meta"}
          </Botao>
        </div>
      )}
    </form>
  );
}
