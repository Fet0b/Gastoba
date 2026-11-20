import { expect, test, type Page } from "@playwright/test";

import { entrar, semearCaixinhas } from "./apoio";
import { instalarEstado } from "./auditoria/estados";

// Frente 070, faixa I (T035 a T037a): Investimentos. Mede os pontos corrigidos e gera, por último, as capturas
// para o visão em test-results/i/. Só dados inventados, na simulação.

/** Um cenário rico: posições em grupos diferentes, caixinhas em caixa alta, nome longo e parte sem caixinha. */
async function semearCenarioRico(page: Page): Promise<void> {
  await semearCaixinhas(page);
  await page.evaluate(async () => {
    const caminho = "/src/simulacao/manipuladores.ts";
    const m = (await import(/* @vite-ignore */ caminho)) as typeof import("../src/simulacao/manipuladores");
    const a = m.adicionarInvestimentoSimulado({ nome: "CDB BANCO INTER S.A. 104% CDI vence 03/2027", tipo: "FIXED_INCOME", subtipo: "CDB", saldo: "8400.00", valor_aplicado: "8000.00", rendimento: "400.00", taxa: { percentual: "104", indexador: "CDI", adicional_anual: null } }, 45);
    const b = m.adicionarInvestimentoSimulado({ nome: "LCA ITAÚ UNIBANCO S.A.", tipo: "FIXED_INCOME", subtipo: "LCA", saldo: "5200.00", valor_aplicado: "5000.00", rendimento: "200.00" }, 45);
    const c = m.adicionarInvestimentoSimulado({ nome: "Tesouro Selic 2029", tipo: "FIXED_INCOME", subtipo: "TREASURY", saldo: "2600.00" }, 45);
    const d = m.adicionarInvestimentoSimulado({ nome: "FUNDO MULTIMERCADO XPTO INVESTIMENTOS", tipo: "MUTUAL_FUND", saldo: "4100.00" }, 45);
    const e = m.adicionarInvestimentoSimulado({ nome: "PETR4", tipo: "EQUITY", subtipo: "STOCK", saldo: "1800.00" }, 45);
    const f = m.adicionarInvestimentoSimulado({ nome: "Conta investimentos (Nubank)", tipo: "CAIXINHA", saldo: "950.00" }, 45);
    m.definirAlocacoesSimuladas(a, { APARTAMENTO: "4000", "RESERVA DE EMERGÊNCIA": "3000", casa: "1000" }, "400.00");
    m.definirAlocacoesSimuladas(b, { "viagem de ferias para a europa": "3000", casa: "2200" });
    m.definirAlocacoesSimuladas(d, { APARTAMENTO: "1000", rascunho: "3100" });
    void c; void e; void f;
    const u = "/src/api/useConsulta.ts";
    ((await import(/* @vite-ignore */ u)) as { invalidar: (p: string) => void }).invalidar("");
  });
}

async function abrirInvestimentos(page: Page, largura: number, estado: "dados" | "vazio" | "carregando" = "dados"): Promise<void> {
  await page.setViewportSize({ width: largura, height: 900 });
  await instalarEstado(page, estado);
  await entrar(page, "/investimentos");
  await expect(page.getByRole("heading", { name: "Investimentos", exact: true })).toBeVisible();
}


for (const largura of [1366, 390]) {
  test(`T036: Posições dentro do painel, Ordenar com a largura do conteúdo e subgrupos em veludo em ${largura}px`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "a largura vem do teste");
    await abrirInvestimentos(page, largura);
    await semearCenarioRico(page);
    const painel = page.getByLabel("Posições", { exact: true }).first();
    await expect(painel).toBeVisible();
    const medidas = await page.evaluate(() => {
      const painel = document.querySelector('[aria-label="Posições"]') as HTMLElement;
      const titulo = [...painel.querySelectorAll("h2")].find((h) => h.textContent === "Posições") as HTMLElement;
      const seletor = painel.querySelector("select") as HTMLElement;
      const fundoDoPainel = getComputedStyle(painel).backgroundColor;
      const subs = [...painel.querySelectorAll("[data-subgrupo]")] as HTMLElement[];
      const caixaDe = (e: Element) => e.getBoundingClientRect();
      const lacunas = subs.slice(1).map((s, k) => caixaDe(s).top - caixaDe(subs[k]).bottom);
      const p = caixaDe(painel);
      return {
        tituloNoPainel: caixaDe(titulo).left >= p.left + 12 && caixaDe(titulo).top >= p.top,
        seletorNoPainel: caixaDe(seletor).right <= p.right - 12,
        larguraDoSeletor: caixaDe(seletor).width,
        larguraDoPainel: p.width,
        fundoDoPainel,
        fundoDoSub: subs[0] ? getComputedStyle(subs[0]).backgroundColor : "",
        bordaDoSub: subs[0] ? getComputedStyle(subs[0]).borderTopWidth : "",
        lacunas,
      };
    });
    expect(medidas.tituloNoPainel).toBe(true);
    expect(medidas.seletorNoPainel).toBe(true);
    expect(medidas.larguraDoSeletor).toBeLessThanOrEqual(Math.min(medidas.larguraDoPainel, 272));
    expect(medidas.fundoDoSub).not.toBe(medidas.fundoDoPainel);
    expect(parseFloat(medidas.bordaDoSub)).toBeGreaterThanOrEqual(1);
    expect(medidas.lacunas.length).toBeGreaterThan(0);
    for (const l of medidas.lacunas) expect(l).toBeGreaterThanOrEqual(8);
  });

  test(`T036: Evolução não é esticada nem deixa vão em ${largura}px`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "a largura vem do teste");
    await abrirInvestimentos(page, largura);
    await semearCenarioRico(page);
    const vao = await page.evaluate(() => {
      const cartao = document.querySelector('[aria-label="Evolução do saldo"]') as HTMLElement;
      const ultimo = cartao.lastElementChild as HTMLElement;
      const c = cartao.getBoundingClientRect();
      return c.bottom - ultimo.getBoundingClientRect().bottom - parseFloat(getComputedStyle(cartao).paddingBottom);
    });
    expect(vao).toBeLessThanOrEqual(2);
  });
}

test("T037: em 390 px o nome tem prioridade, o menu fica na primeira linha e os valores alinham à direita", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "a largura vem do teste");
  await abrirInvestimentos(page, 390);
  await semearCenarioRico(page);
  const linhas = await page.evaluate(() => {
    return [...document.querySelectorAll('ul[aria-label="Seus investimentos"] > li')].map((li) => {
      const caixa = (e: Element | null) => (e ? e.getBoundingClientRect() : null);
      const nome = li.querySelector("h3") as HTMLElement;
      const menu = li.querySelector('button[aria-label^="Mais ações"]') as HTMLElement;
      const valores = [...li.querySelectorAll("div")].filter((d) => /^(Aplicado|Saldo|Rendimento)/.test(d.textContent ?? "") && d.children.length >= 2 && d.querySelector("span"));
      const direitas = valores.map((v) => Math.round(v.getBoundingClientRect().right));
      const textosDosValores = valores.map((v) => [...v.querySelectorAll(":scope > span")].slice(1).map((x) => Math.round(caixa(x)!.right)));
      return {
        largura: caixa(li)!.width,
        nomeLargura: caixa(nome)!.width,
        nomeAltura: caixa(nome)!.height,
        menuTopo: caixa(menu)!.top,
        nomeBase: caixa(nome)!.bottom,
        nomeTopo: caixa(nome)!.top,
        direitas,
        textosDosValores,
        rolagem: li.scrollWidth - li.clientWidth,
      };
    });
  });
  expect(linhas.length).toBeGreaterThan(4);
  for (const l of linhas) {
    expect(l.nomeLargura).toBeGreaterThan(l.largura * 0.55);
    expect(l.menuTopo).toBeLessThan(l.nomeBase);
    expect(l.rolagem).toBeLessThanOrEqual(1);
    const direitasDosTextos = l.textosDosValores.flat();
    if (direitasDosTextos.length > 0) expect(new Set(direitasDosTextos).size).toBe(1);
  }
});

test("T037: o total do grupo fica na linha do nome, sem quebrar, em 390 e 1366", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "a largura vem do teste");
  for (const largura of [390, 1366]) {
    await page.setViewportSize({ width: largura, height: 900 });
    await abrirInvestimentos(page, largura);
    await semearCenarioRico(page);
    const grupos = await page.evaluate(() =>
      [...document.querySelectorAll("[data-categoria] > summary, [data-subgrupo] > summary")].map((resumo) => {
        const nome = resumo.querySelector("strong") as HTMLElement;
        const total = [...resumo.querySelectorAll("span")].find((x) => /R\$/.test(x.textContent ?? "") && x.children.length === 0) as HTMLElement;
        const n = nome.getBoundingClientRect();
        const t = total.getBoundingClientRect();
        return { alturaDoTotal: t.height, linhaDoTotal: parseFloat(getComputedStyle(total).lineHeight), mesmaLinha: t.top < n.bottom && t.bottom > n.top };
      }),
    );
    expect(grupos.length).toBeGreaterThan(3);
    for (const g of grupos) {
      expect(g.alturaDoTotal).toBeLessThanOrEqual(g.linhaDoTotal * 1.3);
      expect(g.mesmaLinha).toBe(true);
    }
  }
});

test("T037/T035: caixinhas com maiúscula inicial e cores distintas nos metadados das posições", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "a largura vem do teste");
  await abrirInvestimentos(page, 1366);
  await semearCenarioRico(page);
  const itens = await page.evaluate(() =>
    [...document.querySelectorAll('ul[aria-label="Seus investimentos"] [data-metadados] > span')]
      .map((item) => ({ texto: (item.textContent ?? "").trim(), ponto: item.querySelector("span[aria-hidden]") as HTMLElement | null }))
      .filter((i) => i.ponto !== null)
      .map((i) => ({ texto: i.texto, cor: getComputedStyle(i.ponto!).backgroundColor })),
  );
  expect(itens.length).toBeGreaterThan(5);
  for (const i of itens) expect(i.texto[0]).toBe(i.texto[0]!.toLocaleUpperCase("pt-BR"));
  const porNome = new Map<string, string>();
  for (const i of itens) {
    if (porNome.has(i.texto)) expect(porNome.get(i.texto)).toBe(i.cor);
    porNome.set(i.texto, i.cor);
  }
  expect(new Set(porNome.values()).size).toBe(porNome.size);
});

test("T037a: o diálogo Destinações mostra os nomes com a primeira letra maiúscula, sem caixa alta", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "a largura vem do teste");
  await abrirInvestimentos(page, 1366);
  await semearCenarioRico(page);
  await page.getByRole("button", { name: /^Mais ações de CDB/ }).click();
  await page.getByRole("menuitem", { name: "Ver destinações e cores", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: /^Destinações de CDB/ });
  await expect(dialogo).toBeVisible();
  const nomes = await dialogo.locator('th[scope="row"]').evaluateAll((ths) =>
    ths.map((th) => ({ texto: (th.textContent ?? "").trim(), transformacao: getComputedStyle(th).textTransform })),
  );
  expect(nomes.length).toBeGreaterThan(1);
  for (const n of nomes) {
    expect(n.transformacao).toBe("none");
    expect(n.texto).not.toBe(n.texto.toUpperCase());
  }
  expect(nomes.some((n) => n.texto.startsWith("Apartamento"))).toBe(true);
  expect(nomes.some((n) => n.texto.startsWith("Reserva de emergência"))).toBe(true);
});

// --- correções do portão visual (D1 a D10) ----------------------------------------------------------------

test("D1: as fatias especiais da pizza usam a cor neutra, nunca a de uma caixinha", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "a largura vem do teste");
  await abrirInvestimentos(page, 1366);
  await semearCenarioRico(page);
  const cores = await page.evaluate(() => {
    const pontos = [...document.querySelectorAll('[aria-label="Distribuição dos investimentos"] button[aria-label^="Mostrar no gráfico"]')].map((b) => ({
      nome: b.getAttribute("aria-label")!.replace("Mostrar no gráfico: ", ""),
      cor: getComputedStyle(b.querySelector("span")!).backgroundColor,
    }));
    return pontos;
  });
  const especiais = cores.filter((c) => /^(Sem destinação|Caixinha sem destinação)$/.test(c.nome));
  const reais = cores.filter((c) => !/^(Sem destinação|Caixinha sem destinação)$/.test(c.nome));
  expect(reais.length).toBeGreaterThan(1);
  for (const e of especiais) for (const r of reais) expect(e.cor, `${e.nome} x ${r.nome}`).not.toBe(r.cor);
});

for (const largura of [1366, 1920]) {
  test(`D4: Aplicado, Saldo e Rendimento alinham em todos os grupos em ${largura}px`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "a largura vem do teste");
    await abrirInvestimentos(page, largura);
    await semearCenarioRico(page);
    const direitas = await page.evaluate(() => {
      const por = new Map<string, Set<number>>();
      for (const li of document.querySelectorAll('ul[aria-label="Seus investimentos"] > li')) {
        const colunas = [...li.querySelectorAll("div")].filter((d) => /^(Aplicado|Saldo|Rendimento)/.test(d.textContent ?? "") && d.querySelector("span") && d.children.length >= 2 && getComputedStyle(d).display !== "none");
        for (const c of colunas) {
          const nome = (c.textContent ?? "").match(/^(Aplicado|Saldo|Rendimento)/)![1];
          const valor = [...c.querySelectorAll(":scope > span")].slice(1)[0] as HTMLElement;
          const r = document.createRange(); r.selectNodeContents(valor);
          por.set(nome, (por.get(nome) ?? new Set()).add(Math.round(r.getBoundingClientRect().right)));
        }
      }
      return Object.fromEntries([...por].map(([k, v]) => [k, [...v]]));
    });
    for (const [nome, lados] of Object.entries(direitas)) expect(Math.max(...lados) - Math.min(...lados), `${nome}: ${lados}`).toBeLessThanOrEqual(1);
  });
}

test("D5/D6: em 320 px o nome do subgrupo fica em uma linha e o total usa título, Névoa e texto de apoio", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "a largura vem do teste");
  await abrirInvestimentos(page, 320);
  await semearCenarioRico(page);
  const grupos = await page.evaluate(() =>
    [...document.querySelectorAll("[data-categoria] > summary, [data-subgrupo] > summary")].map((resumo) => {
      const nome = resumo.querySelector("strong") as HTMLElement;
      const total = [...resumo.querySelectorAll("span")].find((x) => /R\$/.test(x.textContent ?? "") && x.children.length === 0) as HTMLElement;
      const e = getComputedStyle(total);
      const raiz = getComputedStyle(document.documentElement);
      return { nomeAltura: nome.getBoundingClientRect().height, linha: parseFloat(getComputedStyle(nome).lineHeight), corDoTotal: e.color, nevoa: raiz.getPropertyValue("--cor-nevoa").trim(), fonte: e.fontFamily, tabular: e.fontVariantNumeric, tamanho: parseFloat(e.fontSize) };
    }),
  );
  expect(grupos.length).toBeGreaterThan(3);
  for (const g of grupos) {
    expect(g.nomeAltura).toBeLessThanOrEqual(g.linha * 1.3);
    expect(g.fonte).toMatch(/Bricolage/i);
    expect(g.tabular).toContain("tabular-nums");
    expect(g.tamanho).toBeGreaterThanOrEqual(13);
    expect(g.tamanho).toBeLessThanOrEqual(15);
  }
});

test("D7: em 390 px o 'Ver como tabela' da Distribuição ocupa a largura toda, com o chevron na ponta", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "a largura vem do teste");
  await abrirInvestimentos(page, 390);
  await semearCenarioRico(page);
  const m = await page.evaluate(() => {
    const d = [...document.querySelectorAll('[aria-label="Distribuição dos investimentos"] details')].find((x) => x.textContent?.startsWith("Ver como tabela")) as HTMLElement;
    const resumo = d.querySelector("summary")!.getBoundingClientRect();
    const cartao = (d.closest("section") as HTMLElement).getBoundingClientRect();
    return { largura: resumo.width, cartao: cartao.width };
  });
  expect(m.largura).toBeGreaterThan(m.cartao * 0.8);
});

test("D8: o estado vazio é o próprio contêiner, sem painel sólido em volta", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "a largura vem do teste");
  await abrirInvestimentos(page, 1366, "vazio");
  const m = await page.evaluate(() => {
    const titulo = [...document.querySelectorAll("main p")].find((p) => p.textContent === "Nenhum investimento ainda") as HTMLElement;
    const vazio = titulo.parentElement!;
    return { tracejado: getComputedStyle(vazio).borderTopStyle, dentroDeSecao: vazio.closest("section") !== null };
  });
  expect(m.tracejado).toBe("dashed");
  expect(m.dentroDeSecao).toBe(false);
});

test("D10: 'Sem rentabilidade' é metadado em Bruma, com 13px ou mais", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "a largura vem do teste");
  await abrirInvestimentos(page, 1366);
  await semearCenarioRico(page);
  const m = await page.evaluate(() => {
    const alvo = [...document.querySelectorAll("[data-sem-rentabilidade]")][0] as HTMLElement | undefined;
    if (!alvo) return null;
    const e = getComputedStyle(alvo);
    const sonda = document.createElement("span"); sonda.style.color = "var(--cor-bruma)"; document.body.append(sonda);
    const bruma = getComputedStyle(sonda).color; sonda.remove();
    return { cor: e.color, bruma, tamanho: parseFloat(e.fontSize) };
  });
  expect(m).not.toBeNull();
  expect(m!.cor).toBe(m!.bruma);
  expect(m!.tamanho).toBeGreaterThanOrEqual(13);
});

// --- capturas, por último -------------------------------------------------------------------------------

const PASTA = "test-results/i";

for (const largura of [1366, 390]) {
  test(`capturas: dados, vazio e carregando em ${largura}px`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "a largura vem do teste");
    await abrirInvestimentos(page, largura);
    await semearCenarioRico(page);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${PASTA}/investimentos-dados-${largura}.png`, fullPage: true });

    for (const estado of ["vazio", "carregando"] as const) {
      const outra = await page.context().newPage();
      await outra.setViewportSize({ width: largura, height: 900 });
      await instalarEstado(outra, estado);
      await entrar(outra, "/investimentos");
      await expect(outra.getByRole("heading", { name: "Investimentos", exact: true })).toBeVisible();
      await outra.waitForTimeout(400);
      await outra.screenshot({ path: `${PASTA}/investimentos-${estado}-${largura}.png`, fullPage: true });
      await outra.close();
    }
  });

  test(`capturas: detalhe, destinações, revisão e editor em ${largura}px`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "a largura vem do teste");
    await abrirInvestimentos(page, largura);
    await semearCenarioRico(page);
    await page.getByRole("button", { name: /^Mais ações de CDB/ }).click();
    await page.getByRole("menuitem", { name: "Ver destinações e cores", exact: true }).click();
    await expect(page.getByRole("dialog", { name: /^Destinações de CDB/ })).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${PASTA}/dialogo-destinacoes-${largura}.png` });
    await page.keyboard.press("Escape");

    // O detalhe da posição aberto (operações e abertura).
    await page.getByRole("button", { name: /^Mais ações de LCA/ }).click();
    await page.getByRole("menuitem", { name: "Ver operações e abertura", exact: true }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${PASTA}/detalhe-da-posicao-${largura}.png` });
    await page.keyboard.press("Escape");

    // A conferência: a Revisão da bolsa.
    await page.getByRole("button", { name: "Revisar", exact: true }).first().click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${PASTA}/revisao-da-bolsa-${largura}.png` });
    await page.keyboard.press("Escape");

    // O editor de caixinhas: Definir destinações / Alocar em caixinhas.
    await page.getByRole("button", { name: /^Mais ações de CDB/ }).click();
    const item = page.getByRole("menuitem", { name: /^(Definir destinações|Alocar em caixinhas)$/ });
    if (await item.count()) {
      await item.first().click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${PASTA}/editor-de-caixinhas-${largura}.png` });
    }
  });
}

test("capturas: dados em 320px", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "a largura vem do teste");
  await abrirInvestimentos(page, 320);
  await semearCenarioRico(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${PASTA}/investimentos-dados-320.png`, fullPage: true });
});
