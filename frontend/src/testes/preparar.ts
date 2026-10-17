import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

import { limparCache } from "../api/useConsulta";
import { fetchSimulado, reiniciarSimulacao } from "../simulacao/fetchSimulado";

// Preparação comum a todos os testes (setupFiles do Vitest).
// O jsdom não implementa window.matchMedia nem HTMLDialogElement.showModal/close;
// aqui ficam substitutos mínimos, com o comportamento de que os componentes dependem.

// --- window.matchMedia -------------------------------------------------------

type OuvinteDeMidia = (evento: MediaQueryListEvent) => void;

let midiaCorresponde = false;
let layoutEstreito = false;
const listasDeMidia = new Set<MediaQueryList>();
const ouvintesDeMidia = new Map<MediaQueryList, Set<OuvinteDeMidia>>();

// Consultas de largura (`min-width`) valem para o layout de computador, a não ser que o teste
// peça o de celular com `definirLayoutEstreito(true)`; as demais seguem `definirMidia`.
function corresponde(consulta: string): boolean {
  return consulta.includes("min-width") ? !layoutEstreito : midiaCorresponde;
}

function criarListaDeMidia(consulta: string): MediaQueryList {
  const ouvintes = new Set<OuvinteDeMidia>();
  const lista = {
    get matches() {
      return corresponde(consulta);
    },
    media: consulta,
    onchange: null,
    addEventListener(tipo: string, ouvinte: OuvinteDeMidia) {
      if (tipo === "change") ouvintes.add(ouvinte);
    },
    removeEventListener(tipo: string, ouvinte: OuvinteDeMidia) {
      if (tipo === "change") ouvintes.delete(ouvinte);
    },
    addListener(ouvinte: OuvinteDeMidia) {
      ouvintes.add(ouvinte);
    },
    removeListener(ouvinte: OuvinteDeMidia) {
      ouvintes.delete(ouvinte);
    },
    dispatchEvent() {
      return true;
    },
  } as unknown as MediaQueryList;
  listasDeMidia.add(lista);
  ouvintesDeMidia.set(lista, ouvintes);
  return lista;
}

/**
 * Troca o resultado de todas as media queries (por exemplo, ligar
 * `prefers-reduced-motion: reduce`) e dispara `change` nas listas já criadas.
 */
export function definirMidia(corresponde: boolean): void {
  if (midiaCorresponde === corresponde) return;
  midiaCorresponde = corresponde;
  avisarMudanca((consulta) => !consulta.includes("min-width"));
}

/** Simula a tela de celular (largura abaixo de 48rem) e dispara `change` nas consultas de largura. */
export function definirLayoutEstreito(estreito: boolean): void {
  if (layoutEstreito === estreito) return;
  layoutEstreito = estreito;
  avisarMudanca((consulta) => consulta.includes("min-width"));
}

function avisarMudanca(vale: (consulta: string) => boolean): void {
  for (const lista of listasDeMidia) {
    if (!vale(lista.media)) continue;
    const evento = { matches: lista.matches, media: lista.media } as MediaQueryListEvent;
    for (const ouvinte of [...(ouvintesDeMidia.get(lista) ?? [])]) ouvinte(evento);
  }
}

function instalarMatchMedia(): void {
  midiaCorresponde = false;
  layoutEstreito = false;
  listasDeMidia.clear();
  ouvintesDeMidia.clear();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: criarListaDeMidia,
  });
}

// --- <dialog> ----------------------------------------------------------------

if (typeof HTMLDialogElement !== "undefined") {
  const prototipo = HTMLDialogElement.prototype;
  if (typeof prototipo.showModal !== "function") {
    prototipo.showModal = function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
  }
  if (typeof prototipo.show !== "function") {
    prototipo.show = function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
  }
  if (typeof prototipo.close !== "function") {
    prototipo.close = function (this: HTMLDialogElement, valorDeRetorno?: string) {
      if (!this.hasAttribute("open")) return;
      if (valorDeRetorno !== undefined) this.returnValue = valorDeRetorno;
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
}

// --- ciclo de cada teste -----------------------------------------------------

// Toda chamada à API cai no fetch simulado, que começa vazio e SEM sessão em cada
// teste: quem precisa estar autenticado chama `entrarNaSimulacao()` (de
// simulacao/fetchSimulado) no próprio beforeEach.
beforeEach(() => {
  instalarMatchMedia();
  vi.stubGlobal("fetch", fetchSimulado);
});

afterEach(() => {
  cleanup();
  reiniciarSimulacao();
  limparCache();
  vi.unstubAllGlobals();
});
