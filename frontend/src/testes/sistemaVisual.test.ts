/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Varredura do sistema visual (revisão de UI/UX): lê o código-fonte dos componentes e das
 * páginas e confere as regras de conteúdo e de componentes-base, para que não voltem sem aviso.
 */
const FONTES = import.meta.glob(
  ["../**/*.tsx", "!../**/*.test.tsx", "!../simulacao/**"],
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
) as Record<string, string>;

const TOKENS = import.meta.glob("../estilos/tokens.css", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** Pastas que podem ter `<button>` próprio (os componentes-base e as exceções do plano). */
const PASTAS_COM_BOTAO_PROPRIO = [
  "/componentes/Botao/",
  "/componentes/Chip/",
  "/componentes/MenuDeAcoes/",
  "/componentes/Dica/",
  "/componentes/DialogoDeConfirmacao/",
  "/componentes/Navegacao/",
  "/componentes/Pagina/",
  "/componentes/Aviso/",
  "/componentes/Olho/",
  "/componentes/Grafico/GraficoDeBarras",
  "/componentes/Grafico/GraficoDePizza",
  "/componentes/Compositor/CampoDeTags",
  "/componentes/Metas/LinhaDaMeta",
  "/componentes/Contas/CartaoDeConta",
  "/componentes/Investimentos/CorDaDestinacao",
];

const arquivos = Object.entries(FONTES);

function comLinhas(texto: string): [number, string][] {
  return texto.split("\n").map((linha, i) => [i + 1, linha]);
}

describe("sistema visual: varredura do código", () => {
  it("encontra os arquivos de componentes e de páginas", () => {
    expect(arquivos.length).toBeGreaterThan(50);
  });

  it("nenhum texto da interface usa o separador ' · ' (cada dado em seu próprio elemento)", () => {
    const achados = arquivos.flatMap(([caminho, texto]) =>
      comLinhas(texto)
        .filter(
          ([, linha]) => /·/.test(linha) && !/^\s*(\/\/|\/\*|\*)/.test(linha),
        )
        .map(([n]) => `${caminho}:${n}`),
    );
    expect(achados).toEqual([]);
  });

  it("nenhum <button> cru fora dos componentes-base e das exceções do plano", () => {
    const achados = arquivos
      .filter(
        ([caminho]) =>
          !PASTAS_COM_BOTAO_PROPRIO.some((pasta) => caminho.includes(pasta)),
      )
      .flatMap(([caminho, texto]) =>
        comLinhas(texto)
          .filter(([, linha]) => /<button[\s>]/.test(linha))
          .map(([n]) => `${caminho}:${n}`),
      );
    expect(achados).toEqual([]);
  });

  it("o botão destrutivo só aparece no DialogoDeConfirmacao", () => {
    const achados = arquivos
      .filter(
        ([caminho]) => !caminho.includes("/componentes/DialogoDeConfirmacao/"),
      )
      .flatMap(([caminho, texto]) =>
        comLinhas(texto)
          .filter(([, linha]) => /variante=["{]\s*"?destrutivo/.test(linha))
          .map(([n]) => `${caminho}:${n}`),
      );
    expect(achados).toEqual([]);
  });

  it("nenhum EstadoVazio tem a prop texto= (só título e ação)", () => {
    const achados = arquivos.flatMap(([caminho, texto]) => {
      const blocos = texto.match(/<EstadoVazio[\s\S]*?\/>/g) ?? [];
      return blocos
        .filter((bloco) => /\btexto=/.test(bloco))
        .map(() => caminho);
    });
    expect(achados).toEqual([]);
  });

  it("os tokens não usam color-mix()", () => {
    const [[, tokens]] = Object.entries(TOKENS);
    expect(tokens).not.toContain("color-mix(");
  });

  // ---------------------------------------------------------------------------------------
  // Artigo XI (frente 059): elementos nativos só dentro dos componentes-base, CSS só em tokens.
  // As listas de exceções são temporárias: cada uma encolhe até ficar vazia ao fim da frente.
  // ---------------------------------------------------------------------------------------

  it("elementos nativos de formulário e de texto só existem nos componentes-base", () => {
    const achados = arquivos
      .filter(
        ([caminho]) =>
          !PASTAS_COM_ELEMENTO_NATIVO.some((pasta) => caminho.includes(pasta)),
      )
      .filter(([, texto]) => ELEMENTO_NATIVO.test(texto))
      .map(([caminho]) => caminho);
    const novos = achados.filter(
      (c) => !EXCECOES_DE_ELEMENTO_NATIVO.some((e) => c.endsWith(e)),
    );
    expect(novos).toEqual([]);
    const jaLimpos = EXCECOES_DE_ELEMENTO_NATIVO.filter(
      (e) => !achados.some((c) => c.endsWith(e)),
    );
    expect(jaLimpos, "arquivo já limpo: tire-o da lista de exceções").toEqual(
      [],
    );
  });

  it("o CSS dos componentes só usa tokens (cor, tamanho de texto, raio, peso e px)", () => {
    const achados = Object.entries(CSS).flatMap(([caminho, texto]) =>
      violacoesDeCss(caminho, texto).map(
        (v) => `${caminho.replace("../", "")}: ${v}`,
      ),
    );
    const novos = achados.filter(
      (a) => !EXCECOES_DE_CSS.some((e) => a.startsWith(e)),
    );
    expect(novos).toEqual([]);
    const jaLimpos = EXCECOES_DE_CSS.filter(
      (e) => !achados.some((a) => a.startsWith(e)),
    );
    expect(jaLimpos, "arquivo já limpo: tire-o da lista de exceções").toEqual(
      [],
    );
  });

  it("nenhuma página tem botão primário próprio (a ação da página vem do cabeçalho)", () => {
    const achados = arquivos
      .filter(([caminho]) => caminho.includes("/paginas/"))
      .filter(
        ([caminho]) =>
          !EXCECOES_DE_BOTAO_PRIMARIO.some((e) => caminho.endsWith(e)),
      )
      .filter(([, texto]) => /variante=["{]\s*"?primario/.test(texto))
      .map(([caminho]) => caminho);
    expect(achados).toEqual([]);
  });

  it("toda página usa o CabecalhoDaTela", () => {
    const achados = arquivos
      .filter(([caminho]) => /\/paginas\/[A-Z][A-Za-z]+\.tsx$/.test(caminho))
      .filter(
        ([caminho]) => !EXCECOES_DE_CABECALHO.some((e) => caminho.endsWith(e)),
      )
      .filter(([, texto]) => !texto.includes("cabecalho="))
      .map(([caminho]) => caminho);
    expect(achados).toEqual([]);
  });
});

const ELEMENTO_NATIVO =
  /<(select|input|textarea|summary|details|table|label|fieldset|h[1-4])[\s>]/;

/** Pastas onde o elemento nativo é permitido: são os próprios componentes-base. */
const PASTAS_COM_ELEMENTO_NATIVO = [
  "/componentes/Campo/",
  "/componentes/Recolhivel/",
  "/componentes/Titulo/",
  "/componentes/Tabela/",
  "/componentes/Dialogo/",
  "/componentes/Chip/",
  "/componentes/ControleSegmentado/",
  "/componentes/SeletorDoTema/",
  "/componentes/Compositor/CampoDeTags",
  "/componentes/Compositor/GrupoDeChips",
  "/componentes/Pagina/",
  "/componentes/Navegacao/",
  "/componentes/Investimentos/CorDaDestinacao",
];

/**
 * Lê os `.module.css` do disco: o Vitest não processa CSS (o `?inline` vem vazio) e o `?raw`
 * de um módulo CSS devolve só o mapa de classes.
 */
const RAIZ_DO_CODIGO = join(process.cwd(), "src");
const CSS: Record<string, string> = Object.fromEntries(
  readdirSync(RAIZ_DO_CODIGO, { recursive: true, encoding: "utf-8" })
    .filter((c) => c.endsWith(".module.css"))
    .map((c) => [
      "../" + c.split("\\").join("/"),
      readFileSync(join(RAIZ_DO_CODIGO, c), "utf-8"),
    ]),
);

/** Pastas de CSS com medidas próprias por natureza (desenho e traços de SVG). */
const CSS_DE_DESENHO = ["/componentes/Olho/", "/componentes/Grafico/"];

function violacoesDeCss(caminho: string, texto: string): string[] {
  const limpo = texto.replace(/\/\*[\s\S]*?\*\//g, "");
  const achados: string[] = [];
  if (/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|color-mix\(/.test(limpo))
    achados.push("cor literal");
  for (const [, valor] of limpo.matchAll(/font-size:\s*([^;]+);/g)) {
    if (
      !/^var\(--(texto|numero)-[a-z-]+(,[^)]*)?\)$|^inherit$/.test(valor.trim())
    )
      achados.push(`font-size ${valor.trim()}`);
  }
  for (const [, valor] of limpo.matchAll(/border-radius:\s*([^;]+);/g)) {
    if (
      !/^(var\(--raio-[a-z0-9-]+\)|0|50%)( (var\(--raio-[a-z0-9-]+\)|0|50%))*$/.test(
        valor.trim(),
      )
    )
      achados.push(`border-radius ${valor.trim()}`);
  }
  for (const [, valor] of limpo.matchAll(/font-weight:\s*([^;]+);/g)) {
    if (!/^(400|500|var\(--peso-[a-z]+\)|inherit)$/.test(valor.trim()))
      achados.push(`font-weight ${valor.trim()}`);
  }
  if (!CSS_DE_DESENHO.some((pasta) => caminho.includes(pasta))) {
    const semTokens = limpo.replace(/var\([^)]*\)/g, "");
    if (
      /(?<![\d.])(?!0?\.?[0-2]px)\d*\.?\d+px/.test(
        semTokens.replace(/\b[0-2]px\b/g, ""),
      )
    )
      achados.push("px literal");
  }
  return achados;
}

/** Exceções temporárias (prefixo do achado, "arquivo: regra"); ver T003 a T049 de tasks.md. */
const EXCECOES_DE_ELEMENTO_NATIVO: string[] = [];
const EXCECOES_DE_CSS: string[] = [];
const EXCECOES_DE_BOTAO_PRIMARIO: string[] = [];
const EXCECOES_DE_CABECALHO: string[] = [];

/** Art. XI.1.8: só `aparencia/aplicarAparencia.ts` troca, em tempo de execução, os tokens de cor. */
const CODIGO = import.meta.glob(
  ["../**/*.ts", "../**/*.tsx", "!../**/*.test.ts", "!../**/*.test.tsx", "!../simulacao/**"],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

describe("sistema visual: aparência da pessoa", () => {
  const VARIAVEIS_LOCAIS = ["--cor-do-anel", "--cor-da-categoria"];
  const ESCRITA_DE_TOKEN =
    /["'`](--(?:cor|superficie|borda|textura|gradiente)[a-z-]*)["'`]/g;

  it("nenhum outro arquivo escreve variável de cor ou de textura em tempo de execução", () => {
    const achados = Object.entries(CODIGO)
      .filter(([caminho]) => !caminho.endsWith("/aparencia/aplicarAparencia.ts"))
      .filter(([caminho]) => !caminho.includes("/aparencia/"))
      .flatMap(([caminho, texto]) =>
        comLinhas(texto)
          .filter(([, linha]) => /setProperty|style=|estilo\s*=|CSSProperties/.test(linha))
          .flatMap(([n, linha]) =>
            [...linha.matchAll(ESCRITA_DE_TOKEN)]
              .map((m) => m[1])
              .filter((nome) => !VARIAVEIS_LOCAIS.includes(nome))
              .map((nome) => `${caminho}:${n} ${nome}`),
          ),
      );
    expect(achados).toEqual([]);
  });

  it("aplicarAparencia.ts existe e é quem chama setProperty", () => {
    const [, texto] =
      Object.entries(CODIGO).find(([c]) => c.endsWith("/aparencia/aplicarAparencia.ts")) ?? [];
    expect(texto).toContain("setProperty");
  });
});

// ---------------------------------------------------------------------------------------------
// Frente 070 (plano §5.2): cinco regras estáticas que previnem as causas dos defeitos de layout.
// As listas PENDENTES_* guardam o que ainda viola cada regra; cada faixa da 070 tira da lista o
// que corrige (o teste exige, como nas exceções acima), e a fase final apaga as listas.
// ---------------------------------------------------------------------------------------------

/** Declarações CSS (`propriedade: valor`) de um trecho, inclusive as das regras aninhadas. */
function declaracoes(corpo: string): { propriedade: string; valor: string }[] {
  return [...corpo.matchAll(/(?:^|[;{\s])([a-z-]+)\s*:\s*([^;{}]+)/g)].map((m) => ({
    propriedade: m[1]!,
    valor: m[2]!.trim(),
  }));
}

/** Cada bloco `@regra condição { corpo }` do CSS, com o corpo completo (chaves balanceadas). */
function blocosDeRegra(css: string, regra: string): { condicao: string; corpo: string }[] {
  const limpo = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocos: { condicao: string; corpo: string }[] = [];
  const abertura = new RegExp(`@${regra}\\b([^{]*)\\{`, "g");
  for (let m = abertura.exec(limpo); m; m = abertura.exec(limpo)) {
    let nivel = 1;
    let i = m.index + m[0].length;
    const inicio = i;
    while (i < limpo.length && nivel > 0) {
      if (limpo[i] === "{") nivel += 1;
      else if (limpo[i] === "}") nivel -= 1;
      i += 1;
    }
    blocos.push({ condicao: m[1]!.trim(), corpo: limpo.slice(inicio, i - 1) });
  }
  return blocos;
}

/** Regra 1: layout em `componentes/` muda por `@container`, não por `@media` de largura. */
function layoutPorMediaDeLargura(caminho: string, css: string): string[] {
  if (!caminho.includes("/componentes/")) return [];
  return blocosDeRegra(css, "media")
    .filter((b) => /\b(min|max)-width\b|\bwidth\b/.test(b.condicao))
    .flatMap((b) =>
      declaracoes(b.corpo)
        .filter((d) => d.propriedade === "grid-template-columns" || d.propriedade === "display")
        .map((d) => `${d.propriedade} dentro de @media (${b.condicao})`),
    );
}

/** Regra 2: nenhum `text-transform` fora do cabeçalho de `Tabela` (`uppercase`). */
function textTransformProibido(caminho: string, css: string): string[] {
  const limpo = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const achados: string[] = [];
  for (const [, valor] of limpo.matchAll(/text-transform:\s*([^;]+);/g)) {
    const v = valor!.trim();
    if (v === "uppercase" && caminho.includes("/componentes/Tabela/")) continue;
    if (v !== "none") achados.push(`text-transform: ${v}`);
  }
  return achados;
}

/** Regra 3: nenhum separador " · " literal nos módulos de texto e de dados da interface. */
const PASTAS_SEM_SEPARADOR = ["/investimentos/", "/transacoes/", "/inicio/", "/contas/", "/texto/"];
function separadorLiteral(caminho: string, texto: string): string[] {
  if (!PASTAS_SEM_SEPARADOR.some((p) => caminho.includes(p))) return [];
  return comLinhas(texto)
    .filter(([, linha]) => /·|\\u00b7|&middot;/i.test(linha) && !/^\s*(\/\/|\/\*|\*)/.test(linha))
    .map(([n]) => `linha ${n}`);
}

/** Regra 4: a classe passada a `Titulo` não muda tamanho, peso nem altura de linha. */
function classeQueMudaOTitulo(texto: string, cssDoArquivo: Record<string, string>): string[] {
  const importacoes = Object.fromEntries(
    [...texto.matchAll(/import\s+(\w+)\s+from\s+["']([^"']+\.module\.css)["']/g)].map((m) => [m[1]!, m[2]!]),
  );
  const achados: string[] = [];
  for (const [tag] of texto.matchAll(/<Titulo\b[\s\S]*?>(?=[\s\S]*?<\/Titulo>|\s*\/>)/g)) {
    const atributo = /className=\{([^}]*)\}/.exec(tag)?.[1];
    if (!atributo) continue;
    for (const [, objeto, classe] of atributo.matchAll(/(\w+)\.(\w+)/g)) {
      const css = cssDoArquivo[importacoes[objeto!] ?? ""];
      if (!css) continue;
      const limpo = css.replace(/\/\*[\s\S]*?\*\//g, "");
      const regras = [...limpo.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((r) =>
        new RegExp(`\\.${classe}(?![\\w-])`).test(r[1]!),
      );
      for (const r of regras) {
        for (const d of declaracoes(r[2]!)) {
          if (["font-size", "font-weight", "line-height"].includes(d.propriedade)) {
            achados.push(`${classe} declara ${d.propriedade}`);
          }
        }
      }
    }
  }
  return achados;
}

/** Regra 5: todo `import "./X.module.css"` aponta para um arquivo que existe. */
function importacaoDeCssQueNaoExiste(caminho: string, texto: string, existentes: Set<string>): string[] {
  const pasta = caminho.slice(0, caminho.lastIndexOf("/"));
  return [...texto.matchAll(/from\s+["'](\.{1,2}\/[^"']+\.module\.css)["']/g)]
    .map((m) => m[1]!)
    .filter((relativo) => !existentes.has(normalizarCaminho(`${pasta}/${relativo}`)))
    .map((relativo) => `importa ${relativo}, que não existe`);
}
function normalizarCaminho(caminho: string): string {
  const partes: string[] = [];
  for (const parte of caminho.split("/")) {
    if (parte === "..") partes.pop();
    else if (parte !== ".") partes.push(parte);
  }
  return partes.join("/");
}

/** Ainda violam (arquivo: regra); cada faixa tira da lista o que corrige. */
const PENDENTES_DE_MEDIA: string[] = [
  "/componentes/Agenda/Agenda.module.css",
  "/componentes/Chaves/Chaves.module.css",
  "/componentes/Grafico/DetalheDaTag.module.css",
  "/componentes/Grafico/GraficoDeBarras.module.css",
  "/componentes/Grafico/GraficoDePizza.module.css",
  "/componentes/Inicio/Inicio.module.css",
  "/componentes/Investimentos/Investimentos.module.css",
  "/componentes/Investimentos/RevisaoDaBolsa.module.css",
  "/componentes/Pagina/Pagina.module.css",
  "/componentes/Recorrencias/Recorrencias.module.css",
  "/componentes/Transacoes/LinhaDoTempo.module.css",
  "/componentes/Transacoes/Transacoes.module.css",
];
const PENDENTES_DE_TEXT_TRANSFORM: string[] = [
  "/componentes/Agenda/Agenda.module.css",
  "/componentes/Chaves/Chaves.module.css",
  "/componentes/Entrar/Entrar.module.css",
  "/componentes/Inicio/Inicio.module.css",
  "/componentes/Investimentos/Investimentos.module.css",
  "/componentes/Navegacao/Navegacao.module.css",
  "/componentes/Recorrencias/Recorrencias.module.css",
];
const PENDENTES_DE_SEPARADOR: string[] = [];
const PENDENTES_DE_CLASSE_NO_TITULO: string[] = [
  "/componentes/Agenda/ComprometidoPorMes.tsx",
  "/componentes/Agenda/ProximosLancamentos.tsx",
  "/componentes/Chaves/FormularioDeChave.tsx",
  "/componentes/Chaves/ListaDeChaves.tsx",
  "/componentes/Chaves/SegredoDaChave.tsx",
  "/componentes/Compositor/CompositorDeGasto.tsx",
  "/componentes/Entrar/Entrar.tsx",
  "/componentes/Faturas/CartaoDeFatura.tsx",
  "/componentes/Grafico/DetalheDaTag.tsx",
  "/componentes/Grafico/GraficoDeBarras.tsx",
  "/componentes/Importadas/CaixaDeEntrada.tsx",
  "/componentes/Importadas/CartaoDeImportada.tsx",
  "/componentes/Importadas/EditorDeDivisao.tsx",
  "/componentes/Importadas/ListaDeIgnoradas.tsx",
  "/componentes/Inicio/UltimosGastos.tsx",
  "/componentes/Metas/MetasDoMes.tsx",
  "/componentes/Metas/PainelDaMeta.tsx",
  "/componentes/Navegacao/BarraDeAbas.tsx",
  "/componentes/Recorrencias/ListaDeRecorrencias.tsx",
  "/componentes/Sininho/Sininho.tsx",
  "/componentes/Transacoes/FiltrosEmFolha.tsx",
  "/componentes/Transacoes/LinhaDoTempo.tsx",
  "/paginas/Inicio.tsx",
  "/paginas/Orcamento.tsx",
  "/paginas/Outros.tsx",
  "/paginas/Perfil.tsx",
];

/** Compara o que a regra acusa com a lista de pendentes, nos dois sentidos. */
function conferirComPendentes(achados: string[], pendentes: string[]): void {
  const novos = achados.filter((a) => !pendentes.some((p) => a.startsWith(p)));
  expect(novos, "violação nova: corrija em vez de listar").toEqual([]);
  const jaLimpos = pendentes.filter((p) => !achados.some((a) => a.startsWith(p)));
  expect(jaLimpos, "arquivo já limpo: tire-o da lista de pendentes").toEqual([]);
}

describe("sistema visual: regras estáticas da frente 070", () => {
  const todosOsCss = Object.entries(CSS).map(([c, t]) => [c.replace("../", "/"), t] as const);

  it("regra 1: componentes mudam de layout por @container, não por @media de largura", () => {
    conferirComPendentes(
      todosOsCss.flatMap(([c, t]) => layoutPorMediaDeLargura(c, t).map((v) => `${c}: ${v}`)),
      PENDENTES_DE_MEDIA,
    );
  });

  it("regra 1 (caso plantado): grid dentro de @media de largura em componentes falha", () => {
    const css = ".a { color: red; }\n@media (min-width: 40rem) {\n  .a { grid-template-columns: 1fr 1fr; }\n}";
    expect(layoutPorMediaDeLargura("/componentes/X/X.module.css", css)).not.toEqual([]);
    expect(layoutPorMediaDeLargura("/paginas/X.module.css", css)).toEqual([]);
    expect(layoutPorMediaDeLargura("/componentes/X/X.module.css", "@media (prefers-reduced-motion: reduce) { .a { display: none; } }")).toEqual([]);
    expect(layoutPorMediaDeLargura("/componentes/X/X.module.css", "@container (max-width: 40rem) { .a { display: grid; } }")).toEqual([]);
  });

  it("regra 2: sem text-transform lowercase ou capitalize; uppercase só no cabeçalho da Tabela", () => {
    conferirComPendentes(
      todosOsCss.flatMap(([c, t]) => textTransformProibido(c, t).map((v) => `${c}: ${v}`)),
      PENDENTES_DE_TEXT_TRANSFORM,
    );
  });

  it("regra 2 (caso plantado): lowercase e uppercase fora da Tabela falham", () => {
    expect(textTransformProibido("/componentes/X/X.module.css", ".a { text-transform: lowercase; }")).not.toEqual([]);
    expect(textTransformProibido("/componentes/X/X.module.css", ".a { text-transform: uppercase; }")).not.toEqual([]);
    expect(textTransformProibido("/componentes/Tabela/Tabela.module.css", ".a { text-transform: uppercase; }")).toEqual([]);
    expect(textTransformProibido("/componentes/X/X.module.css", ".a { text-transform: none; }")).toEqual([]);
  });

  it("regra 3: sem separador literal nos módulos de texto e de dados", () => {
    const achados = Object.entries(CODIGO)
      .map(([c, t]) => [c.replace("../", "/"), t] as const)
      .flatMap(([c, t]) => separadorLiteral(c, t).map((v) => `${c}: ${v}`));
    conferirComPendentes(achados, PENDENTES_DE_SEPARADOR);
  });

  it("regra 3 (caso plantado): separador em investimentos/ falha e fora da lista de pastas não", () => {
    expect(separadorLiteral("/investimentos/rotulo.ts", 'const a = `${x} · ${y}`;')).not.toEqual([]);
    expect(separadorLiteral("/texto/x.ts", 'const a = "\\u00B7";')).not.toEqual([]);
    expect(separadorLiteral("/api/x.ts", 'const a = "·";')).toEqual([]);
    expect(separadorLiteral("/texto/x.ts", "// um · no comentário")).toEqual([]);
  });

  it("regra 4: a classe passada a Titulo não declara font-size, font-weight nem line-height", () => {
    const achados = arquivos.flatMap(([caminho, texto]) =>
      classeQueMudaOTitulo(texto, cssRelativoA(caminho)).map((v) => `${caminho.replace("../", "/")}: ${v}`),
    );
    conferirComPendentes(achados, PENDENTES_DE_CLASSE_NO_TITULO);
  });

  it("regra 4 (caso plantado): classe com font-size passada a Titulo falha", () => {
    const tsx = 'import estilos from "./X.module.css";\n<Titulo nivel="secao" className={estilos.grande}>Oi</Titulo>';
    const css = { "./X.module.css": ".grande { font-size: 40px; margin: 0; }" };
    expect(classeQueMudaOTitulo(tsx, css)).toEqual(["grande declara font-size"]);
    expect(classeQueMudaOTitulo(tsx, { "./X.module.css": ".grande { margin: 0; }" })).toEqual([]);
    expect(classeQueMudaOTitulo('<Titulo nivel="secao">Oi</Titulo>', css)).toEqual([]);
  });

  it("regra 5: todo import de .module.css aponta para um arquivo que existe", () => {
    const existentes = new Set(Object.keys(CSS).map((c) => c.replace("../", "src/")));
    const achados = [...Object.entries(CODIGO)]
      .map(([c, t]) => [c.replace("../", "src/"), t] as const)
      .flatMap(([c, t]) => importacaoDeCssQueNaoExiste(c, t, existentes).map((v) => `${c}: ${v}`));
    expect(achados).toEqual([]);
  });

  it("regra 5 (caso plantado): import de CSS de outra pasta falha", () => {
    const existentes = new Set(["src/componentes/Contas/Contas.module.css"]);
    const tsx = 'import estilos from "./Contas.module.css";';
    expect(importacaoDeCssQueNaoExiste("src/paginas/Contas.tsx", tsx, existentes)).not.toEqual([]);
    expect(importacaoDeCssQueNaoExiste("src/componentes/Contas/Contas.tsx", tsx, existentes)).toEqual([]);
    expect(importacaoDeCssQueNaoExiste("src/paginas/Contas.tsx", 'import e from "../componentes/Contas/Contas.module.css";', existentes)).toEqual([]);
  });
});

/** Mapa "import relativo -> texto do CSS" para o arquivo `.tsx` em `caminho` (chaves como no import). */
function cssRelativoA(caminho: string): Record<string, string> {
  const pasta = caminho.slice(0, caminho.lastIndexOf("/"));
  const mapa: Record<string, string> = {};
  for (const [c, texto] of Object.entries(CSS)) {
    const nome = c.slice(c.lastIndexOf("/") + 1);
    if (normalizarCaminho(`${pasta}/./${nome}`) === normalizarCaminho(c)) mapa[`./${nome}`] = texto;
  }
  return mapa;
}
