import { describe, expect, it } from "vitest";

import { rotuloDeExibicao } from "./rotulo";

describe("rotuloDeExibicao", () => {
  it("põe a primeira letra em maiúscula", () => {
    expect(rotuloDeExibicao("patrimonio")).toBe("Patrimonio");
  });

  it("acerta letras acentuadas", () => {
    expect(rotuloDeExibicao("ética")).toBe("Ética");
  });

  it("deixa o resto do texto como está", () => {
    expect(rotuloDeExibicao("reserva de emergência")).toBe("Reserva de emergência");
    expect(rotuloDeExibicao("CDB Banco")).toBe("CDB Banco");
  });

  it("devolve o texto vazio sem mudar", () => {
    expect(rotuloDeExibicao("")).toBe("");
  });

  it("não mexe no que já começa em maiúscula", () => {
    expect(rotuloDeExibicao("Ações")).toBe("Ações");
  });
});
