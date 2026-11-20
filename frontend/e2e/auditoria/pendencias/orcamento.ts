import type { Pendencia } from "../comparar";

export const simulacao: Pendencia[] = [
  { regra: "R6", largura: 1366 },
  { regra: "R6", largura: 1366, estado: "vazio" },
  { regra: "R6", largura: 1366, estado: "carregando" },
  { regra: "R12", largura: 1366 },
  { regra: "R12", largura: 1366, estado: "vazio" },
  { regra: "R12", largura: 1366, estado: "carregando" },
  { regra: "R20", largura: 1366 },
  { regra: "R20", largura: 1366, estado: "vazio" },
  { regra: "R20", largura: 1366, estado: "carregando" },
  { regra: "R20", largura: 390 },
  { regra: "R20", largura: 390, estado: "vazio" },
  { regra: "R20", largura: 390, estado: "carregando" },
];

export const teste: Pendencia[] = [
  { regra: "R1", largura: 390 },
  { regra: "R6", largura: 1366 },
  { regra: "R6", largura: 1366, estado: "vazio" },
  { regra: "R6", largura: 1366, estado: "carregando" },
  { regra: "R12", largura: 1366 },
  { regra: "R12", largura: 1366, estado: "vazio" },
  { regra: "R12", largura: 1366, estado: "carregando" },
  { regra: "R13", largura: 390 },
  { regra: "R20", largura: 1366 },
  { regra: "R20", largura: 1366, estado: "vazio" },
  { regra: "R20", largura: 1366, estado: "carregando" },
  { regra: "R20", largura: 390 },
  { regra: "R20", largura: 390, estado: "vazio" },
  { regra: "R20", largura: 390, estado: "carregando" },
];
