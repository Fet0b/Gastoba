import type {GuardadoNasMetas,Aparencia,EscolhaDeAparencia,OpcoesDeAparencia,AlvoDaMeta,ReservaDaDestinacao,PendenciasDeRevisao,RevisaoDoAporte,Cobertura,CorDaDestinacao,CaixinhasDoResgate,DestinacaoCadastrada,IconeDaCaixinha} from "./tipos";
// Consultas e mutações da API usadas pelos componentes. Chaves do cache:
// "contas", "gastos?<filtros>", "resumos/tags?<filtros>", "ganhos?<filtros>", "recorrencias", "metas" e
// "metas/progresso?mes=AAAA-MM", "tags", "categorias" e "chaves" (as chaves de
// API); mutações invalidam as consultas que mudam com elas.

import { chamar } from "./cliente";
import type {
  ClassificacaoDesfeita,
  Aceite,
  AceiteDaTransacao,
  AceiteEmLote,
  AceiteEmLoteResposta,
  DivisaoDaTransacao,
  DivisaoResposta,
  Categoria,
  ChaveDeApi,
  FaturaDetalhada,
  ListaDeFaturas,
  ChaveDeApiCriada,
  Conta,
  AlteracaoDeRecorrencia,
  FiltrosDeGanhos,
  FiltrosDoResumoPorTags,
  FiltrosDeGastos,
  Ganho,
  Gasto,
  DestinacoesIniciais,
  Investimento,
  Meta,
  MovimentoDeInvestimento,
  NovaRealocacao,
  NovaChaveDeApi,
  NovaConta,
  NovaRecorrencia,
  NovoGanho,
  NovoGasto,
  PontoDoHistorico,
  Realocacao,
  Recorrencia,
  RendaBase,
  ResumoDasMetas,
  ResumoDeInvestimentos,
  ResumoPorTags,
  Sincronizacao,
  TransacaoImportada,
  VisaoDosInvestimentos,
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

/** Catálogo de caixinhas vazias que a pessoa pode atribuir a posições existentes. */
export function useDestinacoesCadastradas() {
  return useConsulta("destinacoes-cadastradas", (signal) =>
    chamar<DestinacaoCadastrada[]>("/destinacoes-cadastradas", { signal }),
  );
}

async function criarDestinacaoCadastrada(entrada: { nome: string; cor?: CorDaDestinacao | null; icone?: IconeDaCaixinha | null }): Promise<DestinacaoCadastrada> {
  try {
    return await chamar<DestinacaoCadastrada>("/destinacoes-cadastradas", {
      metodo: "POST",
      corpo: entrada,
    });
  } finally {
    // Mesmo se a resposta se perder depois da gravação, a próxima leitura encontra a identidade criada.
    invalidar("destinacoes-cadastradas");
  }
}

export function useCriarDestinacaoCadastrada() {
  return useMutacao(criarDestinacaoCadastrada);
}

async function definirIconeDaCaixinha(entrada: { id: string; icone: IconeDaCaixinha | null }): Promise<DestinacaoCadastrada> {
  try {
    return await chamar<DestinacaoCadastrada>(`/destinacoes-cadastradas/${encodeURIComponent(entrada.id)}/icone`, {
      metodo: "PUT",
      corpo: { icone: entrada.icone },
    });
  } finally {
    invalidar("destinacoes-cadastradas");
  }
}

export function useDefinirIconeDaCaixinha() {
  return useMutacao(definirIconeDaCaixinha);
}

async function excluirDestinacaoCadastrada(id: string): Promise<true> {
  try {
    await chamar<void>(`/destinacoes-cadastradas/${encodeURIComponent(id)}`, { metodo: "DELETE" });
    return true;
  } finally {
    invalidar("destinacoes-cadastradas");
  }
}

export function useExcluirDestinacaoCadastrada() {
  return useMutacao(excluirDestinacaoCadastrada);
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
export function useTransacoesImportadas(estado: "pendente" | "ignorada" = "pendente", motivo?: "transferencia_entre_contas" | "movimento_interno_da_conta") {
  return useConsulta(
    estado === "pendente" ? "transacoes-importadas" : `transacoes-importadas?estado=${estado}&motivo=${motivo ?? ""}`,
    (signal) =>
      chamar<TransacaoImportada[]>("/transacoes-importadas", {
        signal,
        ...(estado === "pendente" ? {} : { parametros: { estado, ...(motivo ? { motivo } : {}) } }),
      }),
  );
}

/** Restaurar só troca o estado (ignorada → pendente): nenhum lançamento nem saldo muda. */
async function restaurarTransacaoImportada(id: string): Promise<true> {
  try {
    await chamar<void>(`/transacoes-importadas/${encodeURIComponent(id)}/restaurar`, {
      metodo: "POST",
    });
    return true;
  } finally {
    invalidar("transacoes-importadas");
  }
}

export function useRestaurarTransacaoImportada() {
  return useMutacao(restaurarTransacaoImportada);
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
    invalidarDoAceite();
  }
}

/** Aceitar cria gasto, ganho ou aporte: refaz tudo o que depende deles. */
function invalidarDoAceite(): void {
  for (const chave of [
    "transferencias-entre-contas",
    "transacoes-importadas",
    "gastos",
    "ganhos",
    "resumos",
    "tags",
    "metas",
    "investimentos",
    "movimentos-de-investimento",
    "resgates-sem-destinacao",
    "reservas-das-destinacoes",
    "revisao-de-investimentos",
    "recorrencias",
  ]) {
    invalidar(chave);
  }
}

/** Divide a transação em partes, cada uma um gasto ou ganho (tudo ou nada). */
async function dividirTransacaoImportada(entrada: {
  id: string;
  divisao: DivisaoDaTransacao;
}): Promise<DivisaoResposta> {
  try {
    return await chamar<DivisaoResposta>(
      `/transacoes-importadas/${encodeURIComponent(entrada.id)}/dividir`,
      { metodo: "POST", corpo: entrada.divisao },
    );
  } finally {
    invalidarDoAceite();
  }
}

export function useDividirTransacaoImportada() {
  return useMutacao(dividirTransacaoImportada);
}

/** Aceita várias saídas de uma vez (tudo ou nada). */
async function aceitarEmLote(dados: AceiteEmLote): Promise<AceiteEmLoteResposta> {
  try {
    return await chamar<AceiteEmLoteResposta>("/transacoes-importadas/aceitar-em-lote", {
      metodo: "POST",
      corpo: dados,
    });
  } finally {
    invalidarDoAceite();
  }
}

export function useAceitarEmLote() {
  return useMutacao(aceitarEmLote);
}

async function ignorarTransacaoImportada(entrada: string | { id: string; motivo: "transferencia_entre_contas" }): Promise<true> {
  const id = typeof entrada === "string" ? entrada : entrada.id;
  try {
    await chamar<void>(`/transacoes-importadas/${encodeURIComponent(id)}/ignorar`, {
      metodo: "POST",
      ...(typeof entrada === "string" ? {} : { corpo: { motivo: entrada.motivo } }),
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
    invalidar("faturas");
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

/** Apagar a conta leva junto gastos, ganhos e recorrências: tudo que depende dela se refaz. */
async function excluirConta(id: string): Promise<true> {
  try {
    await chamar<void>(`/contas/${encodeURIComponent(id)}`, { metodo: "DELETE" });
    return true;
  } finally {
    for (const chave of ["contas", "gastos", "ganhos", "resumos", "tags", "metas", "recorrencias"]) {
      invalidar(chave);
    }
  }
}

export function useExcluirConta() {
  return useMutacao(excluirConta);
}

export function useCriarConta() {
  return useMutacao(criarConta);
}

/** Todo prefixo cuja resposta leva o nome de uma conta se refaz quando o apelido muda. */
function invalidarNomesDeConta(): void {
  invalidar("contas");
  invalidar("faturas");
  invalidar("transacoes-importadas");
  invalidar("recorrencias");
}

async function definirApelido(entrada: { id: string; apelido: string }): Promise<Conta> {
  try {
    return await chamar<Conta>(`/contas/${encodeURIComponent(entrada.id)}/apelido`, {
      metodo: "PUT",
      corpo: { apelido: entrada.apelido },
    });
  } finally {
    invalidarNomesDeConta();
  }
}

async function removerApelido(id: string): Promise<true> {
  try {
    await chamar<void>(`/contas/${encodeURIComponent(id)}/apelido`, { metodo: "DELETE" });
    return true;
  } finally {
    invalidarNomesDeConta();
  }
}

/** Dá ou troca o apelido da conta (068); a mensagem da API vai junto ao campo. */
export function useDefinirApelido() {
  return useMutacao(definirApelido);
}

export function useRemoverApelido() {
  return useMutacao(removerApelido);
}

export function useRegistrarGasto() {
  return useMutacao(registrarGasto);
}

/** Excluir devolve o saldo da conta e muda a renda do mês: contas, ganhos, metas e a caixa se refazem. */
async function excluirGanho(id: string): Promise<true> {
  try {
    await chamar<void>(`/ganhos/${encodeURIComponent(id)}`, { metodo: "DELETE" });
    return true;
  } finally {
    invalidar("contas");
    invalidar("ganhos");
    invalidar("metas");
    // Um ganho aceito da caixa de entrada devolve a transação à caixa ao ser excluído.
    invalidar("transacoes-importadas");
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

export function useRendaBase() {
  return useConsulta("renda-base", (signal) => chamar<RendaBase>("/renda-base", { signal }));
}

async function definirRendaBase(valor: string): Promise<RendaBase> {
  const base = await chamar<RendaBase>("/renda-base", { metodo: "PUT", corpo: { valor } });
  invalidar("renda-base");
  invalidar("metas");
  return base;
}

async function removerRendaBase(_entrada: void): Promise<true> {
  await chamar<void>("/renda-base", { metodo: "DELETE" });
  invalidar("renda-base");
  invalidar("metas");
  return true;
}

export function useDefinirRendaBase() {
  return useMutacao(definirRendaBase);
}

export function useRemoverRendaBase() {
  return useMutacao(removerRendaBase);
}

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

async function definirMeta(meta: Omit<Meta,"nome">): Promise<Meta> {
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

/** A configuração do guardado nas metas (066). */
export function useGuardadoNasMetas() {
  return useConsulta("guardado-nas-metas", (signal) =>
    chamar<GuardadoNasMetas>("/guardado-nas-metas", { signal }),
  );
}

async function definirGuardadoNasMetas(guardado: GuardadoNasMetas): Promise<GuardadoNasMetas> {
  try {
    return await chamar<GuardadoNasMetas>("/guardado-nas-metas", { metodo: "PUT", corpo: guardado });
  } finally {
    invalidar("guardado-nas-metas");
    invalidar("metas");
  }
}

/** Troca a configuração inteira; o anel das metas se refaz porque o prefixo `metas` é invalidado. */
export function useDefinirGuardadoNasMetas() {
  return useMutacao(definirGuardadoNasMetas);
}

export function useDefinirMeta() {
  return useMutacao(definirMeta);
}

export function useRemoverMeta() {
  return useMutacao(removerMeta);
}


// --- investimentos ----------------------------------------------------------------

/** As posições, cada uma com o saldo rateado entre as destinações. */
export function useInvestimentos() {
  return useConsulta("investimentos", (signal) =>
    chamar<Investimento[]>("/investimentos", { signal }),
  );
}

export function useResumoDeInvestimentos(visao: VisaoDosInvestimentos) {
  return useConsulta(`investimentos/resumo?visao=${visao}`, (signal) =>
    chamar<ResumoDeInvestimentos>("/investimentos/resumo", { parametros: { visao }, signal }),
  );
}

/** Saldos diários guardados no período; só existem desde que o Gastoba começou a guardar. */
export function useHistoricoDeInvestimentos(inicio: string, fim: string) {
  return useConsulta(`investimentos/historico?inicio=${inicio}&fim=${fim}`, (signal) =>
    chamar<PontoDoHistorico[]>("/investimentos/historico", { parametros: { inicio, fim }, signal }),
  );
}

export function useRealocacoes(investimentoId: string) {
  return useConsulta(`investimentos/${investimentoId}/realocacoes`, (signal) =>
    chamar<Realocacao[]>(`/investimentos/${encodeURIComponent(investimentoId)}/realocacoes`, {
      signal,
    }),
  );
}

export function useMovimentosDeInvestimento(inicio: string, fim: string, habilitada = true) {
  return useConsulta(habilitada ? `movimentos-de-investimento?inicio=${inicio}&fim=${fim}` : "movimentos-de-investimento-desabilitados", async signal =>
    habilitada ? chamar<MovimentoDeInvestimento[]>("/movimentos-de-investimento", { parametros: { inicio, fim }, signal }) : []);
}

async function realocar(entrada: { investimentoId: string; dados: NovaRealocacao }) {
  try {
    return await chamar<Realocacao>(
      `/investimentos/${encodeURIComponent(entrada.investimentoId)}/realocacoes`,
      { metodo: "POST", corpo: entrada.dados },
    );
  } finally {
    // Na posição por fração a realocação muda a divisão das caixinhas, que as metas leem.
    invalidar("investimentos");
    invalidar("metas");
  }
}

export function useRealocar() {
  return useMutacao(realocar);
}

async function associarMovimento(entrada: {
  movimentoId: string;
  investimentoId: string;
  destinacoes: { tag: string; percentual: number }[];
}) {
  try {
    return await chamar<MovimentoDeInvestimento>(
      `/movimentos-de-investimento/${encodeURIComponent(entrada.movimentoId)}/destinacoes`,
      {
        metodo: "POST",
        corpo: { investimento_id: entrada.investimentoId, destinacoes: entrada.destinacoes },
      },
    );
  } finally {
    invalidar("investimentos");
    invalidar("movimentos-de-investimento");
    invalidar("resgates-sem-destinacao");
    invalidar("metas");
    invalidar("aportes-sem-investimento");
  }
}

export function useAssociarMovimento() {
  return useMutacao(associarMovimento);
}

function invalidarCaixinhasDoResgate() {
  for (const prefixo of ["movimentos-de-investimento", "investimentos", "reservas-das-destinacoes", "metas", "resgates-sem-destinacao"]) invalidar(prefixo);
}

/** Define as caixinhas de um resgate já ligado à posição e sem partes (069, D4). */
async function definirCaixinhasDoResgate(entrada: { movimentoId: string } & CaixinhasDoResgate) {
  try {
    return await chamar<MovimentoDeInvestimento>(
      `/movimentos-de-investimento/${encodeURIComponent(entrada.movimentoId)}/destinacoes`,
      { metodo: "POST", corpo: { investimento_id: entrada.investimento_id, destinacoes: entrada.destinacoes } },
    );
  } finally {
    invalidarCaixinhasDoResgate();
  }
}
export function useDefinirCaixinhasDoResgate() { return useMutacao(definirCaixinhasDoResgate); }

/** Tira as caixinhas do resgate; ele continua ligado à posição (só sessão; 409 com compra ou reaplicação). */
async function removerCaixinhasDoResgate(movimentoId: string) {
  try {
    await chamar<void>(`/movimentos-de-investimento/${encodeURIComponent(movimentoId)}/caixinhas`, { metodo: "DELETE" });
    return true;
  } finally {
    invalidarCaixinhasDoResgate();
  }
}
export function useRemoverCaixinhasDoResgate() { return useMutacao(removerCaixinhasDoResgate); }

/**
 * Define as destinações da parte da posição ainda sem principal (o saldo inicial): cria um aporte
 * sem conta, então refaz as posições, os movimentos e a caixa (a sugestão depende dos movimentos).
 */
async function definirDestinacoesDoInvestimento(entrada: {
  alocar?: boolean;
  investimentoId: string;
  dados: DestinacoesIniciais;
}) {
  try {
    await chamar<MovimentoDeInvestimento>(
      `/investimentos/${encodeURIComponent(entrada.investimentoId)}/${entrada.alocar ? "alocar-sem-caixinha" : "destinacoes"}`,
      { metodo: "POST", corpo: entrada.dados },
    );
    return true;
  } finally {
    invalidar("reservas-das-destinacoes");
    invalidar("investimentos");
    invalidar("movimentos-de-investimento");
    invalidar("transacoes-importadas");
  }
}

export function useDefinirDestinacoesDoInvestimento() {
  return useMutacao(definirDestinacoesDoInvestimento);
}

/** Apaga uma realocação feita por engano: o principal volta à origem. */
async function desfazerRealocacao(entrada: { investimentoId: string; realocacaoId: string }) {
  try {
    await chamar<void>(
      `/investimentos/${encodeURIComponent(entrada.investimentoId)}/realocacoes/${encodeURIComponent(entrada.realocacaoId)}`,
      { metodo: "DELETE" },
    );
    return true as const;
  } finally {
    invalidar("investimentos");
    invalidar("metas");
  }
}

export function useDesfazerRealocacao() {
  return useMutacao(desfazerRealocacao);
}

/** Apaga um saldo inicial definido por engano; o valor volta a ficar sem destinação. */
async function desfazerSaldoInicial(movimentoId: string) {
  try {
    await chamar<void>(`/movimentos-de-investimento/${encodeURIComponent(movimentoId)}`, {
      metodo: "DELETE",
    });
    return true as const;
  } finally {
    invalidar("investimentos");
    invalidar("movimentos-de-investimento");
    invalidar("transacoes-importadas");
  }
}

export function useDesfazerSaldoInicial() {
  return useMutacao(desfazerSaldoInicial);
}

/** Recarrega também os gastos e ganhos que podem pertencer à divisão desfeita. */
async function desfazerClassificacao(entrada: { movimentoId: string; desfazerDivisaoInteira?: boolean }): Promise<ClassificacaoDesfeita> {
  try {
    return await chamar<ClassificacaoDesfeita>(`/movimentos-de-investimento/${encodeURIComponent(entrada.movimentoId)}/desfazer-classificacao`, {
      metodo: "POST", corpo: { desfazer_divisao_inteira: entrada.desfazerDivisaoInteira ?? false },
    });
  } finally {
    invalidarDoAceite();
  }
}
export function useDesfazerClassificacao() { return useMutacao(desfazerClassificacao); }


export function useAlvosDasMetas() {
  return useConsulta("metas/alvos", signal => chamar<AlvoDaMeta[]>("/metas/alvos",{signal}));
}
export function useReservasDasDestinacoes(categoria: string) {
  return useConsulta(`reservas-das-destinacoes?categoria=${categoria}`,signal => chamar<ReservaDaDestinacao[]>("/reservas-das-destinacoes",{parametros:{categoria},signal}));
}
export function usePendenciasDeRevisao() {
  return useConsulta("revisao-de-investimentos",signal => chamar<PendenciasDeRevisao>("/revisao-de-investimentos",{signal}));
}
function invalidarDespesasEInvestimentos() {
  for (const prefixo of ["gastos","movimentos-de-investimento","metas","recorrencias","revisao-de-investimentos","reservas-das-destinacoes","investimentos","resumos","resgates-sem-destinacao"]) invalidar(prefixo);
}
export function useAssociarCompra() {
  return useMutacao(async (e: {gastoId:string;tag:string;valor:string;movimentoId?:string}) => {
    try {return await chamar<Cobertura>(`/gastos/${encodeURIComponent(e.gastoId)}/coberturas`,{metodo:"POST",corpo:{tag:e.tag,valor:e.valor,...(e.movimentoId?{movimento_id:e.movimentoId}:{})}});} finally {invalidarDespesasEInvestimentos();}
  });
}
export function useDesassociarCompra() {
  return useMutacao(async (e: {gastoId:string;coberturaId:string}) => {
    try {await chamar(`/gastos/${encodeURIComponent(e.gastoId)}/coberturas/${encodeURIComponent(e.coberturaId)}`,{metodo:"DELETE"}); return true;} finally {invalidarDespesasEInvestimentos();}
  });
}
export function useRevisarAporte() {
  return useMutacao(async(e:{id:string;dados:RevisaoDoAporte})=>{
    try {return await chamar<MovimentoDeInvestimento>(`/revisao-de-investimentos/aportes/${encodeURIComponent(e.id)}`,{metodo:"POST",corpo:e.dados});}finally{invalidarDespesasEInvestimentos();}
  });
}
export function useRevisarGastoLegado() {
  return useMutacao(async(e:{id:string;categoria:string})=>{
    try{return await chamar<Gasto>(`/revisao-de-investimentos/gastos/${encodeURIComponent(e.id)}`,{metodo:"POST",corpo:{categoria:e.categoria}});}finally{invalidarDespesasEInvestimentos();}
  });
}
export function useRevisarRecorrenciaLegada() {
  return useMutacao(async(e:{id:string;categoria:string})=>{
    try{return await chamar<Recorrencia>(`/revisao-de-investimentos/recorrencias/${encodeURIComponent(e.id)}`,{metodo:"POST",corpo:{categoria:e.categoria}});}finally{invalidarDespesasEInvestimentos();}
  });
}
/** Saques de investimento sem tag: alimentam o sininho. */
export function useResgatesSemDestinacao() {
  return useConsulta("resgates-sem-destinacao",signal => chamar<import("./tipos").AvisoDeResgate[]>("/resgates-sem-destinacao",{signal}));
}
export function useDefinirCorDaDestinacao(){
  return useMutacao(async(e:{tag:string;cor:CorDaDestinacao})=>{
    try{return await chamar("/cores-das-destinacoes",{metodo:"PUT",corpo:e});}finally{invalidar("investimentos");invalidar("reservas-das-destinacoes");invalidar("destinacoes-cadastradas");}
  });
}
export function useRemoverCorDaDestinacao(){
  return useMutacao(async(tag:string)=>{
    try{await chamar("/cores-das-destinacoes",{metodo:"DELETE",parametros:{tag}});return true;}finally{invalidar("investimentos");invalidar("reservas-das-destinacoes");invalidar("destinacoes-cadastradas");}
  });
}

/** Os cartões com suas faturas; `hoje` ("AAAA-MM-DD") define a situação de cada uma. Só a dona da importação. */
export function useFaturas(hoje: string) {
  return useConsulta(`faturas?hoje=${hoje}`, (signal) =>
    chamar<ListaDeFaturas>("/faturas", { parametros: { hoje }, signal }),
  );
}

/** Uma fatura com as compras e os pagamentos; só se monta quando a fatura é aberta na tela. */
export function useFatura(id: string, hoje: string) {
  return useConsulta(`faturas/${id}?hoje=${hoje}`, (signal) =>
    chamar<FaturaDetalhada>(`/faturas/${encodeURIComponent(id)}`, { parametros: { hoje }, signal }),
  );
}


async function consultarImpactoDaReversao(id: string): Promise<import("./tipos").ImpactoDaReversao> {
  return chamar(`/transacoes-importadas/${encodeURIComponent(id)}/impacto-da-reversao`);
}
export function useConsultarImpactoDaReversao() { return useMutacao(consultarImpactoDaReversao); }
async function desfazerClassificacaoImportada(entrada: { transacaoId: string; versaoEsperada: string; desfazerDivisaoInteira: boolean; desfazerDependencias: boolean }): Promise<ClassificacaoDesfeita> {
  try {
    return await chamar(`/transacoes-importadas/${encodeURIComponent(entrada.transacaoId)}/desfazer-classificacao`, {
      metodo: "POST", corpo: { versao_esperada: entrada.versaoEsperada, desfazer_divisao_inteira: entrada.desfazerDivisaoInteira, desfazer_dependencias: entrada.desfazerDependencias },
    });
  } finally { invalidarDoAceite(); }
}
export function useDesfazerClassificacaoImportada() { return useMutacao(desfazerClassificacaoImportada); }


async function definirPapelDaConta(entrada: { id: string; papel: "corrente" | "investimento" }): Promise<Conta> {
 try { return await chamar(`/contas/${encodeURIComponent(entrada.id)}/papel`, { metodo: "PUT", corpo: { papel: entrada.papel } }); }
 finally { invalidar("contas"); }
}
export function useDefinirPapelDaConta() { return useMutacao(definirPapelDaConta); }
async function classificarTransferencia(entrada: { id: string; conta_contraparte_id: string; par_transacao_id: string | null }): Promise<import("./tipos").TransferenciaEntreContas> {
 try { return await chamar(`/transacoes-importadas/${encodeURIComponent(entrada.id)}/aceitar-como-transferencia`, {
  metodo: "POST", corpo: { conta_contraparte_id: entrada.conta_contraparte_id, par_transacao_id: entrada.par_transacao_id },
 }); } finally { invalidarDoAceite(); invalidar("transferencias-entre-contas"); }
}
export function useClassificarTransferencia() { return useMutacao(classificarTransferencia); }
export function useTransferencias(inicio: string, fim: string, habilitada = true) {
 return useConsulta<import("./tipos").TransferenciaEntreContas[]>(habilitada ? `transferencias-entre-contas?inicio=${inicio}&fim=${fim}` : "transferencias-desabilitadas", async sinal => habilitada ? chamar("/transferencias-entre-contas", { parametros: { inicio, fim }, signal: sinal }) : []);
}
async function completarPar(entrada: { id: string; transacao_id: string }): Promise<import("./tipos").TransferenciaEntreContas> {
 try { return await chamar(`/transferencias-entre-contas/${encodeURIComponent(entrada.id)}/completar-par`, { metodo: "POST", corpo: { transacao_id: entrada.transacao_id } }); }
 finally { invalidarDoAceite(); invalidar("transferencias-entre-contas"); }
}
export function useCompletarParDaTransferencia() { return useMutacao(completarPar); }

export function useReaplicacoesDeResgates() {
  return useConsulta("reaplicacoes-de-resgates", signal => chamar<import("./tipos").ReaplicacaoDeResgate[]>("/reaplicacoes-de-resgates", {signal}));
}
export function useResgatesParaReaplicar(aporteId: string) {
  return useConsulta(`resgates-para-reaplicar/${aporteId}`, signal => chamar<import("./tipos").ResgateParaReaplicar[]>(`/movimentos-de-investimento/${encodeURIComponent(aporteId)}/resgates-para-reaplicar`, {signal}));
}
function invalidarReaplicacoes() {
  for (const prefixo of ["metas", "movimentos-de-investimento", "reaplicacoes-de-resgates", "resgates-para-reaplicar", "reservas-das-destinacoes"]) invalidar(prefixo);
}
export function useConfirmarReaplicacao() {
  return useMutacao(async (corpo: import("./tipos").ConfirmarReaplicacao) => {
    try { return await chamar<import("./tipos").ReaplicacaoDeResgate>("/reaplicacoes-de-resgates", {metodo:"POST", corpo}); }
    finally { invalidarReaplicacoes(); }
  });
}
export function useRemoverReaplicacao() {
  return useMutacao(async (id: string) => {
    try { await chamar(`/reaplicacoes-de-resgates/${encodeURIComponent(id)}`, {metodo:"DELETE"}); return true; }
    finally { invalidarReaplicacoes(); }
  });
}

export function useClassificarNaturezaDoResgate() {
 return useMutacao(async (e:{id:string;tipo:"resgate"|"vencimento"}) => {
  await chamar(`/movimentos-de-investimento/${encodeURIComponent(e.id)}/natureza-do-resgate`,{metodo:"PUT",corpo:{tipo:e.tipo}});
  invalidar("movimentos-de-investimento"); invalidar("resgates-sem-destinacao");
  return true;
 });
}


async function reclassificarTransacaoImportada(entrada: {
  transacaoId: string; rotulo: import("./tipos").RotuloDeReclassificacao; versaoEsperada: string;
  investimentoId: string | null; movimentoRelacionadoId?: string; desfazerDivisaoInteira: boolean; desfazerDependencias: boolean;
}): Promise<{ tipo: string; id: string }> {
  try {
    return await chamar(`/transacoes-importadas/${encodeURIComponent(entrada.transacaoId)}/reclassificar`, {
      metodo: "POST",
      corpo: {
        rotulo: entrada.rotulo, versao_esperada: entrada.versaoEsperada, investimento_id: entrada.investimentoId, movimento_relacionado_id: entrada.movimentoRelacionadoId,
        desfazer_divisao_inteira: entrada.desfazerDivisaoInteira, desfazer_dependencias: entrada.desfazerDependencias,
      },
    });
  } finally { invalidarDoAceite(); invalidar("investimentos"); invalidar("metas"); invalidar("movimentos-de-investimento"); }
}
export function useReclassificarTransacaoImportada() { return useMutacao(reclassificarTransacaoImportada); }

async function desfazerCasamento(id: string): Promise<boolean> {
  try { await chamar(`/casamentos/${encodeURIComponent(id)}`, { metodo: "DELETE" }); return true; }
  finally { invalidarDaRevisaoDaBolsa(); }
}
export function useDesfazerCasamento() { return useMutacao(desfazerCasamento); }

function invalidarDaRevisaoDaBolsa(): void {
  invalidarDoAceite();
  for (const chave of ["revisao-da-bolsa", "casamentos", "movimentos-de-investimento", "transacoes-importadas", "investimentos", "metas", "ganhos", "gastos", "resumos"]) invalidar(chave);
}
export function useRevisaoDaBolsa(habilitada = true) {
  return useConsulta<import("./tipos").RevisaoDaBolsa>(habilitada ? "revisao-da-bolsa" : "revisao-da-bolsa-desabilitada", async sinal => {
    if (!habilitada) return { propostas: [], sem_par: [], confirmados: [], conciliadas: [] };
    const resposta = await chamar<Partial<import("./tipos").RevisaoDaBolsa>>("/revisao-da-bolsa", { signal: sinal });
    return { propostas: resposta.propostas ?? [], sem_par: resposta.sem_par ?? [], confirmados: resposta.confirmados ?? [], conciliadas: resposta.conciliadas ?? [] };
  });
}
async function confirmarPropostasDaBolsa(itens: import("./tipos").ItemDeConfirmacao[]): Promise<import("./tipos").LigacaoConfirmada[]> {
  try {
    const resposta = await chamar<{ confirmados: import("./tipos").LigacaoConfirmada[] }>("/revisao-da-bolsa/confirmar", { metodo: "POST", corpo: { itens } });
    return resposta.confirmados;
  } finally { invalidarDaRevisaoDaBolsa(); }
}
export function useConfirmarPropostasDaBolsa() { return useMutacao(confirmarPropostasDaBolsa); }
async function refazerCasamento(id: string): Promise<import("./tipos").LigacaoConfirmada> {
  try { return await chamar(`/casamentos/${encodeURIComponent(id)}/refazer`, { metodo: "POST" }); }
  finally { invalidarDaRevisaoDaBolsa(); }
}
export function useRefazerCasamento() { return useMutacao(refazerCasamento); }
/** Troca o gasto antigo de uma liquidação da bolsa pela ligação com as operações (069, T022). */
async function trocarGastoPelaLigacao(transacaoId: string): Promise<import("./tipos").LigacaoConfirmada> {
  try { return await chamar(`/revisao-da-bolsa/trocar-gasto/${encodeURIComponent(transacaoId)}`, { metodo: "POST" }); }
  finally { invalidarDaRevisaoDaBolsa(); for (const chave of ["tags", "recorrencias", "reservas-das-destinacoes", "resgates-sem-destinacao"]) invalidar(chave); }
}
export function useTrocarGastoPelaLigacao() { return useMutacao(trocarGastoPelaLigacao); }

export function useOperacoes(investimentoId: string) {
  return useConsulta(`investimentos/${investimentoId}/operacoes`, signal =>
    chamar<import("./tipos").Operacao[]>(`/investimentos/${encodeURIComponent(investimentoId)}/operacoes`, { signal }));
}
async function salvarOperacao(entrada: { investimentoId: string; operacaoId?: string; dados: import("./tipos").NovaOperacao }) {
  try {
    const { tipo: _tipo, operacao_relacionada_id: _relacao, confirmar_duplicidade: _duplicidade, ...alteracao } = entrada.dados;
    return await chamar<import("./tipos").Operacao>(entrada.operacaoId
      ? `/operacoes/${encodeURIComponent(entrada.operacaoId)}`
      : `/investimentos/${encodeURIComponent(entrada.investimentoId)}/operacoes`, {
      metodo: entrada.operacaoId ? "PUT" : "POST", corpo: entrada.operacaoId ? alteracao : entrada.dados,
    });
  } finally {
    invalidar("investimentos"); invalidar("reservas-das-destinacoes");
  }
}
export function useSalvarOperacao() { return useMutacao(salvarOperacao); }
async function excluirOperacao(id: string) {
  try {
    await chamar(`/operacoes/${encodeURIComponent(id)}`, { metodo: "DELETE" });
    return true;
  } finally {
    invalidar("investimentos"); invalidar("reservas-das-destinacoes");
  }
}
export function useExcluirOperacao() { return useMutacao(excluirOperacao); }

export function useAportesSemInvestimento() {
  return useConsulta("aportes-sem-investimento", signal => chamar<import("./tipos").AporteSemInvestimento[]>("/aportes-sem-investimento", { signal }));
}
async function tratarAporte(entrada: { id: string; acao: "mesclar" | "excluir" | "desfazer" | "confirmar"; mantidoId?: string }) {
  try {
    await chamar(`/aportes-sem-investimento/${encodeURIComponent(entrada.id)}/${entrada.acao}`, { metodo: "POST", corpo: entrada.mantidoId ? { mantido_id: entrada.mantidoId } : undefined });
    return true;
  } finally {
    for (const p of ["aportes-sem-investimento", "investimentos", "movimentos-de-investimento", "metas", "transacoes-importadas", "revisao-de-investimentos"]) invalidar(p);
  }
}
export function useTratarAporte() { return useMutacao(tratarAporte); }

// --- aparência -------------------------------------------------------------------

/** As intensidades, texturas e marcas que a pessoa pode escolher (lidas dos enums do backend). */
export function useOpcoesDeAparencia() {
  return useConsulta("aparencia/opcoes", (signal) =>
    chamar<OpcoesDeAparencia>("/aparencia/opcoes", { signal }),
  );
}

async function definirAparencia(escolha: EscolhaDeAparencia): Promise<Aparencia> {
  return chamar<Aparencia>("/aparencia", { metodo: "PUT", corpo: escolha });
}

async function restaurarAparencia(_entrada: void): Promise<true> {
  await chamar<void>("/aparencia", { metodo: "DELETE" });
  return true;
}

/** O perfil vive no estado da sessão (não no cache): quem chama entrega o resultado a `useSessao`. */
export function useDefinirAparencia() {
  return useMutacao(definirAparencia);
}

export function useRestaurarAparencia() {
  return useMutacao(restaurarAparencia);
}
