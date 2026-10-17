import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { chamar, MENSAGEM_SEM_RESPOSTA } from "../../api/cliente";
import { entrarNaSimulacao, reiniciarSimulacao } from "../../simulacao/fetchSimulado";
import { MENSAGEM_SESSAO_TERMINOU, ProvedorDeSessao, useSessao } from "./Sessao";

// Contra o fetch simulado (vazio e sem sessão a cada teste, pelo preparar.ts).
const CREDENCIAIS = { email: "voce@exemplo.com", senha: "senha-de-exemplo-123" };

/** Mostra o estado da sessão em texto e oferece entrar e sair. */
function Sonda() {
  const sessao = useSessao();
  return (
    <div>
      <p data-testid="estado">{sessao.estado}</p>
      <p data-testid="usuario">{sessao.usuario?.nome ?? "-"}</p>
      <p data-testid="aviso">{sessao.aviso ?? "-"}</p>
      <button type="button" onClick={() => void sessao.entrar(CREDENCIAIS).catch(() => undefined)}>
        Entrar
      </button>
      <button
        type="button"
        onClick={() =>
          void sessao
            .cadastrar({ nome: "Ana", email: "ana@exemplo.com", senha: "uma-senha-bem-grande" })
            .catch(() => undefined)
        }
      >
        Cadastrar
      </button>
      <button type="button" onClick={() => void sessao.sair()}>
        Sair
      </button>
    </div>
  );
}

function renderizar() {
  return render(
    <ProvedorDeSessao>
      <Sonda />
    </ProvedorDeSessao>,
  );
}

const texto = (id: string) => screen.getByTestId(id).textContent;

async function esperarEstado(estado: string) {
  await waitFor(() => expect(texto("estado")).toBe(estado));
}

describe("Sessao", () => {
  it("começa verificando e restaura a sessão existente com /auth/eu", async () => {
    entrarNaSimulacao();
    renderizar();

    expect(texto("estado")).toBe("verificando");
    await esperarEstado("autenticado");
    expect(texto("usuario")).toBe("Você");
    expect(texto("aviso")).toBe("-");
  });

  it("sem sessão (401) fica anônimo, sem aviso de sessão terminada", async () => {
    renderizar();

    await esperarEstado("anonimo");
    expect(texto("usuario")).toBe("-");
    expect(texto("aviso")).toBe("-");
  });

  it("sem resposta do servidor ao verificar, fica anônimo e avisa", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
    renderizar();

    await esperarEstado("anonimo");
    expect(texto("aviso")).toBe(MENSAGEM_SEM_RESPOSTA);
  });

  it("entrar autentica e traz a pessoa, sem guardar o token", async () => {
    renderizar();
    await esperarEstado("anonimo");

    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await esperarEstado("autenticado");
    expect(texto("usuario")).toBe("Você");
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("cadastrar cria a pessoa e já entra com ela", async () => {
    renderizar();
    await esperarEstado("anonimo");

    fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));

    await esperarEstado("autenticado");
    expect(texto("usuario")).toBe("Ana");
  });

  it("entrar com credenciais erradas rejeita e continua anônimo", async () => {
    let falha: unknown = null;
    function SondaDoErro() {
      const sessao = useSessao();
      return (
        <button
          type="button"
          onClick={() => {
            sessao.entrar({ ...CREDENCIAIS, senha: "errada" }).catch((erro: unknown) => {
              falha = erro;
            });
          }}
        >
          Tentar
        </button>
      );
    }
    render(
      <ProvedorDeSessao>
        <Sonda />
        <SondaDoErro />
      </ProvedorDeSessao>,
    );
    await esperarEstado("anonimo");

    fireEvent.click(screen.getByRole("button", { name: "Tentar" }));

    await waitFor(() => expect(falha).toMatchObject({ codigo: "credenciais_invalidas" }));
    expect(texto("estado")).toBe("anonimo");
    expect(texto("aviso")).toBe("-");
  });

  it("sair volta a anônimo sem aviso", async () => {
    entrarNaSimulacao();
    renderizar();
    await esperarEstado("autenticado");

    fireEvent.click(screen.getByRole("button", { name: "Sair" }));

    await esperarEstado("anonimo");
    expect(texto("usuario")).toBe("-");
    expect(texto("aviso")).toBe("-");
  });

  it("sair sem resposta do servidor também volta a anônimo", async () => {
    entrarNaSimulacao();
    renderizar();
    await esperarEstado("autenticado");
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));

    fireEvent.click(screen.getByRole("button", { name: "Sair" }));

    await esperarEstado("anonimo");
  });

  it("sair com a sessão já encerrada (401) volta a anônimo sem o aviso de sessão terminada", async () => {
    entrarNaSimulacao();
    renderizar();
    await esperarEstado("autenticado");
    reiniciarSimulacao();

    fireEvent.click(screen.getByRole("button", { name: "Sair" }));

    await esperarEstado("anonimo");
    expect(texto("aviso")).toBe("-");
  });

  it("um 401 nao_autenticado durante o uso volta a anônimo com o aviso", async () => {
    entrarNaSimulacao();
    renderizar();
    await esperarEstado("autenticado");
    reiniciarSimulacao();

    await act(async () => {
      await chamar("/contas").catch(() => undefined);
    });

    await esperarEstado("anonimo");
    expect(texto("aviso")).toBe(MENSAGEM_SESSAO_TERMINOU);
    expect(MENSAGEM_SESSAO_TERMINOU).toBe("Sua sessão terminou. Entre de novo.");
  });

  it("vários 401 ao mesmo tempo são tratados como uma perda só", async () => {
    entrarNaSimulacao();
    renderizar();
    await esperarEstado("autenticado");
    reiniciarSimulacao();

    await act(async () => {
      await Promise.all([
        chamar("/contas").catch(() => undefined),
        chamar("/tags").catch(() => undefined),
        chamar("/categorias").catch(() => undefined),
      ]);
    });

    await esperarEstado("anonimo");
    expect(texto("aviso")).toBe(MENSAGEM_SESSAO_TERMINOU);
  });

  it("entrar de novo depois da perda tira o aviso", async () => {
    entrarNaSimulacao();
    renderizar();
    await esperarEstado("autenticado");
    reiniciarSimulacao();
    await act(async () => {
      await chamar("/contas").catch(() => undefined);
    });
    await esperarEstado("anonimo");

    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await esperarEstado("autenticado");
    expect(texto("aviso")).toBe("-");
  });

  it("useSessao fora do provedor falha com uma mensagem clara", () => {
    const espiao = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(() => render(<Sonda />)).toThrow("useSessao precisa estar dentro do ProvedorDeSessao.");
    } finally {
      espiao.mockRestore();
    }
  });
});
