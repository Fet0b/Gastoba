import type { Pendencia } from "../comparar";

export const simulacao: Pendencia[] = [
  { regra: "R6", largura: 1366 },
  { regra: "R6", largura: 1366, estado: "vazio" },
  { regra: "R6", largura: 1366, estado: "carregando" },
  { regra: "R12", largura: 1366 },
  { regra: "R12", largura: 1366, estado: "vazio" },
  { regra: "R12", largura: 1366, estado: "carregando" },
  { regra: "R17", largura: 1366 },
  { regra: "R17", largura: 390 },
  { regra: "R18", largura: 1366 },
  { regra: "R18", largura: 390 },
  { regra: "R14", largura: 390 },
];

export const teste: Pendencia[] = [
  { regra: "R6", largura: 1366 },
  { regra: "R6", largura: 1366, estado: "vazio" },
  { regra: "R6", largura: 1366, estado: "carregando" },
  { regra: "R11", largura: 390 },
  { regra: "R12", largura: 1366 },
  { regra: "R12", largura: 1366, estado: "vazio" },
  { regra: "R12", largura: 1366, estado: "carregando" },
  { regra: "R14", largura: 390 },
  { regra: "R17", largura: 1366 },
  { regra: "R17", largura: 390 },
  { regra: "R18", largura: 1366 },
  { regra: "R18", largura: 390 },
  { regra: "R20", largura: 390 },
  { regra: "R20", largura: 390, estado: "vazio" },
];
