import { type FormEvent, useEffect, useId, useRef, useState } from "react";

import { ErroDaApiCliente } from "../../api/cliente";
import { useCriarChaveDeApi } from "../../api/consultas";
import type { ChaveDeApiCriada, EscopoDaChave } from "../../api/tipos";
import estilos from "./Chaves.module.css";

type Propriedades = {
  /** A chave criada, com o segredo: quem recebe o mostra uma vez e o descarta. */
  aoCriar: (criada: ChaveDeApiCriada) => void;
  /** Toda falha ao criar (a página pisca o olho e avisa quando não há resposta). */
  aoFalhar: (erro: unknown) => void;
};

export const ESCOPOS: readonly { escopo: EscopoDaChave; nome: string; explicacao: string }[] = [
  {
    escopo: "leitura",
    nome: "Leitura",
    explicacao: "Só consulta: contas, gastos, tags e categorias.",
  },
  {
    escopo: "escrita",
    nome: "Escrita",
    explicacao: "Consulta e também cria contas e registra gastos.",
  },
];

type ErrosDoFormulario = { nome?: string; escopo?: string; geral?: string };

/** Onde mostrar o erro da API; sem resposta do servidor fica com o aviso da página. */
function errosDoFormulario(erro: unknown): ErrosDoFormulario {
  if (!(erro instanceof ErroDaApiCliente) || erro.codigo === "sem_resposta") return {};
  switch (erro.codigo) {
    case "nome_de_chave_invalido":
      return { nome: erro.mensagem };
    case "requisicao_invalida": {
      const erros: ErrosDoFormulario = {};
      for (const { campo, mensagem } of erro.detalhes ?? []) {
        if (campo === "body.nome") erros.nome ??= mensagem;
        else if (campo === "body.escopo") erros.escopo ??= mensagem;
      }
      return erros.nome || erros.escopo ? erros : { geral: erro.mensagem };
    }
    default:
      return { geral: erro.mensagem };
  }
}

/**
 * Formulário de nova chave de API: nome e escopo (leitura ou escrita, cada um
 * com a explicação). Sem expiração: a chave vale até ser revogada. Erros da
 * API aparecem junto ao campo, com o foco levado até ele.
 */
export function FormularioDeChave({ aoCriar, aoFalhar }: Propriedades) {
  const [nome, definirNome] = useState("");
  const [escopo, definirEscopo] = useState<EscopoDaChave>("leitura");
  const criar = useCriarChaveDeApi();
  const id = useId();
  const campoNome = useRef<HTMLInputElement>(null);

  const erros = errosDoFormulario(criar.erro);

  // A função mais recente numa ref: cada erro novo avisa uma vez só.
  const avisarFalha = useRef(aoFalhar);
  useEffect(() => {
    avisarFalha.current = aoFalhar;
  });
  useEffect(() => {
    if (criar.erro === null) return;
    avisarFalha.current(criar.erro);
    if (errosDoFormulario(criar.erro).nome) campoNome.current?.focus();
  }, [criar.erro]);

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    const criada = await criar.executar({ nome, escopo });
    if (!criada) return;
    definirNome("");
    definirEscopo("leitura");
    aoCriar(criada);
  }

  const idNome = `${id}-nome`;
  const idDicaNome = `${id}-dica-nome`;
  const idErroNome = `${id}-erro-nome`;
  const idErroEscopo = `${id}-erro-escopo`;
  const idTitulo = `${id}-titulo`;

  return (
    <form className={estilos.formulario} onSubmit={enviar} aria-labelledby={idTitulo} noValidate>
      <h2 id={idTitulo} className={estilos.subtitulo}>
        Nova chave
      </h2>

      <div className={estilos.campo}>
        <label htmlFor={idNome}>Nome da chave</label>
        <input
          ref={campoNome}
          id={idNome}
          className={estilos.entrada}
          value={nome}
          onChange={(evento) => definirNome(evento.target.value)}
          autoComplete="off"
          aria-invalid={erros.nome ? true : undefined}
          aria-describedby={erros.nome ? `${idErroNome} ${idDicaNome}` : idDicaNome}
        />
        <p id={idDicaNome} className={estilos.dica}>
          Para lembrar onde ela é usada (ex.: planilha, script de backup).
        </p>
        {erros.nome && (
          <p id={idErroNome} className={estilos.erroDoCampo}>
            {erros.nome}
          </p>
        )}
      </div>

      <fieldset
        className={estilos.escopos}
        aria-describedby={erros.escopo ? idErroEscopo : undefined}
      >
        <legend>Escopo</legend>
        {ESCOPOS.map((opcao) => {
          const idOpcao = `${id}-escopo-${opcao.escopo}`;
          const idExplicacao = `${idOpcao}-explicacao`;
          return (
            <div key={opcao.escopo} className={estilos.opcao}>
              <input
                id={idOpcao}
                type="radio"
                name={`${id}-escopo`}
                value={opcao.escopo}
                checked={escopo === opcao.escopo}
                onChange={() => definirEscopo(opcao.escopo)}
                aria-describedby={idExplicacao}
              />
              <label htmlFor={idOpcao}>{opcao.nome}</label>
              <p id={idExplicacao} className={estilos.dica}>
                {opcao.explicacao}
              </p>
            </div>
          );
        })}
        {erros.escopo && (
          <p id={idErroEscopo} className={estilos.erroDoCampo}>
            {erros.escopo}
          </p>
        )}
      </fieldset>

      {/* Sem campo ao qual ligar a mensagem: o alerta a anuncia. */}
      {erros.geral && (
        <p role="alert" className={estilos.erroDoCampo}>
          {erros.geral}
        </p>
      )}

      <button type="submit" className={estilos.primario} disabled={criar.pendente}>
        Criar chave
      </button>
    </form>
  );
}
