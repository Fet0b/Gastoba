import type { Pendencia } from "../comparar";

export const simulacao: Pendencia[] = [
  { regra: "R6", largura: 1366 },
  { regra: "R6", largura: 1366, estado: "vazio" },
  { regra: "R6", largura: 1366, estado: "carregando" },
  { regra: "R12", largura: 1366 },
  { regra: "R12", largura: 1366, estado: "vazio" },
  { regra: "R12", largura: 1366, estado: "carregando" },
];

export const teste: Pendencia[] = [
  { regra: "R1", largura: 1366 },
  { regra: "R1", largura: 390 },
  { regra: "R2", largura: 1366 },
  { regra: "R3", largura: 1366 },
  { regra: "R3", largura: 390 },
  { regra: "R6", largura: 1366 },
  { regra: "R6", largura: 1366, estado: "vazio" },
  { regra: "R6", largura: 1366, estado: "carregando" },
  { regra: "R7", largura: 1366 },
  { regra: "R7", largura: 390 },
  { regra: "R12", largura: 1366 },
  { regra: "R12", largura: 1366, estado: "vazio" },
  { regra: "R12", largura: 1366, estado: "carregando" },
  { regra: "R13", largura: 1366 },
  { regra: "R13", largura: 390 },
  { regra: "R14", largura: 1366 },
  { regra: "R14", largura: 390 },
  { regra: "R18", largura: 1366 },
  { regra: "R18", largura: 390 },
];
