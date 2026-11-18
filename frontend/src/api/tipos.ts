// Tipos do contrato da API (escritos à mão a partir de backend/src/gastoba/api/esquemas.py).
// Dinheiro trafega sempre como string decimal ("25.90"), nunca como número (Art. III.3).

export type Conta = {
  papel?: "corrente" | "investimento" | null;
  id: string;
  nome: string;
  saldo: string;
  origem: "manual" | "open_finance";
  /** `remunerada`: aplica e resgata sozinha; o saldo é a caixinha, não entra no total das contas. */
  tipo: "corrente" | "cartao" | "remunerada";
};

export type AlvoDaMeta = { codigo: string; nome: string };
export type Categoria = AlvoDaMeta & { legada: boolean };

export type Gasto = {
  transacao_importada_id?: string | null;
  valor_coberto: string;
  coberturas: Cobertura[];
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
  transacao_importada_id?: string | null;
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
export type Meta = { categoria: string; nome: string; percentual: number };

export type SituacaoDaMeta = "dentro" | "alerta" | "estourou" | "sem_renda";

/** Uma meta no mês: o limite é o percentual da renda; `restante` fica negativo ao estourar. */
export type ProgressoDaMeta = {
  nome: string;
  categoria: string;
  percentual: number;
  limite: string;
  gasto: string;
  restante: string;
  /** `gasto * 100 / limite`, para baixo; nulo se há gasto e o limite é zero. */
  percentual_usado: number | null;
  situacao: SituacaoDaMeta;
  /** `gasto` mais o que as caixinhas pagaram: o card mostra "bruto de limite + adicional". */
  gasto_bruto: string;
  /** O que as caixinhas pagaram de compras da categoria no mês; aumenta o limite. */
  limite_adicional: string;
  caixinhas: CaixinhaDaMeta[];
  /** Rentabilidade (%, duas casas) das caixinhas da meta; nula sem dado. */
  rentabilidade: string | null;
};

/** Uma caixinha ligada à meta: o que pagou no mês (pode ser zero) e a rentabilidade. */
export type CaixinhaDaMeta = { tag: string; valor: string; rentabilidade: string | null };

/** Previsão mensal usada somente como referência das metas. */
export type RendaBase = { valor: string | null };

/** Renda registrada, base opcional e referência usada no progresso das metas. */
export type ResumoDasMetas = {
  aportes_do_mes?: string;
  classificacoes_para_revisar?: number;
  mes: string;
  renda: string;
  renda_base: string | null;
  renda_de_referencia: string;
  metas: ProgressoDaMeta[];
};

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
  gestao_de_investimentos?: boolean;
};

export type SentidoDaTransacao = "entrada" | "saida";

/** Transação vinda do banco, esperando a decisão da pessoa (a caixa de entrada). */
export type TransacaoImportada = {
  motivo_ignorada?: "transferencia_entre_contas" | null;
  tipo_de_movimento_sugerido?: TipoDeMovimento | null;
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
  /** A posição de que a saída parece ser o aporte (a emissão do título); nulo sem sugestão. */
  investimento_sugerido_id: string | null;
  /** A outra ponta provável de uma transferência entre contas próprias, se for inequívoca. */
  par_sugerido_id?: string | null;
};

/** O que `POST /transacoes-importadas/{id}/aceitar` criou. */
export type Aceite = { tipo: "gasto" | "ganho" | TipoDeMovimento; id: string };

export type AceiteDaTransacao = {
  tipo_de_movimento?: TipoDeMovimento;
  movimento_relacionado_id?: string;
  /** Categoria ativa obrigatória apenas no gasto; proibida em operação de investimento. */
  categoria?: string;
  tags: string[];
  /** Classifica uma operação de investimento, sem categoria de despesa nem tags comuns. */
  como_investimento?: boolean;
  /** Só com `como_investimento`: o investimento e a divisão do valor (soma 100%). */
  investimento_id?: string;
  destinacoes?: DestinacaoDeEnvio[];
};

/** Aceita de uma vez várias saídas pendentes, com a mesma categoria e as mesmas tags. */
export type AceiteEmLote = AceiteDaTransacao & { transacao_ids: string[] };
export type AceiteEmLoteResposta = { aceitas: Aceite[] };

/** Uma parte do aporte: a tag e o percentual inteiro (1 a 100). */
export type DestinacaoDeEnvio = { tag: string; percentual: number };

export type DestinacaoDoInvestimento = {
  cor: CorDaDestinacao | null;
  /** Nula na parte do saldo que ainda não tem destinação. */
  tag: string | null;
  principal: string;
  valor_atual: string;
  /** `valor_atual - principal`; o ganho sobre o principal em % ("4.32"), nulo sem principal. */
  rendimento: string;
  rentabilidade: string | null;
};

/** A remuneração contratada como a instituição informa; o que é zero vem nulo. */
export type TaxaDoInvestimento = {
  /** % do indexador (ou a taxa, sem indexador), em texto: "101.2". */
  percentual: string | null;
  /** "CDI", "IPCA"…, como a instituição escreve. */
  indexador: string | null;
  /** A parte fixa ao ano somada ao percentual. */
  adicional_anual: string | null;
};

/** O que falta para fechar o histórico de uma posição: ``faltam_cotas`` ou ``sobram_cotas``. */
export type PendenciaDeInvestimento = { tipo: "faltam_cotas" | "sobram_cotas"; quantidade_estimada: string };

export type AcaoDoHistorico = "confirmar_quantidade" | "completar" | "conferir_operacoes";

export type NaturezaDoMovimento = "liquidacao_de_bolsa" | "imposto_ou_taxa" | "conta_remunerada" | "vencimento" | "rendimento" | "outra";

export type Investimento = {
  alocacao_por_fracao?: boolean;
  pendencias_de_operacoes?: PendenciaDeOperacao[];
  /** Nome normalizado com vencimento e taxa (e o final do id, só se ainda repetir): único. */
  rotulo?: string | null;
  /**
   * Posição pelas operações (060). Sem histórico completo a rentabilidade vem nula, com o
   * motivo `historico_incompleto`; o anualizado só existe com mais de 12 meses. Opcionais para
   * aceitar respostas anteriores a esses campos.
   */
  quantidade?: string | null;
  custo_medio?: string | null;
  historico_completo?: boolean;
  rentabilidade_do_periodo?: string | null;
  rentabilidade_anualizada?: string | null;
  motivo_sem_rentabilidade?: string | null;
  pendencias?: PendenciaDeInvestimento[];
  /** Qual botão acompanha o aviso do histórico; nulo quando não há o que fazer. */
  acao_do_historico?: AcaoDoHistorico | null;
  data_de_aplicacao?: string | null;
  conta_id?: string | null;
  custos_registrados?: string;
  resultado_realizado?: string | null;
  id: string;
  nome: string;
  tipo: string;
  subtipo: string | null;
  saldo: string;
  /**
   * Valor aplicado, lucro e rentabilidade em % (lucro / aplicado): da instituição (`origem_da_rentabilidade`);
   * nulos quando ela não informa, exceto na conta remunerada, estimada pelo principal (`"aportes"`).
   */
  valor_aplicado: string | null;
  rendimento: string | null;
  rentabilidade: string | null;
  origem_da_rentabilidade: "instituicao" | "aportes" | null;
  /** Com o histórico das operações fechado: o aplicado (custo médio) e o lucro sobre ele. */
  valor_aplicado_das_operacoes?: string | null;
  rendimento_das_operacoes?: string | null;
  taxa: TaxaDoInvestimento | null;
  /** "AAAA-MM-DD" do vencimento do título, se a instituição informa. */
  vencimento?: string | null;
  /** "AAAA-MM-DD" do último saldo guardado, ou nulo. */
  atualizado_em: string | null;
  destinacoes: DestinacaoDoInvestimento[];
};

export type VisaoDosInvestimentos = "destinacao" | "tipo";

export type FatiaDeInvestimento = { cor: CorDaDestinacao | null; rotulo: string | null; valor: string };
export type HistoricoDeMeta = { categoria: string; nome: string; acao: "criada" | "alterada" | "removida"; percentual_anterior: number | null; percentual_novo: number | null; instante: string };

export type ResumoDeInvestimentos = {
  aportes_sem_destino?: { total: string; quantidade: number };
  visao: VisaoDosInvestimentos;
  total: string;
  fatias: FatiaDeInvestimento[];
};

export type PontoDoHistorico = { investimento_id: string; data: string; saldo: string };

export type Realocacao = {
  id: string;
  investimento_id: string;
  origem: string;
  destino: string;
  valor: string;
  data: string;
};

/** `POST /investimentos/{id}/destinacoes`: reparte a parte da posição ainda sem principal. */
export type DestinacoesIniciais = { destinacoes: DestinacaoDeEnvio[] };

/** Informe o `valor` ou o `percentual` (do principal da origem), só um dos dois. */
export type NovaRealocacao = {
  origem: string;
  destino: string;
  data: string;
  valor?: string;
  percentual?: number;
};

export type ClassificacaoDesfeita = { transacao_id: string; estado: "pendente"; lancamentos_removidos: number };

export type MovimentoDeInvestimento = {
  natureza?: NaturezaDoMovimento;
  /** Casamento que originou o movimento (nulo até a Revisão da bolsa). */
  casamento_id?: string | null;
  vencimento_confirmado?: boolean;
  revisao_contabil_pendente?: boolean;
  movimento_relacionado_id?: string | null;
  categoria: string | null;
  revisao_pendente: boolean;
  transacao_importada_id: string | null;
  id: string;
  /** Nula só no saldo inicial, que não sai de conta. */
  conta_id: string | null;
  investimento_id: string | null;
  tipo: TipoDeMovimento;
  /** `open_finance`, `manual` (gasto antigo convertido) ou `saldo_inicial`. */
  origem: string;
  descricao: string;
  valor: string;
  data: string;
  destinacoes: ParteDoMovimento[];
};

/** `categoria` é a foto do vínculo da caixinha na hora do aporte; `coberto` é o quanto compras já usaram do resgate. */
export type ParteDoMovimento = { tag: string; valor: string; categoria: string | null; coberto: string | null };

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

/**
 * Uma parte de uma transação dividida: categoria (só na saída), tags e o percentual inteiro. A
 * parte de saída com `como_investimento` é um aporte: sem tags, com o investimento e as
 * destinações opcionais.
 */
export type ParteDaDivisao = {
  como_investimento?: boolean;
  categoria?: string;
  tags: string[];
  percentual: number;
  investimento_id?: string;
  destinacoes?: DestinacaoDeEnvio[];
};
/** De 2 a 10 partes, de 1 a 100% cada, somando 100%. */
export type DivisaoDaTransacao = { partes: ParteDaDivisao[] };
export type DivisaoResposta = { criados: Aceite[] };

export type Cobertura = {id: string; tag: string; valor: string; movimento_id?: string | null};
export type CorDaDestinacao = "ametista" | "menta" | "orquidea" | "ceu" | "ambar" | "coral" | "glicinia" | "esmeralda";
export type ReservaDaDestinacao = {tag: string; reservado: string; coberto: string; disponivel: string; cor: CorDaDestinacao | null};
export type PendenciasDeRevisao = {aportes: MovimentoDeInvestimento[]; gastos: Gasto[]; recorrencias: Recorrencia[]};
export type RevisaoDoAporte = {categoria: string | null; investimento_id?: string; destinacoes?: DestinacaoDeEnvio[]};

export type SituacaoDaFatura = "aberta" | "fechada" | "paga" | "vencida";

/** `GET /faturas`: uma fatura do cartão. Dinheiro como texto; datas "AAAA-MM-DD". */
export type Fatura = {
  id: string;
  inicio: string | null;
  fechamento: string;
  vencimento: string | null;
  total: string;
  pago: string;
  restante: string;
  a_favor: string;
  minimo: string | null;
  situacao: SituacaoDaFatura;
  /** "estimada": calculada pelas compras, não veio do banco. */
  fonte: "banco" | "estimada";
  quantidade_de_compras: number;
};

export type CartaoComFaturas = {
  conta_id: string;
  conta_nome: string;
  valor_devido: string;
  /** Da mais recente para a mais antiga. */
  faturas: Fatura[];
};

export type ListaDeFaturas = { cartoes: CartaoComFaturas[] };

export type CompraDaFatura = {
  id: string;
  data: string;
  descricao: string;
  valor: string;
  /** "entrada" é estorno e abate o total. */
  sentido: SentidoDaTransacao;
  parcela_numero: number | null;
  parcela_total: number | null;
  estado: "pendente" | "aceita" | "ignorada";
};

export type PagamentoDaFatura = { data: string; valor: string; forma: string | null };

export type FaturaDetalhada = Fatura & {
  compras: CompraDaFatura[];
  pagamentos: PagamentoDaFatura[];
};

export type ImpactoDaReversao = { transacoes_reabertas: number; coberturas_removidas: number; transacao_id: string; versao: string; lancamentos_removidos: number; divisao_inteira: boolean };

export type TransferenciaEntreContas = {
 id: string; conta_origem_id: string; conta_destino_id: string; valor: string; data: string;
 aporte_liquido: string; papel_origem: "corrente" | "investimento"; papel_destino: "corrente" | "investimento";
 transacao_origem_id: string | null; transacao_destino_id: string | null; competencia_provisoria: boolean;
};

export type TipoDeMovimento = "aporte" | "resgate" | "rendimento" | "custo" | "imposto";

export type ReconciliacaoDaCaixinha = {
 saldo_inicial: string; saldo_observado: string; saldo_calculado: string; diferenca: string;
 completo: boolean; conciliado: boolean;
};


export type ReaplicacaoDeResgate = { id: string; aporte_id: string; resgate_id: string; valor: string };
export type ConfirmarReaplicacao = { aporte_id: string; resgate_id: string; valor: string };
export type ResgateParaReaplicar = { id: string; data: string; descricao: string; investimento_nome: string; valor: string; disponivel: string };

export type AvisoDeResgate = Omit<MovimentoDeInvestimento, "tipo"> & { tipo: "resgate" | "vencimento"; investimento_nome?: string | null };


/** Uma das transações do casamento: o débito (ou crédito) bruto, a taxa ou o imposto. */
export type VinculoDeCasamento = { transacao_id: string; papel: "bruto" | "taxa" | "imposto" };
export type Casamento = { id: string; operacao_ids: string[]; vinculos: VinculoDeCasamento[] };

/** Revisão da bolsa (061): propostas de ligar lançamentos da conta às operações da corretora. */
export type SituacaoNaRevisao = "pendente" | "aporte_sem_investimento" | "resgate_sem_investimento" | "ganho" | "aporte_de_outra_posicao";
export type OperacaoNaProposta = { id: string; posicao_id: string; rotulo: string; tipo: string; data: string; quantidade: string; valor_bruto: string; custos: string };
export type TransacaoNaProposta = { id: string; data: string; descricao: string; valor: string; situacao: SituacaoNaRevisao };
export type CodigoDeEfeito = "aporte_passa_a_ser_da_posicao" | "taxa_deixa_de_ser_aporte" | "ganho_deixa_de_ser_renda" | "aceita_a_pendente";
export type PropostaDeCasamento = {
  chave: string;
  versao: string;
  tipo: "compra_na_bolsa" | "venda_na_bolsa" | "resgate_de_renda_fixa";
  data_do_pregao: string;
  operacoes: OperacaoNaProposta[];
  bruto: TransacaoNaProposta[];
  taxas: TransacaoNaProposta[];
  /** Dinheiro com sinal: bruto da conta menos o das operações. */
  diferenca: string;
  diferenca_de_custo: string;
  confianca: "exata" | "precisa_escolher";
  motivo: string | null;
  efeitos: { transacao_id: string; codigo: CodigoDeEfeito }[];
};
/** `descricao` diz o que é ("Compra de AUVP11 (3)" ou o texto do banco); `data` e `valor` ajudam a achar. */
export type ItemSemPar = { motivo: string; operacao_id: string | null; transacao_id: string | null; descricao: string; data: string | null; valor: string | null };
export type CasamentoConfirmado = Casamento & { sem_aporte: boolean };
export type RevisaoDaBolsa = { propostas: PropostaDeCasamento[]; sem_par: ItemSemPar[]; confirmados: CasamentoConfirmado[] };
export type LigacaoConfirmada = { casamento_id: string; chave: string };
export type ItemDeConfirmacao = { chave: string; versao: string; operacao_ids?: string[] };
/** O que `POST /transacoes-importadas/{id}/reclassificar` aceita como rótulo. */
export type RotuloDeReclassificacao = "transferencia_para_investimento" | "rendimento_da_posicao" | "imposto" | "custo";

/** Operações da posição (060): quantidades e dinheiro viajam como texto. */
export type TipoDeOperacao = "COMPRA" | "VENDA" | "PROVENTO" | "TAXA" | "IMPOSTO" | "VENCIMENTO" | "ABERTURA";
export type Operacao = {
  id: string; investimento_id: string; tipo: TipoDeOperacao; data: string;
  quantidade: string; valor: string; custos: string;
  origem: "pluggy" | "manual" | "abertura"; editavel: boolean;
  quantidade_estimada: boolean; operacao_relacionada_id: string | null;
  /** A da corretora que veio sem quantidade: só a quantidade pode ser confirmada. */
  quantidade_confirmavel?: boolean;
};
export type NovaOperacao = Pick<Operacao, "tipo" | "data" | "quantidade" | "valor" | "custos"> & {
  operacao_relacionada_id?: string;
  confirmar_duplicidade?: boolean;
};

export type PendenciaDeOperacao = { tipo: string; data: string; motivo: string };
export type AporteSemInvestimento = { id: string; conta_id: string | null; data: string; valor: string; /** O texto do banco e a natureza dele; só `outra` pode ser mesclada ou excluída. */ descricao: string; natureza: NaturezaDoMovimento; duplicado_sugerido_id: string | null; tratamento_pendente_de_aprovacao: boolean };
export type TratamentoDeAporte = { id: string; movimento_id: string; acao: "excluido" | "mesclado"; aprovado: boolean };
