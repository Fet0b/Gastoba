import type { Aparencia, EscolhaDeAparencia } from "../api/tipos";
import { MATIZ_PADRAO } from "./paleta";

/** O que o backend devolve sem escolha nenhuma (`Aparencia.padrao()`), para comparar e restaurar. */
export const ESCOLHA_PADRAO: EscolhaDeAparencia = {
  matiz: MATIZ_PADRAO,
  intensidade: "media",
  textura: "nenhuma",
  nome: "Gastoba",
  marca: "olho",
};

export const NOME_MAXIMO_DO_APP = 20;

export function comoEscolha(aparencia: Aparencia | undefined): EscolhaDeAparencia {
  if (aparencia === undefined) return ESCOLHA_PADRAO;
  const { matiz, intensidade, textura, nome, marca } = aparencia;
  return { matiz, intensidade, textura, nome, marca };
}

export function mesmaEscolha(a: EscolhaDeAparencia, b: EscolhaDeAparencia): boolean {
  return (
    a.matiz === b.matiz &&
    a.intensidade === b.intensidade &&
    a.textura === b.textura &&
    a.nome === b.nome &&
    a.marca === b.marca
  );
}

/** A regra do nome do app espelhada do backend (1 a 20 caracteres imprimíveis, sem espaços nas pontas). */
export function erroDoNome(nome: string): string | null {
  const aparado = nome.trim();
  if (aparado.length === 0) return "Escreva o nome do app: ele não pode ficar vazio.";
  if (Array.from(aparado).length > NOME_MAXIMO_DO_APP) {
    return `O nome do app deve ter de 1 a ${NOME_MAXIMO_DO_APP} caracteres.`;
  }
  if (/\p{C}/u.test(aparado)) return "O nome do app não pode ter caracteres não imprimíveis.";
  return null;
}
