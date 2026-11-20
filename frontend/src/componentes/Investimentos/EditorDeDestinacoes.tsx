import { CampoDeTexto } from "../Campo/CampoDeTexto";
import { CampoDeFaixa } from "../Campo/CampoDeFaixa";
import { GrupoDeCampos } from "../Campo/GrupoDeCampos";
import { Seletor } from "../Campo/Seletor";
import { type KeyboardEvent, useId, useRef, useState } from "react";

import type { Investimento } from "../../api/tipos";
import { formatar } from "../../dinheiro/dinheiro";
import {
  coresDasLinhas,
  lerPercentual,
  type LinhaDeDestinacao,
  MENSAGEM_POSICAO_SEM_CAIXINHAS,
  motivoDasDestinacoes,
  redistribuirPercentuais,
  restanteDaDistribuicao,
  somaDosPercentuais,
  valoresEmAndamento,
} from "../../investimentos/destinacoes";
import { BarraDaDistribuicao } from "./BarraDaDistribuicao";
import { Botao } from "../Botao/Botao";
import estilos from "./EditorDeDestinacoes.module.css";

type Propriedades = {
  /** As posições de GET /investimentos; `undefined` enquanto não chegam. */
  investimentos: readonly Investimento[] | undefined;
  /** O investimento escolhido; vazio é "escolher depois". */
  investimentoId: string;
  aoMudarInvestimento: (id: string) => void;
  linhas: readonly LinhaDeDestinacao[];
  aoMudarLinhas: (linhas: LinhaDeDestinacao[]) => void;
  /** O valor a dividir, para mostrar quanto cabe a cada destinação (só no aporte de uma). */
  valor?: string;
  /** O título do grupo; padrão "Para onde vai". */
  legenda?: string;
  /** Falso quando o investimento já está decidido (a posição): sem o seletor, só as destinações. */
  escolherInvestimento?: boolean;
  /** Dentro de outro cartão (a parte de uma divisão): sem borda nem legenda, só um grupo nomeado. */
  semMoldura?: boolean;
  /** Dentro de um card: wrapper sem fieldset nem grupo acessível redundante com o campo Investimento. */
  semGrupo?: boolean;
  /** Resgate de posição sem caixinhas: nada a dividir, só o texto que explica. */
  semCaixinhas?: boolean;
  /** Como a divisão se chama na tela; "caixinha" no resgate (069). Padrão: "destinação". */
  termo?: "destinação" | "caixinha";
  /** O erro vermelho só aparece depois de sair de um campo (a explicação do botão fica a cargo de quem chama). */
  errosAoSair?: boolean;
  /** Nomes do catálogo cadastrado, carregados pelo componente chamador. */
  destinacoesCadastradas?: readonly string[];
};

export const LINHA_INICIAL: LinhaDeDestinacao = { tag: "", percentual: "100" };

/**
 * Para onde vai o dinheiro de um aporte ou resgate: o investimento e a divisão em porcentagens
 * (tags como rótulo) que soma 100%. Sem investimento escolhido, o valor fica sem destinação por
 * ora e pode ser associado depois.
 */
export function EditorDeDestinacoes({
  investimentos,
  investimentoId,
  aoMudarInvestimento,
  linhas,
  aoMudarLinhas,
  valor,
  legenda = "Para onde vai",
  escolherInvestimento = true,
  semMoldura = false,
  semGrupo = false,
  semCaixinhas = false,
  termo = "destinação",
  errosAoSair = false,
  destinacoesCadastradas = [],
}: Propriedades) {
  const id = useId();
  const [saiu, mudarSaiu] = useState(false);
  // Só conta como "saiu do campo" quem interagiu com ele: o foco que o diálogo e o menu movem sozinhos não vale.
  const interagiu = useRef(false);
  const interacao = { onKeyDown: () => { interagiu.current = true; }, onPointerDown: () => { interagiu.current = true; }, onBlur: () => { if (interagiu.current) mudarSaiu(true); } };
  const idSugestoes = `${id}-sugestoes`;
  const idMotivo = `${id}-motivo`;
  const escolhido =
    !escolherInvestimento ||
    investimentos?.some((investimento) => investimento.id === investimentoId) === true;
  const sugestoes = [
    ...new Set([
      ...destinacoesCadastradas,
      ...(investimentos ?? []).flatMap((investimento) =>
        investimento.destinacoes.flatMap((d) => (d.tag === null ? [] : [d.tag])),
      ),
    ]),
  ];
  const partes = valor === undefined ? [] : valoresEmAndamento(valor, linhas);
  const motivoGeral = motivoDasDestinacoes(linhas);
  const motivo = errosAoSair && !saiu ? null : motivoGeral;
  const soma = somaDosPercentuais(linhas);
  const restante = restanteDaDistribuicao(valor, linhas);
  const cores = coresDasLinhas(linhas, investimentos);

  function mudar(posicao: number, mudanca: Partial<LinhaDeDestinacao>): void {
    interagiu.current = true;
    aoMudarLinhas(linhas.map((linha, i) => (i === posicao ? { ...linha, ...mudanca } : linha)));
  }

  function mover(posicao: number, novo: number): void {
    aoMudarLinhas(redistribuirPercentuais(linhas, posicao, novo));
  }

  function aoTeclar(evento: KeyboardEvent<HTMLInputElement>, posicao: number): void {
    const atual = lerPercentual(linhas[posicao].percentual) ?? 1;
    const passos: Record<string, number> = {
      ArrowUp: 1,
      ArrowRight: 1,
      ArrowDown: -1,
      ArrowLeft: -1,
      PageUp: 10,
      PageDown: -10,
    };
    let novo: number;
    if (evento.key in passos) novo = atual + passos[evento.key];
    else if (evento.key === "Home") novo = 1;
    else if (evento.key === "End") novo = 100;
    else return;
    evento.preventDefault();
    mover(posicao, novo);
  }

  function textoDaBarra(posicao: number): string {
    const percentual = lerPercentual(linhas[posicao].percentual);
    if (percentual === null) return "Sem percentual";
    const parte = partes[posicao];
    return parte == null ? `${percentual}%` : `${percentual}%, ${formatar(parte)}`;
  }

  const Raiz = semMoldura ? "div" : GrupoDeCampos;
  return (
    <Raiz
      legenda={semMoldura ? undefined : legenda}
      className={`${estilos.grupo} ${semMoldura ? estilos.semMoldura : ""}`}
      role={semMoldura && !semGrupo ? "group" : undefined}
      aria-label={semMoldura && !semGrupo ? legenda : undefined}
    >
      {!escolherInvestimento ? null : investimentos !== undefined && investimentos.length === 0 ? (
        <p className={estilos.apoio}>
          Nenhum investimento sincronizado ainda: o aporte fica sem investimento por ora.
        </p>
      ) : (
        <Seletor rotulo="Investimento" aria-describedby={semCaixinhas ? `${id}-sem-caixinhas` : undefined} valor={investimentoId} vazio="Escolher depois" opcoes={(investimentos ?? []).map(i=>({valor:i.id,rotulo:i.nome}))} aoMudar={valor=>{aoMudarInvestimento(valor);if(linhas.length===0)aoMudarLinhas([{...LINHA_INICIAL}]);}} />
      )}

      {escolhido && semCaixinhas && (
        <p id={`${id}-sem-caixinhas`} role="status" className={estilos.apoio}>{MENSAGEM_POSICAO_SEM_CAIXINHAS}</p>
      )}

      {escolhido && !semCaixinhas && (
        <div className={estilos.linhas} role="group" aria-label={termo === "caixinha" ? "Caixinhas" : "Destinações"}>
          <datalist id={idSugestoes}>
            {sugestoes.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
          {linhas.length > 0 && (
            <BarraDaDistribuicao termo={termo} linhas={linhas} valores={partes} cores={cores} restante={restante} />
          )}
          {linhas.map((linha, posicao) => (
            <div key={posicao} className={estilos.linha}>
              <span
                className={estilos.ponto}
                data-ponto=""
                aria-hidden="true"
                style={{ backgroundColor: cores[posicao] }}
              />
              <CampoDeTexto rotulo={`Tag da ${termo} ${posicao + 1}`} {...interacao} className={estilos.tag} list={idSugestoes} placeholder="ex.: viagem" autoCapitalize="none" valor={linha.tag} aoMudar={valor=>mudar(posicao,{tag:valor.toLowerCase()})} aria-describedby={motivo ? idMotivo : undefined} />
              <CampoDeTexto rotulo={`Percentual da ${termo} ${posicao + 1}`} {...interacao} className={estilos.percentual} inputMode="numeric" valor={linha.percentual} aoMudar={valor=>mudar(posicao,{percentual:valor})} aria-describedby={motivo ? idMotivo : undefined} />
              <span className={estilos.sufixo} aria-hidden="true">
                %
              </span>
              {partes[posicao] != null && (
                <span className={`valor ${estilos.parte}`}>{formatar(partes[posicao] as string)}</span>
              )}
              {linhas.length > 1 && (
                <Botao variante="terciario"

                  aria-label={`Remover a ${termo} ${posicao + 1}`}
                  onClick={() => aoMudarLinhas(linhas.filter((_, i) => i !== posicao))}
                >
                  Remover
                </Botao>
              )}
              <CampoDeFaixa rotulo={`Ajustar o percentual da ${termo} ${posicao + 1}`} className={estilos.deslizante} minimo={1} maximo={100} passo={1} valor={lerPercentual(linha.percentual)??1} desabilitado={linhas.length===1} aria-describedby={linhas.length===1?`${id}-unica`:undefined} aria-valuetext={textoDaBarra(posicao)} aoMudar={valor=>mover(posicao,valor)} onKeyDown={evento=>aoTeclar(evento,posicao)} />
            </div>
          ))}
          {linhas.length===1 && <p id={`${id}-unica`} className={estilos.apoio}>Uma única {termo} recebe 100%. Adicione outra para ajustar as porcentagens.</p>}
          <div className={estilos.rodape}>
            <Botao variante="secundario"

              onClick={() => aoMudarLinhas([...linhas, { tag: "", percentual: "" }])}
            >
              Adicionar {termo}
            </Botao>
            <span className={estilos.soma} data-completa={soma === 100}>
              Soma: {soma}%
            </span>
          </div>
          {restante.situacao !== "completa" && (
            <p className={estilos.restante} data-restante={restante.situacao}>
              {restante.situacao === "falta" ? "Falta distribuir" : "Passa de 100% em"}:{" "}
              {restante.percentual}%
              {restante.valor !== null && (
                <>
                  {" "}
                  (<span className="valor">{formatar(restante.valor)}</span>)
                </>
              )}
            </p>
          )}
          {motivo && (
            <p id={idMotivo} className={estilos.motivo}>
              {motivo}
            </p>
          )}
        </div>
      )}
    </Raiz>
  );
}
