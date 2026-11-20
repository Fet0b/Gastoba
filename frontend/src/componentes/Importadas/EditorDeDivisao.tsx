import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import type { Categoria, Investimento } from "../../api/tipos";
import {
  completarComORestante,
  dividirIgualmente,
  type ErrosDaParte,
  errosDasPartes,
  type LinhaDaDivisao,
  MAXIMO_DE_PARTES,
  MINIMO_DE_PARTES,
  restanteDaDivisao,
  valoresEmAndamentoDaDivisao,
} from "../../transacoes/divisao";
import { Botao } from "../Botao/Botao";
import { Titulo } from "../Titulo/Titulo";
import estilos from "./EditorDeDivisao.module.css";
import { LinhaDaParte } from "./LinhaDaParte";
import { RodapeDaDivisao } from "./RodapeDaDivisao";

type Propriedades = {
  categorias: readonly Categoria[] | undefined;
  linhas: readonly LinhaDaDivisao[];
  aoMudarLinhas: (linhas: LinhaDaDivisao[]) => void;
  /** O valor da transação, para mostrar quanto cabe a cada parte. */
  valor: string;
  /** Na saída cada parte tem tipo e categoria; na entrada nenhuma. */
  saida: boolean;
  /** As posições de GET /investimentos, para a parte de aporte; `undefined` enquanto não chegam. */
  investimentos?: readonly Investimento[];
  /** A divisão está pronta para salvar (a mesma regra do backend). */
  podeSalvar: boolean;
  salvando: boolean;
  /** Nome acessível do botão de salvar, com a descrição da transação. */
  nomeDoSalvar: string;
  aoSalvar: () => void;
  /** Fecha o editor e guarda as partes como estão. */
  aoCancelar: () => void;
  /** Fecha o editor e descarta as partes. */
  aoNaoDividir: () => void;
  acoesSecundarias?: ReactNode;
};

export const LINHAS_INICIAIS_DA_DIVISAO: readonly LinhaDaDivisao[] = [
  { categoria: "", tags: "", percentual: "50" },
  { categoria: "", tags: "", percentual: "50" },
];

/**
 * Divide a transação em partes (2 a 10, somando 100%): cada parte vira um gasto (com a própria
 * categoria) ou um ganho, com as próprias tags; na saída, a parte "Aporte" vira um aporte, com o
 * investimento e as destinações no lugar das tags. O valor de cada parte pode ser digitado em % ou em
 * R$ (em R$, vale a porcentagem inteira mais próxima, mostrada ao lado). Os erros aparecem junto ao
 * campo depois que a pessoa sai dele.
 */
export function EditorDeDivisao({
  categorias,
  linhas,
  aoMudarLinhas,
  valor,
  saida,
  investimentos,
  podeSalvar,
  salvando,
  nomeDoSalvar,
  aoSalvar,
  aoCancelar,
  aoNaoDividir,
  acoesSecundarias,
}: Propriedades) {
  const idDoTitulo = useId();
  const [visitados, definirVisitados] = useState<ReadonlySet<string>>(new Set());
  const [parteAtiva, definirParteAtiva] = useState<number | null>(null);
  const [focoPendente, definirFocoPendente] = useState<number | null>(null);
  const campos = useRef<(HTMLElement | null)[]>([]);
  const jaFocou = useRef(false);

  const valores = valoresEmAndamentoDaDivisao(valor, linhas);
  const restante = restanteDaDivisao(valor, linhas);
  const erros = errosDasPartes(linhas, saida);

  // Ao abrir, o foco vai ao primeiro campo vazio (a categoria da primeira parte sem ela).
  useEffect(() => {
    if (jaFocou.current) return;
    jaFocou.current = true;
    const vazia = saida ? erros.findIndex((erro) => erro.categoria !== undefined) : -1;
    campos.current[vazia === -1 ? 0 : vazia]?.focus();
  });

  // Depois de adicionar ou duplicar, o foco vai à parte nova.
  useEffect(() => {
    if (focoPendente === null) return;
    campos.current[focoPendente]?.focus();
    definirFocoPendente(null);
  }, [focoPendente, linhas.length]);

  function mudar(posicao: number, mudanca: Partial<LinhaDaDivisao>): void {
    aoMudarLinhas(linhas.map((linha, i) => (i === posicao ? { ...linha, ...mudanca } : linha)));
  }

  function visitar(posicao: number, campo: keyof ErrosDaParte): void {
    definirVisitados((atuais) => new Set(atuais).add(`${posicao}:${campo}`));
  }

  function errosVisiveis(posicao: number): ErrosDaParte {
    const dela = erros[posicao] ?? {};
    return Object.fromEntries(
      Object.entries(dela).filter(([campo]) => visitados.has(`${posicao}:${campo}`)),
    ) as ErrosDaParte;
  }

  function adicionar(): void {
    aoMudarLinhas([...linhas, { categoria: "", tags: "", percentual: "" }]);
    definirFocoPendente(linhas.length);
  }

  function duplicar(posicao: number): void {
    // A cópia vem sem valor: a pessoa o escolhe (ou usa "Completar com o restante").
    const copia = { ...linhas[posicao], percentual: "", modo: "percentual" as const, reais: undefined };
    aoMudarLinhas([...linhas.slice(0, posicao + 1), copia, ...linhas.slice(posicao + 1)]);
    definirVisitados(new Set());
    definirFocoPendente(posicao + 1);
  }

  function remover(posicao: number): void {
    aoMudarLinhas(linhas.filter((_, i) => i !== posicao));
    definirVisitados(new Set());
    definirParteAtiva(null);
    definirFocoPendente(Math.max(0, posicao - 1));
  }

  function completar(): void {
    const alvo = parteAtiva !== null && parteAtiva < linhas.length ? parteAtiva : linhas.length - 1;
    aoMudarLinhas([...completarComORestante(linhas, alvo)]);
  }

  return (
    <div className={estilos.editor} role="group" aria-labelledby={idDoTitulo}>
      <Titulo nivel="cartao" como="h4" id={idDoTitulo} className={estilos.titulo}>
        Dividir em partes
      </Titulo>
      <div className={estilos.partes}>
        {linhas.map((linha, posicao) => (
          <LinhaDaParte
            key={posicao}
            posicao={posicao}
            linha={linha}
            saida={saida}
            total={valor}
            categorias={categorias}
            investimentos={investimentos}
            valorDaParte={valores[posicao] ?? null}
            erros={errosVisiveis(posicao)}
            podeRemover={linhas.length > MINIMO_DE_PARTES}
            podeDuplicar={linhas.length < MAXIMO_DE_PARTES}
            ativa={parteAtiva === posicao}
            aoMudar={(mudanca) => mudar(posicao, mudanca)}
            aoRemover={() => remover(posicao)}
            aoDuplicar={() => duplicar(posicao)}
            aoSairDoCampo={(campo) => visitar(posicao, campo)}
            aoFocar={() => definirParteAtiva(posicao)}
            registrarFoco={(elemento) => {
              campos.current[posicao] = elemento;
            }}
          />
        ))}
      </div>
      <RodapeDaDivisao
        linhas={linhas}
        saida={saida}
        total={valor}
        restante={restante}
        valores={valores}
        podeAdicionar={linhas.length < MAXIMO_DE_PARTES}
        aoAdicionar={adicionar}
        aoDividirIgualmente={() => aoMudarLinhas(dividirIgualmente(linhas))}
        aoCompletar={completar}
      />
      <div className={estilos.acoesDaDivisao}>
        <div className={estilos.saidas}>
          {acoesSecundarias}
          <Botao variante="terciario" onClick={aoNaoDividir}>
            Não dividir
          </Botao>
          <Botao variante="terciario" onClick={aoCancelar}>
            Cancelar
          </Botao>
        </div>
        <Botao
          variante="primario"
          data-principal="true"
          disabled={!podeSalvar || salvando}
          aria-label={nomeDoSalvar}
          onClick={aoSalvar}
        >
          {salvando ? "Salvando…" : "Salvar divisão"}
        </Botao>
      </div>
    </div>
  );
}
