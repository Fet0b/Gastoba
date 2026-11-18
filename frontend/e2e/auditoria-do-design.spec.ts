import { expect, test } from "@playwright/test";
import { entrar, irPara } from "./apoio";

const TELAS = ["Início", "Transações", "Orçamento", "Contas", "Investimentos", "Faturas", "Tags", "Recorrências", "Perfil"];

// A migração de cada tela remove a respectiva exceção (T033, T038, T044, T049).
const TELAS_PENDENTES = new Set(TELAS.filter(tela=>tela!=="Investimentos"));

for (const largura of [1366, 390]) {
  for (const nome of TELAS) {
    test(`${nome}: auditoria do Artigo XI em ${largura}px`, async ({ page }, info) => {
      test.fixme(TELAS_PENDENTES.has(nome), "A migração dos elementos nativos desta tela ainda está pendente na frente 059.");
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
  test(`cabeçalho único nas nove telas em ${largura}px`, async ({page}, info) => {
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
      await page.evaluate(estado => {
        const original=window.fetch.bind(window);
        window.fetch=async (entrada,opcoes)=>{
          const caminho=new URL(String(entrada),location.href).pathname;
          if(caminho.endsWith("/investimentos")) {
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
