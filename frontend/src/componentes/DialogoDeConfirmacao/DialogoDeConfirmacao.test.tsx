import { createRef, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DialogoDeConfirmacao } from "./DialogoDeConfirmacao";

type Extras = Partial<Parameters<typeof DialogoDeConfirmacao>[0]>;

function montar(extras: Extras = {}) {
  const aoConfirmar = vi.fn();
  const aoCancelar = vi.fn();
  const resultado = render(
    <DialogoDeConfirmacao
      aberto
      titulo="Excluir o ganho Salário?"
      descricao="A conta será debitada."
      rotuloDaAcao="Confirmar exclusão"
      aoConfirmar={aoConfirmar}
      aoCancelar={aoCancelar}
      {...extras}
    />,
  );
  return { aoConfirmar, aoCancelar, ...resultado };
}

function dialogo(): HTMLDialogElement {
  return document.querySelector("dialog") as HTMLDialogElement;
}

describe("DialogoDeConfirmacao", () => {
  it("aberto abre o diálogo modal e foca em Cancelar", () => {
    montar();

    expect(dialogo().hasAttribute("open")).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancelar" }));
  });

  it("fechado não abre", () => {
    montar({ aberto: false });

    expect(dialogo().hasAttribute("open")).toBe(false);
  });

  it("título e descrição ligados por aria-labelledby e aria-describedby", () => {
    montar();
    const titulo = document.getElementById(dialogo().getAttribute("aria-labelledby") as string);
    const descricao = document.getElementById(dialogo().getAttribute("aria-describedby") as string);

    expect(titulo?.textContent).toBe("Excluir o ganho Salário?");
    expect(descricao?.textContent).toBe("A conta será debitada.");
  });

  it("Cancelar e o evento cancel chamam aoCancelar", () => {
    const { aoCancelar } = montar();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(aoCancelar).toHaveBeenCalledTimes(1);

    fireEvent(dialogo(), new Event("cancel", { cancelable: true }));
    expect(aoCancelar).toHaveBeenCalledTimes(2);
  });

  it("a ação é destrutiva e chama aoConfirmar", () => {
    const { aoConfirmar } = montar();
    const acao = screen.getByRole("button", { name: "Confirmar exclusão" });

    expect(acao.getAttribute("data-papel")).toBe("destrutiva");
    fireEvent.click(acao);
    expect(aoConfirmar).toHaveBeenCalledTimes(1);
  });

  it("pendente desabilita os dois botões e ignora cancel", () => {
    const { aoCancelar } = montar({ pendente: true });

    expect((screen.getByRole("button", { name: "Cancelar" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Confirmar exclusão" }) as HTMLButtonElement).disabled).toBe(true);
    const evento = new Event("cancel", { cancelable: true });
    fireEvent(dialogo(), evento);
    expect(aoCancelar).not.toHaveBeenCalled();
    expect(evento.defaultPrevented).toBe(true);
  });

  it("o erro aparece com role=alert dentro do diálogo", () => {
    montar({ erro: "Não foi possível excluir." });

    const alerta = screen.getByRole("alert");
    expect(alerta.textContent).toBe("Não foi possível excluir.");
    expect(dialogo().contains(alerta)).toBe(true);
  });

  it("ao fechar, o foco volta ao elemento focado ao abrir", () => {
    function Pagina() {
      const [aberto, definirAberto] = useState(false);
      return (
        <>
          <button type="button" onClick={() => definirAberto(true)}>
            Abrir
          </button>
          <DialogoDeConfirmacao
            aberto={aberto}
            titulo="T"
            rotuloDaAcao="Confirmar"
            aoConfirmar={() => {}}
            aoCancelar={() => definirAberto(false)}
          />
        </>
      );
    }
    render(<Pagina />);
    const abrir = screen.getByRole("button", { name: "Abrir" });
    abrir.focus();
    fireEvent.click(abrir);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancelar" }));

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(dialogo().hasAttribute("open")).toBe(false);
    expect(document.activeElement).toBe(abrir);
  });

  it("devolverFocoPara tem prioridade sobre o elemento focado ao abrir", () => {
    const alvo = createRef<HTMLButtonElement>();
    function Pagina() {
      const [aberto, definirAberto] = useState(false);
      return (
        <>
          <button type="button" onClick={() => definirAberto(true)}>
            Abrir
          </button>
          <button type="button" ref={alvo}>
            Alvo
          </button>
          <DialogoDeConfirmacao
            aberto={aberto}
            titulo="T"
            rotuloDaAcao="Confirmar"
            aoConfirmar={() => {}}
            aoCancelar={() => definirAberto(false)}
            devolverFocoPara={alvo}
          />
        </>
      );
    }
    render(<Pagina />);
    const abrir = screen.getByRole("button", { name: "Abrir" });
    abrir.focus();
    fireEvent.click(abrir);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(document.activeElement).toBe(alvo.current);
  });
});
