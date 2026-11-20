import { useId, useState } from "react";

import type { AceiteDaTransacao, Categoria, Investimento } from "../../api/tipos";
import {
  destinacoesParaEnvio,
  type LinhaDeDestinacao,
  motivoDasDestinacoes,
} from "../../investimentos/destinacoes";
import { normalizarTag } from "../../tags/tags";
import { CampoDeTags } from "../Compositor/CampoDeTags";
import { MENSAGEM_TAG_PENDENTE } from "../Compositor/CompositorDeGasto";
import { SeletorDeCategoria } from "../Compositor/SeletorDeCategoria";
import { EditorDeDestinacoes, LINHA_INICIAL } from "../Investimentos/EditorDeDestinacoes";
import { MENSAGEM_ESCOLHA_A_CATEGORIA } from "./CartaoDeImportada";
import { Botao } from "../Botao/Botao";
import estilos from "./Importadas.module.css";

type Propriedades = {
  quantidade: number;
  categorias: readonly Categoria[] | undefined;
  sugestoesDeTags: readonly string[];
  investimentos: readonly Investimento[] | undefined;
  pendente: boolean;
  erro: string | null;
  /** Aceita todas as selecionadas com estes dados (a mesma categoria e as mesmas tags). */
  aoAceitar: (dados: AceiteDaTransacao) => void;
  aoLimpar: () => void;
};

/**
 * O que vale para todas as saídas marcadas: a categoria e as tags (ou "aporte em investimento",
 * pelo botão ou pela categoria "Investimentos", com a divisão em destinações). Um clique aceita
 * todas, em vez de uma por uma; é tudo ou nada.
 */
export function PainelDoLote({
  quantidade,
  categorias,
  sugestoesDeTags,
  investimentos,
  pendente,
  erro,
  aoAceitar,
  aoLimpar,
}: Propriedades) {
  const id = useId();
  const [categoria, definirCategoria] = useState<string | null>(null);
  const [tags, definirTags] = useState<string[]>([]);
  const [textoDaTag, definirTextoDaTag] = useState("");
  const [tagsAbertas, definirTagsAbertas] = useState(false);
  const [comoInvestimento, definirComoInvestimento] = useState(false);
  const [investimentoId, definirInvestimentoId] = useState("");
  const [linhas, definirLinhas] = useState<LinhaDeDestinacao[]>([{ ...LINHA_INICIAL }]);

  const motivos: string[] = [];
  if (comoInvestimento) {
    const motivo = investimentoId === "" ? null : motivoDasDestinacoes(linhas);
    if (motivo !== null) motivos.push(motivo);
  } else {
    if (categoria === null) motivos.push(MENSAGEM_ESCOLHA_A_CATEGORIA);
    if (normalizarTag(textoDaTag) !== "") motivos.push(MENSAGEM_TAG_PENDENTE);
  }
  const rotuloDaAcao = comoInvestimento
    ? `Aceitar ${quantidade} como ${quantidade === 1 ? "aporte" : "aportes"}`
    : `Aceitar ${quantidade} como ${quantidade === 1 ? "gasto" : "gastos"}`;
  const idMotivos = `${id}-motivos`;

  function aceitar(): void {
    if (motivos.length > 0 || pendente) return;
    if (comoInvestimento) {
      aoAceitar({
        como_investimento: true,
        tags: [],
        ...(investimentoId === ""
          ? {}
          : { investimento_id: investimentoId, destinacoes: destinacoesParaEnvio(linhas) }),
      });
    } else {
      aoAceitar({ categoria: categoria as string, tags });
    }
  }

  return (
    <section className={estilos.painelDoLote} aria-label="Aceitar em lote">
      <p className={estilos.tituloDoLote} role="status">
        {quantidade === 1 ? "1 saída selecionada" : `${quantidade} saídas selecionadas`}
      </p>
      {!comoInvestimento && <SeletorDeCategoria categorias={categorias} valor={categoria} aoMudar={definirCategoria}/>}
      {comoInvestimento ? (
        <EditorDeDestinacoes
          investimentos={investimentos}
          investimentoId={investimentoId}
          aoMudarInvestimento={definirInvestimentoId}
          linhas={linhas}
          aoMudarLinhas={definirLinhas}
        />
      ) : tagsAbertas ? (
        <CampoDeTags
          tags={tags}
          aoMudar={definirTags}
          aoMudarTexto={definirTextoDaTag}
          sugestoes={sugestoesDeTags}
        />
      ) : (
        <Botao variante="terciario"

          onClick={() => definirTagsAbertas(true)}
        >
          Adicionar tags a todas
        </Botao>
      )}
      <Botao variante="secundario"

        aria-pressed={comoInvestimento}
        onClick={() => definirComoInvestimento(!comoInvestimento)}
      >
        {comoInvestimento ? "Voltar para gasto" : "Aporte em investimento"}
      </Botao>
      {erro && (
        <p role="alert" className={estilos.erro}>
          {erro}
        </p>
      )}
      {motivos.length > 0 && (
        <ul id={idMotivos} className={estilos.motivos}>
          {motivos.map((motivo) => (
            <li key={motivo}>{motivo}</li>
          ))}
        </ul>
      )}
      <div className={estilos.acoes}>
        <Botao variante="primario"

          disabled={motivos.length > 0 || pendente}
          aria-describedby={motivos.length > 0 ? idMotivos : undefined}
          onClick={aceitar}
        >
          {pendente ? "Aceitando…" : rotuloDaAcao}
        </Botao>
        <Botao variante="secundario" disabled={pendente} onClick={aoLimpar}>
          Limpar seleção
        </Botao>
      </div>
    </section>
  );
}
