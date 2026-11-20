import { expect, test } from "@playwright/test";
import { entrar, irPara } from "./apoio";

const TELAS = ["Início", "Transações", "Orçamento", "Contas", "Investimentos", "Caixinhas", "Faturas", "Tags", "Recorrências", "Perfil"];


for (const largura of [1366, 390]) {
  for (const nome of TELAS) {
    test(`${nome}: auditoria do Artigo XI em ${largura}px`, async ({ page }, info) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await entrar(page);
      if (nome !== "Início") await irPara(page, nome);
      const achados = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("main :is(select,input,textarea,button,summary,table,h1,h2,h3,h4,label)")]
          .filter(e => e.offsetParent && !e.className?.toString().trim())
          .map(e => `${e.tagName}${e instanceof HTMLInputElement ? `:${e.type}` : ""} "${(e.innerText || (e instanceof HTMLInputElement ? e.placeholder : "") || "").trim().slice(0, 30)}"`),
      );
      expect(achados).toEqual([]);
      const primarios = page.locator('[data-cabecalho-da-tela] [data-variante="primario"]:visible');
      await expect(primarios).toHaveCount(1);
      await expect(page.locator("span.valor[data-animando]")).toHaveCount(0);
      await page.screenshot({ path: info.outputPath(`${nome}-${largura}-com-dados.png`), fullPage: true, animations: "disabled" });
    });
  }
}

for (const largura of [1366, 390]) {
  test(`cabeçalho único nas dez telas em ${largura}px`, async ({page}, info) => {
    await page.setViewportSize({width: largura, height: 900});
    await entrar(page);
    for (const nome of TELAS) {
      if (nome !== "Início") await irPara(page, nome);
      const cabecalho=page.locator("main header[data-cabecalho-da-tela]");
      await expect(cabecalho).toHaveCount(1);
      await expect(cabecalho.locator('[data-variante="primario"]:visible')).toHaveCount(1);
      const medidas=await cabecalho.evaluate(e=>({esquerda:e.getBoundingClientRect().left,direita:e.getBoundingClientRect().right,largura:innerWidth}));
      expect(medidas.esquerda).toBeGreaterThanOrEqual(0);
      expect(medidas.direita).toBeLessThanOrEqual(medidas.largura);
      await expect(page.locator("span.valor[data-animando]")).toHaveCount(0);
      await page.screenshot({path:info.outputPath(`${nome}-${largura}-cabecalho.png`),fullPage:true, animations:"disabled"});
    }
  });
}

for (const largura of [1366, 390]) {
  for (const estado of ["vazio", "carregando"] as const) {
    test(`Investimentos: captura ${estado} em ${largura}px`, async ({page}, info) => {
      await page.setViewportSize({width:largura,height:900});
      await entrar(page);
      await page.evaluate(async estado => {
        const u="/src/api/useConsulta.ts";
        const {limparCache}=await import(/* @vite-ignore */u) as typeof import("../src/api/useConsulta");
        limparCache();
        const w=window as typeof window & {pedidosInvestimentos:number};
        w.pedidosInvestimentos=0;
        const original=window.fetch.bind(window);
        window.fetch=async (entrada,opcoes)=>{
          const caminho=new URL(String(entrada),location.href).pathname;
          if(caminho.endsWith("/investimentos")) {
            w.pedidosInvestimentos++;
            if(estado==="carregando")return await new Promise<Response>(()=>{});
            return new Response("[]",{headers:{"Content-Type":"application/json"}});
          }
          if(caminho.endsWith("/investimentos/resumo"))return new Response(JSON.stringify({visao:"destinacao",total:"0.00",fatias:[],aportes_sem_destino:{total:"0.00",quantidade:0}}));
          if(caminho.endsWith("/investimentos/historico")||caminho.endsWith("/contas"))return new Response("[]");
          if(caminho.endsWith("/revisao-de-investimentos"))return new Response(JSON.stringify({aportes:[],gastos:[],recorrencias:[]}));
          return original(entrada,opcoes);
        };
      },estado);
      await irPara(page,"Investimentos");
      await expect.poll(()=>page.evaluate(()=>(window as typeof window & {pedidosInvestimentos:number}).pedidosInvestimentos)).toBeGreaterThan(0);
      if(estado==="vazio")await expect(page.getByText("Nenhum investimento ainda",{exact:true})).toBeVisible();
      else await expect(page.getByRole("status",{name:"Carregando investimentos",exact:true})).toBeVisible();
      await page.screenshot({path:info.outputPath(`Investimentos-${largura}-${estado}.png`),fullPage:true,animations:"disabled"});
    });
  }
}

// O diálogo "Revisão da bolsa" (frente 061) segue o Artigo XI: nenhum elemento nativo sem classe.
for (const largura of [1366, 390]) {
  for (const estado of ["com dados", "vazio", "carregando"] as const) {
    test(`Revisão da bolsa: auditoria ${estado} em ${largura}px`, async ({ page }, info) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await entrar(page);
      await irPara(page, "Transações");
      await page.getByRole("button", { name: "Aportes e resgates", exact: true }).click();
      const abrir = page.getByRole("button", { name: "Revisar", exact: true });
      await expect(abrir).toBeVisible();
      if (estado !== "com dados") {
        await page.evaluate(estado => {
          const original = window.fetch.bind(window);
          window.fetch = async (entrada, opcoes) => {
            const caminho = new URL(String(entrada), location.href).pathname;
            if (caminho.endsWith("/revisao-da-bolsa")) {
              if (estado === "carregando") return await new Promise<Response>(() => {});
              return new Response(JSON.stringify({ propostas: [], sem_par: [], confirmados: [] }), { headers: { "Content-Type": "application/json" } });
            }
            return original(entrada, opcoes);
          };
        }, estado);
      }
      await abrir.click();
      const dialogo = page.getByRole("dialog", { name: "Revisão da bolsa" });
      await expect(dialogo).toBeVisible();
      const achados = await dialogo.evaluate(raiz =>
        [...raiz.querySelectorAll<HTMLElement>("select,input,textarea,button,summary,table,h1,h2,h3,h4,label")]
          .filter(e => e.offsetParent && !e.className?.toString().trim())
          .map(e => `${e.tagName}${e instanceof HTMLInputElement ? `:${e.type}` : ""} "${(e.innerText || "").trim().slice(0, 30)}"`),
      );
      expect(achados).toEqual([]);
      await page.screenshot({ path: info.outputPath(`revisao-da-bolsa-${estado}-${largura}.png`), fullPage: true, animations: "disabled" });
    });
  }
}

// A vista "Aportes e resgates" (frente 061, F5) está migrada para os componentes-base; a tela
// Transações inteira continua em TELAS_PENDENTES (059), então a vista é auditada à parte.
for (const largura of [1366, 390]) {
  for (const estado of ["com dados", "vazio", "carregando"] as const) {
    test(`Aportes e resgates: auditoria ${estado} em ${largura}px`, async ({ page }, info) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await entrar(page);
      await irPara(page, "Transações");
      if (estado !== "com dados") {
        await page.evaluate(estado => {
          const original = window.fetch.bind(window);
          window.fetch = async (entrada, opcoes) => {
            const caminho = new URL(String(entrada), location.href).pathname;
            if (caminho.endsWith("/movimentos-de-investimento")) {
              if (estado === "carregando") return await new Promise<Response>(() => {});
              return new Response("[]", { headers: { "Content-Type": "application/json" } });
            }
            return original(entrada, opcoes);
          };
        }, estado);
      }
      await page.getByRole("button", { name: "Aportes e resgates", exact: true }).click();
      const secao = page.getByRole("region", { name: "Movimentos de investimento" });
      await expect(secao).toBeVisible();
      await expect(secao.getByRole("heading", { name: "Aportes e resgates" })).toBeVisible();
      const achados = await secao.evaluate(raiz =>
        [...raiz.querySelectorAll<HTMLElement>("select,input,textarea,button,summary,table,h1,h2,h3,h4,label")]
          .filter(e => e.offsetParent && !e.className?.toString().trim())
          .map(e => `${e.tagName}${e instanceof HTMLInputElement ? `:${e.type}` : ""} "${(e.innerText || "").trim().slice(0, 30)}"`),
      );
      expect(achados).toEqual([]);
      await page.screenshot({ path: info.outputPath(`aportes-e-resgates-${estado}-${largura}.png`), fullPage: true, animations: "disabled" });
    });
  }
}

for (const largura of [1366, 390]) {
  test(`Orçamento: indicadores de Renda e projeção alinhados em ${largura}px`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: 900 });
    await entrar(page);
    await irPara(page, "Orçamento");
    const medidas = await page.evaluate(() =>
      ["Renda-base mensal", "Renda do mês", "Gasto até agora", "Projeção do mês"].map((nome) => {
        const grupo = document.querySelector<HTMLElement>(`main [role="group"][aria-label="${nome}"]`)!;
        const caixa = grupo.getBoundingClientRect();
        const valor = grupo.querySelector("[data-parte=valor]")!.getBoundingClientRect();
        const rotulo = grupo.querySelector("[data-parte=rotulo]")!.getBoundingClientRect();
        return { topo: caixa.top, altura: caixa.height, valorAteABase: caixa.bottom - valor.bottom, rotulo: rotulo.top - caixa.top, linha: Math.round(valor.top) };
      }),
    );
    // Cartões da mesma linha da grade: mesma altura e mesmas posições internas.
    const porLinha = new Map<number, typeof medidas>();
    for (const m of medidas) porLinha.set(Math.round(m.topo), [...(porLinha.get(Math.round(m.topo)) ?? []), m]);
    for (const grupo of porLinha.values()) {
      for (const m of grupo) {
        expect(Math.abs(m.altura - grupo[0].altura)).toBeLessThanOrEqual(1);
        expect(Math.abs(m.valorAteABase - grupo[0].valorAteABase)).toBeLessThanOrEqual(1);
        expect(Math.abs(m.rotulo - grupo[0].rotulo)).toBeLessThanOrEqual(1);
      }
    }
  });

  test(`Indicadores compactos, sem vão, em Início, Transações, Contas e Investimentos em ${largura}px`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: 900 });
    await entrar(page);
    for (const tela of ["Início", "Transações", "Contas", "Investimentos", "Orçamento"]) {
      if (tela !== "Início") await irPara(page, tela);
      const linhas = await page.evaluate(() => {
        const grupos = [...document.querySelectorAll<HTMLElement>('main [role="group"]')].filter((g) => g.querySelector("[data-parte=valor]"));
        const porLinha = new Map<string, HTMLElement[]>(); const grades: (HTMLElement | null)[] = []; for (const g of grupos) { let a: HTMLElement | null = g.parentElement; while (a && getComputedStyle(a).display !== "grid") a = a.parentElement; if (!grades.includes(a)) grades.push(a); }
        for (const g of grupos) { const c = g.getBoundingClientRect(); let grade: HTMLElement | null = g.parentElement; while (grade && getComputedStyle(grade).display !== "grid") grade = grade.parentElement; const chave = `${grades.indexOf(grade)}|${Math.round(c.top)}`; porLinha.set(chave, [...(porLinha.get(chave) ?? []), g]); }
        return [...porLinha.values()].map((irmaos) => {
          const temNota = irmaos.some((g) => g.querySelector("[data-parte=nota]")?.getAttribute("data-vazia") === "false");
          return irmaos.map((g) => {
            const caixa = g.getBoundingClientRect();
            const valor = g.querySelector("[data-parte=valor]")!.getBoundingClientRect();
            const nota = g.querySelector("[data-parte=nota]")!.getBoundingClientRect();
            return { altura: caixa.height, valorAteABase: caixa.bottom - valor.bottom, alturaDaNota: nota.height, temNota };
          });
        });
      });
      for (const irmaos of linhas) for (const m of irmaos) {
        expect(Math.abs(m.altura - irmaos[0].altura), `${tela}: mesma altura`).toBeLessThanOrEqual(1);
        expect(Math.abs(m.valorAteABase - irmaos[0].valorAteABase), `${tela}: valor na mesma linha`).toBeLessThanOrEqual(1);
        // Linha sem nota nenhuma: nada de área de nota nem de vão embaixo do valor (borda interna de 16px + 1px).
        if (!m.temNota) { expect(m.alturaDaNota, `${tela}: sem área de nota`).toBe(0); expect(m.valorAteABase, `${tela}: sem vão`).toBeLessThanOrEqual(20); }
      }
    }
  });

  test(`Transações: o total do dia fica na coluna dos valores em ${largura}px`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: 900 });
    await entrar(page);
    await irPara(page, "Transações");
    const bordas = await page.evaluate(() => {
      const direita = (e: Element) => Math.round(e.getBoundingClientRect().right);
      const subtotal = document.querySelector("main [data-subtotal]")!;
      const valor = document.querySelector("main [data-valor]")!;
      return { subtotal: direita(subtotal), valor: direita(valor), cor: getComputedStyle(subtotal).color, corDoValor: getComputedStyle(valor).color };
    });
    expect(bordas.subtotal).toBe(bordas.valor);
    expect(bordas.cor).not.toBe(bordas.corDoValor);
  });
}

for (const largura of [1366, 390]) {
  test(`Contas: o diálogo de apelido segue o Artigo XI em ${largura}px`, async ({ page }, info) => {
    await page.setViewportSize({ width: largura, height: 900 });
    await entrar(page);
    await irPara(page, "Contas");
    await page.getByRole("button", { name: /^Mais ações da conta Nubank/ }).click();
    await page.getByRole("menuitem", { name: "Dar apelido", exact: true }).click();
    const dialogo = page.getByRole("dialog", { name: "Dar apelido", exact: true });
    await expect(dialogo).toBeVisible();
    const achados = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("dialog[open] :is(select,input,textarea,button,summary,table,h1,h2,h3,h4,label)")]
        .filter(e => e.offsetParent && !e.className?.toString().trim())
        .map(e => `${e.tagName}${e instanceof HTMLInputElement ? `:${e.type}` : ""} "${(e.innerText || "").trim().slice(0, 30)}"`),
    );
    expect(achados).toEqual([]);
    await expect(dialogo.locator('[data-variante="primario"]:visible')).toHaveCount(1);
    await page.screenshot({ path: info.outputPath(`Contas-apelido-${largura}.png`), animations: "disabled" });
  });
}
