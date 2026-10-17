// Consultas e mutações da API usadas pelos componentes. Chaves do cache:
// "contas", "gastos?<filtros>", "resumos/tags?<filtros>", "ganhos?<filtros>", "recorrencias", "metas" e
// "metas/progresso?mes=AAAA-MM", "tags", "categorias" e "chaves" (as chaves de
// API); mutações invalidam as consultas que mudam com elas.

import { chamar } from "./cliente";
import type {
  Aceite,
  AceiteDaTransacao,
  Categoria,
  ChaveDeApi,
  ChaveDeApiCriada,
  Conta,
  AlteracaoDeRecorrencia,
  FiltrosDeGanhos,
  FiltrosDoResumoPorTags,
  FiltrosDeGastos,
  Ganho,
  Gasto,
  Meta,
  NovaChaveDeApi,
  NovaConta,
  NovaRecorrencia,
  NovoGanho,
  NovoGasto,
  Recorrencia,
  ResumoDasMetas,
  ResumoPorTags,
  Sincronizacao,
  TransacaoImportada,
} from "./tipos";
import { invalidar, useConsulta, useMutacao } from "./useConsulta";

/** Filtros na ordem fixa da chave e da query string, sem os indefinidos. */
function parametrosDosGastos(filtros: FiltrosDeGastos): Record<string, string | undefined> {
  return {
    inicio: filtros.inicio,
    fim: filtros.fim,
    conta_id: filtros.conta_id,
    tag: filtros.tag,
    categoria: filtros.categoria,
  };
}

/** Chave do cache dos gastos: "gastos?inicio=...&fim=..." com os filtros definidos, em ordem fixa. */
export function chaveDosGastos(filtros: FiltrosDeGastos): string {
  const busca = new URLSearchParams();
  for (const [nome, valor] of Object.entries(parametrosDosGastos(filtros))) {
    if (valor !== undefined) busca.append(nome, valor);
  }
  return `gastos?${busca.toString()}`;
}

/** Chave do cache dos ganhos: "ganhos?inicio=...&fim=..." (e `conta_id`, se houver). */
export function chaveDosGanhos(filtros: FiltrosDeGanhos): string {
  const busca = new URLSearchParams();
  for (const [nome, valor] of Object.entries(parametrosDosGanhos(filtros))) {
    if (valor !== undefined) busca.append(nome, valor);
  }
  return `ganhos?${busca.toString()}`;
}

function parametrosDosGanhos(filtros: FiltrosDeGanhos): Record<string, string | undefined> {
  return { inicio: filtros.inicio, fim: filtros.fim, conta_id: filtros.conta_id };
}

export function useContas() {
  return useConsulta("contas", (signal) => chamar<Conta[]>("/contas", { signal }));
}

export function useGastos(filtros: FiltrosDeGastos) {
  return useConsulta(chaveDosGastos(filtros), (signal) =>
    chamar<Gasto[]>("/gastos", { parametros: parametrosDosGastos(filtros), signal }),
  );
}

export function useGanhos(filtros: FiltrosDeGanhos) {
  return useConsulta(chaveDosGanhos(filtros), (signal) =>
    chamar<Ganho[]>("/ganhos", { parametros: parametrosDosGanhos(filtros), signal }),
  );
}

/** Chave do cache do resumo por tag: "resumos/tags?inicio=...&fim=..." (e conta e categoria, se houver). */
export function chaveDoResumoPorTags(filtros: FiltrosDoResumoPorTags): string {
  const busca = new URLSearchParams();
  for (const [nome, valor] of Object.entries(parametrosDoResumoPorTags(filtros))) {
    if (valor !== undefined) busca.append(nome, valor);
  }
  return `resumos/tags?${busca.toString()}`;
}

function parametrosDoResumoPorTags(
  filtros: FiltrosDoResumoPorTags,
): Record<string, string | undefined> {
  return {
    inicio: filtros.inicio,
    fim: filtros.fim,
    conta_id: filtros.conta_id,
    categoria: filtros.categoria,
  };
}

export function useResumoPorTags(filtros: FiltrosDoResumoPorTags) {
  return useConsulta(chaveDoResumoPorTags(filtros), (signal) =>
    chamar<ResumoPorTags>("/resumos/tags", {
      parametros: parametrosDoResumoPorTags(filtros),
      signal,
    }),
  );
}

// --- importação bancária ---------------------------------------------------------

/** A caixa de entrada: as transações do banco que esperam o aceite ou o descarte. */
export function useTransacoesImportadas() {
  return useConsulta("transacoes-importadas", (signal) =>
    chamar<TransacaoImportada[]>("/transacoes-importadas", { signal }),
  );
}

/** Aceitar cria um gasto ou um ganho (o saldo é do banco e não muda): refaz o que depende deles. */
async function aceitarTransacaoImportada(entrada: {
  id: string;
  dados: AceiteDaTransacao;
}): Promise<Aceite> {
  try {
    return await chamar<Aceite>(
      `/transacoes-importadas/${encodeURIComponent(entrada.id)}/aceitar`,
      { metodo: "POST", corpo: entrada.dados },
    );
  } finally {
    for (const chave of ["transacoes-importadas", "gastos", "ganhos", "resumos", "tags", "metas"]) {
      invalidar(chave);
    }
  }
}

async function ignorarTransacaoImportada(id: string): Promise<true> {
  try {
    await chamar<void>(`/transacoes-importadas/${encodeURIComponent(id)}/ignorar`, {
      metodo: "POST",
    });
    return true;
  } finally {
    invalidar("transacoes-importadas");
  }
}

/** Busca agora no banco: contas, saldos e transações novas mudam. */
async function sincronizarContasBancarias(_entrada: void): Promise<Sincronizacao> {
  try {
    return await chamar<Sincronizacao>("/sincronizacoes", { metodo: "POST" });
  } finally {
    invalidar("transacoes-importadas");
    invalidar("contas");
  }
}

export function useAceitarTransacaoImportada() {
  return useMutacao(aceitarTransacaoImportada);
}

export function useIgnorarTransacaoImportada() {
  return useMutacao(ignorarTransacaoImportada);
}

export function useSincronizarContasBancarias() {
  return useMutacao(sincronizarContasBancarias);
}

export function useTags() {
  return useConsulta("tags", (signal) => chamar<string[]>("/tags", { signal }));
}

/** O conjunto de categorias é fixo: nenhuma mutação invalida esta consulta. */
export function useCategorias() {
  return useConsulta("categorias", (signal) => chamar<Categoria[]>("/categorias", { signal }));
}

async function criarConta(nova: NovaConta): Promise<Conta> {
  const conta = await chamar<Conta>("/contas", { metodo: "POST", corpo: nova });
  invalidar("contas");
  return conta;
}

async function registrarGasto(novo: NovoGasto): Promise<Gasto> {
  const gasto = await chamar<Gasto>("/gastos", { metodo: "POST", corpo: novo });
  invalidar("contas");
  invalidar("gastos");
  invalidar("resumos");
  invalidar("tags");
  invalidar("metas");
  return gasto;
}

async function registrarGanho(novo: NovoGanho): Promise<Ganho> {
  const ganho = await chamar<Ganho>("/ganhos", { metodo: "POST", corpo: novo });
  invalidar("contas");
  invalidar("ganhos");
  invalidar("metas");
  return ganho;
}

export function useCriarConta() {
  return useMutacao(criarConta);
}

export function useRegistrarGasto() {
  return useMutacao(registrarGasto);
}

/** Excluir devolve o saldo da conta e muda a renda do mês: contas, ganhos e metas se refazem. */
async function excluirGanho(id: string): Promise<true> {
  try {
    await chamar<void>(`/ganhos/${encodeURIComponent(id)}`, { metodo: "DELETE" });
    return true;
  } finally {
    invalidar("contas");
    invalidar("ganhos");
    invalidar("metas");
  }
}

export function useExcluirGanho() {
  return useMutacao(excluirGanho);
}

export function useRegistrarGanho() {
  return useMutacao(registrarGanho);
}

// --- chaves de API -------------------------------------------------------------

/** As chaves ativas, das mais novas para as mais antigas; a listagem nunca traz o segredo. */
export function useChavesDeApi() {
  return useConsulta("chaves", (signal) => chamar<ChaveDeApi[]>("/chaves-de-api", { signal }));
}

/** O resultado traz o `segredo`, que só aparece aqui: quem chama o mostra uma vez e o descarta. */
async function criarChaveDeApi(nova: NovaChaveDeApi): Promise<ChaveDeApiCriada> {
  const criada = await chamar<ChaveDeApiCriada>("/chaves-de-api", { metodo: "POST", corpo: nova });
  invalidar("chaves");
  return criada;
}

/**
 * Revoga e devolve `true` (a mutação devolve `undefined` numa falha); a lista é
 * recarregada mesmo numa falha (ex.: 404 de uma chave já revogada).
 */
async function revogarChaveDeApi(id: string): Promise<true> {
  try {
    await chamar<void>(`/chaves-de-api/${encodeURIComponent(id)}`, { metodo: "DELETE" });
    return true;
  } finally {
    invalidar("chaves");
  }
}

export function useCriarChaveDeApi() {
  return useMutacao(criarChaveDeApi);
}

export function useRevogarChaveDeApi() {
  return useMutacao(revogarChaveDeApi);
}

// --- recorrências ----------------------------------------------------------------

/** As recorrências, ativas e encerradas, por descrição. */
export function useRecorrencias() {
  return useConsulta("recorrencias", (signal) =>
    chamar<Recorrencia[]>("/recorrencias", { signal }),
  );
}

/** Criar já gera os meses vencidos: saldos, gastos, ganhos, tags e metas mudam. */
async function criarRecorrencia(nova: NovaRecorrencia): Promise<Recorrencia> {
  const recorrencia = await chamar<Recorrencia>("/recorrencias", { metodo: "POST", corpo: nova });
  for (const chave of ["recorrencias", "contas", "gastos", "ganhos", "tags", "metas"]) {
    invalidar(chave);
  }
  return recorrencia;
}

/** Encerra e devolve `true`; a lista é recarregada mesmo numa falha (ex.: 404). */
async function encerrarRecorrencia(id: string): Promise<true> {
  try {
    await chamar<void>(`/recorrencias/${encodeURIComponent(id)}`, { metodo: "DELETE" });
    return true;
  } finally {
    invalidar("recorrencias");
  }
}

/** Alterar vale dos próximos meses em diante: só a lista de recorrências muda. */
async function alterarRecorrencia(alteracao: {
  id: string;
  dados: AlteracaoDeRecorrencia;
}): Promise<Recorrencia> {
  try {
    return await chamar<Recorrencia>(`/recorrencias/${encodeURIComponent(alteracao.id)}`, {
      metodo: "PUT",
      corpo: alteracao.dados,
    });
  } finally {
    invalidar("recorrencias");
  }
}

export function useAlterarRecorrencia() {
  return useMutacao(alterarRecorrencia);
}

export function useCriarRecorrencia() {
  return useMutacao(criarRecorrencia);
}

export function useEncerrarRecorrencia() {
  return useMutacao(encerrarRecorrencia);
}

// --- metas -----------------------------------------------------------------------

/** As metas (categoria e percentual), na ordem das categorias. */
export function useMetas() {
  return useConsulta("metas", (signal) => chamar<Meta[]>("/metas", { signal }));
}

/** O progresso das metas no mês ("AAAA-MM"), com a renda do mês. */
export function useProgressoDasMetas(mes: string) {
  return useConsulta(`metas/progresso?mes=${mes}`, (signal) =>
    chamar<ResumoDasMetas>("/metas/progresso", { parametros: { mes }, signal }),
  );
}

async function definirMeta(meta: Meta): Promise<Meta> {
  try {
    return await chamar<Meta>(`/metas/${encodeURIComponent(meta.categoria)}`, {
      metodo: "PUT",
      corpo: { percentual: meta.percentual },
    });
  } finally {
    invalidar("metas");
  }
}

/** Remove e devolve `true`; as metas são recarregadas mesmo numa falha (ex.: 404). */
async function removerMeta(categoria: string): Promise<true> {
  try {
    await chamar<void>(`/metas/${encodeURIComponent(categoria)}`, { metodo: "DELETE" });
    return true;
  } finally {
    invalidar("metas");
  }
}

export function useDefinirMeta() {
  return useMutacao(definirMeta);
}

export function useRemoverMeta() {
  return useMutacao(removerMeta);
}

