import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ErroDaApiCliente, MENSAGEM_SEM_RESPOSTA } from "../../api/cliente";
import { cadastrar, type DadosDeCadastro } from "../../api/sessao";
import { Cadastrar } from "./Cadastrar";

// Contra o fetch simulado (vazio e sem sessão a cada teste, pelo preparar.ts).
const SENHA = "uma-senha-bem-grande";

function renderizar(
  aoCadastrar: (dados: DadosDeCadastro) => Promise<unknown> = cadastrar,
  aoVoltar: () => void = () => undefined,
) {
  return render(<Cadastrar aoCadastrar={aoCadastrar} aoVoltar={aoVoltar} />);
}

const campo = (nome: string) => screen.getByLabelText(nome) as HTMLInputElement;
const botao = () => screen.getByRole("button", { name: "Criar conta" }) as HTMLButtonElement;

function preencher(nome: string, email: string, senha: string, confirmacao = senha): void {
  fireEvent.change(campo("Nome"), { target: { value: nome } });
  fireEvent.change(campo("E-mail"), { target: { value: email } });
  fireEvent.change(campo("Senha"), { target: { value: senha } });
  fireEvent.change(campo("Confirme a senha"), { target: { value: confirmacao } });
}

function erroDaApi(status: number, codigo: string, mensagem: string) {
  return new ErroDaApiCliente(status, codigo, mensagem);
}

describe("Cadastrar", () => {
  it("tem os quatro campos rotulados, com autocomplete, e o foco no nome", () => {
    renderizar();

    expect(document.activeElement).toBe(campo("Nome"));
    expect(campo("E-mail").type).toBe("email");
    expect(campo("Senha").type).toBe("password");
    expect(campo("Senha").getAttribute("autocomplete")).toBe("new-password");
    expect(campo("Confirme a senha").type).toBe("password");
  });

  it("envia nome, e-mail e senha digitados", async () => {
    const aoCadastrar = vi.fn(async () => undefined);
    renderizar(aoCadastrar);

    preencher("Ana", "ana@exemplo.com", SENHA);
    fireEvent.click(botao());

    await waitFor(() =>
      expect(aoCadastrar).toHaveBeenCalledWith({ nome: "Ana", email: "ana@exemplo.com", senha: SENHA }),
    );
  });

  it("senhas diferentes não chamam a API e o erro fica junto à confirmação", () => {
    const aoCadastrar = vi.fn(async () => undefined);
    renderizar(aoCadastrar);

    preencher("Ana", "ana@exemplo.com", SENHA, "outra-senha-qualquer");
    fireEvent.click(botao());

    expect(aoCadastrar).not.toHaveBeenCalled();
    const confirmacao = campo("Confirme a senha");
    expect(confirmacao.getAttribute("aria-invalid")).toBe("true");
    const descricao = document.getElementById(confirmacao.getAttribute("aria-describedby") ?? "");
    expect(descricao?.textContent).toBe("As senhas não são iguais.");
    expect(document.activeElement).toBe(confirmacao);
  });

  it("e-mail repetido aparece junto ao e-mail, com o foco nele, e as senhas são apagadas", async () => {
    const aoCadastrar = vi.fn(async () => {
      throw erroDaApi(409, "email_ja_cadastrado", "Já existe um usuário com este e-mail.");
    });
    renderizar(aoCadastrar);

    preencher("Ana", "ana@exemplo.com", SENHA);
    fireEvent.click(botao());

    await waitFor(() => expect(campo("E-mail").getAttribute("aria-invalid")).toBe("true"));
    const descricao = document.getElementById(campo("E-mail").getAttribute("aria-describedby") ?? "");
    expect(descricao?.textContent).toBe("Já existe um usuário com este e-mail.");
    expect(document.activeElement).toBe(campo("E-mail"));
    expect(campo("Senha").value).toBe("");
    expect(campo("Confirme a senha").value).toBe("");
  });

  it("senha curta aparece junto à senha", async () => {
    const aoCadastrar = vi.fn(async () => {
      throw erroDaApi(422, "senha_invalida", "A senha precisa ter de 10 a 128 caracteres.");
    });
    renderizar(aoCadastrar);

    preencher("Ana", "ana@exemplo.com", "curta");
    fireEvent.click(botao());

    await waitFor(() => expect(campo("Senha").getAttribute("aria-invalid")).toBe("true"));
    expect(document.activeElement).toBe(campo("Senha"));
  });

  it("cadastro fechado e servidor fora do ar aparecem no formulário", async () => {
    const aoCadastrar = vi
      .fn<(dados: DadosDeCadastro) => Promise<unknown>>()
      .mockRejectedValueOnce(erroDaApi(403, "cadastro_fechado", "O cadastro está fechado nesta instalação."))
      .mockRejectedValueOnce(new Error("rede"));
    renderizar(aoCadastrar);

    preencher("Ana", "ana@exemplo.com", SENHA);
    fireEvent.click(botao());
    expect(await screen.findByText("O cadastro está fechado nesta instalação.")).not.toBeNull();

    preencher("Ana", "ana@exemplo.com", SENHA);
    fireEvent.click(botao());
    expect(await screen.findByText(MENSAGEM_SEM_RESPOSTA)).not.toBeNull();
  });

  it("o botão fica desabilitado enquanto envia", async () => {
    let concluir: () => void = () => undefined;
    const aoCadastrar = vi.fn(() => new Promise<void>((resolver) => (concluir = resolver)));
    renderizar(aoCadastrar);

    preencher("Ana", "ana@exemplo.com", SENHA);
    fireEvent.click(botao());
    await waitFor(() => expect(botao().disabled).toBe(true));
    fireEvent.click(botao());
    expect(aoCadastrar).toHaveBeenCalledTimes(1);

    concluir();
    await waitFor(() => expect(botao().disabled).toBe(false));
  });

  it("voltar leva à tela de entrar", () => {
    const aoVoltar = vi.fn();
    renderizar(undefined, aoVoltar);

    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(aoVoltar).toHaveBeenCalledTimes(1);
  });
});
