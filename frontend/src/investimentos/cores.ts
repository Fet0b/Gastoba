import type { CorDaDestinacao } from "../api/tipos";
export const HEX_DA_COR: Record<CorDaDestinacao, string> = { ametista: "#8B5CF6", menta: "#5BD6B0", orquidea: "#E879F9", ceu: "#60A5FA", ambar: "#FBBF24", coral: "#FF7A90", glicinia: "#B7A8E8", esmeralda: "#34D399" };
export const NOMES_DAS_CORES: Record<CorDaDestinacao, string> = { ametista: "Ametista", menta: "Menta", orquidea: "Orquídea", ceu: "Céu", ambar: "Âmbar", coral: "Coral", glicinia: "Glicínia", esmeralda: "Esmeralda" };
export function corDaDestinacao(cor: CorDaDestinacao | null): string | null { return cor === null ? null : HEX_DA_COR[cor]; }
