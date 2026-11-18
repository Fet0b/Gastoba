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
const EXCECOES_DE_ELEMENTO_NATIVO: string[] = [
  "componentes/Agenda/ComprometidoPorMes.tsx",
  "componentes/Agenda/ProximosLancamentos.tsx",
  "componentes/Chaves/FormularioDeChave.tsx",
  "componentes/Chaves/ListaDeChaves.tsx",
  "componentes/Chaves/SegredoDaChave.tsx",
  "componentes/Compositor/CategoriaDoAporte.tsx",
  "componentes/Compositor/CompositorDeGasto.tsx",
  "componentes/Contas/FiltroDeContas.tsx",
  "componentes/Contas/FormularioDeConta.tsx",
  "componentes/Contas/ListaDeContas.tsx",
  "componentes/Faturas/CartaoComFaturas.tsx",
  "componentes/Faturas/CartaoDeFatura.tsx",
  "componentes/Grafico/DetalheDaTag.tsx",
  "componentes/Grafico/GraficoDeBarras.tsx",
  "componentes/Grafico/GraficoDeRitmo/GraficoDeRitmo.tsx",
  "componentes/Grafico/GraficoDeRitmo/TabelaDoRitmo.tsx",
  "componentes/Importadas/CaixaDeEntrada.tsx",
  "componentes/Importadas/CartaoDeImportada.tsx",
  "componentes/Importadas/ClassificarTransferencia.tsx",
  "componentes/Importadas/EditorDeDivisao.tsx",
  "componentes/Importadas/EditorDeOperacaoDoInvestimento.tsx",
  "componentes/Importadas/LinhaDaParte.tsx",
  "componentes/Importadas/ListaDeIgnoradas.tsx",
  "componentes/Inicio/UltimosGastos.tsx",
  "componentes/Metas/EditorDaMeta.tsx",
  "componentes/Metas/MetasDoMes.tsx",
  "componentes/Metas/PainelDaMeta.tsx",
  "componentes/Recorrencias/EdicaoDeRecorrencia.tsx",
  "componentes/Recorrencias/FormularioDeRecorrencia.tsx",
  "componentes/Recorrencias/ListaDeRecorrencias.tsx",
  "componentes/Sininho/Sininho.tsx",
  "componentes/Transacoes/BuscaDeTransacoes.tsx",
  "componentes/Transacoes/CoberturaDaCompra.tsx",
  "componentes/Transacoes/FiltrosEmFolha.tsx",
  "componentes/Transacoes/LinhaDoTempo.tsx",
  "paginas/Inicio.tsx",
  "paginas/Orcamento.tsx",
  "paginas/Outros.tsx",
  "paginas/Perfil.tsx",
];
const EXCECOES_DE_CSS: string[] = [];
const EXCECOES_DE_BOTAO_PRIMARIO: string[] = [
  "/paginas/Orcamento.tsx",
];
const EXCECOES_DE_CABECALHO: string[] = [];
