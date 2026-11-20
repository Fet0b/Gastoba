import { useEffect, useId, useRef, useState, type RefObject } from "react";

import { ErroDaApiCliente } from "../../api/cliente";
import { useCriarDestinacaoCadastrada } from "../../api/consultas";
import type { CorDaDestinacao, DestinacaoCadastrada, IconeDaCaixinha } from "../../api/tipos";
import { ICONE_PADRAO_DA_CAIXINHA } from "../../investimentos/caixinhas";
import { normalizarTag, validarTag } from "../../tags/tags";
import { Botao } from "../Botao/Botao";
import { CampoDeTexto } from "../Campo/CampoDeTexto";
import { Dialogo } from "../Dialogo/Dialogo";
import { DialogoDeConfirmacao } from "../DialogoDeConfirmacao/DialogoDeConfirmacao";
import { EscolhaDaCorDaCaixinha, EscolhaDoIcone } from "./EscolhaDeAparencia";
import estilos from "./Caixinhas.module.css";

type Propriedades = {
  aberto: boolean;
  aoFechar: () => void;
  /** Chamado depois que a API criou a caixinha (o diálogo já pode fechar). */
  aoCriar?: (criada: DestinacaoCadastrada) => void;
  devolverFocoPara?: RefObject<HTMLElement | null>;
};

function mensagemDoErro(erro: unknown): string {
  return erro instanceof ErroDaApiCliente ? erro.mensagem : "Não foi possível salvar. Tente novamente.";
}

/**
 * Criar caixinha: nome, cor e ícone na mesma gravação. Criar não movimenta dinheiro nem cria posição.
 * Fechar com algo digitado pede confirmação antes de descartar.
 */
export function FormularioDeCaixinha({ aberto, aoFechar, aoCriar, devolverFocoPara }: Propriedades) {
  const criacao = useCriarDestinacaoCadastrada();
  const [nome, definirNome] = useState("");
  const [cor, definirCor] = useState<CorDaDestinacao | null>(null);
  const [icone, definirIcone] = useState<IconeDaCaixinha>(ICONE_PADRAO_DA_CAIXINHA);
  const [alterado, definirAlterado] = useState(false);
  const [erroLocal, definirErroLocal] = useState<string | null>(null);
  const [perguntarDescarte, definirPerguntarDescarte] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const idDoFormulario = useId();

  useEffect(() => {
    if (aberto) return;
    definirNome("");
    definirCor(null);
    definirIcone(ICONE_PADRAO_DA_CAIXINHA);
    definirAlterado(false);
    definirErroLocal(null);
    definirPerguntarDescarte(false);
  }, [aberto]);

  function pedirParaFechar(): void {
    if (alterado) definirPerguntarDescarte(true);
    else aoFechar();
  }

  async function salvar(): Promise<void> {
    const normalizado = normalizarTag(nome);
    const erro = validarTag(normalizado);
    if (erro) {
      definirErroLocal(erro);
      return;
    }
    definirErroLocal(null);
    const resultado = await criacao.executar({
      nome: normalizado,
      ...(cor !== null ? { cor } : {}),
      ...(icone !== ICONE_PADRAO_DA_CAIXINHA ? { icone } : {}),
    });
    if (resultado) {
      aoCriar?.(resultado);
      aoFechar();
    }
  }

  const erroDaCriacao = criacao.erro ? mensagemDoErro(criacao.erro) : null;

  return (
    <>
      <Dialogo
        aberto={aberto && !perguntarDescarte}
        aoFechar={pedirParaFechar}
        titulo="Criar caixinha"
        className={estilos.dialogo}
        focoInicial={campo}
        devolverFocoPara={devolverFocoPara}
        bloqueado={criacao.pendente}
        rodape={
          <>
            <Botao variante="secundario" onClick={pedirParaFechar} disabled={criacao.pendente}>Cancelar</Botao>
            <Botao variante="primario" type="submit" form={idDoFormulario} disabled={criacao.pendente}>Salvar caixinha</Botao>
          </>
        }
      >
        <p className={estilos.introducao}>
          Uma caixinha é um nome para organizar investimentos que você já tem. Criar uma não movimenta dinheiro nem cria uma posição.
        </p>
        <form id={idDoFormulario} className={estilos.formulario} onSubmit={(evento) => { evento.preventDefault(); void salvar(); }}>
          <CampoDeTexto
            ref={campo}
            rotulo="Nome"
            valor={nome}
            aoMudar={(valor) => { definirNome(valor); definirAlterado(true); definirErroLocal(null); }}
            ajuda="Use de 1 a 30 caracteres."
            erro={erroLocal ?? erroDaCriacao ?? undefined}
            maxLength={200}
            autoComplete="off"
          />
          <EscolhaDoIcone valor={icone} aoMudar={(valor) => { definirIcone(valor); definirAlterado(true); }} desabilitado={criacao.pendente} />
          <EscolhaDaCorDaCaixinha valor={cor} aoMudar={(valor) => { definirCor(valor); definirAlterado(true); }} desabilitado={criacao.pendente} />
        </form>
      </Dialogo>
      <DialogoDeConfirmacao
        aberto={aberto && perguntarDescarte}
        titulo="Descartar formulário?"
        descricao="As alterações deste formulário serão descartadas."
        rotuloDaAcao="Descartar"
        aoCancelar={() => definirPerguntarDescarte(false)}
        aoConfirmar={() => { definirPerguntarDescarte(false); aoFechar(); }}
        devolverFocoPara={devolverFocoPara}
      />
    </>
  );
}
