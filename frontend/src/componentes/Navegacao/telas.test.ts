import { describe, expect, it } from "vitest";

import { CAMINHOS_DOS_ICONES } from "../Icone/Icone";
import { dividirTelas, TELAS } from "./telas";

describe("TELAS", () => {
  it("lista as nove telas na ordem da navegação", () => {
    expect(TELAS.map((t) => t.nome)).toEqual([
      "Início",
      "Transações",
      "Orçamento",
      "Contas",
      "Investimentos",
      "Faturas",
      "Tags",
      "Recorrências",
      "Perfil",
    ]);
    expect(TELAS.map((t) => t.tela)).toEqual([
      "inicio",
      "transacoes",
      "orcamento",
      "contas",
      "investimentos",
      "faturas",
      "tags",
      "outros",
      "perfil",
    ]);
  });

  it("nenhuma tela está marcada como em breve (Faturas já existe)", () => {
    expect(TELAS.filter((t) => t.emBreve).map((t) => t.tela)).toEqual([]);
  });

  it("dá a cada tela um ícone existente", () => {
    for (const { icone } of TELAS) expect(CAMINHOS_DOS_ICONES[icone]).toBeDefined();
  });

  it("separa quatro principais e cinco de Mais", () => {
    const { principais, emMais } = dividirTelas();
    expect(principais.map((t) => t.tela)).toEqual(["inicio", "transacoes", "orcamento", "contas"]);
    expect(emMais.map((t) => t.tela)).toEqual(["investimentos", "faturas", "tags", "outros", "perfil"]);
  });
});
