import { describe, expect, it } from "vitest";

import { rotuloDaTaxa } from "./taxa";

describe("rotuloDaTaxa", () => {
  it("mostra só o percentual do indexador quando não há adicional", () => {
    expect(rotuloDaTaxa({ percentual: "101.2", indexador: "CDI", adicional_anual: null })).toBe(
      "101,2% CDI",
    );
  });

  it("soma o adicional ao ano quando existe", () => {
    expect(rotuloDaTaxa({ percentual: "100", indexador: "IPCA", adicional_anual: "5.5" })).toBe(
      "100% IPCA + 5,5% a.a.",
    );
  });

  it("sem percentual, o adicional é a taxa toda", () => {
    expect(rotuloDaTaxa({ percentual: null, indexador: null, adicional_anual: "12.5" })).toBe(
      "12,5% a.a.",
    );
  });

  it("sem indexador mostra só o percentual", () => {
    expect(rotuloDaTaxa({ percentual: "11.3", indexador: null, adicional_anual: null })).toBe("11,3%");
  });

  it("sem taxa não há rótulo", () => {
    expect(rotuloDaTaxa(null)).toBeNull();
  });
});
