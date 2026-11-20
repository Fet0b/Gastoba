import type { Page } from "@playwright/test";

/**
 * Auditoria geométrica (frente 070, plano §5.1): regras que medem, no navegador, o que a varredura
 * estática não vê (largura real das colunas, palavras partidas, texto fora de painel, cortes sem
 * reticências). `auditar` roda as regras na página aberta e devolve os achados; as suítes comparam
 * com a lista de pendências de cada tela.
 */

export const REGRAS = Array.from({ length: 20 }, (_, i) => `R${i + 1}`);

export type Achado = { regra: string; alvo: string };

export const DESCRICAO_DAS_REGRAS: Record<string, string> = {
  R1: "coluna estreita",
  R2: "palavra partida",
  R3: "texto colado",
  R4: "texto fora de painel",
  R5: "superfície sem camada",
  R6: "título fora da tabela",
  R7: "valor de destaque",
  R8: "rótulo de campo",
  R9: "dd com margem",
  R10: "separador no começo da linha",
  R11: "corte sem reticências",
  R12: "caixa alta ou código cru",
  R13: "coluna de valor",
  R14: "menu fora da primeira linha",
  R15: "cabeçalho em várias linhas",
  R16: "contraste",
  R17: "cores repetidas na legenda",
  R18: "sinal sem a cor semântica",
  R19: "desabilitado sem explicação",
  R20: "grade com vaga",
};

export async function auditar(page: Page, regras: readonly string[] = REGRAS): Promise<Achado[]> {
  return page.evaluate(executar, [...regras]);
}

/** Roda dentro da página: precisa ser autocontida (sem imports nem referências ao módulo). */
function executar(ativas: string[]): { regra: string; alvo: string }[] {
  const achados: { regra: string; alvo: string }[] = [];
  const quer = (regra: string): boolean => ativas.includes(regra);
  const achar = (regra: string, el: Element | null, detalhe = ""): void => {
    achados.push({ regra, alvo: `${descrever(el)}${detalhe ? ` (${detalhe})` : ""}` });
  };

  // --- utilidades -----------------------------------------------------------------------------
  function descrever(el: Element | null): string {
    if (!el) return "?";
    const classes = (typeof el.className === "string" ? el.className : "")
      .split(/\s+/)
      .filter(Boolean)
      .map((c) => c.replace(/^_?([A-Za-z0-9]+)_[A-Za-z0-9]{4,}.*$/, "$1"))
      .slice(0, 2)
      .join(".");
    const texto = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 28);
    return `${el.tagName.toLowerCase()}${classes ? `.${classes}` : ""}${texto ? ` "${texto}"` : ""}`;
  }

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const contexto = canvas.getContext("2d", { willReadFrequently: true });
  type Rgba = [number, number, number, number];
  const cacheDeCor = new Map<string, Rgba>();
  function cor(texto: string): Rgba {
    const guardada = cacheDeCor.get(texto);
    if (guardada) return guardada;
    let resultado: Rgba = [0, 0, 0, 0];
    if (contexto) {
      contexto.clearRect(0, 0, 1, 1);
      contexto.fillStyle = "#000";
      contexto.fillStyle = texto;
      contexto.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = contexto.getImageData(0, 0, 1, 1).data;
      resultado = [r ?? 0, g ?? 0, b ?? 0, (a ?? 0) / 255];
    }
    cacheDeCor.set(texto, resultado);
    return resultado;
  }
  const igual = (a: Rgba, b: Rgba): boolean =>
    Math.abs(a[0] - b[0]) <= 2 && Math.abs(a[1] - b[1]) <= 2 && Math.abs(a[2] - b[2]) <= 2;
  function token(nome: string): Rgba {
    const sonda = document.createElement("i");
    sonda.style.background = `var(${nome})`;
    document.body.append(sonda);
    const c = cor(getComputedStyle(sonda).backgroundColor);
    sonda.remove();
    return c;
  }
  const fundoDe = (el: Element): Rgba => cor(getComputedStyle(el).backgroundColor);
  /** Primeiro ancestral (a partir do próprio, se pedido) com fundo opaco. */
  function ancestralOpaco(el: Element | null, incluirProprio: boolean): Element | null {
    let atual = incluirProprio ? el : (el?.parentElement ?? null);
    while (atual) {
      if (fundoDe(atual)[3] >= 0.99) return atual;
      atual = atual.parentElement;
    }
    return null;
  }
  function compor(frente: Rgba, fundo: Rgba): Rgba {
    return [
      frente[0] * frente[3] + fundo[0] * (1 - frente[3]),
      frente[1] * frente[3] + fundo[1] * (1 - frente[3]),
      frente[2] * frente[3] + fundo[2] * (1 - frente[3]),
      1,
    ];
  }
  /** Fundo efetivo: as camadas translúcidas compostas até o primeiro fundo opaco. */
  function fundoEfetivo(el: Element): Rgba {
    const camadas: Rgba[] = [];
    let atual: Element | null = el;
    while (atual) {
      const c = fundoDe(atual);
      camadas.push(c);
      if (c[3] >= 0.99) break;
      atual = atual.parentElement;
    }
    let fundo: Rgba = camadas.pop() ?? [0, 0, 0, 1];
    if (fundo[3] < 0.99) fundo = compor(fundo, [0, 0, 0, 1]);
    for (const camada of camadas.reverse()) fundo = compor(camada, fundo);
    return fundo;
  }
  function luminancia(c: Rgba): number {
    const lin = (v: number): number => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  }
  function contraste(a: Rgba, b: Rgba): number {
    const la = luminancia(a);
    const lb = luminancia(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  const cacheDeVisibilidade = new WeakMap<Element, boolean>();
  function visivel(el: Element | null): boolean {
    if (!el) return false;
    const guardado = cacheDeVisibilidade.get(el);
    if (guardado !== undefined) return guardado;
    let resultado = true;
    const estilo = getComputedStyle(el);
    if (estilo.display === "none" || estilo.visibility === "hidden" || Number(estilo.opacity) === 0) {
      resultado = false;
    } else if (el !== document.body && el.parentElement && !visivel(el.parentElement)) {
      resultado = false;
    } else if (el !== document.body && el !== document.documentElement) {
      const r = el.getBoundingClientRect();
      const oculto = estilo.overflow !== "visible" && r.width <= 1.5 && r.height <= 1.5;
      const recortado = estilo.clipPath !== "none" && r.width <= 1.5 && r.height <= 1.5;
      if (oculto || recortado) resultado = false;
      else if (r.width === 0 && r.height === 0 && el.getClientRects().length === 0) resultado = false;
    }
    cacheDeVisibilidade.set(el, resultado);
    return resultado;
  }
  const dentroDeSvg = (el: Element): boolean => el.closest("svg") !== null;
  const px = (valor: string): number => Number.parseFloat(valor);

  /** Nós de texto visíveis (com o elemento pai), fora de svg, script e estilo. */
  const textos: { no: Text; pai: HTMLElement }[] = [];
  const percurso = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let no = percurso.nextNode(); no; no = percurso.nextNode()) {
    const pai = no.parentElement;
    if (!pai || !(no.textContent ?? "").trim()) continue;
    if (["SCRIPT", "STYLE", "NOSCRIPT", "OPTION", "TEXTAREA"].includes(pai.tagName)) continue;
    if (dentroDeSvg(pai) || !visivel(pai)) continue;
    textos.push({ no: no as Text, pai });
  }
  const textoProprio = (el: Element): string =>
    [...el.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
  /** Retângulos só do texto (não das caixas dos filhos): um nó de texto por vez. */
  function retangulosDoTexto(el: Element): DOMRect[] {
    const resultado: DOMRect[] = [];
    const andador = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let no = andador.nextNode(); no; no = andador.nextNode()) {
      if (!(no.textContent ?? "").trim()) continue;
      const intervalo = document.createRange();
      intervalo.selectNodeContents(no);
      resultado.push(...[...intervalo.getClientRects()].filter((r) => r.width > 0 && r.height > 0));
    }
    return resultado;
  }
  function linhas(retangulos: DOMRect[], tamanho: number): number {
    const topos = retangulos.map((r) => r.top).sort((a, b) => a - b);
    let total = 0;
    let ultimo = Number.NEGATIVE_INFINITY;
    for (const t of topos) {
      if (t - ultimo > tamanho * 0.6) total += 1;
      ultimo = t;
    }
    return total;
  }
  const elementos = [...document.body.querySelectorAll("*")].filter(
    (el) => !dentroDeSvg(el) && !["SCRIPT", "STYLE", "NOSCRIPT", "OPTION"].includes(el.tagName),
  );
  const visiveis = elementos.filter((el) => visivel(el));
  const DINHEIRO = /^[+\-−–]?\s*R\$\s*[\d.]+,\d{2}$/;
  /** "R$ 1.482,30 de R$ 975,00" (gasto de limite): também é valor de coluna e vai à direita. */
  const PAR_DE_DINHEIRO = /^R\$\s*[\d.]+,\d{2}\s+de\s+R\$\s*[\d.]+,\d{2}$/;
  const LINHA = "li, tr, [role=row], [role=listitem]";

  // R1: coluna estreita --------------------------------------------------------------------
  if (quer("R1")) {
    for (const el of visiveis) {
      if (el.children.length > 0) continue;
      const texto = textoProprio(el);
      if (texto.length < 6) continue;
      const tamanho = px(getComputedStyle(el).fontSize);
      const retangulos = retangulosDoTexto(el);
      if (retangulos.length === 0) continue;
      const maisLarga = Math.max(...retangulos.map((r) => r.width));
      const n = linhas(retangulos, tamanho);
      if (n >= 2 && maisLarga < 6 * tamanho) achar("R1", el, `${n} linhas em ${Math.round(maisLarga)}px`);
    }
  }

  // R2: palavra partida --------------------------------------------------------------------
  if (quer("R2")) {
    for (const { no, pai } of textos) {
      const texto = no.textContent ?? "";
      const palavra = /[^\s\-–—/·]{3,}/g;
      for (let m = palavra.exec(texto); m; m = palavra.exec(texto)) {
        const intervalo = document.createRange();
        intervalo.setStart(no, m.index);
        intervalo.setEnd(no, m.index + m[0].length);
        const tamanho = px(getComputedStyle(pai).fontSize);
        if (linhas([...intervalo.getClientRects()].filter((r) => r.width > 0), tamanho) > 1) {
          achar("R2", pai, `"${m[0].slice(0, 20)}"`);
          break;
        }
      }
    }
  }

  // R3: texto colado -----------------------------------------------------------------------
  if (quer("R3")) {
    for (const pai of visiveis) {
      const filhos = [...pai.children].filter((f) => visivel(f) && (f.textContent ?? "").trim() !== "");
      if (filhos.length < 2) continue;
      for (let i = 0; i + 1 < filhos.length; i += 1) {
        const a = filhos[i]!;
        const b = filhos[i + 1]!;
        if (a.nextElementSibling !== b) continue;
        if (a.nextSibling !== b) continue; // há um nó de texto (espaço) entre os dois
        // O que importa é o texto encostar no texto, não as caixas (regiões vizinhas têm folga interna).
        const ta = retangulosDoTexto(a);
        const tb = retangulosDoTexto(b);
        if (ta.length === 0 || tb.length === 0) continue;
        const ultimo = ta.reduce((x, y) => (y.bottom > x.bottom + 1 || (Math.abs(y.bottom - x.bottom) <= 1 && y.right > x.right) ? y : x));
        const primeiro = tb.reduce((x, y) => (y.top < x.top - 1 || (Math.abs(y.top - x.top) <= 1 && y.left < x.left) ? y : x));
        const sobreposicao = Math.min(ultimo.bottom, primeiro.bottom) - Math.max(ultimo.top, primeiro.top);
        if (sobreposicao < Math.min(ultimo.height, primeiro.height) * 0.5) continue;
        const folga = primeiro.left - ultimo.right;
        if (folga >= 2 || folga < -1) continue;
        const fim = (a.textContent ?? "").trimEnd().slice(-1);
        const inicio = (b.textContent ?? "").trimStart().slice(0, 1);
        if (/[([$]/.test(fim) || /[:;,.)\]!?%]/.test(inicio)) continue;
        achar("R3", pai, `"${(a.textContent ?? "").trim().slice(0, 14)}" + "${(b.textContent ?? "").trim().slice(0, 14)}"`);
        break;
      }
    }
  }

  // R4: fora de painel ---------------------------------------------------------------------
  if (quer("R4")) {
    const fundoDaPagina = fundoDe(document.body);
    const principal = document.querySelector("main");
    const ehPainel = (el: Element): boolean => {
      if (["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) return false;
      const f = fundoDe(el);
      return f[3] >= 0.99 && !igual(f, fundoDaPagina);
    };
    const jaVistos = new Set<Element>();
    for (const { pai } of textos) {
      if (!principal?.contains(pai) || jaVistos.has(pai)) continue;
      if (pai.closest("[data-cabecalho-da-tela], button, a, [role=button], [role=tab], select")) continue;
      if (getComputedStyle(pai).position === "fixed" || pai.closest("[style*='position: fixed']")) continue;
      let atual: Element | null = pai;
      let emFixo = false;
      let dentro = false;
      while (atual && atual !== document.body) {
        if (getComputedStyle(atual).position === "fixed") emFixo = true;
        if (ehPainel(atual)) {
          dentro = true;
          break;
        }
        atual = atual.parentElement;
      }
      if (dentro || emFixo) continue;
      jaVistos.add(pai);
      achar("R4", pai);
    }
  }

  // R5: superfície -------------------------------------------------------------------------
  if (quer("R5")) {
    const noite = token("--cor-noite");
    const ameixa = token("--cor-ameixa");
    const veludo = token("--cor-veludo");
    const campos = visiveis.filter((el) =>
      el.matches(
        "input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]), select, textarea",
      ),
    );
    for (const campo of campos) {
      const proprio = fundoDe(campo);
      const sobre = ancestralOpaco(campo, false);
      if (!sobre) continue;
      const fundoDoAncestral = fundoDe(sobre);
      const mesmoFundo = proprio[3] < 0.05 || igual(compor(proprio, fundoDoAncestral), fundoDoAncestral);
      if (!mesmoFundo) continue;
      const estilo = getComputedStyle(campo);
      const larguraDaBorda = px(estilo.borderTopWidth);
      const bordaInvisivel =
        larguraDaBorda === 0 || estilo.borderTopStyle === "none" || igual(cor(estilo.borderTopColor), fundoDoAncestral);
      if (bordaInvisivel) achar("R5", campo, "campo sem borda visível sobre o mesmo fundo");
    }
    if (noite[3] > 0) {
      for (const el of visiveis) {
        if (el === document.body || fundoDe(el)[3] < 0.99 || !igual(fundoDe(el), noite)) continue;
        const sobre = ancestralOpaco(el, false);
        if (!sobre) continue;
        const f = fundoDe(sobre);
        if (igual(f, ameixa) || igual(f, veludo)) achar("R5", el, "fundo noite dentro de ameixa ou veludo");
      }
    }
  }

  // R6: título -----------------------------------------------------------------------------
  if (quer("R6")) {
    const permitidos: [number, number][] = [
      [28, 700],
      [20, 650],
      [16, 650],
    ];
    for (const el of visiveis.filter((e) => /^H[1-4]$/.test(e.tagName))) {
      const estilo = getComputedStyle(el);
      const tamanho = px(estilo.fontSize);
      const peso = Number(estilo.fontWeight);
      if (!permitidos.some(([t, p]) => Math.abs(t - tamanho) <= 0.5 && p === peso)) {
        achar("R6", el, `${tamanho}px, ${peso}`);
      }
    }
  }

  // R7: destaque ---------------------------------------------------------------------------
  if (quer("R7")) {
    const grandes = textos.map((t) => t.pai).filter((el, i, todos) => todos.indexOf(el) === i)
      .filter((el) => px(getComputedStyle(el).fontSize) >= 32);
    if (grandes.length > 1) for (const el of grandes.slice(1)) achar("R7", el, "mais de um valor de destaque na tela");
    for (const el of grandes) {
      const estilo = getComputedStyle(el);
      if (Number(estilo.fontWeight) !== 700) achar("R7", el, `peso ${estilo.fontWeight}`);
      if (!estilo.fontVariantNumeric.includes("tabular-nums")) achar("R7", el, "sem algarismos tabulares");
    }
    for (const { pai } of textos) {
      if (!DINHEIRO.test(textoProprio(pai)) || !pai.closest(LINHA)) continue;
      const tamanho = px(getComputedStyle(pai).fontSize);
      if (tamanho > 20 && tamanho < 32) achar("R7", pai, `valor de lista com ${tamanho}px`);
    }
  }

  // R8: rótulo de campo --------------------------------------------------------------------
  if (quer("R8")) {
    for (const el of visiveis.filter((e) => e.matches("label, legend") && e.closest("form, dialog, [role=dialog]"))) {
      if (el.querySelector("input[type=checkbox], input[type=radio]")) continue;
      if (el.matches("legend") && el.closest("fieldset")?.querySelector("input[type=radio], input[type=checkbox]")) continue;
      const tamanho = px(getComputedStyle(el).fontSize);
      if (Math.abs(tamanho - 13) > 0.5) achar("R8", el, `${tamanho}px`);
    }
  }

  // R9: dl ---------------------------------------------------------------------------------
  if (quer("R9")) {
    for (const dd of visiveis.filter((e) => e.tagName === "DD")) {
      const estilo = getComputedStyle(dd);
      if (px(estilo.marginInlineStart) !== 0) {
        achar("R9", dd, `margem ${estilo.marginInlineStart}`);
        continue;
      }
      const dt = dd.previousElementSibling;
      if (dt?.tagName === "DT") {
        const rd = dd.getBoundingClientRect();
        const rt = dt.getBoundingClientRect();
        const abaixo = rd.top >= rt.bottom - 1;
        if (abaixo && Math.abs(rd.left - rt.left) > 2) achar("R9", dd, "dd abaixo do dt fora de alinhamento");
      }
    }
  }

  // R10: separador no começo de linha ------------------------------------------------------
  if (quer("R10")) {
    for (const pai of visiveis) {
      const filhos = [...pai.children].filter((f) => visivel(f));
      for (let i = 1; i < filhos.length; i += 1) {
        const filho = filhos[i]!;
        const conteudo = getComputedStyle(filho, "::before").content;
        if (!conteudo || conteudo === "none" || conteudo === "normal" || conteudo === '""') continue;
        const anterior = filhos[i - 1]!.getBoundingClientRect();
        const atual = filho.getBoundingClientRect();
        if (atual.top >= anterior.bottom - 1 || atual.left < anterior.left - 1) {
          // O separador posicionado no vão antes do item e recortado pelo contêiner (`Metadados`) não aparece.
          const recorta = ["clip", "hidden"].includes(getComputedStyle(pai).overflowX);
          const absoluto = getComputedStyle(filho, "::before").position === "absolute";
          if (recorta && absoluto && atual.left <= pai.getBoundingClientRect().left + 1) continue;
          achar("R10", filho, "separador no começo da linha");
        }
      }
    }
  }

  // R11: corte sem reticências -------------------------------------------------------------
  if (quer("R11")) {
    for (const el of visiveis) {
      const estilo = getComputedStyle(el);
      if (el.tagName === "SELECT") {
        const opcao = (el as HTMLSelectElement).selectedOptions[0];
        if (!opcao || !contexto) continue;
        contexto.font = `${estilo.fontWeight} ${estilo.fontSize} ${estilo.fontFamily}`;
        const largura = contexto.measureText(opcao.text).width;
        const util =
          el.clientWidth - px(estilo.paddingLeft) - px(estilo.paddingRight) - 24; /* seta do navegador */
        if (largura > util && estilo.textOverflow !== "ellipsis") {
          achar("R11", el, `"${opcao.text.slice(0, 24)}" corta sem reticências`);
        }
        continue;
      }
      if (!["hidden", "clip"].includes(estilo.overflowX)) continue;
      if (el.scrollWidth <= el.clientWidth + 1) continue;
      if ((el.textContent ?? "").trim().length <= 2) continue;
      // `text-overflow` só vale em contêiner de bloco: num flex ou grid o texto é cortado sem reticências.
      const emBloco = !/(flex|grid)/.test(estilo.display);
      if (estilo.textOverflow === "ellipsis" && emBloco) {
        // Reticências só se justificam quando falta lugar: com espaço livre ao lado, na mesma linha
        // visual da linha da lista, o texto foi cortado cedo (a coluna do valor ou do menu foi para baixo).
        const linha = el.closest(LINHA);
        const caixa = el.getBoundingClientRect();
        if (!linha || caixa.height === 0) continue;
        const limite = linha.getBoundingClientRect().right - px(getComputedStyle(linha).paddingRight);
        const ocupada = [...linha.querySelectorAll("*")].some((o) => {
          if (o === el || el.contains(o) || o.contains(el) || !visivel(o)) return false;
          if (o.children.length > 0 && !o.matches("button, a, [role=button]")) return false;
          if ((o.textContent ?? "").trim() === "" && !o.matches("button, a, [role=button]")) return false;
          const r = o.getBoundingClientRect();
          return r.left >= caixa.right - 1 && r.top < caixa.bottom - 1 && r.bottom > caixa.top + 1;
        });
        if (!ocupada && limite - caixa.right >= 32) achar("R11", el, "cortada com espaço livre ao lado");
        continue;
      }
      achar("R11", el, `${el.scrollWidth}px em ${el.clientWidth}px${emBloco ? "" : " (ellipsis não vale em flex/grid)"}`);
    }
  }

  // R12: caixa alta e códigos --------------------------------------------------------------
  if (quer("R12")) {
    const SIGLAS = new Set([
      "PIX", "TED", "DOC", "CDB", "CDI", "LCI", "LCA", "FII", "FIIS", "ETF", "ETFS", "CPF", "CNPJ", "IPCA",
      "SELIC", "BRL", "USD", "IOF", "IRPF", "CVM", "FGC", "CRI", "CRA", "RDB", "LC", "LF", "LIG", "API", "DI",
      "NF", "NFE", "PJ", "PF", "ATM", "TV", "SAC", "RPPS", "IBOV", "IFIX",
    ]);
    const ehCaixaAlta = (token: string): boolean => {
      const limpo = token.replace(/[.,;:()]/g, "");
      return /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]{3,}$/.test(limpo) && !SIGLAS.has(limpo);
    };
    const jaVistos = new Set<Element>();
    for (const { no, pai } of textos) {
      if (jaVistos.has(pai)) continue;
      const texto = no.textContent ?? "";
      const estilo = getComputedStyle(pai);
      if (/\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/.test(texto)) {
        jaVistos.add(pai);
        achar("R12", pai, "código interno");
        continue;
      }
      const palavras = texto.split(/\s+/).filter(Boolean);
      if (palavras.some((p) => ehCaixaAlta(p) && p.replace(/[.,;:()]/g, "").length >= 4)) {
        jaVistos.add(pai);
        achar("R12", pai, "caixa alta");
        continue;
      }
      if (palavras.some((p, i) => ehCaixaAlta(p) && i + 1 < palavras.length && ehCaixaAlta(palavras[i + 1]!))) {
        jaVistos.add(pai);
        achar("R12", pai, "caixa alta");
        continue;
      }
      const transformacao = estilo.textTransform;
      if (transformacao === "lowercase" || transformacao === "capitalize") {
        jaVistos.add(pai);
        achar("R12", pai, `text-transform ${transformacao}`);
      } else if (transformacao === "uppercase" && !pai.closest("th, thead")) {
        jaVistos.add(pai);
        achar("R12", pai, "text-transform uppercase fora do cabeçalho de tabela");
      }
    }
  }

  // Valores monetários em linha de lista (R13, R18) ----------------------------------------
  const valores = textos
    .filter(({ pai }) => {
      const texto = textoProprio(pai);
      return (DINHEIRO.test(texto) || PAR_DE_DINHEIRO.test(texto)) && pai.closest(LINHA);
    })
    .map(({ no, pai }) => {
      const intervalo = document.createRange();
      intervalo.selectNodeContents(no);
      return { pai, direita: intervalo.getBoundingClientRect().right, linha: pai.closest(LINHA)! };
    });

  // R13: coluna de valor -------------------------------------------------------------------
  if (quer("R13")) {
    for (const v of valores) {
      if (!getComputedStyle(v.pai).fontVariantNumeric.includes("tabular-nums")) achar("R13", v.pai, "sem algarismos tabulares");
    }
    const grupos = new Map<Element, Map<number, { pai: Element; direita: number }[]>>();
    const ordinalNaLinha = new Map<Element, number>();
    for (const v of valores) {
      const lista = v.pai.closest("ul, ol, tbody, [role=list], [role=table], [role=rowgroup]") ?? v.linha.parentElement;
      if (!lista) continue;
      const ordinal = ordinalNaLinha.get(v.linha) ?? 0;
      ordinalNaLinha.set(v.linha, ordinal + 1);
      const colunas = grupos.get(lista) ?? new Map<number, { pai: Element; direita: number }[]>();
      colunas.set(ordinal, [...(colunas.get(ordinal) ?? []), { pai: v.pai, direita: v.direita }]);
      grupos.set(lista, colunas);
    }
    for (const colunas of grupos.values()) {
      for (const coluna of colunas.values()) {
        if (coluna.length < 2) continue;
        const referencia = coluna[0]!.direita;
        const fora = coluna.find((c) => Math.abs(c.direita - referencia) > 1);
        if (fora) achar("R13", fora.pai, "borda direita diferente das outras da coluna");
      }
    }
  }

  // R14: menu na linha ---------------------------------------------------------------------
  if (quer("R14")) {
    const gatilhos = visiveis.filter(
      (el) => el.matches("button, [role=button]") && /^Mais ações/i.test(el.getAttribute("aria-label") ?? ""),
    );
    for (const gatilho of gatilhos) {
      const linha = gatilho.closest(LINHA);
      if (!linha) continue;
      const topos = textos
        .filter(({ pai }) => linha.contains(pai) && !gatilho.contains(pai))
        .flatMap(({ no }) => {
          const intervalo = document.createRange();
          intervalo.selectNodeContents(no);
          return [...intervalo.getClientRects()].filter((r) => r.width > 0).map((r) => ({ topo: r.top, base: r.bottom }));
        });
      if (topos.length === 0) continue;
      const primeira = topos.reduce((menor, atual) => (atual.topo < menor.topo ? atual : menor));
      if (gatilho.getBoundingClientRect().top > primeira.base + 1) achar("R14", gatilho, "abaixo da primeira linha");
    }
  }

  // R15: cabeçalho -------------------------------------------------------------------------
  /** Controle que flutua (o botão "Novo gasto" do celular) não pertence à linha do cabeçalho. */
  function flutuante(el: Element, limite: Element): boolean {
    for (let atual: Element | null = el; atual && atual !== limite; atual = atual.parentElement) {
      if (getComputedStyle(atual).position === "fixed") return true;
    }
    return false;
  }
  if (quer("R15") && window.innerWidth <= 480) {
    for (const cabecalho of document.querySelectorAll("header[data-cabecalho-da-tela]")) {
      const acoes = [...cabecalho.children].filter((c) => c !== cabecalho.firstElementChild);
      const controles = acoes
        .flatMap((a) => [...a.querySelectorAll("button, a, [role=button], input, select")])
        .filter((c) => visivel(c) && !flutuante(c, cabecalho));
      if (controles.length < 2) continue;
      const topos = controles.map((c) => c.getBoundingClientRect().top);
      if (Math.max(...topos) - Math.min(...topos) > 2) achar("R15", cabecalho, "controles em mais de uma linha");
    }
  }

  // R16: contraste -------------------------------------------------------------------------
  if (quer("R16")) {
    for (const el of visiveis) {
      const proprio = fundoDe(el);
      if (proprio[3] <= 0.05 || el.matches(":disabled, [aria-disabled=true]") || el.closest(":disabled")) continue;
      const texto = textoProprio(el);
      if (!texto) continue;
      const estilo = getComputedStyle(el);
      if (Number(estilo.opacity) < 1) continue;
      const fundo = fundoEfetivo(el);
      const frente = compor(cor(estilo.color), fundo);
      const razao = contraste(frente, fundo);
      if (razao < 4.5) achar("R16", el, `${razao.toFixed(2)}:1`);
    }
  }

  // R17: cores distintas -------------------------------------------------------------------
  if (quer("R17")) {
    // Uma legenda pode vir repartida: a lista principal e as "outras partes" dentro de um recolhível
    // (`details`) irmão. Elas formam um grupo só: a chave é o pai da lista ou, no recolhível, o pai do `details`.
    const grupos = new Map<Element, Element[]>();
    for (const lista of visiveis.filter((e) => e.matches("ul, ol"))) {
      const recolhivel = lista.closest("details");
      const chave = recolhivel?.parentElement ?? lista.parentElement ?? lista;
      grupos.set(chave, [...(grupos.get(chave) ?? []), lista]);
    }
    for (const listas of grupos.values()) {
      const amostras = listas.flatMap((lista) =>
        [...lista.querySelectorAll("*")].filter((e) => {
          if (!visivel(e) || e.children.length > 0 || (e.textContent ?? "").trim() !== "") return false;
          const r = e.getBoundingClientRect();
          return r.width >= 6 && r.width <= 20 && r.height >= 6 && r.height <= 20 && fundoDe(e)[3] >= 0.99;
        }),
      );
      if (amostras.length < 2 || amostras.length > 8) continue;
      const vistas: Rgba[] = [];
      for (const amostra of amostras) {
        const c = fundoDe(amostra);
        if (vistas.some((v) => igual(v, c))) achar("R17", amostra, "cor repetida na legenda");
        vistas.push(c);
      }
    }
  }

  // R18: sinal e cor -----------------------------------------------------------------------
  if (quer("R18")) {
    const positivo = token("--cor-positivo");
    const negativo = token("--cor-negativo");
    for (const v of valores) {
      const texto = textoProprio(v.pai);
      const cores = cor(getComputedStyle(v.pai).color);
      if (texto.startsWith("+") && positivo[3] > 0 && !igual(cores, positivo)) achar("R18", v.pai, "+ sem a cor positiva");
      if (/^[−-]/.test(texto) && negativo[3] > 0 && !igual(cores, negativo)) achar("R18", v.pai, "− sem a cor negativa");
    }
  }

  // R19: desabilitado explicado ------------------------------------------------------------
  if (quer("R19")) {
    for (const botao of visiveis.filter((e) => e.matches("button:disabled, [role=button][aria-disabled=true]"))) {
      const ids = (botao.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
      const explicado = ids.some((id) => {
        const alvo = document.getElementById(id);
        return alvo && visivel(alvo) && (alvo.textContent ?? "").trim() !== "";
      });
      if (!explicado) achar("R19", botao, "sem aria-describedby para texto visível");
    }
  }

  // R20: grade sem vaga --------------------------------------------------------------------
  if (quer("R20")) {
    for (const grade of visiveis.filter((e) => e.matches("[style*='--colunas']") && getComputedStyle(e).display === "grid")) {
      const itens = [...grade.children].filter((c) => visivel(c));
      const caixa = grade.getBoundingClientRect();
      const colunas = getComputedStyle(grade).gridTemplateColumns.split(" ").length;
      if (colunas < 2 || itens.length === 0) continue;
      const porLinha = new Map<number, number>();
      for (const item of itens) {
        const r = item.getBoundingClientRect();
        const chave = Math.round(r.top / 4);
        porLinha.set(chave, Math.max(porLinha.get(chave) ?? 0, r.right));
      }
      for (const direita of porLinha.values()) {
        if (direita < caixa.right - 3) {
          achar("R20", grade, "linha com célula vazia");
          break;
        }
      }
    }
  }

  return achados;
}
