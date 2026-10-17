// Hooks próprios de busca de dados (no lugar de uma biblioteca): cache simples
// em módulo, dados anteriores mantidos durante uma nova busca e invalidação por
// prefixo de chave. Sem repetição automática: a pessoa tenta de novo.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Dados já buscados, por chave. */
const cache = new Map<string, unknown>();

/** Chaves cujos dados em cache precisam ser buscados de novo. */
const obsoletas = new Set<string>();

type Ouvinte = { chave: string; refazer: () => void };

/** Consultas montadas, avisadas por `invalidar`. */
const ouvintes = new Set<Ouvinte>();

export type EstadoDaConsulta<T> = {
  dados: T | undefined;
  erro: unknown;
  carregando: boolean;
};

function precisaBuscar(chave: string): boolean {
  return !cache.has(chave) || obsoletas.has(chave);
}

/**
 * Marca como obsoletas as consultas cujas chaves começam com `prefixo` e faz
 * as montadas buscarem de novo (as desmontadas buscam ao montar).
 */
export function invalidar(prefixo: string): void {
  for (const chave of cache.keys()) {
    if (chave.startsWith(prefixo)) obsoletas.add(chave);
  }
  for (const ouvinte of [...ouvintes]) {
    if (ouvinte.chave.startsWith(prefixo)) ouvinte.refazer();
  }
}

/** Esquece todos os dados guardados (usado entre os testes). */
export function limparCache(): void {
  cache.clear();
  obsoletas.clear();
}

/**
 * Busca os dados da `chave` com `buscar` (que recebe o sinal de cancelamento).
 * Usa o cache quando há dados válidos; senão busca, mantendo os dados
 * anteriores (inclusive de outra chave) até a resposta chegar. Uma resposta
 * antiga que chega depois da nova é descartada.
 */
export function useConsulta<T>(
  chave: string,
  buscar: (signal: AbortSignal) => Promise<T>,
): EstadoDaConsulta<T> {
  // O estado guarda a chave a que se refere: no render em que a chave muda (antes
  // do efeito), o estado ainda é da chave anterior e não pode ser entregue como está.
  const [estado, definirEstado] = useState<EstadoDaConsulta<T> & { chave: string }>(() => ({
    chave,
    dados: cache.get(chave) as T | undefined,
    erro: null,
    carregando: precisaBuscar(chave),
  }));
  const [versao, definirVersao] = useState(0);
  const ultimaBusca = useRef(0);

  useEffect(() => {
    const ouvinte: Ouvinte = { chave, refazer: () => definirVersao((v) => v + 1) };
    ouvintes.add(ouvinte);
    return () => {
      ouvintes.delete(ouvinte);
    };
  }, [chave]);

  useEffect(() => {
    if (!precisaBuscar(chave)) {
      const dados = cache.get(chave) as T;
      definirEstado((anterior) =>
        anterior.chave === chave &&
        anterior.dados === dados &&
        anterior.erro === null &&
        !anterior.carregando
          ? anterior
          : { chave, dados, erro: null, carregando: false },
      );
      return;
    }

    const numero = ++ultimaBusca.current;
    const controle = new AbortController();
    const atual = () => numero === ultimaBusca.current && !controle.signal.aborted;
    definirEstado((anterior) => ({
      chave,
      dados: cache.has(chave) ? (cache.get(chave) as T) : anterior.dados,
      erro: null,
      carregando: true,
    }));

    buscar(controle.signal).then(
      (dados) => {
        if (!atual()) return;
        cache.set(chave, dados);
        obsoletas.delete(chave);
        definirEstado({ chave, dados, erro: null, carregando: false });
      },
      (erro: unknown) => {
        if (!atual()) return;
        definirEstado((anterior) => ({ chave, dados: anterior.dados, erro, carregando: false }));
      },
    );

    return () => controle.abort();
    // `buscar` é recriada a cada render; a busca só refaz quando a chave muda ou é invalidada.
  }, [chave, versao]);

  const { chave: chaveDoEstado, dados, erro, carregando } = estado;
  return useMemo(() => {
    if (chaveDoEstado === chave) return { dados, erro, carregando };
    // A chave acabou de mudar: o que o efeito vai definir, já neste render.
    return {
      dados: cache.has(chave) ? (cache.get(chave) as T) : dados,
      erro: null,
      carregando: precisaBuscar(chave),
    };
  }, [chave, chaveDoEstado, dados, erro, carregando]);
}

export type EstadoDaMutacao<E, S> = {
  /** Executa; devolve o resultado, ou `undefined` se falhou ou se já havia uma execução pendente. */
  executar: (entrada: E) => Promise<S | undefined>;
  pendente: boolean;
  erro: unknown;
};

/** Mutação sem repetição automática; uma execução por vez (duplo clique envia uma vez). */
export function useMutacao<E, S>(executar: (entrada: E) => Promise<S>): EstadoDaMutacao<E, S> {
  const [pendente, definirPendente] = useState(false);
  const [erro, definirErro] = useState<unknown>(null);
  const emAndamento = useRef(false);

  const executarUmaVez = useCallback(
    async (entrada: E): Promise<S | undefined> => {
      if (emAndamento.current) return undefined;
      emAndamento.current = true;
      definirPendente(true);
      definirErro(null);
      try {
        return await executar(entrada);
      } catch (falha) {
        definirErro(falha);
        return undefined;
      } finally {
        emAndamento.current = false;
        definirPendente(false);
      }
    },
    [executar],
  );

  return { executar: executarUmaVez, pendente, erro };
}
