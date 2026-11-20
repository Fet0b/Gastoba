import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Conta } from "../../api/tipos";
import { entrarNaSimulacao } from "../../simulacao/fetchSimulado";
import { ListaDeContas } from "./ListaDeContas";
import { MenuDaConta } from "./MenuDaConta";

beforeEach(() => {
  entrarNaSimulacao();
});

function conta(extra: Partial<Conta> & { id: string }): Conta {
  return {
    nome: "Nubank",
    saldo: "10.00",
    origem: "open_finance",
    tipo: "corrente",
    rotulo: "Nubank",
    apelido: null,
    nome_no_banco: "Nubank",
    final_do_numero: null,
    ...extra,
  };
}

describe("MenuDaConta (apelido)", () => {
  it("a conta importada tem o menu com 'Dar apelido', sem excluir", () => {
    render(<MenuDaConta conta={conta({ id: "a" })} aoDarApelido={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Mais ações da conta Nubank, Conta corrente" }));
    expect(screen.getByRole("menuitem", { name: "Dar apelido" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: /Excluir/ })).toBeNull();
  });

  it("com apelido o item é 'Mudar apelido'", () => {
    render(<MenuDaConta conta={conta({ id: "a", apelido: "Casa", rotulo: "Casa" })} aoDarApelido={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Mais ações da conta Casa/ }));
    expect(screen.getByRole("menuitem", { name: "Mudar apelido" })).toBeTruthy();
  });

  it("a conta manual tem apelido e exclusão", () => {
    render(
      <MenuDaConta conta={conta({ id: "a", origem: "manual" })} aoDarApelido={vi.fn()} aoExcluir={vi.fn(async () => true)} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Mais ações da conta/ }));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Dar apelido", "Excluir conta"]);
  });

  it("escolher o item entrega a conta a quem abre o diálogo", () => {
    const aoDarApelido = vi.fn();
    const alvo = conta({ id: "a" });
    render(<MenuDaConta conta={alvo} aoDarApelido={aoDarApelido} />);
    fireEvent.click(screen.getByRole("button", { name: /^Mais ações da conta/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Dar apelido" }));
    expect(aoDarApelido).toHaveBeenCalledWith(alvo);
  });
});

describe("ListaDeContas (apelido)", () => {
  function lista(contas: Conta[]) {
    return render(
      <ListaDeContas
        contas={contas}
        carregando={false}
        formularioAberto={false}
        aoMudarFormulario={vi.fn()}
        aoCriar={vi.fn()}
        aoFalhar={vi.fn()}
        aoAvisar={vi.fn()}
      />,
    );
  }

  it("sugere um apelido para as contas que a pessoa não distingue, e só para elas", () => {
    lista([
      conta({ id: "a", nome: "Nubank" }),
      conta({ id: "b", nome: "Nubank (2)" }),
      conta({ id: "c", nome: "Itaú", rotulo: "Itaú", nome_no_banco: "Itaú" }),
    ]);
    expect(screen.getAllByText("Dê um apelido para diferenciar")).toHaveLength(2);
  });

  it("não sugere quando os finais diferenciam as contas", () => {
    lista([
      conta({ id: "a", final_do_numero: "0412" }),
      conta({ id: "b", nome: "Nubank (2)", final_do_numero: "7788" }),
    ]);
    expect(screen.queryByText("Dê um apelido para diferenciar")).toBeNull();
  });

  it("o menu da conta sugerida abre o diálogo de apelido dela", () => {
    lista([conta({ id: "a" }), conta({ id: "b", nome: "Nubank (2)" })]);
    const [primeiro] = screen.getAllByRole("button", { name: /^Mais ações da conta/ });
    fireEvent.click(primeiro);
    fireEvent.click(screen.getByRole("menuitem", { name: "Dar apelido" }));
    const dialogo = screen.getByRole("dialog", { name: "Dar apelido" });
    expect(within(dialogo).getByLabelText("Apelido")).toBeTruthy();
  });
});
