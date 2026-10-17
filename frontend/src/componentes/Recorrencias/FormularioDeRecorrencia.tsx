import { type FormEvent, useEffect, useId, useRef, useState } from "react";

import { ErroDaApiCliente, MENSAGEM_SEM_RESPOSTA } from "../../api/cliente";
import { useCriarRecorrencia } from "../../api/consultas";
import type { Categoria, Conta, Recorrencia, TipoDeRecorrencia } from "../../api/tipos";
import { hojeLocal } from "../../periodo/periodo";
import { aparar, normalizarTag } from "../../tags/tags";
import { CampoDeTags } from "../Compositor/CampoDeTags";
import { MENSAGEM_TAG_PENDENTE } from "../Compositor/CompositorDeGasto";
import { CampoDeValor } from "../Compositor/CampoDeValor";
import { SeletorDeCategoria } from "../Compositor/SeletorDeCategoria";
import estilos from "./Recorrencias.module.css";

export const MENSAGEM_SEM_CONTAS_PARA_RECORRENCIA = "Crie uma conta antes de criar uma recorrência.";

type Propriedades = {
  contas: readonly Conta[] | undefined;
  categorias: readonly Categoria[] | undefined;
  /** Tags já usadas (GET /tags), oferecidas enquanto se digita. */
  sugestoesDeTags?: readonly string[];
  aoCriar: (recorrencia: Recorrencia) => void;
  /** Toda falha ao criar (a tela pisca o olho e, sem resposta, avisa). */
  aoFalhar: (erro: unknown) => void;
};

type Campo = "valor" | "descricao" | "dia" | "inicio" | "fim" | "conta" | "categoria" | "tags";
export type Erros = Partial<Record<Campo | "geral", string>>;

const CAMPO_DO_DETALHE: Readonly<Record<string, Campo>> = {
  "body.valor": "valor",
  "body.descricao": "descricao",
  "body.dia_do_mes": "dia",
  "body.inicio": "inicio",
  "body.fim": "fim",
  "body.conta_id": "conta",
  "body.categoria": "categoria",
  "body.tags": "tags",
};

/** Onde mostrar o erro da API: junto ao campo ou no formulário. */
export function errosDaApi(erro: unknown): Erros {
  if (erro === null || erro === undefined) return {};
  if (!(erro instanceof ErroDaApiCliente)) return { geral: MENSAGEM_SEM_RESPOSTA };
  switch (erro.codigo) {
    case "valor_invalido":
      return { valor: erro.mensagem };
    case "descricao_invalida":
      return { descricao: erro.mensagem };
    case "tag_invalida":
      return { tags: erro.mensagem };
    case "conta_nao_encontrada":
      return { conta: erro.mensagem };
    case "requisicao_invalida": {
      const erros: Erros = {};
      for (const { campo, mensagem } of erro.detalhes ?? []) {
        const destino = Object.hasOwn(CAMPO_DO_DETALHE, campo) ? CAMPO_DO_DETALHE[campo] : undefined;
        if (destino) erros[destino] ??= mensagem;
      }
      return Object.keys(erros).length > 0 ? erros : { geral: erro.mensagem };
    }
    default:
      // Inclui `recorrencia_invalida` (dia, categoria, período, limite): a mensagem explica.
      return { geral: erro.mensagem };
  }
}

/** O dia do mês digitado, se for um inteiro de 1 a 31. */
export function lerDiaDoMes(texto: string): number | null {
  if (!/^\d{1,2}$/.test(texto.trim())) return null;
  const dia = Number.parseInt(texto, 10);
  return dia >= 1 && dia <= 31 ? dia : null;
}

/**
 * Formulário de criar uma recorrência: ganho (o salário) ou gasto (os fixos),
 * com valor, descrição, o dia do mês, o período e a conta; o gasto também pede a
 * categoria. O botão fica desabilitado, com a explicação, até estar completo.
 * Criar já gera os meses vencidos desde o início.
 */
export function FormularioDeRecorrencia({
  contas,
  categorias,
  sugestoesDeTags = [],
  aoCriar,
  aoFalhar,
}: Propriedades) {
  const [tipo, definirTipo] = useState<TipoDeRecorrencia>("ganho");
  const [valor, definirValor] = useState("0.00");
  const [descricao, definirDescricao] = useState("");
  const [dia, definirDia] = useState("5");
  const [inicio, definirInicio] = useState(hojeLocal);
  const [fim, definirFim] = useState("");
  const [contaId, definirContaId] = useState("");
  const [categoria, definirCategoria] = useState<string | null>(null);
  const [tags, definirTags] = useState<string[]>([]);
  const [textoDaTag, definirTextoDaTag] = useState("");
  const criar = useCriarRecorrencia();
  const id = useId();
  const campoValor = useRef<HTMLInputElement>(null);

  const contaEscolhida = contas?.some((conta) => conta.id === contaId) ? contaId : (contas?.[0]?.id ?? "");
  const erros = errosDaApi(criar.erro);
  // A falha mais recente vai à tela uma vez só, mesmo que `aoFalhar` mude de identidade.
  const avisarFalha = useRef(aoFalhar);
  useEffect(() => {
    avisarFalha.current = aoFalhar;
  });
  useEffect(() => {
    if (criar.erro !== null) avisarFalha.current(criar.erro);
  }, [criar.erro]);
  const diaLido = lerDiaDoMes(dia);

  const motivos: string[] = [];
  if (contas !== undefined && contas.length === 0) motivos.push(MENSAGEM_SEM_CONTAS_PARA_RECORRENCIA);
  if (valor === "0.00") motivos.push("Informe um valor maior que zero.");
  if (aparar(descricao) === "") motivos.push("Escreva uma descrição.");
  if (diaLido === null) motivos.push("Informe o dia do mês, de 1 a 31.");
  if (inicio === "") motivos.push("Escolha quando começa.");
  if (fim !== "" && inicio !== "" && fim < inicio) motivos.push("O fim não pode ser antes do início.");
  if (tipo === "gasto" && categoria === null) motivos.push("Escolha uma categoria.");
  if (normalizarTag(textoDaTag) !== "") motivos.push(MENSAGEM_TAG_PENDENTE);

  const meses = inicio !== "" && inicio < hojeLocal();

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (motivos.length > 0 || diaLido === null) return;
    const recorrencia = await criar.executar({
      tipo,
      conta_id: contaEscolhida,
      valor,
      descricao: aparar(descricao),
      dia_do_mes: diaLido,
      inicio,
      ...(tipo === "gasto" && categoria !== null ? { categoria } : {}),
      tags,
      ...(fim !== "" ? { fim } : {}),
    });
    if (recorrencia) {
      definirValor("0.00");
      definirDescricao("");
      definirCategoria(null);
      definirTags([]);
      aoCriar(recorrencia);
      campoValor.current?.focus();
    }
  }

  const idDescricao = `${id}-descricao`;
  const idDia = `${id}-dia`;
  const idInicio = `${id}-inicio`;
  const idFim = `${id}-fim`;
  const idConta = `${id}-conta`;
  const idMotivos = `${id}-motivos`;
  const idErro = (campo: Campo) => `${id}-erro-${campo}`;
  const erroDe = (campo: Campo) =>
    erros[campo] ? (
      <p id={idErro(campo)} className={estilos.erro}>
        {erros[campo]}
      </p>
    ) : null;

  return (
    <form
      className={estilos.formulario}
      onSubmit={enviar}
      noValidate
      aria-label="Nova recorrência"
      aria-busy={criar.pendente ? true : undefined}
    >
      <div role="group" aria-label="O que a recorrência registra" className={estilos.tipos}>
        {(["ganho", "gasto"] as const).map((opcao) => (
          <button
            key={opcao}
            type="button"
            className={estilos.tipo}
            aria-pressed={tipo === opcao}
            onClick={() => definirTipo(opcao)}
          >
            {opcao === "ganho" ? "Ganho" : "Gasto"}
          </button>
        ))}
      </div>

      <CampoDeValor
        ref={campoValor}
        rotulo="Valor"
        valor={valor}
        aoMudar={definirValor}
        erro={erros.valor}
      />

      <div className={estilos.campo}>
        <label htmlFor={idDescricao}>Descrição</label>
        <input
          id={idDescricao}
          className={estilos.entrada}
          value={descricao}
          maxLength={200}
          autoComplete="off"
          onChange={(evento) => definirDescricao(evento.target.value)}
          aria-invalid={erros.descricao ? true : undefined}
          aria-describedby={erros.descricao ? idErro("descricao") : undefined}
        />
        {erroDe("descricao")}
      </div>

      <div className={estilos.linha}>
        <div className={estilos.campo}>
          <label htmlFor={idDia}>Dia do mês</label>
          <input
            id={idDia}
            className={estilos.entrada}
            inputMode="numeric"
            autoComplete="off"
            value={dia}
            onChange={(evento) => definirDia(evento.target.value)}
            aria-invalid={dia !== "" && diaLido === null ? true : undefined}
            aria-describedby={erros.dia ? idErro("dia") : undefined}
          />
          {erroDe("dia")}
        </div>
        <div className={estilos.campo}>
          <label htmlFor={idConta}>Conta</label>
          <select
            id={idConta}
            className={estilos.entrada}
            value={contaEscolhida}
            disabled={!contas || contas.length === 0}
            onChange={(evento) => definirContaId(evento.target.value)}
            aria-invalid={erros.conta ? true : undefined}
            aria-describedby={erros.conta ? idErro("conta") : undefined}
          >
            {(contas ?? []).map((conta) => (
              <option key={conta.id} value={conta.id}>
                {conta.nome}
              </option>
            ))}
          </select>
          {erroDe("conta")}
        </div>
      </div>

      <div className={estilos.linha}>
        <div className={estilos.campo}>
          <label htmlFor={idInicio}>Começa em</label>
          <input
            id={idInicio}
            type="date"
            className={estilos.entrada}
            value={inicio}
            onChange={(evento) => definirInicio(evento.target.value)}
            aria-invalid={erros.inicio ? true : undefined}
            aria-describedby={erros.inicio ? idErro("inicio") : undefined}
          />
          {erroDe("inicio")}
        </div>
        <div className={estilos.campo}>
          <label htmlFor={idFim}>Termina em (opcional)</label>
          <input
            id={idFim}
            type="date"
            className={estilos.entrada}
            value={fim}
            onChange={(evento) => definirFim(evento.target.value)}
            aria-invalid={erros.fim ? true : undefined}
            aria-describedby={erros.fim ? idErro("fim") : undefined}
          />
          {erroDe("fim")}
        </div>
      </div>

      {tipo === "gasto" && (
        <SeletorDeCategoria
          categorias={categorias}
          valor={categoria}
          aoMudar={definirCategoria}
          erro={erros.categoria}
        />
      )}

      <CampoDeTags
        tags={tags}
        aoMudar={definirTags}
        aoMudarTexto={definirTextoDaTag}
        sugestoes={sugestoesDeTags}
        erro={erros.tags}
      />

      {meses && (
        <p className={estilos.dica}>
          O início é no passado: os meses já vencidos serão criados agora e a conta será ajustada.
        </p>
      )}

      {erros.geral && (
        <p role="alert" className={estilos.erro}>
          {erros.geral}
        </p>
      )}

      {motivos.length > 0 && (
        <ul id={idMotivos} className={estilos.motivos}>
          {motivos.map((motivo) => (
            <li key={motivo}>{motivo}</li>
          ))}
        </ul>
      )}

      <button
        type="submit"
        className={estilos.primario}
        disabled={motivos.length > 0 || criar.pendente}
        aria-describedby={motivos.length > 0 ? idMotivos : undefined}
      >
        {criar.pendente ? "Criando…" : "Criar recorrência"}
      </button>
    </form>
  );
}
