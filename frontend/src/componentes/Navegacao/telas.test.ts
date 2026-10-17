import { describe, expect, it } from "vitest";

import { CAMINHOS_DOS_ICONES } from "../Icone/Icone";
import { dividirTelas, TELAS } from "./telas";

describe("TELAS", () => {
  it("lista as oito telas na ordem da navegação", () => {
    expect(TELAS.map((t) => t.nome)).toEqual([
      "Início",
      "Transações",
      "Orçamento",
      "Contas",
      "Faturas",
      "Tags",
      "Outros",
      "Perfil",
    ]);
    expect(TELAS.map((t) => t.tela)).toEqual([
      "inicio",
      "transacoes",
      "orcamento",
      "contas",
      "faturas",
      "tags",
      "outros",
      "perfil",
    ]);
  });

  it("dá a cada tela um ícone existente", () => {
    for (const { icone } of TELAS) expect(CAMINHOS_DOS_ICONES[icone]).toBeDefined();
  });

  it("separa quatro principais e quatro de Mais", () => {
    const { principais, emMais } = dividirTelas();
    expect(principais.map((t) => t.tela)).toEqual(["inicio", "transacoes", "orcamento", "contas"]);
    expect(emMais.map((t) => t.tela)).toEqual(["faturas", "tags", "outros", "perfil"]);
  });
});
