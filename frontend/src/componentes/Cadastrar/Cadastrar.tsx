import { type FormEvent, useId, useRef, useState } from "react";

import { ErroDaApiCliente, MENSAGEM_SEM_RESPOSTA } from "../../api/cliente";
import type { DadosDeCadastro } from "../../api/sessao";
import estilos from "../Entrar/Entrar.module.css";
import { Olho } from "../Olho/Olho";
import { useEstadoDoOlho } from "../Olho/useEstadoDoOlho";

type Propriedades = {
  /** Cria a conta e já entra; lança o ErroDaApiCliente se não conseguir. */
  aoCadastrar: (dados: DadosDeCadastro) => Promise<unknown>;
  /** Volta à tela de entrar. */
  aoVoltar: () => void;
};

type ErrosDeCadastro = { nome?: string; email?: string; senha?: string; confirmacao?: string; geral?: string };

const MENSAGEM_SENHAS_DIFERENTES = "As senhas não são iguais.";

/** Onde mostrar o erro da API: junto ao campo que a causou ou no formulário. */
function errosDeCadastro(erro: unknown): ErrosDeCadastro {
  if (erro === null) return {};
  if (!(erro instanceof ErroDaApiCliente) || erro.codigo === "sem_resposta") {
    return { geral: MENSAGEM_SEM_RESPOSTA };
  }
  switch (erro.codigo) {
    case "nome_invalido":
      return { nome: erro.mensagem };
    case "email_invalido":
    case "email_ja_cadastrado":
      return { email: erro.mensagem };
    case "senha_invalida":
      return { senha: erro.mensagem };
    case "requisicao_invalida": {
      const erros: ErrosDeCadastro = {};
      for (const { campo, mensagem } of erro.detalhes ?? []) {
        if (campo === "body.nome") erros.nome ??= mensagem;
        else if (campo === "body.email") erros.email ??= mensagem;
        else if (campo === "body.senha") erros.senha ??= mensagem;
      }
      return erros.nome || erros.email || erros.senha ? erros : { geral: erro.mensagem };
    }
    default:
      // Inclui 403 `cadastro_fechado` e 429: a mensagem da API explica.
      return { geral: erro.mensagem };
  }
}

/**
 * Tela de criar conta: nome, e-mail, senha e a confirmação da senha. As senhas
 * não ficam no estado do React (campos não controlados): são lidas só no envio e
 * apagadas se a tentativa falha. A confirmação é conferida aqui, antes de chamar a
 * API; as demais regras (tamanho da senha, e-mail repetido, cadastro fechado) são
 * do backend e a `mensagem` dele é mostrada junto ao campo.
 */
export function Cadastrar({ aoCadastrar, aoVoltar }: Propriedades) {
  const [nome, definirNome] = useState("");
  const [email, definirEmail] = useState("");
  const [enviando, definirEnviando] = useState(false);
  const [erro, definirErro] = useState<unknown>(null);
  const [senhasDiferentes, definirSenhasDiferentes] = useState(false);
  const [estadoDoOlho, sinalizarOlho] = useEstadoDoOlho();
  const emAndamento = useRef(false);
  const campoNome = useRef<HTMLInputElement>(null);
  const campoEmail = useRef<HTMLInputElement>(null);
  const campoSenha = useRef<HTMLInputElement>(null);
  const campoConfirmacao = useRef<HTMLInputElement>(null);
  const id = useId();

  const erros: ErrosDeCadastro = senhasDiferentes
    ? { confirmacao: MENSAGEM_SENHAS_DIFERENTES }
    : errosDeCadastro(erro);

  function limparSenhas(): void {
    if (campoSenha.current) campoSenha.current.value = "";
    if (campoConfirmacao.current) campoConfirmacao.current.value = "";
  }

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (emAndamento.current) return;
    const senha = campoSenha.current?.value ?? "";
    if (senha !== (campoConfirmacao.current?.value ?? "")) {
      definirErro(null);
      definirSenhasDiferentes(true);
      sinalizarOlho("erro");
      campoConfirmacao.current?.focus();
      return;
    }
    emAndamento.current = true;
    definirSenhasDiferentes(false);
    definirEnviando(true);
    definirErro(null);
    try {
      await aoCadastrar({ nome, email, senha });
    } catch (falha) {
      definirErro(falha);
      sinalizarOlho("erro");
      limparSenhas();
      // O foco vai ao primeiro campo a corrigir.
      const falhas = errosDeCadastro(falha);
      if (falhas.nome) campoNome.current?.focus();
      else if (falhas.email) campoEmail.current?.focus();
      else campoSenha.current?.focus();
    } finally {
      emAndamento.current = false;
      definirEnviando(false);
    }
  }

  const idNome = `${id}-nome`;
  const idEmail = `${id}-email`;
  const idSenha = `${id}-senha`;
  const idConfirmacao = `${id}-confirmacao`;
  const idErroNome = `${id}-erro-nome`;
  const idErroEmail = `${id}-erro-email`;
  const idErroSenha = `${id}-erro-senha`;
  const idErroConfirmacao = `${id}-erro-confirmacao`;
  const idErroGeral = `${id}-erro`;

  return (
    <main className={estilos.pagina}>
      <div className={estilos.cartao}>
        <div className={estilos.marca}>
          <Olho decorativo estado={estadoDoOlho} className={estilos.olho} />
          <h1 className={estilos.nome}>Gastoba</h1>
        </div>
        <p className={estilos.chamada}>Crie a sua conta para controlar seus gastos.</p>

        <form
          className={estilos.formulario}
          onSubmit={enviar}
          aria-label="Criar conta no Gastoba"
          aria-describedby={erros.geral ? idErroGeral : undefined}
          noValidate
        >
          <div className={estilos.campo}>
            <label htmlFor={idNome}>Nome</label>
            <input
              ref={campoNome}
              id={idNome}
              type="text"
              className={estilos.entrada}
              value={nome}
              onChange={(evento) => definirNome(evento.target.value)}
              autoComplete="name"
              autoFocus
              aria-invalid={erros.nome ? true : undefined}
              aria-describedby={erros.nome ? idErroNome : undefined}
            />
            {erros.nome && (
              <p id={idErroNome} className={estilos.erroDoCampo}>
                {erros.nome}
              </p>
            )}
          </div>

          <div className={estilos.campo}>
            <label htmlFor={idEmail}>E-mail</label>
            <input
              ref={campoEmail}
              id={idEmail}
              type="email"
              className={estilos.entrada}
              value={email}
              onChange={(evento) => definirEmail(evento.target.value)}
              autoComplete="username"
              spellCheck={false}
              aria-invalid={erros.email ? true : undefined}
              aria-describedby={erros.email ? idErroEmail : undefined}
            />
            {erros.email && (
              <p id={idErroEmail} className={estilos.erroDoCampo}>
                {erros.email}
              </p>
            )}
          </div>

          <div className={estilos.campo}>
            <label htmlFor={idSenha}>Senha</label>
            <input
              ref={campoSenha}
              id={idSenha}
              type="password"
              className={estilos.entrada}
              autoComplete="new-password"
              aria-invalid={erros.senha ? true : undefined}
              aria-describedby={erros.senha ? idErroSenha : undefined}
            />
            {erros.senha && (
              <p id={idErroSenha} className={estilos.erroDoCampo}>
                {erros.senha}
              </p>
            )}
          </div>

          <div className={estilos.campo}>
            <label htmlFor={idConfirmacao}>Confirme a senha</label>
            <input
              ref={campoConfirmacao}
              id={idConfirmacao}
              type="password"
              className={estilos.entrada}
              autoComplete="new-password"
              aria-invalid={erros.confirmacao ? true : undefined}
              aria-describedby={erros.confirmacao ? idErroConfirmacao : undefined}
            />
            {erros.confirmacao && (
              <p id={idErroConfirmacao} className={estilos.erroDoCampo}>
                {erros.confirmacao}
              </p>
            )}
          </div>

          <div id={idErroGeral} className={estilos.erroGeral} aria-live="polite" aria-atomic="true">
            {erros.geral && <p>{erros.geral}</p>}
          </div>

          <button type="submit" className={estilos.entrar} disabled={enviando}>
            Criar conta
          </button>
        </form>

        <p className={estilos.alternativa}>
          Já tem conta?{" "}
          <button type="button" className={estilos.ligacao} onClick={aoVoltar}>
            Entrar
          </button>
        </p>
      </div>
    </main>
  );
}
