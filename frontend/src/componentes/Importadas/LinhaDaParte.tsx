import { useId } from "react";

import type { Categoria, Investimento } from "../../api/tipos";
import { corDaCategoria } from "../../categorias/cores";
import { deMascara, formatar, interpretarDigitacao } from "../../dinheiro/dinheiro";
import {
  ehAporte,
  type ErrosDaParte,
  type LinhaDaDivisao,
  percentualDoValor,
} from "../../transacoes/divisao";
import { ControleSegmentado } from "../ControleSegmentado/ControleSegmentado";
import { EditorDeDestinacoes, LINHA_INICIAL } from "../Investimentos/EditorDeDestinacoes";
import { MenuDeAcoes } from "../MenuDeAcoes/MenuDeAcoes";
import { SeletorDoTema } from "../SeletorDoTema/SeletorDoTema";
import estilos from "./EditorDeDivisao.module.css";

type Propriedades = {
  posicao: number;
  linha: LinhaDaDivisao;
  /** Na saída cada parte tem tipo (gasto ou aporte) e categoria; na entrada nenhum dos dois. */
  saida: boolean;
  /** O valor da transação inteira, base da conversão de reais em porcentagem. */
  total: string;
  categorias: readonly Categoria[] | undefined;
  investimentos?: readonly Investimento[];
  /** O valor desta parte; nulo enquanto o percentual não vale. */
  valorDaParte: string | null;
  /** Só os erros que já podem aparecer (campo visitado ou salvamento tentado). */
  erros: ErrosDaParte;
  podeRemover: boolean;
  podeDuplicar: boolean;
  ativa: boolean;
  aoMudar: (mudanca: Partial<LinhaDaDivisao>) => void;
  aoRemover: () => void;
  aoDuplicar: () => void;
  aoSairDoCampo: (campo: keyof ErrosDaParte) => void;
  aoFocar: () => void;
  /** Entrega o primeiro campo da parte, para o editor levar o foco até ele. */
  registrarFoco: (elemento: HTMLElement | null) => void;
};

const TIPOS = [
  { valor: "gasto", rotulo: "Gasto" },
  { valor: "aporte", rotulo: "Aporte" },
] as const;

const UNIDADES = [
  { valor: "percentual", rotulo: "%", nomeAcessivel: "Porcentagem" },
  { valor: "reais", rotulo: "R$", nomeAcessivel: "Reais" },
] as const;

/**
 * Uma parte da divisão em uma linha de grade fixa, igual para todos os tipos: número, tipo,
 * categoria, valor e o menu "⋯"; embaixo, recuada, a linha do que é próprio do tipo (tags no gasto,
 * investimento e destinações no aporte).
 */
export function LinhaDaParte({
  posicao,
  linha,
  saida,
  total,
  categorias,
  investimentos,
  valorDaParte,
  erros,
  podeRemover,
  podeDuplicar,
  ativa,
  aoMudar,
  aoRemover,
  aoDuplicar,
  aoSairDoCampo,
  aoFocar,
  registrarFoco,
}: Propriedades) {
  const id = useId();
  const numero = posicao + 1;
  const aporte = ehAporte(linha, saida);
  const modo = linha.modo ?? "percentual";
  const opcoesDeCategoria = (categorias ?? [])
    .filter((categoria) => !categoria.legada)
    .map((categoria) => ({
      valor: categoria.codigo,
      rotulo: categoria.nome,
      cor: corDaCategoria(categoria.codigo),
    }));
  const percentualLido = Number(linha.percentual);
  const equivalente =
    modo === "percentual"
      ? valorDaParte === null
        ? null
        : `equivale a ${formatar(valorDaParte)}`
      : `equivale a ${Number.isInteger(percentualLido) && percentualLido > 0 ? `${percentualLido}%` : "–"}${
          valorDaParte === null ? "" : `, ${formatar(valorDaParte)}`
        }`;

  function trocarUnidade(novo: "percentual" | "reais"): void {
    if (novo === "reais") {
      const digitos = (valorDaParte ?? "").replace(/\D/g, "");
      aoMudar({ modo: "reais", reais: interpretarDigitacao(digitos) });
    } else {
      aoMudar({ modo: "percentual", reais: undefined });
    }
  }

  function digitarReais(texto: string): void {
    const mascara = interpretarDigitacao(texto);
    const percentual = percentualDoValor(deMascara(mascara), total);
    aoMudar({ reais: mascara, percentual: percentual === null ? "" : String(percentual) });
  }

  const idDoErroDaCategoria = `${id}-categoria`;
  const idDoErroDoValor = `${id}-valor`;
  const idDoErroDasTags = `${id}-tags`;

  return (
    <div
      className={estilos.parte}
      role="group"
      aria-label={`Parte ${numero}`}
      data-parte={numero}
      data-ativa={ativa ? "" : undefined}
      data-sem-tipo={saida ? undefined : ""}
      onFocusCapture={aoFocar}
    >
      <span className={estilos.numero} aria-hidden="true">
        {numero}
      </span>

      {saida && (
        <div className={estilos.tipo}>
          <ControleSegmentado
            nome={`Tipo da parte ${numero}`}
            opcoes={TIPOS}
            valor={aporte ? "aporte" : "gasto"}
            aoMudar={(tipo) =>
              aoMudar({
                como_investimento: tipo === "aporte",
                destinacoes: linha.destinacoes ?? [{ ...LINHA_INICIAL }],
              })
            }
          />
        </div>
      )}

      {saida && !aporte && (
        <div className={estilos.categoria}>
          <SeletorDoTema
            ref={registrarFoco}
            rotulo={`Categoria da parte ${numero}`}
            valor={linha.categoria}
            opcoes={opcoesDeCategoria}
            vazio={aporte ? "Nenhuma: só Liberdade financeira" : "Categoria…"}
            aoMudar={(categoria) => aoMudar({ categoria })}
            aoSair={() => aoSairDoCampo("categoria")}
            erro={erros.categoria}
            idDoErro={idDoErroDaCategoria}
          />
        </div>
      )}

      <div className={estilos.valor}>
        <div className={estilos.campoDeValor} data-invalido={erros.percentual ? "" : undefined}>
          <ControleSegmentado
            compacto
            nome={`Unidade da parte ${numero}`}
            opcoes={UNIDADES}
            valor={modo}
            aoMudar={trocarUnidade}
          />
          {modo === "percentual" ? (
            <input
              ref={saida ? undefined : registrarFoco}
              className={estilos.entradaDeValor}
              aria-label={`Percentual da parte ${numero}`}
              aria-invalid={erros.percentual ? true : undefined}
              aria-describedby={erros.percentual ? idDoErroDoValor : undefined}
              inputMode="numeric"
              value={linha.percentual}
              onChange={(evento) => aoMudar({ percentual: evento.target.value })}
              onBlur={() => aoSairDoCampo("percentual")}
            />
          ) : (
            <input
              ref={saida ? undefined : registrarFoco}
              className={estilos.entradaDeValor}
              aria-label={`Valor da parte ${numero} em reais`}
              aria-invalid={erros.percentual ? true : undefined}
              aria-describedby={erros.percentual ? idDoErroDoValor : undefined}
              inputMode="numeric"
              value={linha.reais ?? ""}
              onChange={(evento) => digitarReais(evento.target.value)}
              onBlur={() => aoSairDoCampo("percentual")}
            />
          )}
        </div>
        {erros.percentual ? (
          <p id={idDoErroDoValor} className={estilos.erro}>
            {erros.percentual}
          </p>
        ) : (
          equivalente !== null && (
            <p className={estilos.equivalente} data-equivalente="">
              {equivalente}
            </p>
          )
        )}
      </div>

      <div className={estilos.menu}>
        <MenuDeAcoes
          rotulo={`Mais ações da parte ${numero}`}
          itens={[
            { rotulo: "Duplicar", nomeAcessivel: `Duplicar a parte ${numero}`, desabilitado: !podeDuplicar, aoEscolher: aoDuplicar },
            {
              rotulo: "Remover parte",
              nomeAcessivel: `Remover a parte ${numero}`,
              desabilitado: !podeRemover,
              aoEscolher: aoRemover,
            },
          ]}
        />
      </div>

      <div className={estilos.detalhe}>
        {aporte ? (
          <EditorDeDestinacoes
            semMoldura
            legenda={`Para onde vai a parte ${numero}`}
            investimentos={investimentos}
            investimentoId={linha.investimentoId ?? ""}
            aoMudarInvestimento={(investimentoId) => aoMudar({ investimentoId })}
            linhas={linha.destinacoes ?? []}
            aoMudarLinhas={(destinacoes) => aoMudar({ destinacoes })}
            valor={valorDaParte ?? undefined}
          />
        ) : (
          <div className={estilos.campoDeTags}>
            <input
              className={estilos.entradaDeTags}
              aria-label={`Tags da parte ${numero}, separadas por vírgula`}
              aria-invalid={erros.tags ? true : undefined}
              aria-describedby={erros.tags ? idDoErroDasTags : undefined}
              placeholder="tags (opcional)"
              value={linha.tags}
              onChange={(evento) => aoMudar({ tags: evento.target.value })}
              onBlur={() => aoSairDoCampo("tags")}
            />
            {erros.tags && (
              <p id={idDoErroDasTags} className={estilos.erro}>
                {erros.tags}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
