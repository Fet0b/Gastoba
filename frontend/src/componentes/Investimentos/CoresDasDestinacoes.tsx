import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import type { CorDaDestinacao, Investimento } from "../../api/tipos";
import { atribuirCoresDasDestinacoes, corDaDestinacao } from "../../cores/mapaDeCores";

export type CorDe = (tag: string, corEscolhida: CorDaDestinacao | null) => string;

const Contexto = createContext<CorDe | undefined>(undefined);
const SEM_CONJUNTO: CorDe = (tag, corEscolhida) => corDaDestinacao(tag, corEscolhida);

/**
 * A cor de cada caixinha calculada sobre o conjunto das posições: mesma entrada, mesma cor em todas as telas,
 * sem colisão até oito (070, achado 22). Sem as posições carregadas, cai na cor pelo hash.
 */
export function useCoresDasDestinacoes(investimentos: readonly Investimento[] | undefined): CorDe {
  const atribuidas = useMemo(
    () => atribuirCoresDasDestinacoes((investimentos ?? []).flatMap((i) => i.destinacoes)),
    [investimentos],
  );
  return useCallback((tag, corEscolhida) => corDaDestinacao(tag, corEscolhida, atribuidas), [atribuidas]);
}

/** Entrega a mesma atribuição aos componentes da tela; fora dele, vale a cor pelo hash. */
export function ProvedorDeCoresDasDestinacoes({ corDe, children }: { corDe: CorDe; children: ReactNode }) {
  return <Contexto.Provider value={corDe}>{children}</Contexto.Provider>;
}

export function useCorDaDestinacao(): CorDe {
  return useContext(Contexto) ?? SEM_CONJUNTO;
}
