import { type FormEvent, useEffect, useId, useRef, useState } from "react";

import { ErroDaApiCliente } from "../../api/cliente";
import { useCriarChaveDeApi } from "../../api/consultas";
import type { ChaveDeApiCriada, EscopoDaChave } from "../../api/tipos";
import { Botao } from "../Botao/Botao";
import { Titulo } from "../Titulo/Titulo";
import { CampoDeTexto } from "../Campo/CampoDeTexto";
import { GrupoDeOpcoes } from "../Campo/GrupoDeOpcoes";
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

  const idErroEscopo = `${id}-erro-escopo`;
  const idTitulo = `${id}-titulo`;

  return (
    <form className={estilos.formulario} onSubmit={enviar} aria-labelledby={idTitulo} noValidate>
      <Titulo nivel="secao" como="h2" id={idTitulo} className={estilos.subtitulo}>
        Nova chave
      </Titulo>

      <CampoDeTexto
        ref={campoNome}
        rotulo="Nome da chave"
        valor={nome}
        aoMudar={definirNome}
        autoComplete="off"
        ajuda="Para lembrar onde ela é usada (ex.: planilha, script de backup)."
        erro={erros.nome}
      />

      <GrupoDeOpcoes
        legenda="Escopo"
        valor={escopo}
        aoMudar={(valor) => definirEscopo(valor as EscopoDaChave)}
        opcoes={ESCOPOS.map((opcao) => ({ valor: opcao.escopo, titulo: opcao.nome, descricao: opcao.explicacao }))}
        variante="cartao"
      />
      {erros.escopo && (
        <p id={idErroEscopo} role="alert" className={estilos.erroDoCampo}>
          {erros.escopo}
        </p>
      )}

      {/* Sem campo ao qual ligar a mensagem: o alerta a anuncia. */}
      {erros.geral && (
        <p role="alert" className={estilos.erroDoCampo}>
          {erros.geral}
        </p>
      )}

      <Botao type="submit" variante="primario" disabled={criar.pendente}>
        Criar chave
      </Botao>
    </form>
  );
}
