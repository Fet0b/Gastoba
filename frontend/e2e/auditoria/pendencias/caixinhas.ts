import type { Pendencia } from "../comparar";

// A tela Caixinhas (077) nasce sem achado próprio. Os dois itens abaixo não são dela: são o nome da
// marca ("Gastoba", h1 da barra lateral) em 1366 px, o mesmo achado que toda vista do computador
// já lista em seu arquivo (R6 e R12), a ser resolvido com a barra lateral e não aqui.
const DA_BARRA_LATERAL: Pendencia[] = [
  { regra: "R6", largura: 1366 },
  { regra: "R6", largura: 1366, estado: "vazio" },
  { regra: "R6", largura: 1366, estado: "carregando" },
  { regra: "R12", largura: 1366 },
  { regra: "R12", largura: 1366, estado: "vazio" },
  { regra: "R12", largura: 1366, estado: "carregando" },
];

// Ação "Criar caixinha" no cabeçalho (XI.4.1) com o sino: no celular fica em duas linhas (R15).
// Mesma pendência de Investimentos (070), a resolver no CabecalhoDaTela e não nesta tela.
const R15_DO_CABECALHO: Pendencia[] = [{ regra: "R15", largura: 390 }];

export const simulacao: Pendencia[] = [...DA_BARRA_LATERAL, ...R15_DO_CABECALHO];

export const teste: Pendencia[] = [...DA_BARRA_LATERAL, ...R15_DO_CABECALHO];
