import { expect, test, type Page } from "@playwright/test";
import { entrar, irPara } from "./apoio";

// Medições dos componentes-base (frente 070, Fase 2). Cada teste fixa a própria largura (1366 ou
// 390 px), então só o projeto "desktop" os roda; o projeto "celular" teria a largura trocada.
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop", "a largura é fixada em cada teste");
});

async function abrir(page: Page, largura: number, tela?: string): Promise<void> {
  await page.setViewportSize({ width: largura, height: largura < 600 ? 844 : 900 });
  await entrar(page);
  if (tela) await irPara(page, tela);
}

test("dd fica junto do dt: nenhuma margem padrão em dd", async ({ page }) => {
  await abrir(page, 1366, "Faturas");
  const margens = await page.evaluate(() =>
    [...document.querySelectorAll("main dd")].map((dd) => getComputedStyle(dd).marginInlineStart),
  );
  expect(margens.length).toBeGreaterThan(0);
  expect(margens.filter((m) => m !== "0px")).toEqual([]);
});

test("Metadados: o separador nunca aparece no começo de uma linha quebrada (390 px)", async ({ page }) => {
  await abrir(page, 390);
  const achados: string[] = [];
  for (const tela of ["Investimentos", "Contas", "Faturas"]) {
    await irPara(page, tela);
    achados.push(
      ...(await page.evaluate((nome) => {
        const problemas: string[] = [];
        if (!document.querySelector("main [data-metadados]")) problemas.push(`${nome}: nenhum Metadados na tela`);
        for (const grupo of document.querySelectorAll("main [data-metadados]")) {
          const raiz = grupo.getBoundingClientRect();
          const itens = [...grupo.children] as HTMLElement[];
          const recorte = getComputedStyle(grupo).overflowX === "clip";
          itens.forEach((item, i) => {
            if (i === 0) return;
            const sepFora = item.getBoundingClientRect().left - raiz.left < 2;
            // No começo da linha o separador só some se o contêiner o recorta.
            if (sepFora && !recorte) problemas.push(`${nome}: separador no começo de linha`);
          });
          if (!recorte) problemas.push(`${nome}: contêiner sem recorte lateral`);
        }
        return problemas;
      }, tela)),
    );
  }
  expect(achados).toEqual([]);
});

test("Destaque: valor com peso 700 e algarismos tabulares", async ({ page }) => {
  await abrir(page, 1366);
  const ruins: string[] = [];
  for (const tela of ["Início", "Contas"]) {
    if (tela !== "Início") await irPara(page, tela);
    const medidas = await page.evaluate(() =>
      [...document.querySelectorAll("main [data-tamanho] > span:nth-child(2)")].map((v) => {
        const e = getComputedStyle(v);
        return { peso: e.fontWeight, numeros: e.fontVariantNumeric };
      }),
    );
    expect(medidas.length, `Destaques em ${tela}`).toBeGreaterThan(0);
    for (const m of medidas) if (m.peso !== "700" || !m.numeros.includes("tabular-nums")) ruins.push(`${tela}: ${m.peso} ${m.numeros}`);
  }
  expect(ruins).toEqual([]);
});

test("diálogo Novo gasto: rótulos em 13 px e campos com borda visível sobre veludo", async ({ page }) => {
  await abrir(page, 1366, "Transações");
  await page.getByRole("button", { name: "Novo gasto", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Novo gasto" });
  await expect(dialogo).toBeVisible();
  const medidas = await dialogo.evaluate((raiz) => {
    const rotulos = new Set<Element>();
    for (const campo of raiz.querySelectorAll("input:not([type=radio]):not([type=checkbox]), select"))
      for (const l of (campo as HTMLInputElement).labels ?? []) rotulos.add(l);
    for (const l of raiz.querySelectorAll("legend, [id$='-rotulo']")) rotulos.add(l);
    const tamanhos = [...rotulos].map((l) => `${(l.textContent ?? "").trim()}=${getComputedStyle(l).fontSize}`);
    const bordas = [...raiz.querySelectorAll("input:not([type=radio]):not([type=checkbox]), select")].flatMap((c) => {
      // O campo de tags desenha a moldura num ancestral próximo.
      let alvo: Element | null = c;
      for (let i = 0; i < 3 && alvo; i++) {
        const e = getComputedStyle(alvo);
        if (parseFloat(e.borderTopWidth) > 0) return [`${(c as HTMLInputElement).id}:${e.borderTopColor === e.backgroundColor ? "igual" : "ok"}:${e.backgroundColor}`];
        alvo = alvo.parentElement;
      }
      return [`${(c as HTMLInputElement).id}:sem-borda`];
    });
    return { tamanhos, bordas };
  });
  expect(medidas.tamanhos.length).toBeGreaterThanOrEqual(5);
  expect(medidas.tamanhos.filter((t) => !t.endsWith("=13px"))).toEqual([]);
  expect(medidas.bordas.filter((b) => !b.includes(":ok:"))).toEqual([]);
  const noite = await page.evaluate(() => {
    const t = document.createElement("i");
    t.style.color = "var(--cor-noite)";
    document.body.append(t);
    const cor = getComputedStyle(t).color;
    t.remove();
    return cor;
  });
  expect(medidas.bordas.filter((b) => b.endsWith(noite))).toEqual([]);
});

test("Novo gasto em 1366×768: rodapé fica visível sem rolar o formulário", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await entrar(page);
  await irPara(page, "Transações");
  await page.getByRole("button", { name: "Novo gasto", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Novo gasto" });
  await expect(dialogo).toBeVisible();
  const medidas = await dialogo.evaluate((raiz) => {
    const rodape = raiz.querySelector("footer[data-rodape-dialogo]")!;
    const corpo = raiz.querySelector("[data-corpo-dialogo]")!;
    const dialogo = raiz.getBoundingClientRect();
    const botoes = [...rodape.querySelectorAll("button")].map((botao) => botao.getBoundingClientRect());
    const campos = [...corpo.querySelectorAll<HTMLElement>("input, select")];
    const estilosDoCorpo = getComputedStyle(corpo);
    const folgaEsperada = Math.min(
      Number.parseFloat(estilosDoCorpo.paddingTop),
      Number.parseFloat(estilosDoCorpo.paddingRight),
      Number.parseFloat(estilosDoCorpo.paddingBottom),
      Number.parseFloat(estilosDoCorpo.paddingLeft),
    );
    corpo.scrollTop = 0;
    const limites = corpo.getBoundingClientRect();
    const primeiro = campos[0].getBoundingClientRect();
    const folgaSuperior = primeiro.top - limites.top;
    const folgaLateral = Math.min(...campos.flatMap((campo) => {
      const caixa = campo.getBoundingClientRect();
      return [caixa.left - limites.left, limites.right - caixa.right];
    }));
    corpo.scrollTop = corpo.scrollHeight;
    const ultimo = campos.at(-1)!.getBoundingClientRect();
    const folgaInferior = corpo.getBoundingClientRect().bottom - ultimo.bottom;
    return {
      rolagemDoCorpo: getComputedStyle(corpo).overflowY,
      corpoTemRolagem: corpo.scrollHeight > corpo.clientHeight,
      folgaSuperior,
      folgaInferior,
      folgaLateral,
      folgaEsperada,
      rodapeDentroDoDialogo: rodape.getBoundingClientRect().bottom <= dialogo.bottom + 1,
      quantidadeDeBotoes: botoes.length,
      botoesDentroDaJanela: botoes.every((botao) => botao.top >= 0 && botao.bottom <= innerHeight),
    };
  });
  expect(medidas.rolagemDoCorpo).toBe("auto");
  expect(medidas.corpoTemRolagem).toBe(true);
  expect(medidas.folgaSuperior).toBeGreaterThanOrEqual(medidas.folgaEsperada - 1);
  expect(medidas.folgaInferior).toBeGreaterThanOrEqual(medidas.folgaEsperada - 1);
  expect(medidas.folgaLateral).toBeGreaterThanOrEqual(medidas.folgaEsperada - 1);
  expect(medidas.rodapeDentroDoDialogo).toBe(true);
  expect(medidas.quantidadeDeBotoes).toBe(2);
  expect(medidas.botoesDentroDaJanela).toBe(true);
});

test("Seletor: a opção escolhida corta com reticências", async ({ page }) => {
  await abrir(page, 1366, "Transações");
  await page.getByRole("button", { name: "Novo gasto", exact: true }).click();
  const conta = page.getByRole("dialog", { name: "Novo gasto" }).getByLabel("Conta", { exact: true });
  const estilo = await conta.evaluate((e) => {
    const c = getComputedStyle(e);
    return { corte: c.textOverflow, ocultar: c.overflowX, linha: c.whiteSpace };
  });
  expect(estilo.corte).toBe("ellipsis");
  expect(estilo.ocultar).toMatch(/^(hidden|clip)$/);
  expect(estilo.linha).toBe("nowrap");
});

test("CabecalhoDaTela em 390 px: controles na linha do título e o link abaixo do subtítulo", async ({ page }) => {
  await abrir(page, 390, "Investimentos");
  const g = await page.evaluate(() => {
    const cab = document.querySelector("[data-cabecalho-da-tela]")!;
    const titulo = cab.querySelector("h2")!.getBoundingClientRect();
    const sub = cab.querySelector("p")!.getBoundingClientRect();
    const link = [...cab.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Ver aportes"))!;
    const linkBox = link.getBoundingClientRect();
    const texto = document.createRange();
    texto.selectNodeContents(link);
    const textoDoLink = texto.getBoundingClientRect();
    const controles = [...cab.lastElementChild!.children].filter((e) => getComputedStyle(e).position !== "fixed");
    return {
      tops: controles.map((e) => Math.round(e.getBoundingClientRect().top)),
      linkAbaixo: linkBox.top >= sub.bottom - 1,
      controlesNaLinhaDoTitulo: controles.every((e) => e.getBoundingClientRect().top < titulo.bottom && e.getBoundingClientRect().bottom <= linkBox.top + 1),
      alinhado: Math.abs(textoDoLink.left - titulo.left) <= 2,
    };
  });
  expect(new Set(g.tops).size).toBe(1);
  expect(g.linkAbaixo).toBe(true);
  expect(g.controlesNaLinhaDoTitulo).toBe(true);
  expect(g.alinhado).toBe(true);
});

test("390 px sem seletor de mês: o sino acompanha a linha do título", async ({ page }) => {
  await abrir(page, 390, "Contas");
  const medidas = await page.evaluate(() => {
    const cab = document.querySelector("[data-cabecalho-da-tela]")!;
    const titulo = cab.querySelector("h2")!.getBoundingClientRect();
    const sino = cab.querySelector("[data-sininho] button")!.getBoundingClientRect();
    return {
      sinalizado: cab.hasAttribute("data-sininho-unico"),
      topoDoSino: sino.top,
      topoDoTitulo: titulo.top,
      larguraDoSino: sino.width,
    };
  });
  expect(medidas.sinalizado).toBe(true);
  expect(medidas.larguraDoSino).toBeGreaterThanOrEqual(44);
  expect(Math.abs(medidas.topoDoSino - medidas.topoDoTitulo)).toBeLessThanOrEqual(4);
});

test("GradeDeIndicadores: três cartões em duas colunas, o último ocupa a linha inteira", async ({ page }) => {
  await abrir(page, 390, "Transações");
  const g = await page.evaluate(() => {
    const grade = [...document.querySelectorAll("main div")].find((d) => getComputedStyle(d).display === "grid" && d.children.length === 3 && /Saldo/.test(d.textContent ?? ""))!;
    const filhos = [...grade.children].map((c) => c.getBoundingClientRect());
    return { grade: grade.getBoundingClientRect().width, larguras: filhos.map((f) => Math.round(f.width)), topos: filhos.map((f) => Math.round(f.top)) };
  });
  expect(g.larguras[2]).toBeGreaterThanOrEqual(g.grade - 1);
  expect(g.topos[0]).toBe(g.topos[1]);
  expect(g.topos[2]).toBeGreaterThan(g.topos[0]);
});
