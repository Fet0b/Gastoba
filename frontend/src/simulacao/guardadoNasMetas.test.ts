import { describe, expect, it } from "vitest";

import { chamar } from "../api/cliente";
import type { GuardadoNasMetas, ResumoDasMetas } from "../api/tipos";
import { entrarNaSimulacao } from "./fetchSimulado";
import { prepararCenarioDoGuardado } from "./manipuladores";

const MES = "2026-11";

async function progressoDe(categoria: string) {
  const resumo = await chamar<ResumoDasMetas>("/metas/progresso", { parametros: { mes: MES } });
  return resumo.metas.find((meta) => meta.categoria === categoria)!;
}

describe("simulação do guardado nas metas", () => {
  it("sem configuração devolve desligado e sem marcações", async () => {
    entrarNaSimulacao();
    expect(await chamar<GuardadoNasMetas>("/guardado-nas-metas")).toEqual({ ativo: false, marcacoes: [] });
  });

  it("salva, devolve e preserva as marcações ao desligar", async () => {
    prepararCenarioDoGuardado();
    const corpo = { ativo: true, marcacoes: [{ categoria: "conforto", tag: " Computador " }] };
    const salvo = await chamar<GuardadoNasMetas>("/guardado-nas-metas", { metodo: "PUT", corpo });
    expect(salvo.marcacoes).toEqual([{ categoria: "conforto", tag: "computador" }]);
    const desligado = await chamar<GuardadoNasMetas>("/guardado-nas-metas", {
      metodo: "PUT",
      corpo: { ativo: false, marcacoes: salvo.marcacoes },
    });
    expect(desligado.ativo).toBe(false);
    expect((await chamar<GuardadoNasMetas>("/guardado-nas-metas")).marcacoes).toHaveLength(1);
  });

  it.each([
    ["tag repetida", [{ categoria: "conforto", tag: "computador" }, { categoria: "lazer", tag: "Computador" }], "guardado_invalido"],
    ["tag inexistente", [{ categoria: "conforto", tag: "nao-existe" }], "guardado_invalido"],
    ["Liberdade financeira", [{ categoria: "liberdade_financeira", tag: "computador" }], "categoria_invalida"],
    ["categoria legada", [{ categoria: "investimentos", tag: "computador" }], "categoria_invalida"],
    ["categoria desconhecida", [{ categoria: "xyz", tag: "computador" }], "categoria_invalida"],
  ])("recusa %s com 422", async (_nome, marcacoes, codigo) => {
    prepararCenarioDoGuardado();
    await expect(
      chamar("/guardado-nas-metas", { metodo: "PUT", corpo: { ativo: true, marcacoes } }),
    ).rejects.toMatchObject({ status: 422, codigo });
  });

  it("recusa mais de 20 marcações e corpo de tipo errado", async () => {
    prepararCenarioDoGuardado();
    const muitas = Array.from({ length: 21 }, (_, n) => ({ categoria: "conforto", tag: `t${n}` }));
    await expect(
      chamar("/guardado-nas-metas", { metodo: "PUT", corpo: { ativo: true, marcacoes: muitas } }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      chamar("/guardado-nas-metas", { metodo: "PUT", corpo: { ativo: "sim", marcacoes: [] } }),
    ).rejects.toMatchObject({ status: 422, codigo: "requisicao_invalida" });
  });

  it("desligado, o progresso não traz guardado", async () => {
    prepararCenarioDoGuardado();
    const meta = await progressoDe("conforto");
    expect(meta.guardado).toBe("0.00");
    expect(meta.percentual_guardado).toBe(0);
    expect(meta.caixinhas_guardadas).toEqual([]);
  });

  it("ligado, soma o aporte menos o resgate do mês e não muda gasto, limite nem situação", async () => {
    prepararCenarioDoGuardado();
    const antes = await progressoDe("conforto");
    await chamar("/guardado-nas-metas", {
      metodo: "PUT",
      corpo: { ativo: true, marcacoes: [{ categoria: "conforto", tag: "computador" }] },
    });
    const depois = await progressoDe("conforto");
    // limite 1.000,00; aporte 500,00 e resgate 200,00 no mês: guardado 300,00 (30%).
    expect(depois.guardado).toBe("300.00");
    expect(depois.percentual_guardado).toBe(30);
    expect(depois.caixinhas_guardadas).toEqual(["computador"]);
    expect({ ...depois, guardado: "", percentual_guardado: 0, caixinhas_guardadas: [] }).toEqual({
      ...antes,
      guardado: "",
      percentual_guardado: 0,
      caixinhas_guardadas: [],
    });
  });
});
