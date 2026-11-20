import { describe, expect, it } from "vitest";

import { iniciaisDe } from "./iniciais";

describe("iniciaisDe", () => {
  it("usa a primeira letra do primeiro e do último nome, em maiúsculas", () => {
    expect(iniciaisDe("ana maria silva")).toBe("AS");
  });

  it("com um só nome, uma inicial", () => {
    expect(iniciaisDe("Você")).toBe("V");
  });

  it("ignora espaços sobrando e devolve ? sem nome", () => {
    expect(iniciaisDe("  Ana   Lima ")).toBe("AL");
    expect(iniciaisDe("   ")).toBe("?");
  });

  it("não parte um caractere fora do plano básico", () => {
    expect(iniciaisDe("\u{1F600} Bia")).toBe("\u{1F600}B");
  });
});
