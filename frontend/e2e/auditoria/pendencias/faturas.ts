import type { Pendencia } from "../comparar";

export const simulacao: Pendencia[] = [
  { regra: "R4", largura: 1366 },
  { regra: "R4", largura: 390 },
  { regra: "R6", largura: 1366 },
  { regra: "R6", largura: 1366, estado: "vazio" },
  { regra: "R6", largura: 1366, estado: "carregando" },
  { regra: "R12", largura: 1366 },
  { regra: "R12", largura: 1366, estado: "vazio" },
  { regra: "R12", largura: 1366, estado: "carregando" },
  { regra: "R12", largura: 390 },
];

export const teste: Pendencia[] = [
  { regra: "R4", largura: 1366 },
  { regra: "R4", largura: 390 },
  { regra: "R6", largura: 1366 },
  { regra: "R6", largura: 1366, estado: "vazio" },
  { regra: "R6", largura: 1366, estado: "carregando" },
  { regra: "R9", largura: 1366 },
  { regra: "R9", largura: 390 },
  { regra: "R12", largura: 1366 },
  { regra: "R12", largura: 1366, estado: "vazio" },
  { regra: "R12", largura: 1366, estado: "carregando" },
];
