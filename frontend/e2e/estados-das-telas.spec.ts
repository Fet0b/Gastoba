import { expect, test } from "@playwright/test";
import { entrar, irPara } from "./apoio";

// Artigo XI.7 e XI.10: as telas com lista também são auditadas e capturadas vazias e carregando.
// Contas e Transações já têm os dados no cache da sessão quando a pessoa chega (o Início os carrega),
// então o carregando delas não aparece de forma confiável aqui; o vazio de Transações vem de um mês antigo
// e o de Contas é coberto pelos testes de componente.
const TELAS = [
  { nome: "Transações", caminho: "/transacoes?mes=2020-01", estados: ["vazio"], vazio: "Nenhum gasto ou ganho neste mês", carregando: "", bloqueados: [] as string[] },
  { nome: "Recorrências", caminho: "/", estados: ["vazio", "carregando"], vazio: "Nenhuma recorrência ainda", carregando: "Carregando as recorrências…", bloqueados: ["/recorrencias"] },
] as const;

for (const largura of [1366, 390]) {
  for (const tela of TELAS) {
    for (const estado of tela.estados) {
      test(`${tela.nome}: ${estado} em ${largura}px sem elementos fora do padrão`, async ({ page }, info) => {
        await page.setViewportSize({ width: largura, height: 900 });
        await entrar(page, tela.caminho);
        await page.evaluate(({ estado, caminhos }) => {
          const original = window.fetch.bind(window);
          window.fetch = async (entrada, opcoes) => {
            const caminho = new URL(String(entrada), location.href).pathname;
            if ((opcoes?.method ?? "GET") === "GET" && caminhos.some((c) => caminho.endsWith(c))) {
              if (estado === "carregando") return await new Promise<Response>(() => {});
              return new Response("[]", { headers: { "Content-Type": "application/json" } });
            }
            return original(entrada, opcoes);
          };
        }, { estado, caminhos: [...tela.bloqueados] });
        if (tela.caminho === "/") await irPara(page, tela.nome);
        if (estado === "vazio") await expect(page.getByText(tela.vazio, { exact: true })).toBeVisible();
        else await expect(page.getByRole("status", { name: tela.carregando, exact: true }).first()).toBeVisible();
        const achados = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>("main :is(select,input,textarea,button,summary,table,h1,h2,h3,h4,label)")]
            .filter((e) => e.offsetParent && !e.className?.toString().trim())
            .map((e) => `${e.tagName} "${(e.innerText || "").trim().slice(0, 30)}"`),
        );
        expect(achados).toEqual([]);
        await page.screenshot({ path: info.outputPath(`${tela.nome}-${largura}-${estado}.png`), fullPage: true, animations: "disabled" });
      });
    }
  }
}
