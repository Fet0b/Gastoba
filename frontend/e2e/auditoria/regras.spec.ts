import { expect, test, type Page } from "@playwright/test";

import { auditar, REGRAS } from "./regras";

// Frente 070, T005: cada regra da auditoria geométrica tem aqui um HTML que passa e um que falha
// (e os casos de borda do plano §6). O HTML não depende do app: tokens e estilos vêm da própria página.

const BASE = `
<style>
  :root {
    --cor-noite: #0c0814; --cor-ameixa: #171024; --cor-veludo: #241a38; --cor-bruma: #9a8fb8;
    --cor-nevoa: #eee9fb; --cor-positivo: #4ade80; --cor-negativo: #ff6b81;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--cor-noite); color: var(--cor-nevoa); font: 16px/1.5 sans-serif; }
  .painel { background: var(--cor-ameixa); padding: 16px; }
  .oculto { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;
    clip-path: inset(50%); white-space: nowrap; border: 0; }
  ul { list-style: none; margin: 0; padding: 0; }
  p { margin: 0; }
</style>`;

// As regras medem HTML próprio com a largura pedida pelo teste: um projeto basta (no "celular", com
// `isMobile`, o viewport de layout ignora `setViewportSize` e o R15 falhava).
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop", "a largura vem do teste, não do projeto");
});

async function rodar(page: Page, html: string, regra: string, largura = 1000): Promise<string[]> {
  await page.setViewportSize({ width: largura, height: 700 });
  await page.setContent(`<!doctype html><html><head>${BASE}</head><body>${html}</body></html>`);
  const achados = await auditar(page, [regra]);
  expect(achados.every((a) => a.regra === regra)).toBe(true);
  return achados.map((a) => a.alvo);
}

const comPainel = (conteudo: string): string => `<main><section class="painel">${conteudo}</section></main>`;

test("a lista de regras vai de R1 a R20", () => {
  expect(REGRAS).toEqual(Array.from({ length: 20 }, (_, i) => `R${i + 1}`));
});

test.describe("R1 coluna estreita", () => {
  test("texto de 6+ caracteres quebrado numa coluna de menos de 6em falha", async ({ page }) => {
    expect(await rodar(page, comPainel(`<div style="width:60px"><p>Reserva de emergência</p></div>`), "R1")).not.toEqual([]);
  });
  test("coluna larga passa", async ({ page }) => {
    expect(await rodar(page, comPainel(`<div style="width:320px"><p>Reserva de emergência</p></div>`), "R1")).toEqual([]);
  });
  test("texto curto numa coluna estreita passa", async ({ page }) => {
    expect(await rodar(page, comPainel(`<div style="width:40px"><p>Casa</p></div>`), "R1")).toEqual([]);
  });
  test("texto de svg não acusa", async ({ page }) => {
    expect(await rodar(page, comPainel(`<svg width="40" height="40"><text x="0" y="20">Reserva de emergência</text></svg>`), "R1")).toEqual([]);
  });
});

test.describe("R2 palavra partida", () => {
  test("palavra longa quebrada no meio falha", async ({ page }) => {
    expect(await rodar(page, comPainel(`<div style="width:60px;overflow-wrap:anywhere">Supercalifragilistico</div>`), "R2")).not.toEqual([]);
  });
  test("palavra longa com reticências passa", async ({ page }) => {
    expect(await rodar(page, comPainel(`<div style="width:60px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Supercalifragilistico</div>`), "R2")).toEqual([]);
  });
  test("quebra entre palavras passa", async ({ page }) => {
    expect(await rodar(page, comPainel(`<div style="width:90px">Reserva de emergência da casa</div>`), "R2")).toEqual([]);
  });
});

test.describe("R3 texto colado", () => {
  test("irmãos com texto sem espaço falham", async ({ page }) => {
    expect(await rodar(page, comPainel(`<p><span>Gasto</span><span>terça-feira</span></p>`), "R3")).not.toEqual([]);
  });
  test("irmãos separados por espaço passam", async ({ page }) => {
    expect(await rodar(page, comPainel(`<p><span>Gasto</span> <span>terça-feira</span></p>`), "R3")).toEqual([]);
  });
  test("irmãos de uma linha flex com gap passam", async ({ page }) => {
    expect(await rodar(page, comPainel(`<p style="display:flex;gap:8px"><span>Gasto</span><span>terça-feira</span></p>`), "R3")).toEqual([]);
  });
  test("regiões vizinhas com folga interna passam", async ({ page }) => {
    const html = `<div style="display:flex"><aside style="padding:16px">Menu lateral</aside><section style="padding:16px">Conteúdo</section></div>`;
    expect(await rodar(page, comPainel(html), "R3")).toEqual([]);
  });
  test("opções de um controle segmentado, cada uma com a sua caixa, passam", async ({ page }) => {
    const html = `<div style="display:flex"><label style="flex:1;padding:0 16px"><input type="radio" name="x"> Suave</label><label style="flex:1;padding:0 16px"><input type="radio" name="x"> Média</label></div>`;
    expect(await rodar(page, comPainel(html), "R3")).toEqual([]);
  });
  test("pontuação colada ao texto passa", async ({ page }) => {
    expect(await rodar(page, comPainel(`<p><span>Total</span><span>: 3</span></p>`), "R3")).toEqual([]);
  });
});

test.describe("R4 fora de painel", () => {
  test("texto de conteúdo direto na página falha", async ({ page }) => {
    expect(await rodar(page, `<main><p>Texto solto</p></main>`, "R4")).not.toEqual([]);
  });
  test("texto dentro de painel passa", async ({ page }) => {
    expect(await rodar(page, comPainel(`<p>Texto no painel</p>`), "R4")).toEqual([]);
  });
  test("texto do cabeçalho da tela passa", async ({ page }) => {
    expect(await rodar(page, `<main><header data-cabecalho-da-tela><h1>Contas</h1><p>Subtítulo</p></header></main>`, "R4")).toEqual([]);
  });
  test("texto só para leitor de tela passa", async ({ page }) => {
    expect(await rodar(page, `<main><p class="oculto">Para leitores</p></main>`, "R4")).toEqual([]);
  });
  test("controle com fundo próprio fora de painel passa (o lugar dele é de outra regra)", async ({ page }) => {
    expect(await rodar(page, `<main><button>Gastos e ganhos</button></main>`, "R4")).toEqual([]);
  });
  test("texto fora de main passa", async ({ page }) => {
    expect(await rodar(page, `<nav><a href="#">Início</a></nav>`, "R4")).toEqual([]);
  });
});

test.describe("R5 superfície", () => {
  const campo = (borda: string): string =>
    `<div style="background:var(--cor-veludo);padding:8px"><input aria-label="Nome" style="background:var(--cor-veludo);border:1px solid ${borda};height:44px"></div>`;
  test("campo veludo com borda veludo sobre veludo falha", async ({ page }) => {
    expect(await rodar(page, comPainel(campo("#241a38")), "R5")).not.toEqual([]);
  });
  test("campo com borda visível passa", async ({ page }) => {
    expect(await rodar(page, comPainel(campo("#5b4a85")), "R5")).toEqual([]);
  });
  test("fundo noite dentro de ameixa falha", async ({ page }) => {
    expect(await rodar(page, comPainel(`<div style="background:var(--cor-noite);padding:8px">Item</div>`), "R5")).not.toEqual([]);
  });
  test("fundo noite na página passa", async ({ page }) => {
    expect(await rodar(page, `<div style="background:var(--cor-noite)">Item</div>`, "R5")).toEqual([]);
  });
});

test.describe("R6 título", () => {
  test("título de 15 px falha", async ({ page }) => {
    expect(await rodar(page, comPainel(`<h2 style="font-size:15px;font-weight:700;margin:0">Recorrências</h2>`), "R6")).not.toEqual([]);
  });
  test("as três medidas da tabela passam", async ({ page }) => {
    const html = comPainel(
      `<h1 style="font-size:28px;font-weight:700">A</h1><h2 style="font-size:20px;font-weight:650">B</h2><h3 style="font-size:16px;font-weight:650">C</h3>`,
    );
    expect(await rodar(page, html, "R6")).toEqual([]);
  });
  test("título só para leitor de tela passa", async ({ page }) => {
    expect(await rodar(page, `<h1 class="oculto" style="font-size:15px">Gastoba</h1>`, "R6")).toEqual([]);
  });
});

test.describe("R7 destaque", () => {
  const destaque = (peso: number, variante: string): string =>
    `<p style="font-size:40px;font-weight:${peso};font-variant-numeric:${variante}">R$ 1.000,00</p>`;
  test("dois valores de destaque falham", async ({ page }) => {
    expect(await rodar(page, comPainel(destaque(700, "tabular-nums") + destaque(700, "tabular-nums")), "R7")).not.toEqual([]);
  });
  test("destaque sem peso 700 falha", async ({ page }) => {
    expect(await rodar(page, comPainel(destaque(500, "tabular-nums")), "R7")).not.toEqual([]);
  });
  test("destaque sem algarismos tabulares falha", async ({ page }) => {
    expect(await rodar(page, comPainel(destaque(700, "proportional-nums")), "R7")).not.toEqual([]);
  });
  test("valor de linha de lista com mais de 20 px falha", async ({ page }) => {
    expect(await rodar(page, comPainel(`<ul><li><span style="font-size:28px">R$ 10,00</span></li></ul>`), "R7")).not.toEqual([]);
  });
  test("um destaque correto e valores de lista de 16 px passam", async ({ page }) => {
    const html = comPainel(destaque(700, "tabular-nums") + `<ul><li><span>R$ 10,00</span></li></ul>`);
    expect(await rodar(page, html, "R7")).toEqual([]);
  });
});

test.describe("R8 rótulo de campo", () => {
  test("rótulo de 16 px em formulário falha", async ({ page }) => {
    expect(await rodar(page, comPainel(`<form><label style="font-size:16px">Nome<input></label></form>`), "R8")).not.toEqual([]);
  });
  test("rótulo de 13 px passa", async ({ page }) => {
    expect(await rodar(page, comPainel(`<form><label style="font-size:13px">Nome<input></label></form>`), "R8")).toEqual([]);
  });
  test("rótulo de caixa ou opção, em linha com o texto, passa", async ({ page }) => {
    expect(await rodar(page, comPainel(`<form><label style="font-size:16px"><input type="checkbox"> Aceito</label></form>`), "R8")).toEqual([]);
  });
  test("rótulo fora de formulário e de diálogo passa", async ({ page }) => {
    expect(await rodar(page, comPainel(`<label style="font-size:16px">Busca<input></label>`), "R8")).toEqual([]);
  });
});

test.describe("R9 dl", () => {
  test("dd com a margem padrão falha", async ({ page }) => {
    expect(await rodar(page, comPainel(`<dl><dt>Valor</dt><dd>R$ 1,00</dd></dl>`), "R9")).not.toEqual([]);
  });
  test("dd sem margem passa", async ({ page }) => {
    expect(await rodar(page, comPainel(`<dl><dt>Valor</dt><dd style="margin:0">R$ 1,00</dd></dl>`), "R9")).toEqual([]);
  });
});

test.describe("R10 separador", () => {
  const lista = (largura: number): string => `
    <style>.m{display:flex;flex-wrap:wrap;width:${largura}px}.m span{width:80px}.m span+span::before{content:"\\00B7"}</style>
    <div class="m"><span>A</span><span>B</span><span>C</span></div>`;
  test("separador no começo de linha falha", async ({ page }) => {
    expect(await rodar(page, comPainel(lista(100)), "R10")).not.toEqual([]);
  });
  test("itens na mesma linha passam", async ({ page }) => {
    expect(await rodar(page, comPainel(lista(400)), "R10")).toEqual([]);
  });
  const recortada = (extra: string): string => `
    <style>.m{display:flex;flex-wrap:wrap;width:100px;column-gap:16px;${extra}}.m span{position:relative;width:80px}.m span+span::before{content:"\\00B7";position:absolute;inset-inline-end:100%;width:16px}</style>
    <div class="m"><span>A</span><span>B</span><span>C</span></div>`;
  test("separador absoluto recortado pelo contêiner no começo da linha passa", async ({ page }) => {
    expect(await rodar(page, comPainel(recortada("overflow-x:clip")), "R10")).toEqual([]);
  });
  test("o mesmo separador sem o recorte falha", async ({ page }) => {
    expect(await rodar(page, comPainel(recortada("")), "R10")).not.toEqual([]);
  });
});

test.describe("R11 corte", () => {
  const caixa = (extra: string, texto = "Texto bem comprido de uma descrição"): string =>
    `<div style="width:60px;overflow:hidden;white-space:nowrap;${extra}">${texto}</div>`;
  test("texto cortado sem reticências falha", async ({ page }) => {
    expect(await rodar(page, comPainel(caixa("")), "R11")).not.toEqual([]);
  });
  test("texto cortado com reticências passa", async ({ page }) => {
    expect(await rodar(page, comPainel(caixa("text-overflow:ellipsis")), "R11")).toEqual([]);
  });
  test("reticências declaradas num contêiner flex não valem e falham (achado 9)", async ({ page }) => {
    expect(await rodar(page, comPainel(caixa("display:flex;text-overflow:ellipsis")), "R11")).not.toEqual([]);
  });
  test("contêiner flex cujo filho corta com reticências passa", async ({ page }) => {
    const html = `<div style="display:flex;width:60px;overflow:hidden"><span style="min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">Texto bem comprido de uma descrição</span></div>`;
    expect(await rodar(page, comPainel(html), "R11")).toEqual([]);
  });
  const linhaDe = (terceira: string): string =>
    `<ul><li style="display:grid;grid-template-columns:40px 216px 44px;width:324px;align-items:start"><span>i</span><p style="margin:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">Pix Enviado Restaurante Sabor Caseiro</p>${terceira}</li></ul>`;
  test("descrição cortada com coluna vazia ao lado, na mesma linha, falha (achado 16)", async ({ page }) => {
    const html = linhaDe(`<span></span>`);
    expect(await rodar(page, comPainel(html), "R11")).not.toEqual([]);
  });
  test("descrição cortada com o menu ao lado, na mesma linha, passa", async ({ page }) => {
    expect(await rodar(page, comPainel(linhaDe(`<button aria-label="Mais ações da linha" style="width:44px;height:30px">⋯</button>`)), "R11")).toEqual([]);
  });
  test("texto curto que cabe passa", async ({ page }) => {
    expect(await rodar(page, comPainel(caixa("", "Ok")), "R11")).toEqual([]);
  });
  test("uma letra de marca que passa da caixa não conta", async ({ page }) => {
    expect(await rodar(page, comPainel(`<span style="display:inline-block;width:10px;overflow:hidden;white-space:nowrap;font-size:32px">G</span>`), "R11")).toEqual([]);
  });
  test("texto só para leitor de tela passa", async ({ page }) => {
    expect(await rodar(page, comPainel(`<span class="oculto">Texto só para leitores de tela</span>`), "R11")).toEqual([]);
  });
  test("opção escolhida de seletor cortada sem reticências falha", async ({ page }) => {
    const seletor = (extra: string): string =>
      `<select style="width:90px;${extra}"><option>Conta corrente do banco com nome muito comprido</option></select>`;
    expect(await rodar(page, comPainel(seletor("")), "R11")).not.toEqual([]);
    expect(await rodar(page, comPainel(seletor("text-overflow:ellipsis")), "R11")).toEqual([]);
  });
});

test.describe("R12 caixa alta e códigos", () => {
  test("código interno cru falha", async ({ page }) => {
    expect(await rodar(page, comPainel(`<p>REAL_ESTATE_FUND</p>`), "R12")).not.toEqual([]);
  });
  test("nome de banco em caixa alta falha", async ({ page }) => {
    expect(await rodar(page, comPainel(`<p>ITAÚ UNIBANCO</p>`), "R12")).not.toEqual([]);
  });
  test("text-transform lowercase em nome falha", async ({ page }) => {
    expect(await rodar(page, `<nav><span style="text-transform:lowercase">Meu Gastoba</span></nav>`, "R12")).not.toEqual([]);
  });
  test("texto em caixa mista e siglas passam", async ({ page }) => {
    expect(await rodar(page, comPainel(`<p>Itaú Unibanco</p><p>Pix recebido</p><p>CDB e CDI</p>`), "R12")).toEqual([]);
  });
  test("uppercase no cabeçalho de tabela passa", async ({ page }) => {
    const tabela = `<table><thead><tr><th style="text-transform:uppercase">Valor</th></tr></thead></table>`;
    expect(await rodar(page, comPainel(tabela), "R12")).toEqual([]);
  });
});

test.describe("R13 coluna de valor", () => {
  const linha = (margem: number, numeros = "tabular-nums"): string =>
    `<li style="display:flex;justify-content:flex-end"><span style="margin-right:${margem}px;font-variant-numeric:${numeros}">R$ 10,00</span></li>`;
  test("valores com bordas direitas diferentes falham", async ({ page }) => {
    expect(await rodar(page, comPainel(`<ul>${linha(0)}${linha(40)}</ul>`), "R13")).not.toEqual([]);
  });
  test("valores alinhados passam", async ({ page }) => {
    expect(await rodar(page, comPainel(`<ul>${linha(0)}${linha(0)}</ul>`), "R13")).toEqual([]);
  });
  test("valor sem algarismos tabulares falha", async ({ page }) => {
    expect(await rodar(page, comPainel(`<ul>${linha(0, "proportional-nums")}${linha(0)}</ul>`), "R13")).not.toEqual([]);
  });
});

test.describe("R13 gasto de limite (achado 17)", () => {
  const meta = (texto: string, alinhamento: string): string =>
    `<li style="display:flex;flex-direction:column;align-items:${alinhamento};width:300px"><span style="font-variant-numeric:tabular-nums">${texto}</span></li>`;
  test("pares 'R$ x de R$ y' de larguras diferentes alinhados à esquerda falham", async ({ page }) => {
    const html = comPainel(`<ul>${meta("R$ 1.482,30 de R$ 975,00", "flex-start")}${meta("R$ 309,90 de R$ 650,00", "flex-start")}</ul>`);
    expect(await rodar(page, html, "R13")).not.toEqual([]);
  });
  test("pares alinhados à direita passam", async ({ page }) => {
    const html = comPainel(`<ul>${meta("R$ 1.482,30 de R$ 975,00", "flex-end")}${meta("R$ 309,90 de R$ 650,00", "flex-end")}</ul>`);
    expect(await rodar(page, html, "R13")).toEqual([]);
  });
});

test.describe("R14 menu na linha", () => {
  test("gatilho abaixo da primeira linha de texto falha", async ({ page }) => {
    const html = comPainel(`<ul><li><span>Descrição da linha</span><div><button aria-label="Mais ações da linha">⋯</button></div></li></ul>`);
    expect(await rodar(page, html, "R14")).not.toEqual([]);
  });
  test("gatilho na primeira linha passa", async ({ page }) => {
    const html = comPainel(
      `<ul><li style="display:flex;justify-content:space-between"><span>Descrição da linha</span><button aria-label="Mais ações da linha">⋯</button></li></ul>`,
    );
    expect(await rodar(page, html, "R14")).toEqual([]);
  });
});

test.describe("R15 cabeçalho", () => {
  const cabecalho = (acoes: string): string =>
    `<main><header data-cabecalho-da-tela><div><h1>Recorrências</h1></div><div style="${acoes}"><button>Mês</button><button>Nova</button><button>Novo gasto</button></div></header></main>`;
  test("controles em linhas diferentes em 390 px falham", async ({ page }) => {
    expect(await rodar(page, cabecalho("display:grid;justify-items:start"), "R15", 390)).not.toEqual([]);
  });
  test("controles na mesma linha em 390 px passam", async ({ page }) => {
    expect(await rodar(page, cabecalho("display:flex;gap:4px"), "R15", 390)).toEqual([]);
  });
  test("botão flutuante fora da linha do cabeçalho não conta", async ({ page }) => {
    const html = `<main><header data-cabecalho-da-tela><div><h1>Contas</h1></div><div style="display:flex;gap:4px"><button>Mês</button><button style="position:fixed;bottom:8px;right:8px">Novo gasto</button></div></header></main>`;
    expect(await rodar(page, html, "R15", 390)).toEqual([]);
  });
  test("em tela larga a regra não vale", async ({ page }) => {
    expect(await rodar(page, cabecalho("display:grid;justify-items:start"), "R15", 1366)).toEqual([]);
  });
});

test.describe("R16 contraste", () => {
  test("selo com contraste baixo falha", async ({ page }) => {
    expect(await rodar(page, comPainel(`<span style="background:#6d5bd0;color:#f0b429;padding:4px">9 pendentes</span>`), "R16")).not.toEqual([]);
  });
  test("selo com contraste suficiente passa", async ({ page }) => {
    expect(await rodar(page, comPainel(`<span style="background:#f0b429;color:#0c0814;padding:4px">9 pendentes</span>`), "R16")).toEqual([]);
  });
  test("controle desabilitado não conta", async ({ page }) => {
    expect(await rodar(page, comPainel(`<button disabled style="background:#6d5bd0;color:#8a7fb0">Salvar</button>`), "R16")).toEqual([]);
  });
});

test.describe("R17 cores distintas", () => {
  const legenda = (a: string, b: string): string =>
    `<ul><li><i style="display:inline-block;width:10px;height:10px;background:${a}"></i> Casa</li><li><i style="display:inline-block;width:10px;height:10px;background:${b}"></i> Reserva</li></ul>`;
  test("duas partes com a mesma cor falham", async ({ page }) => {
    expect(await rodar(page, comPainel(legenda("#a855f7", "#a855f7")), "R17")).not.toEqual([]);
  });
  test("cores distintas passam", async ({ page }) => {
    expect(await rodar(page, comPainel(legenda("#a855f7", "#38bdf8")), "R17")).toEqual([]);
  });
});

test.describe("R17 legenda repartida em recolhível (achado 22)", () => {
  const item = (cor: string, nome: string): string =>
    `<li><i style="display:inline-block;width:10px;height:10px;background:${cor}"></i> ${nome}</li>`;
  const legendaRepartida = (a: string, b: string): string =>
    `<div><ul>${item("#38bdf8", "Viagem")}${item(a, "Reserva")}</ul><details><summary>+ 1 destinação</summary><ul>${item(b, "Casa")}</ul></details></div>`;
  test("cor repetida entre a lista e o recolhível da mesma legenda falha", async ({ page }) => {
    expect(await rodar(page, comPainel(legendaRepartida("#fbbf24", "#fbbf24")), "R17")).not.toEqual([]);
  });
  test("cores distintas entre a lista e o recolhível passam", async ({ page }) => {
    expect(await rodar(page, comPainel(legendaRepartida("#fbbf24", "#34d399")), "R17")).toEqual([]);
  });
  test("a mesma cor em listas de seções diferentes passa", async ({ page }) => {
    const html = comPainel(`<div><ul>${item("#fbbf24", "Reserva")}</ul></div><div><ul>${item("#fbbf24", "Reserva")}</ul></div>`);
    expect(await rodar(page, html, "R17")).toEqual([]);
  });
});

test.describe("R18 sinal e cor", () => {
  const linha = (texto: string, cor: string): string => `<li><span style="color:${cor}">${texto}</span></li>`;
  test("entrada sem a cor positiva falha", async ({ page }) => {
    expect(await rodar(page, comPainel(`<ul>${linha("+R$ 10,00", "var(--cor-nevoa)")}</ul>`), "R18")).not.toEqual([]);
  });
  test("saída sem a cor negativa falha", async ({ page }) => {
    expect(await rodar(page, comPainel(`<ul>${linha("\u2212R$ 10,00", "var(--cor-nevoa)")}</ul>`), "R18")).not.toEqual([]);
  });
  test("sinais com as cores semânticas passam", async ({ page }) => {
    const html = `<ul>${linha("+R$ 10,00", "var(--cor-positivo)")}${linha("\u2212R$ 5,00", "var(--cor-negativo)")}</ul>`;
    expect(await rodar(page, comPainel(html), "R18")).toEqual([]);
  });
  test("valor sem sinal não conta", async ({ page }) => {
    expect(await rodar(page, comPainel(`<ul>${linha("R$ 10,00", "var(--cor-nevoa)")}</ul>`), "R18")).toEqual([]);
  });
});

test.describe("R19 desabilitado explicado", () => {
  test("botão desabilitado sem explicação falha", async ({ page }) => {
    expect(await rodar(page, comPainel(`<button disabled>Salvar</button>`), "R19")).not.toEqual([]);
  });
  test("botão desabilitado com texto visível que diz o que falta passa", async ({ page }) => {
    expect(await rodar(page, comPainel(`<button disabled aria-describedby="d">Salvar</button><p id="d">Preencha o valor.</p>`), "R19")).toEqual([]);
  });
  test("a explicação escondida não vale", async ({ page }) => {
    expect(await rodar(page, comPainel(`<button disabled aria-describedby="d">Salvar</button><p id="d" hidden>Preencha o valor.</p>`), "R19")).not.toEqual([]);
  });
  test("botão habilitado passa", async ({ page }) => {
    expect(await rodar(page, comPainel(`<button>Salvar</button>`), "R19")).toEqual([]);
  });
});

test.describe("R20 grade sem vaga", () => {
  const grade = (ultimo: string): string =>
    `<div style="--colunas:3;display:grid;grid-template-columns:repeat(2,1fr);gap:8px;width:300px"><div>a</div><div>b</div><div style="${ultimo}">c</div></div>`;
  test("última linha com célula vazia falha", async ({ page }) => {
    expect(await rodar(page, comPainel(grade("")), "R20")).not.toEqual([]);
  });
  test("último indicador na linha inteira passa", async ({ page }) => {
    expect(await rodar(page, comPainel(grade("grid-column:1 / -1")), "R20")).toEqual([]);
  });
});
