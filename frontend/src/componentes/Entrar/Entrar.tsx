import { CampoDeTexto } from "../Campo/CampoDeTexto";
import { Titulo } from "../Titulo/Titulo";
import { type FormEvent, useId, useRef, useState } from "react";

import { ErroDaApiCliente, MENSAGEM_SEM_RESPOSTA } from "../../api/cliente";
import type { Credenciais } from "../../api/sessao";
import { Olho } from "../Olho/Olho";
import { useEstadoDoOlho } from "../Olho/useEstadoDoOlho";
import { Botao } from "../Botao/Botao";
import estilos from "./Entrar.module.css";

type Propriedades = {
  /** Entra com as credenciais; lança o ErroDaApiCliente se não conseguir. */
  aoEntrar: (credenciais: Credenciais) => Promise<unknown>;
  /** Aviso vindo da sessão (ex.: "Sua sessão terminou. Entre de novo."). */
  aviso: string | null;
  /** Leva à tela de criar conta; sem ela, o botão "Criar conta" não aparece. */
  aoCriarConta?: () => void;
};

type ErrosDeEntrar = { email?: string; senha?: string; geral?: string };

function esperaEmTexto(segundos: number): string {
  return `${segundos} ${segundos === 1 ? "segundo" : "segundos"}`;
}

/** Onde mostrar o erro: junto ao e-mail, junto à senha ou no formulário. */
function errosDeEntrar(erro: unknown): ErrosDeEntrar {
  if (erro === null) return {};
  if (!(erro instanceof ErroDaApiCliente) || erro.codigo === "sem_resposta") {
    return { geral: MENSAGEM_SEM_RESPOSTA };
  }
  switch (erro.codigo) {
    case "muitas_tentativas":
      return {
        geral:
          erro.esperarSegundos === undefined
            ? erro.mensagem
            : `Muitas tentativas. Tente de novo em ${esperaEmTexto(erro.esperarSegundos)}.`,
      };
    case "requisicao_invalida": {
      const erros: ErrosDeEntrar = {};
      for (const { campo, mensagem } of erro.detalhes ?? []) {
        if (campo === "body.email") erros.email ??= mensagem;
        else if (campo === "body.senha") erros.senha ??= mensagem;
      }
      return erros.email || erros.senha ? erros : { geral: erro.mensagem };
    }
    default:
      return { geral: erro.mensagem };
  }
}

/**
 * Tela de entrar: e-mail e senha. A senha não fica no estado do React (o campo
 * não é controlado): é lida só no envio e apagada depois de uma tentativa que
 * falha. O erro da API aparece junto ao campo ou numa região `aria-live`
 * ligada ao formulário; o botão fica desabilitado enquanto envia.
 */
export function Entrar({ aoEntrar, aviso, aoCriarConta }: Propriedades) {
  const [email, definirEmail] = useState("");
  const [enviando, definirEnviando] = useState(false);
  const [erro, definirErro] = useState<unknown>(null);
  const [estadoDoOlho, sinalizarOlho] = useEstadoDoOlho();
  const emAndamento = useRef(false);
  const campoEmail = useRef<HTMLInputElement>(null);
  const campoSenha = useRef<HTMLInputElement>(null);
  const id = useId();

  const erros = errosDeEntrar(erro);

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (emAndamento.current) return;
    emAndamento.current = true;
    definirEnviando(true);
    definirErro(null);
    try {
      await aoEntrar({ email, senha: campoSenha.current?.value ?? "" });
    } catch (falha) {
      definirErro(falha);
      sinalizarOlho("erro");
      if (campoSenha.current) campoSenha.current.value = "";
      // O foco vai ao campo a corrigir: o e-mail, se o erro é dele; senão a senha.
      if (errosDeEntrar(falha).email) campoEmail.current?.focus();
      else campoSenha.current?.focus();
    } finally {
      emAndamento.current = false;
      definirEnviando(false);
    }
  }

  const idEmail = `${id}-email`;
  const idSenha = `${id}-senha`;
  const idErroGeral = `${id}-erro`;
  const idTitulo = `${id}-titulo`;

  return (
    <main className={estilos.pagina}>
      <div className={estilos.cartao}>
        <div className={estilos.marca}>
          <Olho decorativo estado={estadoDoOlho} className={estilos.olho} />
          <Titulo nivel="pagina" como="h1" id={idTitulo} className={estilos.nome}>
            Gastoba
          </Titulo>
        </div>
        <p className={estilos.chamada}>Entre para ver para onde vai o seu dinheiro.</p>

        {aviso && (
          <p role="status" className={estilos.aviso}>
            {aviso}
          </p>
        )}

        <form
          className={estilos.formulario}
          onSubmit={enviar}
          aria-label="Entrar no Gastoba"
          aria-describedby={erros.geral ? idErroGeral : undefined}
          noValidate
        >
          <CampoDeTexto rotulo="E-mail" ref={campoEmail} id={idEmail} tipo="email" autoComplete="username" erro={erros.email} valor={email} aoMudar={definirEmail} autoFocus spellCheck={false} />

          <CampoDeTexto rotulo="Senha" ref={campoSenha} id={idSenha} tipo="password" autoComplete="current-password" erro={erros.senha} />

          {/* Sempre montada: uma região criada junto com o texto pode não ser anunciada. */}
          <div id={idErroGeral} className={estilos.erroGeral} aria-live="polite" aria-atomic="true">
            {erros.geral && <p>{erros.geral}</p>}
          </div>

          <Botao variante="primario" type="submit" disabled={enviando}>
            Entrar
          </Botao>
        </form>

        {aoCriarConta && (
          <p className={estilos.alternativa}>
            Ainda não tem conta?{" "}
            <Botao variante="terciario" onClick={aoCriarConta}>
              Criar conta
            </Botao>
          </p>
        )}
      </div>
    </main>
  );
}
