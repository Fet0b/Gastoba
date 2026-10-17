import { type FormEvent, useEffect, useId, useRef, useState } from "react";

import { useAlterarRecorrencia } from "../../api/consultas";
import type { Categoria, Recorrencia } from "../../api/tipos";
import { aparar, normalizarTag } from "../../tags/tags";
import { CampoDeTags } from "../Compositor/CampoDeTags";
import { CampoDeValor } from "../Compositor/CampoDeValor";
import { MENSAGEM_TAG_PENDENTE } from "../Compositor/CompositorDeGasto";
import { SeletorDeCategoria } from "../Compositor/SeletorDeCategoria";
import { errosDaApi, lerDiaDoMes } from "./FormularioDeRecorrencia";
import estilos from "./Recorrencias.module.css";

type Propriedades = {
  recorrencia: Recorrencia;
  categorias: readonly Categoria[] | undefined;
  sugestoesDeTags: readonly string[];
  /** A recorrência já alterada; quem chama fecha o formulário. */
  aoAlterar: (recorrencia: Recorrencia) => void;
  aoCancelar: () => void;
  /** Toda falha ao salvar (a tela pisca o olho e, sem resposta, avisa). */
  aoFalhar: (erro: unknown) => void;
};

/**
 * Edição na própria linha: valor, descrição, dia do mês, fim e, conforme o tipo,
 * a categoria; mais as tags. Conta, tipo e início não mudam. Vale dos próximos
 * meses em diante: o que já foi gerado continua como está.
 */
export function EdicaoDeRecorrencia({
  recorrencia,
  categorias,
  sugestoesDeTags,
  aoAlterar,
  aoCancelar,
  aoFalhar,
}: Propriedades) {
  const [valor, definirValor] = useState(recorrencia.valor);
  const [descricao, definirDescricao] = useState(recorrencia.descricao);
  const [dia, definirDia] = useState(String(recorrencia.dia_do_mes));
  const [fim, definirFim] = useState(recorrencia.fim ?? "");
  const [categoria, definirCategoria] = useState<string | null>(recorrencia.categoria);
  const [tags, definirTags] = useState<string[]>(recorrencia.tags);
  const [textoDaTag, definirTextoDaTag] = useState("");
  const alterar = useAlterarRecorrencia();
  const id = useId();
  const campoValor = useRef<HTMLInputElement>(null);

  const erros = errosDaApi(alterar.erro);
  const avisarFalha = useRef(aoFalhar);
  useEffect(() => {
    avisarFalha.current = aoFalhar;
  });
  useEffect(() => {
    if (alterar.erro !== null) avisarFalha.current(alterar.erro);
  }, [alterar.erro]);
  useEffect(() => {
    campoValor.current?.focus();
  }, []);

  const gasto = recorrencia.tipo === "gasto";
  const diaLido = lerDiaDoMes(dia);
  const motivos: string[] = [];
  if (valor === "0.00") motivos.push("Informe um valor maior que zero.");
  if (aparar(descricao) === "") motivos.push("Escreva uma descrição.");
  if (diaLido === null) motivos.push("Informe o dia do mês, de 1 a 31.");
  if (fim !== "" && fim < recorrencia.inicio) motivos.push("O fim não pode ser antes do início.");
  if (gasto && categoria === null) motivos.push("Escolha uma categoria.");
  if (normalizarTag(textoDaTag) !== "") motivos.push(MENSAGEM_TAG_PENDENTE);

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (motivos.length > 0 || diaLido === null) return;
    const alterada = await alterar.executar({
      id: recorrencia.id,
      dados: {
        valor,
        descricao: aparar(descricao),
        dia_do_mes: diaLido,
        tags,
        ...(gasto && categoria !== null ? { categoria } : {}),
        ...(fim !== "" ? { fim } : {}),
      },
    });
    if (alterada) aoAlterar(alterada);
  }

  const idDescricao = `${id}-descricao`;
  const idDia = `${id}-dia`;
  const idFim = `${id}-fim`;
  const idMotivos = `${id}-motivos`;
  const idErro = (campo: string) => `${id}-erro-${campo}`;

  return (
    <form
      className={estilos.formulario}
      onSubmit={enviar}
      noValidate
      aria-label={`Alterar a recorrência ${recorrencia.descricao}`}
      aria-busy={alterar.pendente ? true : undefined}
    >
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
        {erros.descricao && (
          <p id={idErro("descricao")} className={estilos.erro}>
            {erros.descricao}
          </p>
        )}
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
            aria-invalid={(dia !== "" && diaLido === null) || erros.dia ? true : undefined}
            aria-describedby={erros.dia ? idErro("dia") : undefined}
          />
          {erros.dia && (
            <p id={idErro("dia")} className={estilos.erro}>
              {erros.dia}
            </p>
          )}
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
          {erros.fim && (
            <p id={idErro("fim")} className={estilos.erro}>
              {erros.fim}
            </p>
          )}
        </div>
      </div>

      {gasto && (
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

      <p className={estilos.dica}>Vale dos próximos meses em diante; o que já foi criado não muda.</p>

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

      <div className={estilos.acoes}>
        <button
          type="submit"
          className={estilos.primario}
          disabled={motivos.length > 0 || alterar.pendente}
          aria-describedby={motivos.length > 0 ? idMotivos : undefined}
        >
          {alterar.pendente ? "Salvando…" : "Salvar alterações"}
        </button>
        <button type="button" className={estilos.secundario} disabled={alterar.pendente} onClick={aoCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
