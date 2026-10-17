// Tipos do contrato da API (escritos à mão a partir de backend/src/gastoba/api/esquemas.py).
// Dinheiro trafega sempre como string decimal ("25.90"), nunca como número (Art. III.3).

export type Conta = {
  id: string;
  nome: string;
  saldo: string;
  origem: "manual" | "open_finance";
  tipo: "corrente" | "cartao";
};

export type Categoria = { codigo: string; nome: string };

export type Gasto = {
  id: string;
  conta_id: string;
  valor: string;
  descricao: string;
  /** "AAAA-MM-DD". */
  data: string;
  /** Código da categoria (ex.: "conforto"). */
  categoria: string;
  tags: string[];
  origem: string;
  /** Só no gasto gerado por uma recorrência. */
  recorrencia_id: string | null;
};

/** Ganho: dinheiro que entra numa conta (salário, reembolso). Não tem categoria. */
export type Ganho = {
  id: string;
  conta_id: string;
  valor: string;
  descricao: string;
  /** "AAAA-MM-DD". */
  data: string;
  tags: string[];
  origem: string;
  /** Só no ganho gerado por uma recorrência. */
  recorrencia_id: string | null;
};

export type TipoDeRecorrencia = "ganho" | "gasto";

/** Modelo mensal que gera um ganho ou um gasto por mês, no `dia_do_mes`. */
export type Recorrencia = {
  id: string;
  tipo: TipoDeRecorrencia;
  conta_id: string;
  valor: string;
  descricao: string;
  /** 1 a 31; em mês mais curto vale o último dia. */
  dia_do_mes: number;
  /** "AAAA-MM-DD". */
  inicio: string;
  fim: string | null;
  /** Só no gasto. */
  categoria: string | null;
  tags: string[];
  /** Falso depois de encerrada: o que ela já gerou fica. */
  ativa: boolean;
};

export type NovaRecorrencia = {
  tipo: TipoDeRecorrencia;
  conta_id: string;
  valor: string;
  descricao: string;
  dia_do_mes: number;
  inicio: string;
  categoria?: string;
  tags?: string[];
  fim?: string;
};

/** O que `PUT /recorrencias/{id}` troca: conta, tipo e início não mudam. */
export type AlteracaoDeRecorrencia = {
  valor: string;
  descricao: string;
  dia_do_mes: number;
  categoria?: string;
  tags: string[];
  fim?: string;
};

/** Porcentagem (1 a 100) da renda do mês destinada a uma categoria. */
export type Meta = { categoria: string; percentual: number };

export type SituacaoDaMeta = "dentro" | "alerta" | "estourou" | "sem_renda";

/** Uma meta no mês: o limite é o percentual da renda; `restante` fica negativo ao estourar. */
export type ProgressoDaMeta = {
  categoria: string;
  percentual: number;
  limite: string;
  gasto: string;
  restante: string;
  /** `gasto * 100 / limite`, para baixo; nulo se há gasto e o limite é zero. */
  percentual_usado: number | null;
  situacao: SituacaoDaMeta;
};

/** `GET /metas/progresso`: a renda do mês (soma dos ganhos) e as metas com o progresso. */
export type ResumoDasMetas = { mes: string; renda: string; metas: ProgressoDaMeta[] };

export type NovaConta = { nome: string; saldo_inicial?: string };

/** A parte do total dos gastos que cabe a uma tag; `tag` é `null` nos gastos sem tag. */
export type FatiaPorTag = {
  tag: string | null;
  valor: string;
};

export type ResumoPorTags = {
  inicio: string;
  fim: string;
  total: string;
  fatias: FatiaPorTag[];
};

/** Mesmos filtros de `GET /gastos`, menos a tag: o resumo por tag ignora o filtro de tag. */
export type FiltrosDoResumoPorTags = Omit<FiltrosDeGastos, "tag">;

export type NovoGasto = {
  conta_id: string;
  valor: string;
  descricao: string;
  data: string;
  categoria: string;
  tags: string[];
};

export type NovoGanho = {
  conta_id: string;
  valor: string;
  descricao: string;
  data: string;
  tags: string[];
};

/** `GET /auth/eu`. O e-mail é nulo só no usuário herdado da versão sem login. */
export type Usuario = {
  id: string;
  email: string | null;
  nome: string;
  /** Só em `GET /auth/eu`: a pessoa é a dona da importação bancária e vê a aba Importadas. */
  importacao_bancaria?: boolean;
};

export type SentidoDaTransacao = "entrada" | "saida";

/** Transação vinda do banco, esperando a decisão da pessoa (a caixa de entrada). */
export type TransacaoImportada = {
  id: string;
  conta_id: string;
  /** "AAAA-MM-DD". */
  data: string;
  descricao: string;
  valor: string;
  sentido: SentidoDaTransacao;
  tipo_de_operacao: string | null;
  estado: "pendente" | "aceita" | "ignorada";
  /** Pagamento de fatura, transferência entre as próprias contas ou estorno. */
  sugerir_descarte: boolean;
  /** Já há um lançamento manual da mesma conta, no mesmo dia e com o mesmo valor. */
  possivel_duplicado: boolean;
};

/** O que `POST /transacoes-importadas/{id}/aceitar` criou. */
export type Aceite = { tipo: "gasto" | "ganho"; id: string };

export type AceiteDaTransacao = { categoria?: string; tags: string[] };

export type Sincronizacao = { contas: number; transacoes_novas: number; falhas: number };

/**
 * Resposta de `POST /auth/entrar`. O front ignora o `token`: a sessão viaja só
 * no cookie HttpOnly, que o JavaScript não lê.
 */
export type Sessao = {
  token: string;
  /** Instante ISO 8601 com fuso. */
  expira_em: string;
};

export type EscopoDaChave = "leitura" | "escrita";

/** Chave de API na listagem: nunca traz o segredo, só o prefixo público. */
export type ChaveDeApi = {
  id: string;
  nome: string;
  prefixo: string;
  escopo: EscopoDaChave;
  /** Instantes ISO 8601 com fuso. */
  criada_em: string;
  ultimo_uso: string | null;
  expira_em: string | null;
};

/** Resposta da criação: o único momento em que o segredo aparece. */
export type ChaveDeApiCriada = ChaveDeApi & { segredo: string };

/** Corpo de `POST /chaves-de-api` (a SPA não envia `expira_em`: a chave vale até ser revogada). */
export type NovaChaveDeApi = { nome: string; escopo: EscopoDaChave };

export type DetalheDoErro = { campo: string; mensagem: string };

export type ErroDaApi = {
  erro: { codigo: string; mensagem: string; detalhes?: DetalheDoErro[] };
};

/** Filtros de `GET /ganhos`; `inicio` e `fim` ("AAAA-MM-DD") são inclusivos. */
export type FiltrosDeGanhos = { inicio: string; fim: string; conta_id?: string };

/** Filtros de `GET /gastos`; `inicio` e `fim` ("AAAA-MM-DD") são inclusivos. */
export type FiltrosDeGastos = {
  inicio: string;
  fim: string;
  conta_id?: string;
  tag?: string;
  categoria?: string;
};
