import type { Aparencia } from "../api/tipos";
import { MATIZ_PADRAO, gerarPaleta } from "./paleta";
import { TEXTURAS } from "./texturas";

/**
 * Único ponto do app que escreve variáveis de cor em tempo de execução (Art. XI.1.8).
 * Troca só os valores dos tokens; nenhum componente conhece a aparência.
 */
let propriedadesEscritas: string[] = [];
let tituloOriginal: string | null = null;

function limpar(): void {
  const raiz = document.documentElement.style;
  for (const nome of propriedadesEscritas) raiz.removeProperty(nome);
  propriedadesEscritas = [];
  if (tituloOriginal !== null) {
    document.title = tituloOriginal;
    tituloOriginal = null;
  }
}

/** Aplica a aparência da pessoa; com `null` (ou a padrão) devolve o que está em `tokens.css`. */
export function aplicarAparencia(aparencia: Aparencia | null): void {
  limpar();
  if (aparencia === null || !aparencia.personalizada) return;

  const raiz = document.documentElement.style;
  const escrever = (nome: string, valor: string) => {
    raiz.setProperty(nome, valor);
    propriedadesEscritas.push(nome);
  };

  if (aparencia.matiz !== MATIZ_PADRAO || aparencia.intensidade !== "media") {
    for (const [nome, valor] of Object.entries(gerarPaleta(aparencia.matiz, aparencia.intensidade))) {
      escrever(nome, valor);
    }
  }
  if (aparencia.textura !== "nenhuma") {
    escrever("--textura-da-pagina", TEXTURAS[aparencia.textura]);
  }
  tituloOriginal = document.title;
  document.title = aparencia.nome;
}
