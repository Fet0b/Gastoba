import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ErroDaApiCliente, MENSAGEM_SEM_RESPOSTA } from "../../api/cliente";
import { type Credenciais, entrar } from "../../api/sessao";
import { Entrar } from "./Entrar";

// Contra o fetch simulado (vazio e sem sessão a cada teste, pelo preparar.ts).
const EMAIL = "voce@exemplo.com";
const SENHA = "senha-de-exemplo-123";

function renderizar(
  aoEntrar: (credenciais: Credenciais) => Promise<unknown> = entrar,
  aviso: string | null = null,
) {
  return render(<Entrar aoEntrar={aoEntrar} aviso={aviso} />);
}

const campoEmail = () => screen.getByLabelText("E-mail") as HTMLInputElement;
const campoSenha = () => screen.getByLabelText("Senha") as HTMLInputElement;
const botao = () => screen.getByRole("button", { name: "Entrar" }) as HTMLButtonElement;

function preencher(email: string, senha: string): void {
  fireEvent.change(campoEmail(), { target: { value: email } });
  fireEvent.change(campoSenha(), { target: { value: senha } });
}

function formulario(): HTMLFormElement {
  return screen.getByRole("form", { name: "Entrar no Gastoba" }) as HTMLFormElement;
}

/** O texto do elemento apontado pelo aria-describedby do formulário. */
function descricaoDoFormulario(): string {
  const ids = formulario().getAttribute("aria-describedby") ?? "";
  return ids
    .split(" ")
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
}

function erroDaApi(status: number, codigo: string, mensagem: string, esperarSegundos?: number) {
  return new ErroDaApiCliente(status, codigo, mensagem, undefined, esperarSegundos);
}

describe("Entrar", () => {
  it("tem e-mail e senha rotulados, com autocomplete, e o foco no e-mail", () => {
    renderizar();

    expect(campoEmail().type).toBe("email");
    expect(campoEmail().getAttribute("autocomplete")).toBe("username");
    expect(campoSenha().type).toBe("password");
    expect(campoSenha().getAttribute("autocomplete")).toBe("current-password");
    expect(document.activeElement).toBe(campoEmail());
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Gastoba");
  });

  it("envia o e-mail e a senha digitados", async () => {
    const aoEntrar = vi.fn(async () => undefined);
    renderizar(aoEntrar);

    preencher(EMAIL, SENHA);
    fireEvent.click(botao());

    await waitFor(() => expect(aoEntrar).toHaveBeenCalledWith({ email: EMAIL, senha: SENHA }));
  });

  it("o botão fica desabilitado enquanto envia", async () => {
    let concluir: () => void = () => undefined;
    const aoEntrar = vi.fn(() => new Promise<void>((resolver) => (concluir = resolver)));
    renderizar(aoEntrar);
    preencher(EMAIL, SENHA);

    fireEvent.click(botao());
    expect(botao().disabled).toBe(true);
    fireEvent.submit(formulario());
    expect(aoEntrar).toHaveBeenCalledTimes(1);

    concluir();
    await waitFor(() => expect(botao().disabled).toBe(false));
  });

  it("credenciais erradas: mostra a mensagem da API ligada ao formulário e limpa a senha", async () => {
    renderizar();
    preencher(EMAIL, "senha-errada");

    fireEvent.click(botao());

    expect(await screen.findByText("E-mail ou senha incorretos.")).not.toBeNull();
    expect(descricaoDoFormulario()).toContain("E-mail ou senha incorretos.");
    expect(campoSenha().value).toBe("");
    expect(campoEmail().value).toBe(EMAIL);
    expect(document.activeElement).toBe(campoSenha());
  });

  it("a mensagem de erro fica numa região aria-live", async () => {
    renderizar();
    preencher(EMAIL, "senha-errada");

    fireEvent.click(botao());

    const mensagem = await screen.findByText("E-mail ou senha incorretos.");
    expect(mensagem.closest("[aria-live]")).not.toBeNull();
  });

  it("429: diz em quantos segundos tentar de novo", async () => {
    renderizar(async () => {
      throw erroDaApi(429, "muitas_tentativas", "Muitas tentativas de entrar. Tente de novo mais tarde.", 30);
    });
    preencher(EMAIL, SENHA);

    fireEvent.click(botao());

    expect(await screen.findByText("Muitas tentativas. Tente de novo em 30 segundos.")).not.toBeNull();
    expect(campoSenha().value).toBe("");
  });

  it("429 com 1 segundo usa o singular", async () => {
    renderizar(async () => {
      throw erroDaApi(429, "muitas_tentativas", "Muitas tentativas.", 1);
    });
    preencher(EMAIL, SENHA);

    fireEvent.click(botao());

    expect(await screen.findByText("Muitas tentativas. Tente de novo em 1 segundo.")).not.toBeNull();
  });

  it("429 sem Retry-After mostra a mensagem da API", async () => {
    renderizar(async () => {
      throw erroDaApi(429, "muitas_tentativas", "Muitas tentativas de entrar. Tente de novo mais tarde.");
    });
    preencher(EMAIL, SENHA);

    fireEvent.click(botao());

    expect(
      await screen.findByText("Muitas tentativas de entrar. Tente de novo mais tarde."),
    ).not.toBeNull();
  });

  it("429 de verdade da simulação, depois de cinco tentativas erradas", async () => {
    renderizar();

    for (let tentativa = 0; tentativa < 5; tentativa++) {
      preencher(EMAIL, "senha-errada");
      fireEvent.click(botao());
      await waitFor(() => expect(campoSenha().value).toBe(""));
      await waitFor(() => expect(botao().disabled).toBe(false));
    }
    preencher(EMAIL, SENHA);
    fireEvent.click(botao());

    expect(await screen.findByText(/^Muitas tentativas\. Tente de novo em \d+ segundos\.$/)).not.toBeNull();
  });

  it("sem resposta do servidor: avisa no formulário", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
    renderizar();
    preencher(EMAIL, SENHA);

    fireEvent.click(botao());

    expect(await screen.findByText(MENSAGEM_SEM_RESPOSTA)).not.toBeNull();
  });

  it("erro de validação com detalhes aparece junto ao campo", async () => {
    renderizar(async () => {
      throw new ErroDaApiCliente(422, "requisicao_invalida", "Requisição inválida.", [
        { campo: "body.email", mensagem: "String should have at least 3 characters" },
      ]);
    });
    preencher("a", SENHA);

    fireEvent.click(botao());

    const mensagem = await screen.findByText("String should have at least 3 characters");
    expect(campoEmail().getAttribute("aria-invalid")).toBe("true");
    expect(campoEmail().getAttribute("aria-describedby")).toBe(mensagem.id);
    expect(document.activeElement).toBe(campoEmail());
  });

  it("mostra o aviso recebido (sessão terminada)", () => {
    renderizar(entrar, "Sua sessão terminou. Entre de novo.");

    const aviso = screen.getByText("Sua sessão terminou. Entre de novo.");
    expect(aviso.closest("[role='status']")).not.toBeNull();
  });

  it("a senha nunca vai para um atributo do DOM", async () => {
    const { container } = renderizar(async () => {
      throw erroDaApi(401, "credenciais_invalidas", "E-mail ou senha incorretos.");
    });
    preencher(EMAIL, "segredo-muito-secreto");

    expect(container.innerHTML).not.toContain("segredo-muito-secreto");
    fireEvent.click(botao());
    await screen.findByText("E-mail ou senha incorretos.");
    expect(container.innerHTML).not.toContain("segredo-muito-secreto");
  });

  it("só mostra o botão Criar conta quando há para onde ir", () => {
    const { unmount } = renderizar();
    expect(screen.queryByRole("button", { name: "Criar conta" })).toBeNull();
    unmount();

    const aoCriarConta = vi.fn();
    render(<Entrar aoEntrar={entrar} aviso={null} aoCriarConta={aoCriarConta} />);
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(aoCriarConta).toHaveBeenCalledTimes(1);
  });
});
