import {HEX_DA_COR} from "../investimentos/cores";
import type {Cobertura,CorDaDestinacao} from "../api/tipos";
// Simulação da API em memória, só para desenvolvimento e testes. Reproduz as
// regras do backend (backend/src/gastoba/api, application e domain): formatos,
// códigos de erro, mensagens, limites, ordenação e a ordem em que os erros são
// verificados.
//
// Ordem de precedência, igual à do backend:
// - POST /contas: formato da requisição (requisicao_invalida) → saldo_inicial
//   (valor_invalido) → nome (nome_invalido) → nome repetido (conta_ja_existe).
// - POST /gastos: formato → conversão do valor (valor_invalido: não numérico,
//   acima do limite, fração de centavo) → conta (conta_nao_encontrada) → cada tag
//   (tag_invalida) → descrição (descricao_invalida) → valor positivo
//   (valor_invalido) → quantidade de tags (tag_invalida) → saldo dentro do
//   limite (valor_invalido).
// - GET /gastos: formato → período (periodo_invalido) → conta → tag do filtro.
// - POST /ganhos: como /gastos, sem categoria, e a conta é creditada; GET /ganhos: formato → período → conta.
//
// Autenticação (backend/src/gastoba/api/dependencias.py), antes de tudo isso e
// antes até da validação da requisição: toda rota que existe, menos
// `POST /auth/entrar`, exige a sessão (senão 401 nao_autenticado); com a sessão,
// todo método que não é GET exige `X-Gastoba-Requisicao: 1` (senão 403
// requisicao_invalida_origem). A sessão é um "cookie" guardado aqui dentro (sem
// tocar em document.cookie), que só vai e volta com `credentials: "include"`,
// como no navegador. Chaves de API podem ser criadas, listadas e revogadas, mas
// não autenticam na simulação (só a sessão).

import type {
  Categoria,
  ChaveDeApi,
  ChaveDeApiCriada,
  Conta,
  DetalheDoErro,
  EscopoDaChave,
  Ganho,
  Gasto,
  Meta,
  ProgressoDaMeta,
  Recorrencia,
  ResumoDasMetas,
  Sessao,
  SituacaoDaMeta,
  TipoDeRecorrencia,
  Usuario,
} from "../api/tipos";
import { deCentavos, LIMITE_CENTAVOS } from "../dinheiro/dinheiro";
import { hojeLocal } from "../periodo/periodo";
import { aparar, LIMITE_DE_TAGS, normalizarTag, validarTag } from "../tags/tags";

export type RequisicaoSimulada = {
  metodo: string;
  /** Relativo à URL_BASE, sem a query string e ainda com os escapes `%xx`. */
  caminho: string;
  parametros: URLSearchParams;
  corpo: string | null;
  cabecalhos: Headers;
  /** Se o navegador mandaria (e guardaria) o cookie: `credentials: "include"`. */
  enviaCookie: boolean;
};

/** `corpo` indefinido: resposta sem corpo (204). */
export type RespostaSimulada = {
  status: number;
  corpo?: unknown;
  cabecalhos?: Record<string, string>;
};

const TAMANHO_MAXIMO_DO_NOME = 100;
const TAMANHO_MAXIMO_DA_DESCRICAO = 200;
const MENSAGEM_REQUISICAO_INVALIDA = "A requisição tem campos ausentes ou inválidos.";

/** Mesma ordem e rótulos de `CategoriaDoGasto` no backend. */
const CATEGORIAS: readonly Categoria[] = [
  { codigo: "investimentos", nome: "Investimentos (antiga)", legada:true },
  { codigo: "lazer", nome: "Lazer", legada:false },
  { codigo: "conhecimento", nome: "Conhecimento", legada:false },
  { codigo: "conforto", nome: "Conforto", legada:false },
  { codigo: "gasto_fixo", nome: "Gasto fixo", legada:false },
];

const ALVOS = [{codigo:"liberdade_financeira",nome:"Liberdade financeira"},...CATEGORIAS.filter(c=>!c.legada)];
function nomeDoAlvo(codigo: string) {return ALVOS.find(a=>a.codigo===codigo)?.nome ?? codigo;}
const CODIGOS_DAS_CATEGORIAS = new Set(CATEGORIAS.map((categoria) => categoria.codigo));

// Mensagens do Pydantic (em inglês, como o backend devolve).
const PYDANTIC = {
  ausente: "Field required",
  texto: "Input should be a valid string",
  lista: "Input should be a valid list",
  objeto: "Input should be a valid dictionary or object to extract fields from",
  json: "JSON decode error",
  uuid: "Input should be a valid UUID",
  data: "Input should be a valid date in the format YYYY-MM-DD",
  categoria: `Input should be ${CATEGORIAS.slice(0, -1)
    .map((categoria) => `'${categoria.codigo}'`)
    .join(", ")} or '${CATEGORIAS[CATEGORIAS.length - 1].codigo}'`,
  escopo: "Input should be 'leitura' or 'escrita'",
  inteiro: "Input should be a valid integer",
  tipoDeRecorrencia: "Input should be 'ganho' or 'gasto'",
  // Aproximação: o Pydantic acrescenta o motivo exato (ex.: ", input is too short").
  instante: "Input should be a valid datetime",
};

class ErroSimulado extends Error {
  readonly status: number;
  readonly codigo: string;
  readonly detalhes?: DetalheDoErro[];
  readonly cabecalhos?: Record<string, string>;

  constructor(
    status: number,
    codigo: string,
    mensagem: string,
    detalhes?: DetalheDoErro[],
    cabecalhos?: Record<string, string>,
  ) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.detalhes = detalhes;
    this.cabecalhos = cabecalhos;
  }
}

function requisicaoInvalida(detalhes: DetalheDoErro[]): ErroSimulado {
  return new ErroSimulado(422, "requisicao_invalida", MENSAGEM_REQUISICAO_INVALIDA, detalhes);
}

const valorInvalido = (mensagem: string) => new ErroSimulado(422, "valor_invalido", mensagem);
const tagInvalida = (mensagem: string) => new ErroSimulado(422, "tag_invalida", mensagem);
const contaNaoEncontrada = () => new ErroSimulado(404, "conta_nao_encontrada", "Conta não encontrada.");

// --- estado em memória ---------------------------------------------------------

type ContaGuardada = {
  papel?: "corrente" | "investimento" | null;
  usuario_id?: string;
  id: string;
  nome: string;
  saldo: bigint;
  /** Conta importada do banco: o saldo é do banco e lançamentos não o alteram. */
  origem?: "manual" | "open_finance";
  id_externo?: string;
  tipo?: "corrente" | "cartao" | "remunerada";
};

type TransacaoImportadaGuardada = {
  motivo_ignorada?: "transferencia_entre_contas" | null;
  id: string;
  conta_id: string;
  id_externo: string;
  data: string;
  descricao: string;
  valor: bigint;
  sentido: "entrada" | "saida";
  tipo_de_operacao: string | null;
  estado: "pendente" | "aceita" | "ignorada";
};

const saldoEDoBanco = (conta: ContaGuardada): boolean => (conta.origem ?? "manual") !== "manual";

type GastoGuardado = {
  transacao_importada_id?: string | null;
  id: string;
  conta_id: string;
  valor: bigint;
  descricao: string;
  data: string;
  categoria: string;
  tags: string[];
  recorrencia_id: string | null;
  origem?: "manual" | "open_finance";
};

type GanhoGuardado = {
  transacao_importada_id?: string | null;
  id: string;
  conta_id: string;
  valor: bigint;
  descricao: string;
  data: string;
  tags: string[];
  recorrencia_id: string | null;
  origem?: "manual" | "open_finance";
};

let contas: ContaGuardada[] = [];
let transacoesImportadas: TransacaoImportadaGuardada[] = [];
/** Casamentos sugeridos e confirmados (dados inventados, só em desenvolvimento e testes). */
type CasamentoSimulado = { id: string; operacao_ids: string[]; vinculos: { transacao_id: string; papel: string }[] };
let casamentosSimulados: CasamentoSimulado[] = [];
let gastos: GastoGuardado[] = [];
let coberturasSimuladas: (Cobertura & {gasto_id:string;principal?:bigint})[] = [];
/** Vínculo atual de cada caixinha (tag) a uma categoria, por pessoa e tag. */
let coresSimuladas = new Map<string,CorDaDestinacao>();
const donoAtual = () => donosDasSessoes.get(cookieDaSessao ?? "")?.id ?? USUARIO_DE_EXEMPLO.id;
function gastoDoDono(g:GastoGuardado){return (contas.find(c=>c.id===g.conta_id)?.usuario_id??USUARIO_DE_EXEMPLO.id)===donoAtual();}
function exigirCategoriaAtiva(categoria:string){if(categoria==="investimentos")throw new ErroSimulado(422,"categoria_invalida","A categoria Investimentos foi substituída: use o aporte em investimento e a meta Liberdade financeira.");}
function chaveDaCor(tag:string){return `${donoAtual()}:${tag}`;}
function totalCoberto(id:string):bigint{return coberturasSimuladas.filter(c=>c.gasto_id===id).reduce((s,c)=>s+reaisParaCentavos(c.valor),0n);}
let ganhos: GanhoGuardado[] = [];

type RecorrenciaGuardada = Omit<Recorrencia, "valor"> & { valor: bigint };
let recorrencias: RecorrenciaGuardada[] = [];
let metas: Meta[] = [];
let historicoDeMetas: { usuario_id: string; categoria: string; nome: string; acao: string; percentual_anterior: number | null; percentual_novo: number | null; instante: string }[] = [];
let rendaBase: bigint | null = null;

function contaResposta(conta: ContaGuardada): Conta {
  return {
    id: conta.id,
    nome: conta.nome,
    saldo: deCentavos(conta.saldo),
    origem: conta.origem ?? "manual",
    tipo: conta.tipo ?? "corrente",
    papel: conta.papel ?? null,
  };
}

function gastoResposta(gasto: GastoGuardado): Gasto {
  return {
    id: gasto.id,
    transacao_importada_id: gasto.transacao_importada_id ?? null,
    valor_coberto: deCentavos(totalCoberto(gasto.id)),
    coberturas: coberturasSimuladas.filter(c=>c.gasto_id===gasto.id).map(({id,tag,valor,movimento_id})=>({id,tag,valor,movimento_id:movimento_id??null})),
    conta_id: gasto.conta_id,
    valor: deCentavos(gasto.valor),
    descricao: gasto.descricao,
    data: gasto.data,
    categoria: gasto.categoria,
    tags: [...gasto.tags],
    origem: gasto.origem ?? "manual",
    recorrencia_id: gasto.recorrencia_id,
  };
}

function ganhoResposta(ganho: GanhoGuardado): Ganho {
  return {
    id: ganho.id,
    transacao_importada_id: ganho.transacao_importada_id ?? null,
    conta_id: ganho.conta_id,
    valor: deCentavos(ganho.valor),
    descricao: ganho.descricao,
    data: ganho.data,
    tags: [...ganho.tags],
    origem: ganho.origem ?? "manual",
    recorrencia_id: ganho.recorrencia_id,
  };
}

// --- utilitários que imitam o Python do backend --------------------------------

/** Ordem binária por code point, como o SQLite (UTF-8) ordena; nunca `localeCompare`. */
function compararCodePoints(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const diferenca = (x[i].codePointAt(0) ?? 0) - (y[i].codePointAt(0) ?? 0);
    if (diferenca !== 0) return diferenca;
  }
  return x.length - y.length;
}

const NAO_IMPRIMIVEL = /[\p{C}\p{Z}]/u;

/** O `repr()` de uma string no Python, usado nas mensagens do backend. */
function reprPython(texto: string): string {
  const aspas = texto.includes("'") && !texto.includes('"') ? '"' : "'";
  let saida = "";
  for (const caractere of texto) {
    const codigo = caractere.codePointAt(0) ?? 0;
    if (caractere === "\\") saida += "\\\\";
    else if (caractere === aspas) saida += `\\${aspas}`;
    else if (caractere === "\n") saida += "\\n";
    else if (caractere === "\r") saida += "\\r";
    else if (caractere === "\t") saida += "\\t";
    else if (caractere !== " " && NAO_IMPRIMIVEL.test(caractere)) {
      const hex = codigo.toString(16);
      saida +=
        codigo < 0x100
          ? `\\x${hex.padStart(2, "0")}`
          : codigo < 0x10000
            ? `\\u${hex.padStart(4, "0")}`
            : `\\U${hex.padStart(8, "0")}`;
    } else saida += caractere;
  }
  return `${aspas}${saida}${aspas}`;
}

const DECIMAL_DO_PYTHON = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;
const NAO_FINITO_DO_PYTHON = /^[+-]?(?:inf|infinity|s?nan\d*)$/i;
const LIMITE_EM_REAIS = deCentavos(LIMITE_CENTAVOS);

/**
 * `Dinheiro.de_reais(texto)` do backend: aceita o que o `Decimal` do Python aceita
 * (sinal, expoente, `_` entre os dígitos, espaços nas pontas) e recusa não
 * numérico, não finito, acima de R$ 1 trilhão e fração de centavo.
 */
function reaisParaCentavos(texto: string): bigint {
  const limpo = aparar(texto).replaceAll("_", "");
  if (NAO_FINITO_DO_PYTHON.test(limpo)) {
    throw valorInvalido(`Valor monetário não finito: ${reprPython(texto)}.`);
  }
  const partes = DECIMAL_DO_PYTHON.exec(limpo);
  if (!partes) throw valorInvalido(`Valor monetário não numérico: ${reprPython(texto)}.`);

  const [, sinal, inteiro = "", fracao = "", soFracao, expoenteTexto = "0"] = partes;
  const casas = soFracao ?? fracao;
  const coeficiente = BigInt(`${soFracao === undefined ? inteiro : ""}${casas}` || "0");
  if (coeficiente === 0n) return 0n;

  // Valor = coeficiente × 10^expoente reais.
  const expoente = BigInt(expoenteTexto) - BigInt(casas.length);
  const digitos = BigInt(coeficiente.toString().length);
  // Acima de 10^12 reais? Compara sem calcular potências gigantes.
  const potenciaDoLimite = 12n - expoente;
  const acimaDoLimite =
    potenciaDoLimite < 0n ||
    (potenciaDoLimite < digitos && coeficiente > 10n ** potenciaDoLimite);
  if (acimaDoLimite) {
    throw valorInvalido(
      `Valor monetário acima do limite de R$ ${LIMITE_EM_REAIS}: ${reprPython(texto)}.`,
    );
  }

  let centavos: bigint;
  if (expoente >= -2n) {
    centavos = coeficiente * 10n ** (expoente + 2n);
  } else {
    const divisor = -(expoente + 2n);
    if (divisor > digitos || coeficiente % 10n ** divisor !== 0n) {
      throw valorInvalido(`Valor monetário com centavos fracionários: ${reprPython(texto)}.`);
    }
    centavos = coeficiente / 10n ** divisor;
  }
  return sinal === "-" ? -centavos : centavos;
}

/** UUID nos formatos que o Pydantic aceita, normalizado como o backend devolve. */
function normalizarUuid(texto: string): string | null {
  let corpo = texto;
  if (/^urn:uuid:/i.test(corpo)) corpo = corpo.slice("urn:uuid:".length);
  else if (corpo.startsWith("{") && corpo.endsWith("}")) corpo = corpo.slice(1, -1);
  let hex: string;
  if (/^[0-9a-f]{32}$/i.test(corpo)) hex = corpo;
  else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(corpo)) {
    hex = corpo.replaceAll("-", "");
  } else return null;
  hex = hex.toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Data "AAAA-MM-DD" que existe no calendário. */
function dataValida(texto: string): boolean {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!partes) return false;
  const [ano, mes, dia] = partes.slice(1).map((parte) => Number.parseInt(parte, 10));
  if (ano < 1 || mes < 1 || mes > 12 || dia < 1) return false;
  const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
  const diasNoMes = [31, bissexto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1];
  return dia <= diasNoMes;
}

/** Instante lido de um texto ISO 8601; sem fuso, `ms` trata o texto como UTC. */
type InstanteLido = { ms: number; comFuso: boolean };

const INSTANTE_ISO =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?(Z|[+-]\d{2}:?\d{2})?$/i;

function lerInstante(texto: string): InstanteLido | null {
  const partes = INSTANTE_ISO.exec(texto);
  if (!partes || !dataValida(partes[1])) return null;
  const [, data, hora, minuto, segundo = "0", fracao = "", fuso] = partes;
  const [ano, mes, dia] = data.split("-").map((parte) => Number.parseInt(parte, 10));
  const [h, m, s] = [hora, minuto, segundo].map((parte) => Number.parseInt(parte, 10));
  if (h > 23 || m > 59 || s > 59) return null;
  const milissegundos = Number.parseInt(fracao.padEnd(3, "0").slice(0, 3), 10);
  let deslocamentoMs = 0;
  if (fuso !== undefined && fuso.toUpperCase() !== "Z") {
    const sinal = fuso.startsWith("-") ? -1 : 1;
    const digitos = fuso.slice(1).replace(":", "");
    const horas = Number.parseInt(digitos.slice(0, 2), 10);
    const minutos = Number.parseInt(digitos.slice(2), 10);
    deslocamentoMs = sinal * (horas * 60 + minutos) * 60 * 1000;
  }
  const ms = Date.UTC(ano, mes - 1, dia, h, m, s, milissegundos) - deslocamentoMs;
  return { ms, comFuso: fuso !== undefined };
}

/** `Tag.de_texto(texto)` do backend: normaliza e valida, ou lança tag_invalida. */
function tagDoTexto(texto: string): string {
  const tag = normalizarTag(texto);
  const problema = validarTag(tag);
  if (problema !== null) throw tagInvalida(problema);
  return tag;
}

// --- validação de formato (Pydantic) -------------------------------------------

type Campos = Record<string, unknown>;

/** Lê o corpo JSON como objeto, ou lança requisicao_invalida em `body`. */
function lerCorpo(corpo: string | null): Campos {
  if (corpo === null || corpo === "") throw requisicaoInvalida([{ campo: "body", mensagem: PYDANTIC.ausente }]);
  let json: unknown;
  try {
    json = JSON.parse(corpo);
  } catch {
    throw requisicaoInvalida([{ campo: "body", mensagem: PYDANTIC.json }]);
  }
  if (json === null) throw requisicaoInvalida([{ campo: "body", mensagem: PYDANTIC.ausente }]);
  if (typeof json !== "object" || Array.isArray(json)) {
    throw requisicaoInvalida([{ campo: "body", mensagem: PYDANTIC.objeto }]);
  }
  return json as Campos;
}

class Validacao {
  readonly detalhes: DetalheDoErro[] = [];
  private readonly origem: string;
  private readonly valores: Campos;

  constructor(origem: "body" | "query" | "path", valores: Campos) {
    this.origem = origem;
    this.valores = valores;
  }

  private falhar(campo: string, mensagem: string): undefined {
    this.detalhes.push({ campo: `${this.origem}.${campo}`, mensagem });
    return undefined;
  }

  /** Texto obrigatório; com `padrao`, o campo pode faltar (mas não ser de outro tipo). */
  texto(campo: string, padrao?: string): string | undefined {
    const valor = this.valores[campo];
    if (valor === undefined) return padrao ?? this.falhar(campo, PYDANTIC.ausente);
    return typeof valor === "string" ? valor : this.falhar(campo, PYDANTIC.texto);
  }

  textoOpcional(campo: string): string | undefined {
    const valor = this.valores[campo];
    if (valor === undefined) return undefined;
    return typeof valor === "string" ? valor : this.falhar(campo, PYDANTIC.texto);
  }

  uuid(campo: string, opcional = false): string | undefined {
    const valor = this.valores[campo];
    if (valor === undefined) return opcional ? undefined : this.falhar(campo, PYDANTIC.ausente);
    const uuid = typeof valor === "string" ? normalizarUuid(valor) : null;
    return uuid ?? this.falhar(campo, PYDANTIC.uuid);
  }

  data(campo: string): string | undefined {
    const valor = this.valores[campo];
    if (valor === undefined) return this.falhar(campo, PYDANTIC.ausente);
    return typeof valor === "string" && dataValida(valor) ? valor : this.falhar(campo, PYDANTIC.data);
  }

  categoria(campo: string, opcional = false): string | undefined {
    const valor = this.valores[campo];
    if (valor === undefined) return opcional ? undefined : this.falhar(campo, PYDANTIC.ausente);
    return typeof valor === "string" && CODIGOS_DAS_CATEGORIAS.has(valor)
      ? valor
      : this.falhar(campo, PYDANTIC.categoria);
  }

  /** Inteiro estrito (`StrictInt`): "5", 5.5 e true são recusados. */
  inteiro(campo: string): number | undefined {
    const valor = this.valores[campo];
    if (valor === undefined) return this.falhar(campo, PYDANTIC.ausente);
    return typeof valor === "number" && Number.isInteger(valor) ? valor : this.falhar(campo, PYDANTIC.inteiro);
  }

  tipoDeRecorrencia(campo: string): TipoDeRecorrencia | undefined {
    const valor = this.valores[campo];
    if (valor === undefined) return this.falhar(campo, PYDANTIC.ausente);
    return valor === "ganho" || valor === "gasto" ? valor : this.falhar(campo, PYDANTIC.tipoDeRecorrencia);
  }

  /** Data opcional: ausente ou nula vale `undefined`. */
  dataOpcional(campo: string): string | undefined {
    const valor = this.valores[campo];
    if (valor === undefined || valor === null) return undefined;
    return typeof valor === "string" && dataValida(valor) ? valor : this.falhar(campo, PYDANTIC.data);
  }

  escopo(campo: string): EscopoDaChave | undefined {
    const valor = this.valores[campo];
    if (valor === undefined) return this.falhar(campo, PYDANTIC.ausente);
    return valor === "leitura" || valor === "escrita" ? valor : this.falhar(campo, PYDANTIC.escopo);
  }

  /**
   * Instante ISO 8601 opcional (ausente ou nulo vira `null`). Só confere o formato;
   * o fuso é regra da entidade (expiracao_invalida), como no backend.
   */
  instanteOpcional(campo: string): InstanteLido | null | undefined {
    const valor = this.valores[campo];
    if (valor === undefined || valor === null) return null;
    const instante = typeof valor === "string" ? lerInstante(valor) : null;
    return instante ?? this.falhar(campo, PYDANTIC.instante);
  }

  listaDeTextos(campo: string): string[] | undefined {
    const valor = this.valores[campo];
    if (valor === undefined) return [];
    if (!Array.isArray(valor)) return this.falhar(campo, PYDANTIC.lista);
    let valida = true;
    valor.forEach((item: unknown, indice) => {
      if (typeof item !== "string") {
        this.falhar(`${campo}.${indice}`, PYDANTIC.texto);
        valida = false;
      }
    });
    return valida ? (valor as string[]) : undefined;
  }

  /** Lança requisicao_invalida com todos os problemas encontrados, se houver. */
  conferir(): void {
    if (this.detalhes.length > 0) throw requisicaoInvalida(this.detalhes);
  }
}

// --- regras das rotas ----------------------------------------------------------

function encontrarConta(id: string): ContaGuardada {
  const conta = contas.find((candidata) => candidata.id === id);
  if (!conta) throw contaNaoEncontrada();
  return conta;
}

function guardarConta(nome: string, saldo: bigint): ContaGuardada {
  const aparado = aparar(nome);
  if (aparado === "") {
    throw new ErroSimulado(422, "nome_invalido", "O nome da conta não pode ser vazio.");
  }
  if ([...aparado].length > TAMANHO_MAXIMO_DO_NOME) {
    throw new ErroSimulado(
      422,
      "nome_invalido",
      `O nome da conta deve ter no máximo ${TAMANHO_MAXIMO_DO_NOME} caracteres.`,
    );
  }
  if (contas.some((conta) => conta.nome === aparado)) {
    throw new ErroSimulado(
      409,
      "conta_ja_existe",
      `Já existe uma conta com o nome ${reprPython(aparado)}.`,
    );
  }
  const conta: ContaGuardada = {
    usuario_id:donoAtual(),
    id: crypto.randomUUID(),
    nome: aparado,
    saldo,
    tipo: "corrente",
  };
  contas.push(conta);
  return conta;
}

type DadosDoGasto = {
  transacao_importada_id?: string;
  conta_id: string;
  valor: bigint;
  descricao: string;
  data: string;
  categoria: string;
  tags: readonly string[];
  /** Só nos lançamentos gerados por uma recorrência. */
  recorrencia_id?: string;
  origem?: "manual" | "open_finance";
};

function guardarGasto(dados: DadosDoGasto): GastoGuardado {
  const conta = encontrarConta(dados.conta_id);
  const tags = dados.tags.map(tagDoTexto);
  const descricao = aparar(dados.descricao);
  if (descricao === "") {
    throw new ErroSimulado(422, "descricao_invalida", "A descrição do gasto não pode ser vazia.");
  }
  if ([...descricao].length > TAMANHO_MAXIMO_DA_DESCRICAO) {
    throw new ErroSimulado(
      422,
      "descricao_invalida",
      `A descrição do gasto deve ter no máximo ${TAMANHO_MAXIMO_DA_DESCRICAO} caracteres.`,
    );
  }
  if (dados.valor <= 0n) throw valorInvalido("O valor do gasto deve ser positivo.");
  const distintas = [...new Set(tags)];
  if (distintas.length > LIMITE_DE_TAGS) {
    throw tagInvalida(`Um gasto pode ter no máximo ${LIMITE_DE_TAGS} tags distintas.`);
  }
  const novoSaldo = saldoEDoBanco(conta) ? conta.saldo : conta.saldo - dados.valor;
  if (novoSaldo > LIMITE_CENTAVOS || -novoSaldo > LIMITE_CENTAVOS) {
    throw valorInvalido(
      `Valor monetário acima do limite de ${LIMITE_CENTAVOS} centavos: ${novoSaldo}.`,
    );
  }

  const gasto: GastoGuardado = {
    id: crypto.randomUUID(),
    conta_id: conta.id,
    valor: dados.valor,
    descricao,
    data: dados.data,
    categoria: dados.categoria,
    tags: distintas,
    recorrencia_id: dados.recorrencia_id ?? null,
    transacao_importada_id: dados.transacao_importada_id ?? null,
    origem: dados.origem ?? "manual",
  };
  conta.saldo = novoSaldo;
  gastos.push(gasto);
  return gasto;
}

type DadosDoGanho = Omit<DadosDoGasto, "categoria">;

/** `RegistrarGanho` do backend: mesma ordem de validação do gasto, mas credita a conta. */
function guardarGanho(dados: DadosDoGanho): GanhoGuardado {
  const conta = encontrarConta(dados.conta_id);
  const tags = dados.tags.map(tagDoTexto);
  const descricao = aparar(dados.descricao);
  if (descricao === "") {
    throw new ErroSimulado(422, "descricao_invalida", "A descrição do ganho não pode ser vazia.");
  }
  if ([...descricao].length > TAMANHO_MAXIMO_DA_DESCRICAO) {
    throw new ErroSimulado(
      422,
      "descricao_invalida",
      `A descrição do ganho deve ter no máximo ${TAMANHO_MAXIMO_DA_DESCRICAO} caracteres.`,
    );
  }
  if (dados.valor <= 0n) throw valorInvalido("O valor do ganho deve ser positivo.");
  const distintas = [...new Set(tags)];
  if (distintas.length > LIMITE_DE_TAGS) {
    throw tagInvalida(`Um ganho pode ter no máximo ${LIMITE_DE_TAGS} tags distintas.`);
  }
  const novoSaldo = saldoEDoBanco(conta) ? conta.saldo : conta.saldo + dados.valor;
  if (novoSaldo > LIMITE_CENTAVOS || -novoSaldo > LIMITE_CENTAVOS) {
    throw valorInvalido(
      `Valor monetário acima do limite de ${LIMITE_CENTAVOS} centavos: ${novoSaldo}.`,
    );
  }

  const ganho: GanhoGuardado = {
    id: crypto.randomUUID(),
    conta_id: conta.id,
    valor: dados.valor,
    descricao,
    data: dados.data,
    tags: distintas,
    recorrencia_id: dados.recorrencia_id ?? null,
    transacao_importada_id: dados.transacao_importada_id ?? null,
    origem: dados.origem ?? "manual",
  };
  conta.saldo = novoSaldo;
  ganhos.push(ganho);
  return ganho;
}

/** `ExcluirGanho` do backend: apaga o ganho e debita a conta; o gerado por recorrência não sai. */
function excluirGanho(idTexto: string): RespostaSimulada {
  const validacao = new Validacao("path", { ganho_id: idTexto });
  const id = validacao.uuid("ganho_id") as string;
  validacao.conferir();

  const posicao = ganhos.findIndex((ganho) => ganho.id === id);
  if (posicao === -1) {
    throw new ErroSimulado(404, "ganho_nao_encontrado", "Ganho não encontrado.");
  }
  const ganho = ganhos[posicao];
  if (ganho.recorrencia_id !== null) {
    throw new ErroSimulado(
      409,
      "ganho_de_recorrencia",
      "Este ganho foi criado por uma recorrência. Altere ou encerre a recorrência em vez de apagá-lo.",
    );
  }
  const conta = encontrarConta(ganho.conta_id);
  const novoSaldo = saldoEDoBanco(conta) ? conta.saldo : conta.saldo - ganho.valor;
  if (novoSaldo > LIMITE_CENTAVOS || -novoSaldo > LIMITE_CENTAVOS) {
    throw valorInvalido(
      `Valor monetário acima do limite de ${LIMITE_CENTAVOS} centavos: ${novoSaldo}.`,
    );
  }
  conta.saldo = novoSaldo;
  ganhos.splice(posicao, 1);
  if (ganho.transacao_importada_id) {
    reabrirSeNaoSobrouLancamento(ganho.transacao_importada_id);
  }
  return { status: 204 };
}

/**
 * Como em `ExcluirGanho`: a transação aceita volta à caixa quando não sobra lançamento dela;
 * se ainda há outra parte da divisão, continua aceita, para não contar essa parte duas vezes.
 */
function reabrirSeNaoSobrouLancamento(transacaoId: string): void {
  const transacao = transacoesImportadas.find((t) => t.id === transacaoId);
  if (transacao === undefined || transacao.estado !== "aceita") return;
  const daTransacao = (l: { transacao_importada_id?: string | null }) =>
    l.transacao_importada_id === transacaoId;
  if (gastos.some(daTransacao) || ganhos.some(daTransacao) || movimentosSimulados.some(daTransacao)) {
    return;
  }
  transacao.estado = "pendente";
}

/** `ExcluirConta` do backend: apaga a conta manual com o histórico; a importada não sai. */
function excluirConta(idTexto: string): RespostaSimulada {
  const validacao = new Validacao("path", { conta_id: idTexto });
  const id = validacao.uuid("conta_id") as string;
  validacao.conferir();

  const conta = contas.find((candidata) => candidata.id === id);
  if (conta === undefined) {
    throw new ErroSimulado(404, "conta_nao_encontrada", "Conta não encontrada.");
  }
  if (saldoEDoBanco(conta)) {
    throw new ErroSimulado(
      409,
      "conta_importada",
      "Conta importada do banco não pode ser excluída.",
    );
  }
  const idsDasRecorrencias = new Set(
    recorrencias.filter((r) => r.conta_id === id).map((r) => r.id),
  );
  const daConta = (item: { conta_id: string; recorrencia_id: string | null }): boolean =>
    item.conta_id === id ||
    (item.recorrencia_id !== null && idsDasRecorrencias.has(item.recorrencia_id));
  const gastosRemovidos=new Set(gastos.filter(daConta).map(g=>g.id));
  coberturasSimuladas=coberturasSimuladas.filter(c=>!gastosRemovidos.has(c.gasto_id));
  gastos = gastos.filter((gasto) => !daConta(gasto));
  ganhos = ganhos.filter((ganho) => !daConta(ganho));
  transacoesImportadas = transacoesImportadas.filter((t) => t.conta_id !== id);
  recorrencias = recorrencias.filter((r) => r.conta_id !== id);
  contas = contas.filter((candidata) => candidata.id !== id);
  return { status: 204 };
}

// --- importação bancária (a Pluggy simulada) ------------------------------------

const OPERACOES_QUE_PEDEM_DESCARTE = new Set([
  "PAGAMENTO_FATURA",
  "TRANSFERENCIA_MESMA_INSTITUICAO",
  "ESTORNO",
]);

/** Espelha `OPERACOES_DESCARTADAS_NA_IMPORTACAO` do backend: nascem ignoradas, sem passar pela caixa. */
const OPERACOES_DESCARTADAS_NA_IMPORTACAO = new Set([
  "PAGAMENTO_FATURA",
  "TRANSFERENCIA_MESMA_INSTITUICAO",
]);

const importacaoDesligada = () =>
  new ErroSimulado(404, "importacao_desligada", "A importação bancária não está disponível.");

function donoDaRequisicao(requisicao: RequisicaoSimulada): Usuario {
  return donosDasSessoes.get(autenticar(requisicao)) ?? USUARIO_DE_EXEMPLO;
}

/** Só a pessoa de exemplo é a dona da importação, como o e-mail do dono no `.env` do backend. */
function ehDonoDaImportacao(usuario: Usuario): boolean {
  return usuario.id === USUARIO_DE_EXEMPLO.id;
}

function exigirDonoDaImportacao(requisicao: RequisicaoSimulada): void {
  if (!ehDonoDaImportacao(donoDaRequisicao(requisicao))) throw importacaoDesligada();
}

function eContaRemuneradaSimulada(descricao: string): boolean {
 const t = descricao.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
 return t.includes("conta remunerada") || /(?:aplicacao|resgate) automatic[oa]/.test(t);
}
function sugerirTipoSimulado(descricao: string): import("../api/tipos").TipoDeMovimento | null {
 const t = descricao.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
 if (t.startsWith("liq bolsa") && /\b(irrf|iof)\b/.test(t)) return "imposto";
 if (t.startsWith("liq bolsa") && /\btx\b.*\b(ccp|emol|tta|b3)\b/.test(t)) return "custo";
 if (eContaRemuneradaSimulada(descricao) && /rendimento|remuneracao/.test(t)) return "rendimento";
 return null;
}
function exigirOperacaoComumSimulada(descricao: string): void {
 if (eContaRemuneradaSimulada(descricao) || sugerirTipoSimulado(descricao)) throw new ErroSimulado(422,"transacao_importada_invalida","Esta operação pertence ao investimento; escolha a natureza do movimento ou ignore.");
}
function transacaoImportadaResposta(transacao: TransacaoImportadaGuardada) {
  const mesmaOrigemManual = (lancamento: { origem?: string }) =>
    (lancamento.origem ?? "manual") === "manual";
  const lancamentos: { conta_id: string; data: string; valor: bigint; origem?: string }[] =
    transacao.sentido === "saida" ? gastos : ganhos;
  return {
    id: transacao.id,
    tipo_de_movimento_sugerido: sugerirTipoSimulado(transacao.descricao),
    conta_id: transacao.conta_id,
    data: transacao.data,
    descricao: transacao.descricao,
    valor: deCentavos(transacao.valor),
    sentido: transacao.sentido,
    tipo_de_operacao: transacao.tipo_de_operacao,
    estado: transacao.estado,
    motivo_ignorada: transacao.motivo_ignorada ?? null,
    sugerir_descarte:
      transacao.tipo_de_operacao !== null &&
      OPERACOES_QUE_PEDEM_DESCARTE.has(transacao.tipo_de_operacao),
    possivel_duplicado: lancamentos.some(
      (lancamento) =>
        lancamento.conta_id === transacao.conta_id &&
        lancamento.data === transacao.data &&
        lancamento.valor === transacao.valor &&
        mesmaOrigemManual(lancamento),
    ),
    investimento_sugerido_id: sugerirInvestimento(transacao),
  };
}

/** Minúsculas, sem acento nem pontuação (que vira espaço), palavras separadas por um espaço só. */
function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Espelha `sugerir_investimento` do backend: a saída pendente casa com a posição cujo nome aparece
 * em palavras inteiras na descrição, cujo valor aplicado é o da transação e que ainda não tem
 * movimento; com mais de uma ou nenhuma, não sugere.
 */
function sugerirInvestimento(transacao: TransacaoImportadaGuardada): string | null {
  if (transacao.sentido !== "saida" || transacao.estado !== "pendente") return null;
  const descricao = ` ${normalizarTexto(transacao.descricao)} `;
  const comMovimento = new Set(movimentosSimulados.map((m) => m.investimento_id));
  const candidatas = investimentosSimulados.filter((posicao) => {
    const nome = normalizarTexto(posicao.nome);
    return (
      nome !== "" &&
      posicao.valor_aplicado === transacao.valor &&
      !comMovimento.has(posicao.id) &&
      descricao.includes(` ${nome} `)
    );
  });
  return candidatas.length === 1 ? candidatas[0].id : null;
}

function listarTransacoesImportadas(requisicao: RequisicaoSimulada): RespostaSimulada {
  exigirDonoDaImportacao(requisicao);
  const estado = requisicao.parametros.get("estado") ?? "pendente";
  if (!["pendente", "aceita", "ignorada"].includes(estado)) {
    throw requisicaoInvalida([{ campo: "query.estado", mensagem: "Valor inválido." }]);
  }
  const motivo = requisicao.parametros.get("motivo");
  if (motivo !== null && motivo !== "transferencia_entre_contas") throw requisicaoInvalida([{campo:"query.motivo",mensagem:"Motivo inválido."}]);
  const encontradas = transacoesImportadas
    .filter((transacao) => transacao.estado === estado && (!requisicao.parametros.get("motivo") || transacao.motivo_ignorada === requisicao.parametros.get("motivo")))
    // Da data mais recente para a mais antiga. No começo do mês as datas simuladas se igualam, e o
    // desempate pelo id (um UUID novo a cada rodada) embaralharia a caixa: usa a ordem do banco.
    .sort((a, b) =>
      a.data !== b.data ? (a.data < b.data ? 1 : -1) : a.id_externo < b.id_externo ? -1 : 1,
    );
  return { status: 200, corpo: encontradas.map(transacaoImportadaResposta) };
}

function encontrarTransacaoImportada(
  idTexto: string,
  estadoExigido: TransacaoImportadaGuardada["estado"] = "pendente",
): TransacaoImportadaGuardada {
  const validacao = new Validacao("path", { transacao_id: idTexto });
  const id = validacao.uuid("transacao_id") as string;
  validacao.conferir();
  const transacao = transacoesImportadas.find((candidata) => candidata.id === id);
  if (!transacao) {
    throw new ErroSimulado(
      404,
      "transacao_importada_nao_encontrada",
      "Transação importada não encontrada.",
    );
  }
  if (transacao.estado !== estadoExigido) {
    throw new ErroSimulado(409, "transacao_ja_tratada", "Esta transação já foi tratada.");
  }
  return transacao;
}

/** `POST /transacoes-importadas/{id}/restaurar`: só ignorada → pendente; nada mais muda. */
function restaurarTransacaoImportada(
  requisicao: RequisicaoSimulada,
  idTexto: string,
): RespostaSimulada {
  exigirDonoDaImportacao(requisicao);
  const transacao = encontrarTransacaoImportada(idTexto, "ignorada");
  transacao.estado = "pendente";
  transacao.motivo_ignorada = null;
  return { status: 204 };
}

function aceitarTransacaoImportada(
  requisicao: RequisicaoSimulada,
  idTexto: string,
): RespostaSimulada {
  exigirDonoDaImportacao(requisicao);
  return { status: 201, corpo: aceitarUma(lerCorpo(requisicao.corpo), idTexto) };
}

const MENSAGEM_APORTE_NAO_E_GASTO = "Aporte não é gasto; essa categoria só vale em metas.";
const MENSAGEM_APORTE_SEM_TAGS = "Aporte não tem tags: use as destinações.";

/** Aceita uma transação pendente como gasto, ganho, aporte ou resgate; os campos já vêm lidos. */
function aceitarUma(campos: Campos, idTexto: string): { tipo: string; id: string } {
  const validacao = new Validacao("body", campos);
  const categoria = validacao.categoria("categoria", true);
  const tags = validacao.listaDeTextos("tags") ?? [];
  const investimentoId = validacao.uuid("investimento_id", true);
  const destinacoes = lerDestinacoes(campos, validacao);
  validacao.conferir();
  const transacao = encontrarTransacaoImportada(idTexto);

  if (categoria === "investimentos") throw new ErroSimulado(422,"categoria_invalida","Use o aporte em investimento e a meta Liberdade financeira.");
  if (campos.como_investimento === true) {
    return aceitarComoMovimento(transacao, categoria, tags, investimentoId, destinacoes, campos);
  }
  exigirOperacaoComumSimulada(transacao.descricao);
  if (investimentoId !== undefined || destinacoes.length > 0) {
    throw new ErroSimulado(
      422,
      "transacao_importada_invalida",
      "Investimento e destinações só valem para aporte.",
    );
  }

  const dados = {
    transacao_importada_id: transacao.id,
    conta_id: transacao.conta_id,
    valor: transacao.valor,
    descricao: transacao.descricao,
    data: transacao.data,
    tags,
    origem: "open_finance" as const,
  };
  let tipo: "gasto" | "ganho";
  let id: string;
  if (transacao.sentido === "saida") {
    if (categoria === undefined) {
      throw new ErroSimulado(
        422,
        "transacao_importada_invalida",
        "Escolha a categoria do gasto.",
      );
    }
    tipo = "gasto";
    id = guardarGasto({ ...dados, categoria }).id;
  } else {
    if (categoria !== undefined) {
      throw new ErroSimulado(422, "transacao_importada_invalida", "Ganho não tem categoria.");
    }
    tipo = "ganho";
    id = guardarGanho(dados).id;
  }
  transacao.estado = "aceita";
  return { tipo, id };
}

/** `POST /transacoes-importadas/{id}/dividir`: 2 a 10 partes de 1 a 100% (soma 100), um lançamento por parte. */
function dividirTransacao(requisicao: RequisicaoSimulada, idTexto: string): RespostaSimulada {
  exigirDonoDaImportacao(requisicao);
  const campos = lerCorpo(requisicao.corpo);
  const validacao = new Validacao("body", campos);
  const lista = campos.partes;
  const partes: {
    categoria: string | undefined;
    comoInvestimento: boolean;
    tags: string[];
    percentual: number;
    investimentoId: string | undefined;
    destinacoes: { tag: string; percentual: number }[];
  }[] = [];
  if (!Array.isArray(lista)) {
    validacao.detalhes.push({
      campo: "body.partes",
      mensagem: campos.partes === undefined ? PYDANTIC.ausente : PYDANTIC.lista,
    });
  } else {
    lista.forEach((item: unknown, indice) => {
      const objeto = typeof item === "object" && item !== null ? (item as Campos) : {};
      const sub = new Validacao("body", objeto);
      const categoria = sub.categoria("categoria", true);
      const tags = sub.listaDeTextos("tags") ?? [];
      const percentual = sub.inteiro("percentual");
      const investimentoId = sub.uuid("investimento_id", true);
      const destinacoes = lerDestinacoes(objeto, sub);
      for (const detalhe of sub.detalhes) {
        validacao.detalhes.push({
          campo: detalhe.campo.replace("body.", `body.partes.${indice}.`),
          mensagem: detalhe.mensagem,
        });
      }
      partes.push({ comoInvestimento:objeto.como_investimento === true, categoria, tags, percentual: percentual ?? 0, investimentoId, destinacoes });
    });
  }
  validacao.conferir();
  const transacao = encontrarTransacaoImportada(idTexto);
  if (partes.length < 2 || partes.length > 10) {
    throw new ErroSimulado(422, "divisao_invalida", "Divida a transação em 2 a 10 partes.");
  }
  if (partes.some((p) => p.percentual < 1 || p.percentual > 100)) {
    throw new ErroSimulado(
      422,
      "divisao_invalida",
      "O percentual de cada parte deve ser um inteiro de 1 a 100.",
    );
  }
  if (partes.reduce((soma, p) => soma + p.percentual, 0) !== 100) {
    throw new ErroSimulado(422, "divisao_invalida", "Os percentuais das partes devem somar 100%.");
  }
  const saida = transacao.sentido === "saida";
  const invalida = (mensagem: string) => new ErroSimulado(422, "transacao_importada_invalida", mensagem);
  for (const parte of partes) {
    if (parte.categoria === "investimentos") throw new ErroSimulado(422,"categoria_invalida","Use uma categoria ativa.");
    const aporte = parte.comoInvestimento;
    if (aporte && !saida) throw invalida("Aporte só vale na saída.");
    if (saida && !aporte && parte.categoria === undefined) throw invalida("Escolha a categoria de cada parte.");
    if (!saida && parte.categoria !== undefined) throw invalida("Ganho não tem categoria.");
    if (aporte && parte.tags.length > 0) throw invalida(MENSAGEM_APORTE_SEM_TAGS);
    if (!aporte && (parte.investimentoId !== undefined || parte.destinacoes.length > 0)) {
      throw invalida("Investimento e destinações só valem para aporte.");
    }
    if (parte.investimentoId === undefined && parte.destinacoes.length > 0) {
      throw invalida("Escolha o investimento para destinar o valor.");
    }
    parte.tags = parte.tags.map(tagDoTexto);
  }
  const valores = repartir(transacao.valor, partes.map((p) => BigInt(p.percentual)), 100n);
  // Tudo ou nada: as destinações de cada aporte são conferidas antes de gravar qualquer parte.
  const partesDosAportes = partes.map((parte, posicao) =>
    parte.comoInvestimento &&
    parte.investimentoId !== undefined &&
    valores[posicao] > 0n
      ? prepararPartes({ tipo: "aporte", valor: valores[posicao] }, parte.investimentoId, parte.destinacoes)
      : [],
  );
  const criados: { tipo: string; id: string }[] = [];
  partes.forEach((parte, posicao) => {
    if (valores[posicao] === 0n) return;
    const sufixo = ` (${posicao + 1}/${partes.length})`;
    const dados = {
      transacao_importada_id: transacao.id,
      conta_id: transacao.conta_id,
      valor: valores[posicao],
      descricao: transacao.descricao.slice(0, TAMANHO_MAXIMO_DA_DESCRICAO - sufixo.length).trimEnd() + sufixo,
      data: transacao.data,
      tags: [...new Set(parte.tags)],
      origem: "open_finance" as const,
    };
    if (parte.comoInvestimento) {
      const movimento: MovimentoGuardado = {
    usuario_id: donosDasSessoes.get(cookieDaSessao ?? "")?.id ?? USUARIO_DE_EXEMPLO.id,
        id: crypto.randomUUID(),
        transacao_importada_id: transacao.id,
        conta_id: transacao.conta_id,
        investimento_id: parte.investimentoId ?? null,
        tipo: "aporte",
        categoria:parte.categoria ?? null,
        revisao_pendente:false,
        origem: "open_finance",
        descricao: dados.descricao,
        valor: dados.valor,
        data: dados.data,
        partes: partesDosAportes[posicao],
      };
      movimentosSimulados.push(movimento);
      criados.push({ tipo: "aporte", id: movimento.id });
    } else if (saida) {
      criados.push({ tipo: "gasto", id: guardarGasto({ ...dados, categoria: parte.categoria as string }).id });
    } else {
      criados.push({ tipo: "ganho", id: guardarGanho(dados).id });
    }
  });
  transacao.estado = "aceita";
  return { status: 201, corpo: { criados } };
}

/** `POST /transacoes-importadas/aceitar-em-lote`: só saídas, tudo ou nada, de 1 a 200. */
function aceitarEmLote(requisicao: RequisicaoSimulada): RespostaSimulada {
  exigirDonoDaImportacao(requisicao);
  const campos = lerCorpo(requisicao.corpo);
  const validacao = new Validacao("body", campos);
  const ids = campos.transacao_ids;
  if (!Array.isArray(ids)) {
    validacao.detalhes.push({ campo: "body.transacao_ids", mensagem: PYDANTIC.lista });
  } else {
    ids.forEach((item: unknown, indice) => {
      if (typeof item !== "string" || normalizarUuid(item) === null) {
        validacao.detalhes.push({ campo: `body.transacao_ids.${indice}`, mensagem: PYDANTIC.uuid });
      }
    });
  }
  validacao.conferir();
  const lista = (ids as string[]).map((item) => normalizarUuid(item) as string);
  if (lista.length < 1 || lista.length > 200) {
    throw new ErroSimulado(
      422,
      "transacao_importada_invalida",
      "Escolha de 1 a 200 transações para aceitar de uma vez.",
    );
  }
  for (const id of lista) {
    const transacao = transacoesImportadas.find((candidata) => candidata.id === id);
    if (transacao && transacao.sentido !== "saida") {
      throw new ErroSimulado(
        422,
        "transacao_importada_invalida",
        "Aceitar em lote vale só para saídas; aceite as entradas uma a uma.",
      );
    }
  }
  // Tudo ou nada: confere antes que todas existem, estão pendentes e não se repetem.
  const vistas = new Set<string>();
  for (const id of lista) {
    encontrarTransacaoImportada(id);
    if (vistas.has(id)) {
      throw new ErroSimulado(409, "transacao_ja_tratada", "Esta transação já foi tratada.");
    }
    vistas.add(id);
  }
  const { transacao_ids: _ids, ...comuns } = campos;
  return { status: 201, corpo: { aceitas: lista.map((id) => aceitarUma(comuns, id)) } };
}

function ignorarTransacaoImportada(
  requisicao: RequisicaoSimulada,
  idTexto: string,
): RespostaSimulada {
  exigirDonoDaImportacao(requisicao);
  const motivo = requisicao.corpo ? lerCorpo(requisicao.corpo).motivo ?? null : null;
  if (motivo !== null && motivo !== "transferencia_entre_contas") throw requisicaoInvalida([{campo:"body.motivo",mensagem:"Motivo inválido."}]);
  const transacao = encontrarTransacaoImportada(idTexto);
  transacao.estado = "ignorada";
  transacao.motivo_ignorada = motivo as "transferencia_entre_contas" | null;
  return { status: 204 };
}

/** O banco simulado: uma conta corrente, um cartão de crédito e algumas transações recentes, sempre as mesmas. */
function sincronizarContasBancarias(requisicao: RequisicaoSimulada): RespostaSimulada {
  exigirDonoDaImportacao(requisicao);
  let conta = contas.find((candidata) => candidata.id_externo === "banco-simulado-1");
  if (!conta) {
    const nome = contas.some((candidata) => candidata.nome === "Conta Corrente")
      ? "Conta Corrente (banco-)"
      : "Conta Corrente";
    conta = guardarConta(nome, 150000n);
    conta.origem = "open_finance";
    conta.id_externo = "banco-simulado-1";
  } else {
    conta.saldo = 150000n;
  }
  const doBanco: [string, string, bigint, "entrada" | "saida", string | null, number][] = [
    ["sim-1", "Mercado Extra", 8735n, "saida", "PIX", 1],
    ["sim-2", "Salário", 500000n, "entrada", "FOLHA_PAGAMENTO", 2],
    ["sim-3", "Pagamento recebido", 30000n, "entrada", "PAGAMENTO_FATURA", 3],
    ["sim-4", "Farmácia", 4590n, "saida", "CARTAO", 4],
    ["sim-5", "Transferência entre contas", 20000n, "saida", "TRANSFERENCIA_MESMA_INSTITUICAO", 5],
    ["sim-6", "Estorno de compra", 1990n, "entrada", "ESTORNO", 6],
  ];
  let novas = 0;
  for (const [idExterno, descricao, valor, sentido, operacao, diasAtras] of doBanco) {
    const jaExiste = transacoesImportadas.some(
      (t) => t.conta_id === conta.id && t.id_externo === idExterno,
    );
    if (jaExiste) continue;
    transacoesImportadas.push({
      id: crypto.randomUUID(),
      conta_id: conta.id,
      id_externo: idExterno,
      data: diaDoMesAtual(diasAtras),
      descricao,
      valor,
      sentido,
      tipo_de_operacao: operacao,
      estado: OPERACOES_DESCARTADAS_NA_IMPORTACAO.has(operacao ?? "") ? "ignorada" : "pendente",
    });
    if (!OPERACOES_DESCARTADAS_NA_IMPORTACAO.has(operacao ?? "")) novas += 1;
  }
  const cartao = contas.find((candidata) => candidata.id_externo === "banco-simulado-2");
  if (!cartao) {
    const novo = guardarConta(
      contas.some((candidata) => candidata.nome === "Visa Gold") ? "Visa Gold (banco-)" : "Visa Gold",
      -82000n,
    );
    novo.origem = "open_finance";
    novo.id_externo = "banco-simulado-2";
    novo.tipo = "cartao";
  } else {
    cartao.saldo = -82000n;
  }
  if (investimentosSimulados.length === 0) {
    adicionarInvestimentoSimulado(
      { nome: "LCI do banco simulado", tipo: "FIXED_INCOME", subtipo: "LCI", saldo: "8000.00" },
      30,
    );
  }
  return { status: 200, corpo: { contas: 2, transacoes_novas: novas, falhas: 0 } };
}

function criarConta(corpoTexto: string | null): RespostaSimulada {
  const validacao = new Validacao("body", lerCorpo(corpoTexto));
  const nome = validacao.texto("nome");
  const saldoInicial = validacao.texto("saldo_inicial", "0.00");
  validacao.conferir();

  const saldo = reaisParaCentavos(saldoInicial as string);
  return { status: 201, corpo: contaResposta(guardarConta(nome as string, saldo)) };
}

function registrarGasto(corpoTexto: string | null): RespostaSimulada {
  const validacao = new Validacao("body", lerCorpo(corpoTexto));
  const contaId = validacao.uuid("conta_id");
  const valor = validacao.texto("valor");
  const descricao = validacao.texto("descricao");
  const data = validacao.data("data");
  const categoria = validacao.categoria("categoria");
  const tags = validacao.listaDeTextos("tags");
  validacao.conferir();
  if (categoria === "investimentos") {
    throw new ErroSimulado(422, "categoria_invalida", MENSAGEM_APORTE_NAO_E_GASTO);
  }

  const gasto = guardarGasto({
    conta_id: contaId as string,
    valor: reaisParaCentavos(valor as string),
    descricao: descricao as string,
    data: data as string,
    categoria: categoria as string,
    tags: tags as string[],
  });
  return { status: 201, corpo: gastoResposta(gasto) };
}

function listarGastos(parametros: URLSearchParams): RespostaSimulada {
  // Parâmetro repetido: vale o último, como no Starlette.
  const valores: Campos = {};
  for (const nome of new Set(parametros.keys())) valores[nome] = parametros.getAll(nome).at(-1);
  const validacao = new Validacao("query", valores);
  const inicio = validacao.data("inicio") as string;
  const fim = validacao.data("fim") as string;
  const contaId = validacao.uuid("conta_id", true);
  const tag = validacao.textoOpcional("tag");
  const categoria = validacao.categoria("categoria", true);
  validacao.conferir();

  if (inicio > fim) {
    throw new ErroSimulado(
      422,
      "periodo_invalido",
      "A data inicial do período não pode ser depois da final.",
    );
  }
  if (contaId !== undefined) encontrarConta(contaId);
  const tagDoFiltro = tag === undefined ? undefined : tagDoTexto(tag);

  const encontrados = gastos
    .filter(
      (gasto) =>
        gastoDoDono(gasto) && gasto.data >= inicio &&
        gasto.data <= fim &&
        (contaId === undefined || gasto.conta_id === contaId) &&
        (tagDoFiltro === undefined || gasto.tags.includes(tagDoFiltro)) &&
        (categoria === undefined || gasto.categoria === categoria),
    )
    .sort((a, b) => (a.data !== b.data ? (a.data < b.data ? 1 : -1) : a.id < b.id ? -1 : 1));
  return { status: 200, corpo: encontrados.map(gastoResposta) };
}

/**
 * GET /resumos/tags: o valor de cada gasto é dividido em partes iguais entre as
 * suas tags, com o resto de centavos para as primeiras (a mesma regra do backend).
 */
function resumirGastosPorTag(parametros: URLSearchParams): RespostaSimulada {
  const valores: Campos = {};
  for (const nome of new Set(parametros.keys())) valores[nome] = parametros.getAll(nome).at(-1);
  const validacao = new Validacao("query", valores);
  const inicio = validacao.data("inicio") as string;
  const fim = validacao.data("fim") as string;
  const contaId = validacao.uuid("conta_id", true);
  const categoria = validacao.categoria("categoria", true);
  validacao.conferir();

  if (inicio > fim) {
    throw new ErroSimulado(
      422,
      "periodo_invalido",
      "A data inicial do período não pode ser depois da final.",
    );
  }
  if (contaId !== undefined) encontrarConta(contaId);

  let total = 0n;
  const porTag = new Map<string | null, bigint>();
  for (const gasto of gastos) {
    if(!gastoDoDono(gasto))continue;
    if (gasto.data < inicio || gasto.data > fim) continue;
    if (contaId !== undefined && gasto.conta_id !== contaId) continue;
    if (categoria !== undefined && gasto.categoria !== categoria) continue;
    const liquido = gasto.valor-totalCoberto(gasto.id);
    total += liquido;
    if (gasto.tags.length === 0) {
      porTag.set(null, (porTag.get(null) ?? 0n) + liquido);
      continue;
    }
    const quantidade = BigInt(gasto.tags.length);
    const base = liquido / quantidade;
    const resto = Number(liquido % quantidade);
    gasto.tags.forEach((tag, posicao) => {
      porTag.set(tag, (porTag.get(tag) ?? 0n) + base + (posicao < resto ? 1n : 0n));
    });
  }
  const fatias = [...porTag.entries()]
    .filter(([, valor]) => valor > 0n)
    .sort(([tagA, valorA], [tagB, valorB]) =>
      valorA !== valorB ? (valorA > valorB ? -1 : 1) : compararCodePoints(tagA ?? "", tagB ?? ""),
    )
    .map(([tag, valor]) => ({ tag, valor: deCentavos(valor) }));
  return { status: 200, corpo: { inicio, fim, total: deCentavos(total), fatias } };
}

function registrarGanho(corpoTexto: string | null): RespostaSimulada {
  const validacao = new Validacao("body", lerCorpo(corpoTexto));
  const contaId = validacao.uuid("conta_id");
  const valor = validacao.texto("valor");
  const descricao = validacao.texto("descricao");
  const data = validacao.data("data");
  const tags = validacao.listaDeTextos("tags");
  validacao.conferir();

  const ganho = guardarGanho({
    conta_id: contaId as string,
    valor: reaisParaCentavos(valor as string),
    descricao: descricao as string,
    data: data as string,
    tags: tags as string[],
  });
  return { status: 201, corpo: ganhoResposta(ganho) };
}

function listarGanhos(parametros: URLSearchParams): RespostaSimulada {
  const valores: Campos = {};
  for (const nome of new Set(parametros.keys())) valores[nome] = parametros.getAll(nome).at(-1);
  const validacao = new Validacao("query", valores);
  const inicio = validacao.data("inicio") as string;
  const fim = validacao.data("fim") as string;
  const contaId = validacao.uuid("conta_id", true);
  validacao.conferir();

  if (inicio > fim) {
    throw new ErroSimulado(
      422,
      "periodo_invalido",
      "A data inicial do período não pode ser depois da final.",
    );
  }
  if (contaId !== undefined) encontrarConta(contaId);

  const encontrados = ganhos
    .filter(
      (ganho) =>
        ganho.data >= inicio &&
        ganho.data <= fim &&
        (contaId === undefined || ganho.conta_id === contaId),
    )
    .sort((a, b) => (a.data !== b.data ? (a.data < b.data ? 1 : -1) : a.id < b.id ? -1 : 1));
  return { status: 200, corpo: encontrados.map(ganhoResposta) };
}

function listarTags(): RespostaSimulada {
  const distintas = [...new Set(gastos.filter(gastoDoDono).flatMap((gasto) => gasto.tags))];
  return { status: 200, corpo: distintas.sort(compararCodePoints) };
}

function listarContas(): RespostaSimulada {
  const ordenadas = [...contas].sort((a, b) => compararCodePoints(a.nome, b.nome));
  return { status: 200, corpo: ordenadas.map(contaResposta) };
}

// --- recorrências ----------------------------------------------------------------

const LIMITE_DE_RECORRENCIAS_ATIVAS = 50;
const ANOS_MAXIMOS_NO_PASSADO = 5;

const recorrenciaInvalida = (mensagem: string) =>
  new ErroSimulado(422, "recorrencia_invalida", mensagem);

function recorrenciaResposta(recorrencia: RecorrenciaGuardada): Recorrencia {
  return { ...recorrencia, valor: deCentavos(recorrencia.valor), tags: [...recorrencia.tags] };
}

function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate();
}

function textoDaData(ano: number, mes: number, dia: number): string {
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** `Recorrencia.ocorrencias_ate`: as datas vencidas até hoje, do mês do início ao de hoje. */
function ocorrenciasAte(recorrencia: RecorrenciaGuardada, hoje: string): string[] {
  const [anoInicial, mesInicial] = recorrencia.inicio.split("-").map(Number);
  const [anoFinal, mesFinal] = hoje.split("-").map(Number);
  const datas: string[] = [];
  let ano = anoInicial;
  let mes = mesInicial;
  while (ano < anoFinal || (ano === anoFinal && mes <= mesFinal)) {
    const data = textoDaData(ano, mes, Math.min(recorrencia.dia_do_mes, ultimoDiaDoMes(ano, mes)));
    if (data >= recorrencia.inicio && data <= hoje && (recorrencia.fim === null || data <= recorrencia.fim)) {
      datas.push(data);
    }
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return datas;
}

/** O que `ProcessarRecorrencias` faz ao criar: gera os meses vencidos; um que falha não impede os demais. */
function gerarDaRecorrencia(recorrencia: RecorrenciaGuardada): void {
  for (const data of ocorrenciasAte(recorrencia, hojeLocal())) {
    const dados = {
      conta_id: recorrencia.conta_id,
      valor: recorrencia.valor,
      descricao: recorrencia.descricao,
      data,
      tags: recorrencia.tags,
      recorrencia_id: recorrencia.id,
    };
    try {
      if (recorrencia.tipo === "ganho") guardarGanho(dados);
      else guardarGasto({ ...dados, categoria: recorrencia.categoria as string });
    } catch (erro) {
      if (!(erro instanceof ErroSimulado)) throw erro;
    }
  }
}

type DadosDaRecorrencia = {
  tipo: TipoDeRecorrencia;
  valor: bigint;
  descricao: string;
  dia_do_mes: number;
  categoria: string | null;
  fim: string | null;
  inicio: string;
  tags: readonly string[];
};

/** O construtor de `Recorrencia`, na mesma ordem de verificação. Devolve a descrição aparada. */
function validarRecorrencia(dados: DadosDaRecorrencia): string {
  const descricao = aparar(dados.descricao);
  if (descricao === "") {
    throw new ErroSimulado(422, "descricao_invalida", "A descrição da recorrência não pode ser vazia.");
  }
  if ([...descricao].length > TAMANHO_MAXIMO_DA_DESCRICAO) {
    throw new ErroSimulado(
      422,
      "descricao_invalida",
      `A descrição da recorrência deve ter no máximo ${TAMANHO_MAXIMO_DA_DESCRICAO} caracteres.`,
    );
  }
  if (dados.valor <= 0n) throw valorInvalido("O valor da recorrência deve ser positivo.");
  if (dados.dia_do_mes < 1 || dados.dia_do_mes > 31) {
    throw recorrenciaInvalida("O dia do mês da recorrência deve ser de 1 a 31.");
  }
  if (dados.tipo === "gasto" && dados.categoria === null) {
    throw recorrenciaInvalida("A recorrência de gasto precisa de uma categoria.");
  }
  if (dados.tipo === "ganho" && dados.categoria !== null) {
    throw recorrenciaInvalida("A recorrência de ganho não tem categoria.");
  }
  if (dados.fim !== null && dados.fim < dados.inicio) {
    throw recorrenciaInvalida("O fim da recorrência não pode ser antes do início.");
  }
  if (new Set(dados.tags).size > LIMITE_DE_TAGS) {
    throw tagInvalida(`Uma recorrência pode ter no máximo ${LIMITE_DE_TAGS} tags distintas.`);
  }
  return descricao;
}

/** Corpo JSON com `null` nos campos opcionais tratado como ausente (como o Pydantic). */
function corpoSemNulos(corpoTexto: string | null, opcionais: readonly string[]): Campos {
  const campos = lerCorpo(corpoTexto);
  for (const nome of opcionais) if (campos[nome] === null) delete campos[nome];
  return campos;
}

function criarRecorrencia(corpoTexto: string | null): RespostaSimulada {
  const validacao = new Validacao("body", corpoSemNulos(corpoTexto, ["categoria", "fim"]));
  const tipo = validacao.tipoDeRecorrencia("tipo");
  const contaId = validacao.uuid("conta_id");
  const valor = validacao.texto("valor");
  const descricao = validacao.texto("descricao");
  const dia = validacao.inteiro("dia_do_mes");
  const inicio = validacao.data("inicio");
  const categoria = validacao.categoria("categoria", true);
  const tags = validacao.listaDeTextos("tags");
  const fim = validacao.dataOpcional("fim");
  validacao.conferir();

  const valorEmCentavos = reaisParaCentavos(valor as string);
  const hoje = hojeLocal();
  const [ano, mes, dia0] = hoje.split("-").map(Number);
  if ((inicio as string) < textoDaData(ano - ANOS_MAXIMOS_NO_PASSADO, mes, Math.min(dia0, ultimoDiaDoMes(ano - ANOS_MAXIMOS_NO_PASSADO, mes)))) {
    throw recorrenciaInvalida(
      `O início da recorrência não pode ser mais de ${ANOS_MAXIMOS_NO_PASSADO} anos no passado.`,
    );
  }
  const conta = encontrarConta(contaId as string);
  const tagsNormalizadas = [...new Set((tags as string[]).map(tagDoTexto))];
  const dados: DadosDaRecorrencia = {
    tipo: tipo as TipoDeRecorrencia,
    valor: valorEmCentavos,
    descricao: descricao as string,
    dia_do_mes: dia as number,
    categoria: categoria ?? null,
    fim: fim ?? null,
    inicio: inicio as string,
    tags: tagsNormalizadas,
  };
  const descricaoAparada = validarRecorrencia(dados);
  if (recorrencias.filter((r) => r.ativa).length >= LIMITE_DE_RECORRENCIAS_ATIVAS) {
    throw recorrenciaInvalida(
      `Cada pessoa pode ter no máximo ${LIMITE_DE_RECORRENCIAS_ATIVAS} recorrências ativas.`,
    );
  }

  const recorrencia: RecorrenciaGuardada = {
    id: crypto.randomUUID(),
    tipo: dados.tipo,
    conta_id: conta.id,
    valor: dados.valor,
    descricao: descricaoAparada,
    dia_do_mes: dados.dia_do_mes,
    inicio: dados.inicio,
    fim: dados.fim,
    categoria: dados.categoria,
    tags: tagsNormalizadas,
    ativa: true,
  };
  recorrencias.push(recorrencia);
  gerarDaRecorrencia(recorrencia);
  return { status: 201, corpo: recorrenciaResposta(recorrencia) };
}

function listarRecorrencias(): RespostaSimulada {
  const ordenadas = [...recorrencias].sort(
    (a, b) => compararCodePoints(a.descricao, b.descricao) || compararCodePoints(a.id, b.id),
  );
  return { status: 200, corpo: ordenadas.map(recorrenciaResposta) };
}

function idDaRecorrencia(idTexto: string): string {
  const validacao = new Validacao("path", { recorrencia_id: idTexto });
  const id = validacao.uuid("recorrencia_id");
  validacao.conferir();
  return id as string;
}

function encontrarRecorrencia(id: string): RecorrenciaGuardada {
  const recorrencia = recorrencias.find((candidata) => candidata.id === id);
  if (!recorrencia) {
    throw new ErroSimulado(404, "recorrencia_nao_encontrada", "Recorrência não encontrada.");
  }
  return recorrencia;
}

function alterarRecorrencia(idTexto: string, corpoTexto: string | null): RespostaSimulada {
  const caminho = new Validacao("path", { recorrencia_id: idTexto });
  const id = caminho.uuid("recorrencia_id");
  const validacao = new Validacao("body", corpoSemNulos(corpoTexto, ["categoria", "fim"]));
  const valor = validacao.texto("valor");
  const descricao = validacao.texto("descricao");
  const dia = validacao.inteiro("dia_do_mes");
  const categoria = validacao.categoria("categoria", true);
  const tags = validacao.listaDeTextos("tags");
  const fim = validacao.dataOpcional("fim");
  const detalhes = [...caminho.detalhes, ...validacao.detalhes];
  if (detalhes.length > 0) throw requisicaoInvalida(detalhes);

  const valorEmCentavos = reaisParaCentavos(valor as string);
  const atual = encontrarRecorrencia(id as string);
  if (atual.categoria === "investimentos") throw new ErroSimulado(409,"recorrencia_em_revisao","Categoria antiga: revise em Investimentos.");
  const tagsNormalizadas = [...new Set((tags as string[]).map(tagDoTexto))];
  const descricaoAparada = validarRecorrencia({
    tipo: atual.tipo,
    valor: valorEmCentavos,
    descricao: descricao as string,
    dia_do_mes: dia as number,
    categoria: categoria ?? null,
    fim: fim ?? null,
    inicio: atual.inicio,
    tags: tagsNormalizadas,
  });
  atual.valor = valorEmCentavos;
  atual.descricao = descricaoAparada;
  atual.dia_do_mes = dia as number;
  atual.categoria = categoria ?? null;
  atual.tags = tagsNormalizadas;
  atual.fim = fim ?? null;
  return { status: 200, corpo: recorrenciaResposta(atual) };
}

function encerrarRecorrencia(idTexto: string): RespostaSimulada {
  encontrarRecorrencia(idDaRecorrencia(idTexto)).ativa = false;
  return { status: 204 };
}

// --- metas -------------------------------------------------------------------------

const PERCENTUAL_DE_ALERTA = 80n;

function consultarRendaBase(): RespostaSimulada {
  return { status: 200, corpo: { valor: rendaBase === null ? null : deCentavos(rendaBase) } };
}

function definirRendaBase(corpoTexto: string | null): RespostaSimulada {
  const validacao = new Validacao("body", lerCorpo(corpoTexto));
  const texto = validacao.texto("valor");
  validacao.conferir();
  const valor = reaisParaCentavos(texto as string);
  if (valor <= 0n) throw valorInvalido("A renda-base deve ter valor positivo.");
  rendaBase = valor;
  return consultarRendaBase();
}

function removerRendaBase(): RespostaSimulada {
  rendaBase = null;
  return { status: 204 };
}

function categoriaDoCaminho(categoriaTexto: string, corpo?: Validacao): string {
  if (categoriaTexto === "investimentos") categoriaTexto = "liberdade_financeira";
  const caminho = new Validacao("path", { categoria: categoriaTexto });
  const categoria = categoriaTexto;
  if (!ALVOS.some(a=>a.codigo===categoria)) caminho.detalhes.push({campo:"path.categoria",mensagem:"Alvo inválido."});
  const detalhes = [...caminho.detalhes, ...(corpo?.detalhes ?? [])];
  if (detalhes.length > 0) throw requisicaoInvalida(detalhes);
  return categoria as string;
}

function ordemDaCategoria(codigo: string): number {
  return ALVOS.findIndex((categoria) => categoria.codigo === codigo);
}

function listarMetas(): RespostaSimulada {
  const ordenadas = [...metas].sort((a, b) => ordemDaCategoria(a.categoria) - ordemDaCategoria(b.categoria));
  return { status: 200, corpo: ordenadas.map((meta) => ({ ...meta })) };
}

function definirMeta(categoriaTexto: string, corpoTexto: string | null): RespostaSimulada {
  const validacao = new Validacao("body", lerCorpo(corpoTexto));
  const percentual = validacao.inteiro("percentual");
  const categoria = categoriaDoCaminho(categoriaTexto, validacao);

  if ((percentual as number) < 1 || (percentual as number) > 100) {
    throw new ErroSimulado(422, "percentual_invalido", "O percentual da meta deve ser um inteiro de 1 a 100.");
  }
  const outras = metas
    .filter((meta) => meta.categoria !== categoria)
    .reduce((soma, meta) => soma + meta.percentual, 0);
  if (outras + (percentual as number) > 100) {
    throw new ErroSimulado(
      422,
      "percentuais_excedem_100",
      `As metas somariam ${outras + (percentual as number)}% da renda; o máximo é 100%.`,
    );
  }
  const existente = metas.find((meta) => meta.categoria === categoria);
  if (existente?.percentual !== percentual) historicoDeMetas.unshift({usuario_id:donoAtual(),categoria,nome:nomeDoAlvo(categoria),acao:existente ? "alterada":"criada",percentual_anterior:existente?.percentual ?? null,percentual_novo:percentual as number,instante: new Date().toJSON()});
  if (existente) existente.percentual = percentual as number;
  else metas.push({ categoria, nome:nomeDoAlvo(categoria), percentual: percentual as number });
  return { status: 200, corpo: { categoria, nome:nomeDoAlvo(categoria), percentual } };
}

function removerMeta(categoriaTexto: string): RespostaSimulada {
  const categoria = categoriaDoCaminho(categoriaTexto);
  const posicao = metas.findIndex((meta) => meta.categoria === categoria);
  if (posicao < 0) throw new ErroSimulado(404, "meta_nao_encontrada", "Meta não encontrada.");
  historicoDeMetas.unshift({usuario_id:donoAtual(),categoria,nome:nomeDoAlvo(categoria),acao:"removida",percentual_anterior:metas[posicao].percentual,percentual_novo:null,instante:new Date().toJSON()});
  metas.splice(posicao, 1);
  return { status: 204 };
}

/** `Mes.de_texto`: "AAAA-MM", mês de 01 a 12 e ano de 0001 a 9999. */
function mesValido(texto: string): { inicio: string; fim: string } {
  const encontrado = /^(\d{4})-(\d{2})$/.exec(texto);
  const ano = encontrado ? Number(encontrado[1]) : 0;
  const mes = encontrado ? Number(encontrado[2]) : 0;
  if (ano < 1 || mes < 1 || mes > 12) {
    throw new ErroSimulado(
      422,
      "mes_invalido",
      "O mês deve ser AAAA-MM, com mês de 01 a 12 e ano de 0001 a 9999.",
    );
  }
  return { inicio: textoDaData(ano, mes, 1), fim: textoDaData(ano, mes, ultimoDiaDoMes(ano, mes)) };
}

function situacaoDaMeta(renda: bigint, gasto: bigint, limite: bigint): SituacaoDaMeta {
  if (renda <= 0n) return "sem_renda";
  if (gasto <= 0n) return "dentro";
  if (gasto > limite) return "estourou";
  return gasto * 100n >= limite * PERCENTUAL_DE_ALERTA ? "alerta" : "dentro";
}

/** Por tag, somando os investimentos da pessoa: [principal, rendimento = valor atual − principal]. */
function rendimentosPorTag(): Map<string, [bigint, bigint]> {
  const totais = new Map<string, [bigint, bigint]>();
  for (const investimento of investimentosSimulados) {
    if (investimento.usuario_id !== donoAtual()) continue;
    const principais = principaisDoInvestimento(investimento.id);
    for (const [tag, valor] of ratearSaldo(investimento.saldo, principais)) {
      if (tag === null) continue;
      const principal = principais.get(tag) ?? 0n;
      const [p, r] = totais.get(tag) ?? [0n, 0n];
      totais.set(tag, [p + principal, r + valor - principal]);
    }
  }
  return totais;
}

function consultarProgressoDasMetas(parametros: URLSearchParams): RespostaSimulada {
  const validacao = new Validacao("query", { mes: parametros.getAll("mes").at(-1) });
  const mes = validacao.texto("mes");
  validacao.conferir();
  const { inicio, fim } = mesValido(mes as string);

  const renda = ganhos
    .filter((ganho) => ganho.data >= inicio && ganho.data <= fim)
    .reduce((soma, ganho) => soma + ganho.valor, 0n);
  const referencia = rendaBase ?? renda;
  const ordenadas = [...metas].sort((a, b) => ordemDaCategoria(a.categoria) - ordemDaCategoria(b.categoria));
  const dosAportes = movimentosSimulados.filter(m => (m.usuario_id ?? USUARIO_DE_EXEMPLO.id) === donoAtual() && m.tipo === "aporte" && m.origem !== "saldo_inicial" && m.data >= inicio && m.data <= fim && !investimentosSimulados.some(i => i.id === m.investimento_id && i.tipo === "CAIXINHA")).reduce((s, m) => s + m.valor, 0n);
  const reaplicado = reaplicacoesSimuladas.filter(r=>r.usuario_id===donoAtual() && movimentosSimulados.some(m=>m.id===r.aporte_id && m.data>=inicio && m.data<=fim && !investimentosSimulados.some(i=>i.id===m.investimento_id&&i.tipo==="CAIXINHA"))).reduce((s,r)=>s+reaisParaCentavos(r.valor),0n);
  const progressos: ProgressoDaMeta[] = ordenadas.map((meta) => {
    const dosGastos = gastos.filter(g=>g.categoria === (meta.categoria === "liberdade_financeira" ? "investimentos" : meta.categoria) && g.data>=inicio && g.data<=fim).reduce((s,g)=>s+g.valor-totalCoberto(g.id),0n);
    // Como no backend: a parte com categoria (foto do vínculo) conta só nela; a categoria do
    // movimento inteiro vale só para o aporte sem nenhuma parte vinculada.
    const gasto = dosGastos + (meta.categoria === "liberdade_financeira" ? dosAportes - reaplicado : 0n);
    const usados = new Map<string,bigint>();
    if (meta.categoria !== "liberdade_financeira") {
      for (const c of coberturasSimuladas) {
        const g = gastos.find(x=>x.id===c.gasto_id);
        if (g && c.movimento_id && gastoDoDono(g) && g.categoria===meta.categoria && g.data>=inicio && g.data<=fim) usados.set(c.tag,(usados.get(c.tag)??0n)+reaisParaCentavos(c.valor));
      }
    }
    const rendimentos = rendimentosPorTag();
    const tags = meta.categoria === "liberdade_financeira"
      ? [...rendimentos.keys()]
      : [...usados.keys()];
    tags.sort(compararCodePoints);
    let principalTotal = 0n, rendimentoTotal = 0n;
    const caixinhas = tags.map((tag)=>{
      const [principal, rendimento] = rendimentos.get(tag) ?? [0n, 0n];
      principalTotal += principal; rendimentoTotal += rendimento;
      return { tag, valor: deCentavos(usados.get(tag) ?? 0n), rentabilidade: rentabilidadeEmPercentual(rendimento, principal) };
    });
    const adicional = [...usados.values()].reduce((s,v)=>s+v,0n);
    const limite = (referencia * BigInt(meta.percentual)) / 100n;
    return {
      categoria: meta.categoria,
      nome: nomeDoAlvo(meta.categoria),
      percentual: meta.percentual,
      limite: deCentavos(limite),
      gasto: deCentavos(gasto),
      restante: deCentavos(limite - gasto),
      percentual_usado: gasto <= 0n ? 0 : limite <= 0n ? null : Number((gasto * 100n) / limite),
      situacao: situacaoDaMeta(referencia, gasto, limite),
      gasto_bruto: deCentavos(gasto + adicional),
      limite_adicional: deCentavos(adicional),
      caixinhas,
      rentabilidade: rentabilidadeEmPercentual(rendimentoTotal, principalTotal),
    };
  });
  const resumo: ResumoDasMetas = {
    aportes_do_mes: deCentavos(dosAportes - reaplicado),
    mes: mes as string,
    renda: deCentavos(renda),
    renda_base: rendaBase === null ? null : deCentavos(rendaBase),
    renda_de_referencia: deCentavos(referencia),
    metas: progressos,
  };
  return { status: 200, corpo: resumo };
}

// --- investimentos -------------------------------------------------------------

type InvestimentoGuardado = {
  usuario_id: string;
  id: string;
  nome: string;
  tipo: string;
  conta_id?: string;
  subtipo: string | null;
  saldo: bigint;
  valor_aplicado: bigint | null;
  rendimento: bigint | null;
  taxa: { percentual: string | null; indexador: string | null; adicional_anual: string | null } | null;
  /** Cotas que o histórico não explica (dados inventados): a posição fica com histórico incompleto. */
  faltam_cotas?: string;
  pendencias_de_operacoes?: import("../api/tipos").PendenciaDeOperacao[];
};
/** `valor` é o dinheiro (com sinal); `principal` é o principal abatido do resgate, quando há referência. */
type ParteGuardada = { tag: string; valor: bigint; principal?: bigint; categoria?: string };
type MovimentoGuardado = {
  casamento_id?: string | null;
  vencimento_confirmado?: boolean;
  movimento_relacionado_id?: string | null;
  revisao_contabil_pendente?: boolean;
  categoria?: string | null;
  revisao_pendente?: boolean;
  usuario_id?: string;
  transacao_importada_id?: string | null;
  id: string;
  /** Nula só no saldo inicial, que não sai de conta. */
  conta_id: string | null;
  investimento_id: string | null;
  tipo: import("../api/tipos").TipoDeMovimento;
  origem: "open_finance" | "manual" | "saldo_inicial";
  descricao: string;
  valor: bigint;
  data: string;
  /** Com sinal: positivo no aporte, negativo no resgate. */
  partes: ParteGuardada[];
};
type RealocacaoGuardada = {
  id: string;
  investimento_id: string;
  origem: string;
  destino: string;
  valor: bigint;
  data: string;
};
type PontoGuardado = { investimento_id: string; data: string; saldo: bigint };

let investimentosSimulados: InvestimentoGuardado[] = [];
let movimentosSimulados: MovimentoGuardado[] = [];
let reaplicacoesSimuladas: (import("../api/tipos").ReaplicacaoDeResgate & {usuario_id:string})[] = [];
let realocacoesSimuladas: RealocacaoGuardada[] = [];
let historicoSimulado: PontoGuardado[] = [];

// Operações da 060: dados inventados, separados dos movimentos legados e das caixinhas.
let operacoesSimuladas: import("../api/tipos").Operacao[] = [];
export function adicionarOperacaoSimulada(investimentoId: string, dados: Pick<import("../api/tipos").Operacao, "tipo" | "data" | "quantidade" | "valor" | "origem"> & Partial<import("../api/tipos").Operacao>): string {
  const id = crypto.randomUUID();
  operacoesSimuladas.push({ custos: "0.00", quantidade_estimada: false, operacao_relacionada_id: null, ...dados, id, investimento_id: investimentoId, editavel: dados.origem !== "pluggy", quantidade_confirmavel: dados.origem === "pluggy" && dados.quantidade_estimada === true });
  return id;
}
function posicaoDasOperacoes(id: string) {
  const i = investimentosSimulados.find(i => i.id === normalizarUuid(id) && i.usuario_id === donoAtual());
  if (!i) throw investimentoNaoEncontrado();
  return i;
}
function operacaoSimulada(id: string) {
  const o = operacoesSimuladas.find(o => o.id === normalizarUuid(id) && investimentosSimulados.some(i => i.id === o.investimento_id && i.usuario_id === donoAtual()));
  if (!o) throw new ErroSimulado(404, "operacao_nao_encontrada", "Operação não encontrada.");
  return o;
}
function quantidadeDaOperacao(valor: unknown): string {
  if (typeof valor !== "string" || !/^\d+(?:\.\d+)?$/.test(valor)) throw new ErroSimulado(422, "operacao_invalida", "A quantidade precisa ser um número decimal não negativo.");
  const [inteira, fracao = ""] = valor.split(".");
  const decimal = fracao.replace(/0+$/, "");
  return `${BigInt(inteira)}${decimal ? `.${decimal}` : ""}`;
}
function listarOperacoesSimuladas(id: string): RespostaSimulada {
  const i = posicaoDasOperacoes(id);
  return { status: 200, corpo: operacoesSimuladas.filter(o => o.investimento_id === i.id).sort((a, b) => compararCodePoints(a.data, b.data) || compararCodePoints(a.id, b.id)) };
}
function salvarOperacaoSimulada(id: string, corpo: string | null, alterando = false): RespostaSimulada {
  const campos = lerCorpo(corpo);
  const atual = alterando ? operacaoSimulada(id) : undefined;
  if (atual && !atual.editavel) {
    const soAAQuantidade = atual.quantidade_confirmavel === true
      && (campos.data === undefined || campos.data === atual.data)
      && (campos.valor === undefined || campos.valor === atual.valor)
      && (campos.custos === undefined || campos.custos === atual.custos);
    if (!soAAQuantidade) throw new ErroSimulado(409, "operacao_da_corretora_imutavel", "A operação da corretora não pode ser alterada.");
  }
  const i = posicaoDasOperacoes(atual?.investimento_id ?? id);
  const tipo = atual?.tipo ?? campos.tipo as import("../api/tipos").TipoDeOperacao;
  if (!["COMPRA", "VENDA", "PROVENTO", "TAXA", "IMPOSTO", "VENCIMENTO", ...(atual ? ["ABERTURA"] : [])].includes(tipo)) throw new ErroSimulado(422, "operacao_invalida", "Escolha um tipo de operação válido.");
  const data = campos.data ?? atual?.data;
  if (typeof data !== "string" || !dataValida(data)) throw requisicaoInvalida([{ campo: "body.data", mensagem: "Informe uma data válida." }]);
  const quantidade = quantidadeDaOperacao(campos.quantidade ?? atual?.quantidade);
  const valorTexto = campos.valor ?? atual?.valor;
  const custosTexto = campos.custos ?? atual?.custos ?? "0.00";
  if (typeof valorTexto !== "string" || typeof custosTexto !== "string") throw requisicaoInvalida([{ campo: "body.valor", mensagem: "Informe valores em texto decimal." }]);
  const valor = deCentavos(reaisParaCentavos(valorTexto));
  const custos = deCentavos(reaisParaCentavos(custosTexto));
  if (reaisParaCentavos(valor) < 0n || reaisParaCentavos(custos) < 0n) throw new ErroSimulado(422, "operacao_invalida", "Valor e custos não podem ser negativos.");
  const relacionada = atual?.operacao_relacionada_id ?? (typeof campos.operacao_relacionada_id === "string" ? campos.operacao_relacionada_id : null);
  if ((tipo === "TAXA" || tipo === "IMPOSTO") && !relacionada) throw new ErroSimulado(422, "operacao_invalida", "Taxa e imposto precisam apontar para a operação relacionada.");
  if (relacionada && !operacoesSimuladas.some(o => o.id === relacionada && o.investimento_id === i.id)) throw new ErroSimulado(422, "operacao_invalida", "A operação relacionada não é desta posição.");
  if (!atual && !campos.confirmar_duplicidade && operacoesSimuladas.some(o => o.investimento_id === i.id && o.origem === "pluggy" && o.tipo === tipo && o.data === data && quantidadeDaOperacao(o.quantidade) === quantidade && o.valor === valor)) throw new ErroSimulado(409, "operacao_possivelmente_duplicada", "Já existe uma operação igual vinda da corretora. Confirme se é outra operação.");
  if (atual) {
    Object.assign(atual, { data, quantidade, valor, custos, quantidade_estimada: campos.quantidade === undefined ? atual.quantidade_estimada : false, quantidade_confirmavel: atual.quantidade_confirmavel === true && campos.quantidade === undefined });
    return { status: 200, corpo: atual };
  }
  const novoId = adicionarOperacaoSimulada(i.id, { tipo, data, quantidade, valor, custos, origem: "manual", operacao_relacionada_id: relacionada });
  return { status: 201, corpo: operacaoSimulada(novoId) };
}
function excluirOperacaoSimulada(id: string): RespostaSimulada {
  const o = operacaoSimulada(id);
  if (!o.editavel) throw new ErroSimulado(409, "operacao_da_corretora_imutavel", "A operação da corretora não pode ser excluída.");
  if (operacoesSimuladas.some(ligada => ligada.operacao_relacionada_id === o.id)) throw new ErroSimulado(422, "operacao_invalida", "Remova antes as taxas e os impostos ligados a esta operação.");
  operacoesSimuladas = operacoesSimuladas.filter(atual => atual.id !== o.id);
  return { status: 204 };
}

// Retrato fictício das frações; os movimentos legados permanecem intactos.
let alocacoesSimuladas = new Map<string, { pesos: Map<string, bigint>; sem: bigint }>();
let tratamentosDeAporteSimulados = new Map<string, import("../api/tipos").TratamentoDeAporte & { mantido_id?: string }>();
export function definirAlocacoesSimuladas(id: string, pesos: Record<string, string>, sem = "0.00") {
  posicaoDasOperacoes(id);
  alocacoesSimuladas.set(id, { pesos: new Map(Object.entries(pesos).map(([t, v]) => [normalizarTag(t), reaisParaCentavos(v)])), sem: reaisParaCentavos(sem) });
}
function rateioDasAlocacoes(i: InvestimentoGuardado, principais: Map<string, bigint>): [string | null, bigint][] {
  const a = alocacoesSimuladas.get(i.id);
  if (!a) return ratearSaldo(i.saldo, principais);
  const fora = a.sem < 0n ? 0n : a.sem > i.saldo ? (i.saldo > 0n ? i.saldo : 0n) : a.sem;
  const partes = ratearSaldo(i.saldo - fora, a.pesos);
  if (fora <= 0n) return partes;
  return [...partes.filter(([t]) => t !== null), [null, fora + partes.filter(([t]) => t === null).reduce((s, [, v]) => s + v, 0n)]];
}
function alocarSemCaixinhaSimulado(id: string, corpo: string | null): RespostaSimulada {
  const i = posicaoDasOperacoes(id);
  const alocacao = alocacoesSimuladas.get(i.id);
  if (!alocacao || alocacao.sem <= 0n) throw new ErroSimulado(409, "sem_valor_a_destinar", "Não há valor sem caixinha nesta posição.");
  const campos = lerCorpo(corpo);
  const partes = campos.destinacoes;
  if (!Array.isArray(partes) || !partes.length) throw destinacaoInvalida("Escolha as caixinhas.");
  const linhas = partes as { tag: string; percentual: number }[];
  if (linhas.some(p => typeof p.tag !== "string" || !alocacao.pesos.has(normalizarTag(p.tag)) || !Number.isInteger(p.percentual) || p.percentual <= 0) || linhas.reduce((s, p) => s + p.percentual, 0) !== 100 || new Set(linhas.map(p => normalizarTag(p.tag))).size !== linhas.length) throw destinacaoInvalida("Escolha caixinhas existentes, sem repetir e somando 100%.");
  const valores = repartir(alocacao.sem, linhas.map(p => BigInt(p.percentual)), 100n);
  linhas.forEach((p, n) => { const tag = normalizarTag(p.tag); alocacao.pesos.set(tag, alocacao.pesos.get(tag)! + valores[n]); });
  alocacao.sem = 0n;
  return { status: 204 };
}
function aportesSemInvestimentoSimulados(): RespostaSimulada {
  const todos = movimentosSimulados.filter(m => (m.usuario_id ?? USUARIO_DE_EXEMPLO.id) === donoAtual() && m.tipo === "aporte" && m.origem !== "saldo_inicial");
  return { status: 200, corpo: todos.filter(m => m.investimento_id === null).map(m => ({ id: m.id, conta_id: m.conta_id, data: m.data, valor: deCentavos(m.valor), descricao: m.descricao, natureza: naturezaDaDescricao(m.descricao), duplicado_sugerido_id: todos.find(o => o.id !== m.id && o.conta_id === m.conta_id && o.data === m.data && o.valor === m.valor)?.id ?? null, tratamento_pendente_de_aprovacao: tratamentosDeAporteSimulados.has(m.id) })) };
}
function tratarAporteSimulado(id: string, acao: string, corpo: string | null): RespostaSimulada {
  const m = movimentosSimulados.find(m => m.id === normalizarUuid(id) && (m.usuario_id ?? USUARIO_DE_EXEMPLO.id) === donoAtual());
  if (!m) throw new ErroSimulado(404, "movimento_de_investimento_nao_encontrado", "Movimento não encontrado.");
  if (acao === "desfazer") {
    if (!tratamentosDeAporteSimulados.has(m.id)) throw new ErroSimulado(404, "tratamento_de_aporte_nao_encontrado", "Tratamento não encontrado.");
    tratamentosDeAporteSimulados.delete(m.id);
    return { status: 204 };
  }
  if (tratamentosDeAporteSimulados.has(m.id)) throw new ErroSimulado(409, "aporte_ja_tratado", "Este aporte já foi tratado.");
  if (m.tipo !== "aporte" || m.investimento_id || m.origem === "saldo_inicial") throw new ErroSimulado(422, "mescla_invalida", "Só aportes sem investimento podem ser tratados.");
  if ([...tratamentosDeAporteSimulados.values()].some(t => t.mantido_id === m.id)) throw new ErroSimulado(422, "mescla_invalida", "Não é permitido encadear mesclas.");
  if (acao === "mesclar") {
    const mantido = movimentosSimulados.find(o => o.id === lerCorpo(corpo).mantido_id && (o.usuario_id ?? USUARIO_DE_EXEMPLO.id) === donoAtual());
    if (!mantido || mantido.id === m.id || mantido.tipo !== "aporte" || mantido.conta_id !== m.conta_id || mantido.data !== m.data || mantido.valor !== m.valor || tratamentosDeAporteSimulados.has(mantido.id)) throw new ErroSimulado(422, "mescla_invalida", "Escolha um duplicado da mesma conta, data e valor, sem tratamento ativo.");
  }
  const tratamento: import("../api/tipos").TratamentoDeAporte = { id: crypto.randomUUID(), movimento_id: m.id, acao: acao === "mesclar" ? "mesclado" : "excluido", aprovado: false };
  tratamentosDeAporteSimulados.set(m.id, { ...tratamento, ...(acao === "mesclar" ? { mantido_id: String(lerCorpo(corpo).mantido_id) } : {}) });
  return { status: 200, corpo: tratamento };
}

const destinacaoInvalida = (mensagem: string) =>
  new ErroSimulado(422, "destinacao_invalida", mensagem);
const investimentoNaoEncontrado = () =>
  new ErroSimulado(404, "investimento_nao_encontrado", "Investimento não encontrado.");
const principalInsuficiente = (mensagem: string) =>
  new ErroSimulado(422, "principal_insuficiente", mensagem);
const resgateMaiorQueOValor = (mensagem: string) =>
  new ErroSimulado(422, "resgate_maior_que_o_valor", mensagem);

/** Dia `diasAtras` dias antes de hoje, "AAAA-MM-DD" (componentes locais). */
function diaAntes(diasAtras: number): string {
  const hoje = new Date();
  const dia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - diasAtras);
  const mes = String(dia.getMonth() + 1).padStart(2, "0");
  return `${dia.getFullYear()}-${mes}-${String(dia.getDate()).padStart(2, "0")}`;
}

/**
 * Cria uma posição de investimento (na vida real ela vem da Pluggy) com `diasDeHistorico` saldos
 * diários terminando hoje, crescendo de leve; sem histórico, só o de hoje. Para o desenvolvimento
 * e os testes.
 */
export function adicionarInvestimentoSimulado(
  dados: {
    nome: string;
    tipo: string;
    subtipo?: string;
    saldo: string;
    /** O que a instituição informa (a Pluggy: aplicado e lucro). */
    valor_aplicado?: string;
    rendimento?: string;
    /** A taxa contratada, como a API devolve (zero já vem nulo). */
    taxa?: { percentual: string | null; indexador: string | null; adicional_anual: string | null };
    /** Saldo guardado 30 dias antes de hoje: a referência do resgate por custo médio. */
    saldo_anterior?: string;
    /** Cotas que faltam no histórico: sem rentabilidade, com a pendência (como o backend). */
    faltam_cotas?: string;
  pendencias_de_operacoes?: import("../api/tipos").PendenciaDeOperacao[];
  },
  diasDeHistorico = 0,
): string {
  const saldo = reaisParaCentavos(dados.saldo);
  const investimento: InvestimentoGuardado = {
    usuario_id: donosDasSessoes.get(cookieDaSessao ?? "")?.id ?? USUARIO_DE_EXEMPLO.id,
    id: crypto.randomUUID(),
    nome: dados.nome,
    tipo: dados.tipo,
    subtipo: dados.subtipo ?? null,
    saldo,
    valor_aplicado: dados.valor_aplicado === undefined ? null : reaisParaCentavos(dados.valor_aplicado),
    rendimento: dados.rendimento === undefined ? null : reaisParaCentavos(dados.rendimento),
    taxa: dados.taxa ?? null,
    faltam_cotas: dados.faltam_cotas,
    pendencias_de_operacoes: dados.pendencias_de_operacoes,
  };
  investimentosSimulados.push(investimento);
  for (let atras = diasDeHistorico; atras >= 0; atras -= 1) {
    // 0,03% a menos por dia para trás, em centavos inteiros.
    const valor = saldo - (saldo * 3n * BigInt(atras)) / 10000n;
    historicoSimulado.push({ investimento_id: investimento.id, data: diaAntes(atras), saldo: valor });
  }
  if (dados.saldo_anterior !== undefined) {
    historicoSimulado.push({
      investimento_id: investimento.id,
      data: diaAntes(30),
      saldo: reaisParaCentavos(dados.saldo_anterior),
    });
  }
  return investimento.id;
}

/** O que a pessoa dividiu: `[{tag, percentual}]`, com os erros de formato do Pydantic. */
function lerDestinacoes(
  campos: Campos,
  validacao: Validacao,
): { tag: string; percentual: number }[] {
  const lista = campos.destinacoes;
  if (lista === undefined) return [];
  if (!Array.isArray(lista)) {
    validacao.detalhes.push({ campo: "body.destinacoes", mensagem: PYDANTIC.lista });
    return [];
  }
  const lidas: { tag: string; percentual: number }[] = [];
  lista.forEach((item: unknown, indice) => {
    const objeto = typeof item === "object" && item !== null ? (item as Campos) : null;
    if (objeto === null) {
      validacao.detalhes.push({ campo: `body.destinacoes.${indice}`, mensagem: "Input should be a valid dictionary or object to extract fields from" });
      return;
    }
    const tag = objeto.tag;
    const percentual = objeto.percentual;
    if (typeof tag !== "string") {
      validacao.detalhes.push({ campo: `body.destinacoes.${indice}.tag`, mensagem: PYDANTIC.texto });
    }
    if (typeof percentual !== "number" || !Number.isInteger(percentual)) {
      validacao.detalhes.push({ campo: `body.destinacoes.${indice}.percentual`, mensagem: PYDANTIC.inteiro });
    }
    if (typeof tag === "string" && typeof percentual === "number") {
      lidas.push({ tag, percentual });
    }
  });
  return lidas;
}

/** Normaliza as tags e confere as regras: de 1 a 100, sem repetição, soma 100. */
function validarDestinacoes(
  destinacoes: readonly { tag: string; percentual: number }[],
): { tag: string; percentual: number }[] {
  const normalizadas = destinacoes.map((d) => ({ tag: tagDoTexto(d.tag), percentual: d.percentual }));
  for (const d of normalizadas) {
    if (!Number.isInteger(d.percentual) || d.percentual < 1 || d.percentual > 100) {
      throw destinacaoInvalida("O percentual da destinação deve ser um inteiro de 1 a 100.");
    }
  }
  if (normalizadas.length === 0) throw destinacaoInvalida("Informe ao menos uma destinação.");
  if (new Set(normalizadas.map((d) => d.tag)).size !== normalizadas.length) {
    throw destinacaoInvalida("Cada tag só pode aparecer uma vez nas destinações.");
  }
  if (normalizadas.reduce((soma, d) => soma + d.percentual, 0) !== 100) {
    throw destinacaoInvalida("Os percentuais das destinações devem somar 100%.");
  }
  return normalizadas;
}

/** Reparte `total` pelos pesos em centavos inteiros; o resto vai de 1 em 1 para os primeiros. */
function repartir(total: bigint, pesos: readonly bigint[], somaDosPesos: bigint): bigint[] {
  const partes = pesos.map((peso) => (total * peso) / somaDosPesos);
  let resto = total - partes.reduce((soma, parte) => soma + parte, 0n);
  for (let posicao = 0; resto > 0n; posicao += 1, resto -= 1n) partes[posicao] += 1n;
  return partes;
}

function principaisDoInvestimento(investimentoId: string): Map<string, bigint> {
  const principais = new Map<string, bigint>();
  const somar = (tag: string, valor: bigint) => principais.set(tag, (principais.get(tag) ?? 0n) + valor);
  for (const movimento of movimentosSimulados) {
    if (movimento.investimento_id !== investimentoId) continue;
    for (const parte of movimento.partes) somar(parte.tag, parte.principal ?? parte.valor);
  }
  for (const r of realocacoesSimuladas) {
    if (r.investimento_id !== investimentoId) continue;
    somar(r.origem, -r.valor);
    somar(r.destino, r.valor);
  }
  for (const [tag, valor] of principais) if (valor === 0n) principais.delete(tag);
  return principais;
}

/** O saldo rateado pelo principal (maior primeiro, empate pela tag); sem principal, "sem destinação". */
function ratearSaldo(saldo: bigint, principais: Map<string, bigint>): [string | null, bigint][] {
  const ordenadas = [...principais].filter(([, p]) => p > 0n).sort(
    ([tagA, a], [tagB, b]) => (a === b ? compararCodePoints(tagA, tagB) : a > b ? -1 : 1),
  );
  if (ordenadas.length === 0) return saldo > 0n ? [[null, saldo]] : [];
  const soma = ordenadas.reduce((total, [, p]) => total + p, 0n);
  const partes = repartir(saldo, ordenadas.map(([, p]) => p), soma);
  return ordenadas.map(([tag], posicao) => [tag, partes[posicao]]);
}

/** `rendimento / base` em % com duas casas, truncado em direção ao zero; nulo sem base. */
function rentabilidadeEmPercentual(rendimento: bigint | null, base: bigint | null): string | null {
  if (rendimento === null || base === null || base <= 0n) return null;
  const centesimos = ((rendimento < 0n ? -rendimento : rendimento) * 10000n) / base;
  const sinal = rendimento < 0n && centesimos > 0n ? "-" : "";
  return `${sinal}${centesimos / 100n}.${(centesimos % 100n).toString().padStart(2, "0")}`;
}

function encontrarInvestimento(id: string): InvestimentoGuardado {
  const investimento = investimentosSimulados.find((candidato) => candidato.id === id);
  if (!investimento) throw investimentoNaoEncontrado();
  return investimento;
}

/** O último saldo guardado com data estritamente anterior a `data`; nulo sem ponto assim. */
function saldoAntesDe(investimentoId: string, data: string): bigint | null {
  let melhor: PontoGuardado | null = null;
  for (const ponto of historicoSimulado) {
    if (ponto.investimento_id !== investimentoId || ponto.data >= data) continue;
    if (melhor === null || ponto.data > melhor.data) melhor = ponto;
  }
  return melhor === null ? null : melhor.saldo;
}

/**
 * Valida e calcula as partes do movimento (com sinal). No resgate, com o saldo de antes da data
 * (rateado pelos principais atuais), abate o principal por custo médio; sem essa referência vale a
 * regra antiga: o dinheiro abate o principal e não pode passar dele.
 */
function prepararPartes(
  movimento: { tipo: import("../api/tipos").TipoDeMovimento; valor: bigint; data?: string; origem?: string },
  investimentoId: string,
  destinacoes: readonly { tag: string; percentual: number }[],
): ParteGuardada[] {
  const validas = validarDestinacoes(destinacoes);
  encontrarInvestimento(investimentoId);
  const valores = repartir(movimento.valor, validas.map((d) => BigInt(d.percentual)), 100n);
  const principais = principaisDoInvestimento(investimentoId);
  const valoresAntes = new Map<string | null, bigint>();
  if (movimento.tipo === "resgate" && movimento.data !== undefined) {
    const saldoAntes = saldoAntesDe(investimentoId, movimento.data);
    if (saldoAntes !== null && saldoAntes > 0n) {
      for (const [tag, valor] of ratearSaldo(saldoAntes, principais)) valoresAntes.set(tag, valor);
    }
  }
  const partes: ParteGuardada[] = [];
  validas.forEach((d, posicao) => {
    const valor = valores[posicao];
    if (movimento.tipo === "aporte") {
      // Foto da categoria do vínculo na hora do aporte; o saldo inicial nunca entra numa categoria.
      const categoria = undefined;
      if (valor > 0n) partes.push(categoria === undefined ? { tag: d.tag, valor } : { tag: d.tag, valor, categoria });
      return;
    }
    const principal = principais.get(d.tag) ?? 0n;
    const valorDaTag = valoresAntes.get(d.tag) ?? 0n;
    if (valorDaTag > 0n) {
      if (valor > valorDaTag) {
        throw resgateMaiorQueOValor(`O resgate passa do valor da destinação «${d.tag}» antes dele.`);
      }
      if (valor === 0n) return;
      let abatido = valor >= valorDaTag ? principal : (principal * valor) / valorDaTag;
      if (abatido > principal) abatido = principal;
      if (abatido < 1n) abatido = 1n;
      partes.push({ tag: d.tag, valor: -valor, principal: -abatido });
      return;
    }
    if (valor > principal) {
      throw principalInsuficiente(`O resgate passa do principal da destinação «${d.tag}».`);
    }
    if (valor > 0n) partes.push({ tag: d.tag, valor: -valor });
  });
  return partes;
}

function aceitarComoMovimento(
  transacao: TransacaoImportadaGuardada,
  categoria: string | undefined,
  tags: readonly string[],
  investimentoId: string | undefined,
  destinacoes: readonly { tag: string; percentual: number }[],
  campos: Campos = {},
): { tipo: string; id: string } {
  if (categoria === "investimentos") throw new ErroSimulado(422,"categoria_invalida","Use uma categoria ativa.");
  if ((categoria !== undefined) || tags.length > 0) {
    throw new ErroSimulado(
      422,
      "transacao_importada_invalida",
      "Aporte e resgate não têm categoria nem tags.",
    );
  }
  if (investimentoId === undefined && destinacoes.length > 0) {
    throw new ErroSimulado(
      422,
      "transacao_importada_invalida",
      "Escolha o investimento para destinar o valor.",
    );
  }
  const tipo = (campos.tipo_de_movimento ?? (transacao.sentido === "saida" ? "aporte" : "resgate")) as import("../api/tipos").TipoDeMovimento;
  if (!["aporte", "resgate", "rendimento", "custo", "imposto"].includes(tipo)) throw requisicaoInvalida([{campo:"body.tipo_de_movimento",mensagem:"Natureza inválida."}]);
  const esperado = sugerirTipoSimulado(transacao.descricao);
  if ((esperado && esperado !== tipo) || ((transacao.sentido === "entrada") !== (tipo === "resgate" || tipo === "rendimento"))) throw new ErroSimulado(422,"transacao_importada_invalida","Confira a natureza e o sentido do movimento.");
  const relacionadoId = typeof campos.movimento_relacionado_id === "string" ? campos.movimento_relacionado_id : null;
  const posicao = investimentosSimulados.find(i => i.id === investimentoId);
  if (eContaRemuneradaSimulada(transacao.descricao) && (!posicao || posicao.tipo !== "CAIXINHA" || posicao.conta_id !== transacao.conta_id)) throw new ErroSimulado(422,"transacao_importada_invalida","Escolha a caixinha desta conta investimentos.");
  let partes: ParteGuardada[] = [];
  if (tipo === "rendimento") {
    if (!posicao || destinacoes.length) throw new ErroSimulado(422,"transacao_importada_invalida","Rendimento exige investimento e não acrescenta principal.");
  } else if (tipo === "custo" || tipo === "imposto") {
    const base = movimentosSimulados.find(m => m.id === relacionadoId && m.investimento_id === investimentoId && (m.tipo === "aporte" || m.tipo === "resgate"));
    if (!posicao || !base || destinacoes.length) throw new ErroSimulado(422,"transacao_importada_invalida","Escolha a posição e a operação relacionada ao custo.");
    if (base.tipo === "aporte") {
      const soma = base.partes.reduce((s, p) => s + p.valor, 0n);
      if (soma > 0n) {
        const valores = base.partes.map(p => transacao.valor * p.valor / soma);
        let resto = transacao.valor - valores.reduce((s, v) => s + v, 0n);
        partes = base.partes.map((p, i) => ({ tag: p.tag, valor: valores[i] + (resto-- > 0n ? 1n : 0n) })).filter(p => p.valor > 0n);
      }
    }
  } else if (investimentoId !== undefined) partes = prepararPartes({tipo, valor: transacao.valor, data: transacao.data}, investimentoId, destinacoes);
  const movimento: MovimentoGuardado = {
    usuario_id: donosDasSessoes.get(cookieDaSessao ?? "")?.id ?? USUARIO_DE_EXEMPLO.id,
    id: crypto.randomUUID(),
    transacao_importada_id: transacao.id,
    conta_id: transacao.conta_id,
    investimento_id: investimentoId ?? null,
    tipo,
    movimento_relacionado_id: relacionadoId,
    categoria:categoria ?? null,
    revisao_pendente:false,
    origem: "open_finance",
    descricao: transacao.descricao,
    valor: transacao.valor,
    data: transacao.data,
    partes,
  };
  movimentosSimulados.push(movimento);
  transacao.estado = "aceita";
  return { tipo, id: movimento.id };
}

function listarInvestimentos(): RespostaSimulada {
  const corpo = [...investimentosSimulados]
    .sort((a, b) => compararCodePoints(a.nome, b.nome))
    .map((investimento) => {
      const datas = historicoSimulado
        .filter((p) => p.investimento_id === investimento.id)
        .map((p) => p.data)
        .sort();
      const principais = principaisDoInvestimento(investimento.id);
      // Como no backend: o que a instituição informa; sem isso, nulos, exceto na conta remunerada,
      // que ainda estima pelo principal registrado.
      const registrado = investimento.tipo === "CAIXINHA" ? [...principais.values()].reduce((soma, valor) => soma + valor, 0n) : 0n;
      const daInstituicao = investimento.valor_aplicado !== null || investimento.rendimento !== null;
      const aplicado = daInstituicao ? investimento.valor_aplicado : registrado > 0n ? registrado : null;
      const lucro = daInstituicao ? investimento.rendimento : registrado > 0n ? investimento.saldo - registrado : null;
      const dele = movimentosSimulados.filter(m => m.investimento_id === investimento.id);
      const custos = dele.filter(m => m.tipo === "custo" || m.tipo === "imposto");
      const resgates = dele.filter(m => m.tipo === "resgate");
      const rendimentos = dele.filter(m => m.tipo === "rendimento");
      const baseCompleta = resgates.every(m => m.partes.length > 0 && m.partes.reduce((s, p) => s - p.valor, 0n) === m.valor);
      const receitas = resgates.reduce((s, m) => s + m.valor - m.partes.reduce((t, p) => t - (p.principal ?? p.valor), 0n), 0n);
      const taxasDeVenda = custos.filter(c => resgates.some(r => r.id === c.movimento_relacionado_id)).reduce((s, c) => s + c.valor, 0n);
      const resultadoRealizado = baseCompleta && (resgates.length > 0 || rendimentos.length > 0)
        ? receitas - taxasDeVenda + rendimentos.reduce((s, m) => s + m.valor, 0n)
        : null;
      return {
        custos_registrados: deCentavos(custos.reduce((s, c) => s + c.valor, 0n)),
        resultado_realizado: resultadoRealizado === null ? null : deCentavos(resultadoRealizado),
        id: investimento.id,
        nome: investimento.nome,
        tipo: investimento.tipo,
        subtipo: investimento.subtipo,
        saldo: deCentavos(investimento.saldo),
        valor_aplicado: aplicado === null ? null : deCentavos(aplicado),
        rendimento: lucro === null ? null : deCentavos(lucro),
        rentabilidade: rentabilidadeEmPercentual(lucro, aplicado),
        taxa: investimento.taxa,
        origem_da_rentabilidade: daInstituicao ? "instituicao" : registrado > 0n ? "aportes" : null,
        atualizado_em: datas.at(-1) ?? null,
        conta_id: investimento.conta_id ?? null,
        // Sem `faltam_cotas` a simulação segue como antes (resposta sem os campos de posição).
        ...(investimento.faltam_cotas === undefined ? {} : {
          quantidade: investimento.faltam_cotas,
          custo_medio: null,
          historico_completo: false,
          rentabilidade_do_periodo: null,
          rentabilidade_anualizada: null,
          motivo_sem_rentabilidade: "historico_incompleto",
          pendencias: [{ tipo: "faltam_cotas", quantidade_estimada: investimento.faltam_cotas }],
          acao_do_historico: (investimento.pendencias_de_operacoes ?? []).some((p) => p.motivo === "possivel_duplicidade") ? "conferir_operacoes" : "completar",
        }),
        data_de_aplicacao: movimentosSimulados.filter(m=>m.investimento_id===investimento.id&&m.tipo==="aporte"&&m.origem!=="saldo_inicial").map(m=>m.data).sort()[0] ?? null,
        pendencias_de_operacoes: investimento.pendencias_de_operacoes ?? [],
        alocacao_por_fracao: alocacoesSimuladas.has(investimento.id),
        destinacoes: rateioDasAlocacoes(investimento, principais).map(([tag, valor]) => {
          const principal = tag === null ? 0n : (alocacoesSimuladas.get(investimento.id)?.pesos.get(tag) ?? principais.get(tag) ?? 0n);
          const rendimento = tag === null ? 0n : valor - principal;
          return {
            tag,
            cor:tag===null?null:coresSimuladas.get(chaveDaCor(tag))??null,
            principal: deCentavos(principal),
            valor_atual: deCentavos(valor),
            rendimento: deCentavos(rendimento),
            rentabilidade: tag === null ? null : rentabilidadeEmPercentual(rendimento, principal),
          };
        }),
      };
    });
  return { status: 200, corpo };
}

function resumirInvestimentos(parametros: URLSearchParams): RespostaSimulada {
  const visao = parametros.getAll("visao").at(-1) ?? "destinacao";
  if (visao !== "destinacao" && visao !== "tipo") {
    throw requisicaoInvalida([{ campo: "query.visao", mensagem: "Input should be 'destinacao' or 'tipo'" }]);
  }
  const porRotulo = new Map<string | null, bigint>();
  for (const investimento of investimentosSimulados) {
    const fatias: [string | null, bigint][] =
      visao === "tipo"
        ? [[investimento.tipo, investimento.saldo]]
        : ratearSaldo(investimento.saldo, principaisDoInvestimento(investimento.id));
    for (const [rotulo, valor] of fatias) porRotulo.set(rotulo, (porRotulo.get(rotulo) ?? 0n) + valor);
  }
  const ordenadas = [...porRotulo].filter(([, valor]) => valor > 0n).sort(([rotuloA, a], [rotuloB, b]) => {
    if (a !== b) return a > b ? -1 : 1;
    if ((rotuloA === null) !== (rotuloB === null)) return rotuloA === null ? -1 : 1;
    return compararCodePoints(rotuloA ?? "", rotuloB ?? "");
  });
  return {
    status: 200,
    corpo: {
      visao,
      aportes_sem_destino: (() => {
        const dele = movimentosSimulados.filter(m => (m.usuario_id ?? USUARIO_DE_EXEMPLO.id) === donoAtual() && m.tipo === "aporte" && m.origem !== "saldo_inicial" && m.partes.length === 0 && !m.casamento_id);
        // O que a Revisão da bolsa ainda propõe ligar também é "aporte sem investimento" hoje.
        const casaveis = donoAtual() === USUARIO_DE_EXEMPLO.id ? propostasDaRevisao.flatMap(p => [...p.bruto, ...p.taxas]).filter(t => t.situacao === "aporte_sem_investimento") : [];
        return { quantidade: dele.length + casaveis.length, total: deCentavos(dele.reduce((s, m) => s + m.valor, 0n) + casaveis.reduce((s, t) => s + reaisParaCentavos(t.valor), 0n)) };
      })(),
      total: deCentavos(ordenadas.reduce((soma, [, valor]) => soma + valor, 0n)),
      fatias: ordenadas.map(([rotulo, valor]) => ({ rotulo, cor:visao==="destinacao"&&rotulo!==null?coresSimuladas.get(chaveDaCor(rotulo))??null:null, valor: deCentavos(valor) })),
    },
  };
}

function periodoDaConsulta(parametros: URLSearchParams): { inicio: string; fim: string } {
  const validacao = new Validacao("query", {
    inicio: parametros.getAll("inicio").at(-1),
    fim: parametros.getAll("fim").at(-1),
  });
  const inicio = validacao.data("inicio");
  const fim = validacao.data("fim");
  validacao.conferir();
  if ((inicio as string) > (fim as string)) {
    throw new ErroSimulado(422, "periodo_invalido", "O início do período não pode ser depois do fim.");
  }
  return { inicio: inicio as string, fim: fim as string };
}

function historicoDeInvestimentos(parametros: URLSearchParams): RespostaSimulada {
  const { inicio, fim } = periodoDaConsulta(parametros);
  const corpo = historicoSimulado
    .filter((p) => p.data >= inicio && p.data <= fim)
    .sort((a, b) => compararCodePoints(a.data, b.data) || compararCodePoints(a.investimento_id, b.investimento_id))
    .map((p) => ({ investimento_id: p.investimento_id, data: p.data, saldo: deCentavos(p.saldo) }));
  return { status: 200, corpo };
}

function naturezaDaDescricao(descricao: string): string {
  const texto = descricao.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (/\b(irrf|iof)\b|\btx (emol|ccp|tta)\b/.test(texto)) return "imposto_ou_taxa";
  if (/\brendimentos?\b|\bremuneracao\b/.test(texto)) return "rendimento";
  if (/\bconta remunerada\b|\b(aplicacao|resgate) automatic[oa]\b/.test(texto)) return "conta_remunerada";
  if (texto.startsWith("liq bolsa")) return "liquidacao_de_bolsa";
  if (texto.startsWith("vencimento")) return "vencimento";
  return "outra";
}

function movimentoResposta(movimento: MovimentoGuardado) {
  return {
    id: movimento.id,
    natureza: naturezaDaDescricao(movimento.descricao),
    casamento_id: movimento.casamento_id ?? null,
    vencimento_confirmado: movimento.vencimento_confirmado ?? false,
    categoria: movimento.categoria ?? null,
    revisao_pendente: movimento.revisao_pendente ?? false,
    transacao_importada_id: movimento.transacao_importada_id ?? null,
    movimento_relacionado_id: movimento.movimento_relacionado_id ?? null,
    revisao_contabil_pendente: movimento.revisao_contabil_pendente ?? false,
    conta_id: movimento.conta_id,
    investimento_id: movimento.investimento_id,
    tipo: movimento.tipo,
    origem: movimento.origem,
    descricao: movimento.descricao,
    valor: deCentavos(movimento.valor),
    data: movimento.data,
    destinacoes: [...movimento.partes]
      .sort((a, b) => compararCodePoints(a.tag, b.tag))
      .map((parte) => {
        const usado = movimento.tipo === "resgate" ? coberturasSimuladas.filter((c) => c.movimento_id === movimento.id && c.tag === parte.tag).reduce((s, c) => s + reaisParaCentavos(c.valor), 0n) : 0n;
        return {
          tag: parte.tag,
          valor: deCentavos(parte.valor < 0n ? -parte.valor : parte.valor),
          categoria: parte.categoria ?? null,
          coberto: usado > 0n ? deCentavos(usado) : null,
        };
      }),
  };
}

function listarMovimentosDeInvestimento(parametros: URLSearchParams): RespostaSimulada {
  const { inicio, fim } = periodoDaConsulta(parametros);
  const corpo = movimentosSimulados
    .filter((m) => m.data >= inicio && m.data <= fim)
    .sort((a, b) => compararCodePoints(b.data, a.data))
    .map(movimentoResposta);
  return { status: 200, corpo };
}

function associarMovimento(idTexto: string, corpoTexto: string | null): RespostaSimulada {
  const campos = lerCorpo(corpoTexto);
  const validacao = new Validacao("body", campos);
  const investimentoId = validacao.uuid("investimento_id");
  const destinacoes = lerDestinacoes(campos, validacao);
  if (campos.destinacoes === undefined) {
    validacao.detalhes.push({ campo: "body.destinacoes", mensagem: PYDANTIC.ausente });
  }
  validacao.conferir();
  const movimento = movimentosSimulados.find((m) => m.id === normalizarUuid(idTexto));
  if (!movimento) {
    throw new ErroSimulado(
      404,
      "movimento_de_investimento_nao_encontrado",
      "Movimento não encontrado.",
    );
  }
  if (movimento.investimento_id !== null) {
    throw new ErroSimulado(
      409,
      "movimento_ja_associado",
      "Este movimento já está associado a um investimento.",
    );
  }
  movimento.partes = prepararPartes(movimento, investimentoId as string, destinacoes);
  movimento.investimento_id = investimentoId as string;
  return { status: 200, corpo: { ...movimentoResposta(movimento), destinacoes: [] } };
}

/**
 * `POST /investimentos/{id}/destinacoes`: reparte a parte da posição ainda sem principal (o valor
 * aplicado, ou o saldo se a instituição não informa, menos o principal registrado) num aporte de
 * saldo inicial, sem conta e com data de hoje; 409 se nada sobra.
 */
function definirDestinacoesIniciais(idTexto: string, corpoTexto: string | null): RespostaSimulada {
  const campos = lerCorpo(corpoTexto);
  const validacao = new Validacao("body", campos);
  const destinacoes = lerDestinacoes(campos, validacao);
  if (campos.destinacoes === undefined) {
    validacao.detalhes.push({ campo: "body.destinacoes", mensagem: PYDANTIC.ausente });
  }
  const caminho = new Validacao("path", { investimento_id: idTexto });
  const id = caminho.uuid("investimento_id");
  caminho.conferir();
  validacao.conferir();
  const investimento = encontrarInvestimento(id as string);
  const validas = validarDestinacoes(destinacoes);
  const base = investimento.valor_aplicado ?? investimento.saldo;
  const principal = [...principaisDoInvestimento(investimento.id).values()].reduce((s, v) => s + v, 0n);
  const valor = base > principal ? base - principal : 0n;
  if (valor === 0n) {
    throw new ErroSimulado(
      409,
      "sem_valor_a_destinar",
      "Todo o valor deste investimento já tem destinação; use a realocação.",
    );
  }
  const repartido = repartir(valor, validas.map((d) => BigInt(d.percentual)), 100n);
  const movimento: MovimentoGuardado = {
    usuario_id: donosDasSessoes.get(cookieDaSessao ?? "")?.id ?? USUARIO_DE_EXEMPLO.id,
    id: crypto.randomUUID(),
    conta_id: null,
    investimento_id: investimento.id,
    tipo: "aporte",
    origem: "saldo_inicial",
    descricao: "Saldo inicial",
    valor,
    data: diaAntes(0),
    partes: validas
      .map((d, posicao) => ({ tag: d.tag, valor: repartido[posicao] }))
      .filter((parte) => parte.valor > 0n),
  };
  movimentosSimulados.push(movimento);
  return { status: 201, corpo: movimentoResposta(movimento) };
}

function realocacaoResposta(r: RealocacaoGuardada) {
  return {
    id: r.id,
    investimento_id: r.investimento_id,
    origem: r.origem,
    destino: r.destino,
    valor: deCentavos(r.valor),
    data: r.data,
  };
}

function listarRealocacoes(idTexto: string): RespostaSimulada {
  const investimento = encontrarInvestimento(normalizarUuid(idTexto) ?? "");
  const corpo = realocacoesSimuladas
    .filter((r) => r.investimento_id === investimento.id)
    .sort((a, b) => compararCodePoints(b.data, a.data))
    .map(realocacaoResposta);
  return { status: 200, corpo };
}

function realocarDestinacao(idTexto: string, corpoTexto: string | null): RespostaSimulada {
  const campos = lerCorpo(corpoTexto);
  const validacao = new Validacao("body", campos);
  const origem = validacao.texto("origem");
  const destino = validacao.texto("destino");
  const data = validacao.data("data");
  const valorTexto = validacao.textoOpcional("valor");
  const percentual = campos.percentual;
  if (percentual !== undefined && percentual !== null && (typeof percentual !== "number" || !Number.isInteger(percentual))) {
    validacao.detalhes.push({ campo: "body.percentual", mensagem: PYDANTIC.inteiro });
  }
  validacao.conferir();
  const investimento = encontrarInvestimento(normalizarUuid(idTexto) ?? "");
  const tagDeOrigem = tagDoTexto(origem as string);
  const tagDeDestino = tagDoTexto(destino as string);
  const temValor = valorTexto !== undefined;
  const temPercentual = typeof percentual === "number";
  if (temValor === temPercentual) {
    throw destinacaoInvalida("Informe o valor ou o percentual a realocar, só um deles.");
  }
  const principal = principaisDoInvestimento(investimento.id).get(tagDeOrigem) ?? 0n;
  let valor: bigint;
  if (temPercentual) {
    if (percentual < 1 || percentual > 100) {
      throw destinacaoInvalida("O percentual deve ser um inteiro de 1 a 100.");
    }
    valor = (principal * BigInt(percentual)) / 100n;
  } else {
    valor = reaisParaCentavos(valorTexto as string);
  }
  if (tagDeOrigem === tagDeDestino) {
    throw destinacaoInvalida("A origem e o destino da realocação devem ser diferentes.");
  }
  if (valor <= 0n) throw destinacaoInvalida("O valor da realocação deve ser positivo.");
  if (valor > principal) throw principalInsuficiente("A realocação passa do principal da destinação.");
  const nova: RealocacaoGuardada = {
    id: crypto.randomUUID(),
    investimento_id: investimento.id,
    origem: tagDeOrigem,
    destino: tagDeDestino,
    valor,
    data: data as string,
  };
  realocacoesSimuladas.push(nova);
  return { status: 201, corpo: realocacaoResposta(nova) };
}

/** `DELETE /investimentos/{id}/realocacoes/{realocacao_id}`: o principal volta à origem. */
function desfazerRealocacao(investimentoTexto: string, realocacaoTexto: string): RespostaSimulada {
  const investimento = encontrarInvestimento(normalizarUuid(investimentoTexto) ?? "");
  const posicao = realocacoesSimuladas.findIndex(
    (r) => r.id === normalizarUuid(realocacaoTexto) && r.investimento_id === investimento.id,
  );
  if (posicao < 0) {
    throw new ErroSimulado(404, "realocacao_nao_encontrada", "Realocação não encontrada.");
  }
  const realocacao = realocacoesSimuladas[posicao];
  const principais = principaisDoInvestimento(investimento.id);
  if ((principais.get(realocacao.destino) ?? 0n) < realocacao.valor) {
    throw principalInsuficiente(
      `Não dá para desfazer: a destinação «${realocacao.destino}» já não tem esse valor (um resgate ou outra realocação o usou).`,
    );
  }
  realocacoesSimuladas.splice(posicao, 1);
  return { status: 204 };
}

/** Reabre somente depois de conferir o grupo inteiro, sem alterar saldo de conta. */
function desfazerClassificacao(requisicao: RequisicaoSimulada, idTexto: string): RespostaSimulada {
  const bloqueado = (mensagem: string) => new ErroSimulado(409, "movimento_nao_desfazivel", mensagem);
  if (!ehDonoDaImportacao(donoDaRequisicao(requisicao))) {
    throw bloqueado("A caixa de entrada está desligada: a transação não teria para onde voltar. Nada foi alterado.");
  }
  const campos = requisicao.corpo === null ? {} : lerCorpo(requisicao.corpo);
  const flag = campos.desfazer_divisao_inteira ?? false;
  if (typeof flag !== "boolean") throw requisicaoInvalida([{ campo: "body.desfazer_divisao_inteira", mensagem: "Input should be a valid boolean" }]);
  const movimento = movimentosSimulados.find((m) => m.id === normalizarUuid(idTexto));
  if (!movimento) throw new ErroSimulado(404, "movimento_de_investimento_nao_encontrado", "Movimento não encontrado.");
  if (movimento.origem !== "open_finance") throw bloqueado("Só a classificação vinda da caixa de entrada pode ser desfeita por aqui.");
  const todos = [...gastos, ...ganhos, ...movimentosSimulados];
  let transacao: TransacaoImportadaGuardada | undefined;
  if (movimento.transacao_importada_id) {
    transacao = transacoesImportadas.find((t) => t.id === movimento.transacao_importada_id);
  } else {
    const corresponde = (l: { conta_id: string | null; data: string; valor: bigint; descricao: string }) =>
      l.conta_id === movimento.conta_id && l.data === movimento.data && l.valor === movimento.valor && l.descricao === movimento.descricao;
    const candidatas = transacoesImportadas.filter((t) => corresponde(t) && t.estado === "aceita" && t.sentido === (movimento.tipo === "aporte" ? "saida" : "entrada") && !todos.some((l) => l.transacao_importada_id === t.id));
    const iguais = movimentosSimulados.filter((m) => !m.transacao_importada_id && m.tipo === movimento.tipo && corresponde(m));
    const ambiguo = [...gastos, ...ganhos].some((l) => !l.transacao_importada_id && l.origem === "open_finance" && corresponde(l));
    if (candidatas.length === 1 && iguais.length === 1 && !ambiguo) transacao = candidatas[0];
  }
  if (!transacao) throw bloqueado(/ \(\d+\/\d+\)$/.test(movimento.descricao)
    ? "Esta divisão é anterior ao vínculo com a transação: não dá para identificar todas as partes com segurança. Nada foi alterado."
    : "Não dá para identificar com segurança a transação de origem deste aporte; nada foi alterado.");
  const daTransacao = (l: { transacao_importada_id?: string | null }) => l.transacao_importada_id === transacao.id;
  const movimentos = movimento.transacao_importada_id ? movimentosSimulados.filter(daTransacao) : [movimento];
  const gastosDoGrupo = movimento.transacao_importada_id ? gastos.filter(daTransacao) : [];
  const ganhosDoGrupo = movimento.transacao_importada_id ? ganhos.filter(daTransacao) : [];
  return reverterGrupoSimulado(transacao, movimentos, gastosDoGrupo, ganhosDoGrupo, flag === true);
}

function reverterGrupoSimulado(transacao: TransacaoImportadaGuardada, movimentos: typeof movimentosSimulados, gastosDoGrupo: GastoGuardado[], ganhosDoGrupo: GanhoGuardado[], flag: boolean, dependenciasConfirmadas = false): RespostaSimulada {
  const bloqueado = (mensagem: string) => new ErroSimulado(409, "movimento_nao_desfazivel", mensagem);
  const grupo = [...gastosDoGrupo, ...ganhosDoGrupo, ...movimentos];
  if(reaplicacoesSimuladas.some(r=>movimentos.some(m=>m.id===r.aporte_id||m.id===r.resgate_id))) throw bloqueado("Desfaça primeiro a reaplicação vinculada a este movimento.");
  if (movimentosSimulados.some(m => m.movimento_relacionado_id && movimentos.some(p => p.id === m.movimento_relacionado_id) && !movimentos.some(p => p.id === m.id))) throw bloqueado("Desfaça primeiro os custos ou impostos ligados a esta operação.");
  if (transacao.estado !== "aceita") throw bloqueado("A transação de origem já não está aceita. Nada foi alterado.");
  if (!saldoEDoBanco(encontrarConta(transacao.conta_id))) throw bloqueado("Só uma transação de conta bancária conectada pode voltar à caixa de entrada.");
  if ([...gastosDoGrupo, ...ganhosDoGrupo].some((l) => l.recorrencia_id !== null)) throw bloqueado("O grupo contém lançamento de recorrência. Nada foi alterado.");
  if (grupo.reduce((soma, l) => soma + l.valor, 0n) !== transacao.valor) throw bloqueado("Não dá para identificar todas as partes da transação com segurança. Nada foi alterado.");
  if (grupo.length > 1 && !flag) {
    const tipos = [["gasto", gastosDoGrupo.length], ["ganho", ganhosDoGrupo.length], ["aporte", movimentos.filter((m) => m.tipo === "aporte").length], ["resgate", movimentos.filter((m) => m.tipo === "resgate").length]] as const;
    const contagem = tipos.filter(([, n]) => n > 0).map(([tipo, n]) => `${n} ${tipo}${n === 1 ? "" : "s"}`).join(" e ");
    throw new ErroSimulado(409, "divisao_exige_confirmacao", `Esta transação foi dividida em ${grupo.length} partes (${contagem}). Desfazer remove todas as partes e devolve a transação inteira para a caixa de entrada.`);
  }
  const removidosDaReserva = new Map<string,Map<string,bigint>>();
  for(const m of movimentos){
    if(m.tipo!=="aporte" || !m.categoria)continue;
    const porTag=removidosDaReserva.get(m.categoria)??new Map<string,bigint>();
    for(const p of m.partes)if(p.valor>0n)porTag.set(p.tag,(porTag.get(p.tag)??0n)+p.valor);
    removidosDaReserva.set(m.categoria,porTag);
  }
  for(const [categoria,partes] of removidosDaReserva){
    const reservas=reservasDaCategoria(categoria);
    for(const [tag,removido] of partes){
      const r=reservas.find(r=>r.tag===tag);
      const cobertoDoGrupo=gastosDoGrupo.filter(g=>g.categoria===categoria).reduce((s,g)=>s+coberturasSimuladas.filter(c=>c.gasto_id===g.id&&c.tag===tag).reduce((t,c)=>t+reaisParaCentavos(c.valor),0n),0n);
      if(reaisParaCentavos(r?.reservado??"0.00")-removido < reaisParaCentavos(r?.coberto??"0.00")-cobertoDoGrupo)throw bloqueado(`A reserva de «${tag}» já cobre compras: desfaça a associação da compra antes. Nada foi alterado.`);
    }
  }
  const necessarios = new Map<string, Map<string, bigint>>();
  for (const m of movimentos) {
    if (m.tipo !== "aporte" || m.investimento_id === null) continue;
    const partes = necessarios.get(m.investimento_id) ?? new Map<string, bigint>();
    for (const p of m.partes) partes.set(p.tag, (partes.get(p.tag) ?? 0n) + p.valor);
    necessarios.set(m.investimento_id, partes);
  }
  for (const [investimento, partes] of necessarios) {
    const principais = principaisDoInvestimento(investimento);
    for (const [tag, valor] of partes) if ((principais.get(tag) ?? 0n) < valor) throw principalInsuficiente(`Não dá para desfazer: a destinação «${tag}» já não tem esse valor (uma realocação ou um resgate o usou).`);
  }
  const dependencias = coberturasSimuladas.filter(c => c.movimento_id && movimentos.some(m => m.id === c.movimento_id));
  if (dependencias.length > 0 && !dependenciasConfirmadas) throw bloqueado("Este resgate paga compras. Confirme a remoção das coberturas indicadas na prévia.");
  const ids = new Set(grupo.map((l) => l.id));
  coberturasSimuladas = coberturasSimuladas.filter(c => !dependencias.some(d => d.id === c.id));
  coberturasSimuladas=coberturasSimuladas.filter(c=>!gastosDoGrupo.some(g=>g.id===c.gasto_id));
  gastos = gastos.filter((l) => !ids.has(l.id));
  ganhos = ganhos.filter((l) => !ids.has(l.id));
  movimentosSimulados = movimentosSimulados.filter((l) => !ids.has(l.id));
  transacao.estado = "pendente";
  return { status: 200, corpo: { transacao_id: transacao.id, estado: "pendente", lancamentos_removidos: grupo.length } };
}


let revisoesDasClassificacoes = new Map<string, number>();
function previaDaReversao(requisicao: RequisicaoSimulada, idTexto: string): RespostaSimulada {
  exigirDonoDaImportacao(requisicao);
  const t = transacoesImportadas.find(t => t.id === normalizarUuid(idTexto) && (contas.find(c => c.id === t.conta_id)?.usuario_id ?? USUARIO_DE_EXEMPLO.id) === donoAtual());
  if (!t) throw new ErroSimulado(404, "transacao_importada_nao_encontrada", "Transação importada não encontrada.");
  if (t.estado === "pendente") throw new ErroSimulado(409, "movimento_nao_desfazivel", "Esta transação já está na caixa de entrada.");
  const grupo = [...gastos, ...ganhos, ...movimentosSimulados].filter(l => l.transacao_importada_id === t.id);
  const transferencia = transferenciasSimuladas.find(x => x.ativa && [x.transacao_origem_id, x.transacao_destino_id].includes(t.id));
  const dependencias = coberturasSimuladas.filter(c => grupo.some(l => l.id === c.movimento_id || l.id === c.gasto_id));
  const versao = JSON.stringify([t, grupo, transferencia, dependencias, reaplicacoesSimuladas.filter(r=>grupo.some(m=>m.id===r.aporte_id||m.id===r.resgate_id)), revisoesDasClassificacoes.get(t.id) ?? 0], (_chave, valor: unknown) => typeof valor === "bigint" ? valor.toString() : valor);
  return { status: 200, corpo: { transacao_id: t.id, versao, transacoes_reabertas: transferencia ? [transferencia.transacao_origem_id, transferencia.transacao_destino_id].filter(Boolean).length : 1, lancamentos_removidos: grupo.length + (transferencia ? 1 : 0), divisao_inteira: grupo.length > 1, coberturas_removidas: dependencias.filter(c => grupo.some(l => l.id === c.movimento_id)).length } };
}
function desfazerImportada(requisicao: RequisicaoSimulada, idTexto: string): RespostaSimulada {
  const previa = previaDaReversao(requisicao, idTexto).corpo as { versao: string };
  const campos = lerCorpo(requisicao.corpo);
  if (campos.versao_esperada !== undefined && campos.versao_esperada !== previa.versao) throw new ErroSimulado(409, "movimento_nao_desfazivel", "A classificação mudou. Confira a prévia novamente.");
  const t = transacoesImportadas.find(t => t.id === normalizarUuid(idTexto))!;
  let resposta: RespostaSimulada;
  const transferencia = transferenciasSimuladas.find(x => x.ativa && [x.transacao_origem_id, x.transacao_destino_id].includes(t.id));
  if (transferencia) {
    if (campos.versao_esperada === undefined) throw new ErroSimulado(409,"movimento_nao_desfazivel","Confira a prévia da transferência inteira.");
    for (const id of [transferencia.transacao_origem_id, transferencia.transacao_destino_id]) {
      const ponta = transacoesImportadas.find(p => p.id === id); if (ponta) ponta.estado = "pendente";
    }
    transferencia.ativa = false;
    resposta = { status: 200, corpo: { transacao_id: t.id, estado: "pendente", lancamentos_removidos: 1 } };
  } else if (t.estado === "ignorada") {
    t.estado = "pendente";
    resposta = { status: 200, corpo: { transacao_id: t.id, estado: "pendente", lancamentos_removidos: 0 } };
  } else {
    resposta = reverterGrupoSimulado(t, movimentosSimulados.filter(m => m.transacao_importada_id === t.id), gastos.filter(g => g.transacao_importada_id === t.id), ganhos.filter(g => g.transacao_importada_id === t.id), campos.desfazer_divisao_inteira === true, campos.desfazer_dependencias === true);
  }
  revisoesDasClassificacoes.set(t.id, (revisoesDasClassificacoes.get(t.id) ?? 0) + 1);
  return resposta;
}

/** Teste e desenvolvimento: registra uma sugestão de casamento (nada é aplicado até confirmar). */
// ---- Revisão da bolsa (061): propostas fictícias, confirmar em lote, desfazer e refazer ----------
type LigacaoDaRevisao = { id: string; operacao_ids: string[]; vinculos: { transacao_id: string; papel: string }[]; sem_aporte: boolean; proposta: import("../api/tipos").PropostaDeCasamento | null; movimentos: string[] };
let revisaoDaBolsaSemeada = false;
let propostasDaRevisao: import("../api/tipos").PropostaDeCasamento[] = [];
let semParDaRevisao: import("../api/tipos").ItemSemPar[] = [];
let ligacoesDaRevisao: LigacaoDaRevisao[] = [];
const CONTA_DA_REVISAO = "00000000-0000-4000-8000-0000000000a1";

function semearRevisaoDaBolsa(): void {
  if (revisaoDaBolsaSemeada) return;
  revisaoDaBolsaSemeada = true;
  const id = () => crypto.randomUUID();
  const operacao = (rotulo: string, quantidade: string, valor: string, data: string, custos = "0.00") => ({ id: id(), posicao_id: id(), rotulo, tipo: "COMPRA", data, quantidade, valor_bruto: valor, custos });
  const transacao = (descricao: string, valor: string, data: string, situacao: import("../api/tipos").SituacaoNaRevisao) => ({ id: id(), data, descricao, valor, situacao });
  const bruto = (pregao: string) => `LIQ BOLSA - VISTA BRUTO - PREGÃO: ${pregao}`;
  const taxa = (pregao: string) => `LIQ BOLSA - VISTA TX CCP/EMOL/TTA B3 - PREGÃO: ${pregao}`;
  const proposta = (tipo: "compra_na_bolsa", pregao: string, operacoes: ReturnType<typeof operacao>[], brutos: ReturnType<typeof transacao>[], taxas: ReturnType<typeof transacao>[], extra: { diferenca: string; diferenca_de_custo: string; confianca?: "exata" | "precisa_escolher"; motivo?: string }): import("../api/tipos").PropostaDeCasamento => {
    const chave = `chave-${id()}`;
    return {
      chave, versao: `versao-${chave}`, tipo, data_do_pregao: pregao, operacoes, bruto: brutos, taxas,
      diferenca: extra.diferenca, diferenca_de_custo: extra.diferenca_de_custo, confianca: extra.confianca ?? "exata", motivo: extra.motivo ?? null,
      efeitos: [...brutos, ...taxas].map(t => ({ transacao_id: t.id, codigo: (t.situacao === "pendente" ? "aceita_a_pendente" : taxas.includes(t) ? "taxa_deixa_de_ser_aporte" : "aporte_passa_a_ser_da_posicao") as import("../api/tipos").CodigoDeEfeito })),
    };
  };
  propostasDaRevisao = [
    proposta("compra_na_bolsa", "2026-11-03", [operacao("AUPO11", "25", "2789.30", "2026-11-03", "0.95")],
      [transacao(bruto("03/11/2026"), "2789.30", "2026-11-04", "aporte_sem_investimento")],
      [transacao(taxa("03/11/2026"), "0.62", "2026-11-04", "aporte_sem_investimento"), transacao(taxa("03/11/2026"), "0.13", "2026-11-04", "aporte_sem_investimento"), transacao(taxa("03/11/2026"), "0.07", "2026-11-04", "aporte_sem_investimento")],
      { diferenca: "0.00", diferenca_de_custo: "-0.13" }),
    proposta("compra_na_bolsa", "2026-10-27", [operacao("BBAS3", "1", "50.00", "2026-10-27"), operacao("ITUB4", "3", "92.05", "2026-10-27")],
      [transacao(bruto("27/10/2026"), "142.05", "2026-10-29", "pendente")], [], { diferenca: "0.00", diferenca_de_custo: "0.00" }),
    proposta("compra_na_bolsa", "2026-10-20", [operacao("VALE3", "2", "50.00", "2026-10-20"), operacao("PETR4", "2", "50.00", "2026-10-20")],
      [transacao(bruto("20/10/2026"), "50.00", "2026-10-22", "pendente")], [], { diferenca: "0.00", diferenca_de_custo: "0.00", confianca: "precisa_escolher", motivo: "Há mais de uma combinação possível de operações para este valor." }),
  ];
  semParDaRevisao = [{ motivo: "Nenhum lançamento corresponde a esta operação.", operacao_id: id(), transacao_id: null, descricao: "Compra de AUVP11 (3)", data: "2026-10-21", valor: "455.28" }];
  ligacoesDaRevisao = [{ id: id(), operacao_ids: [id()], vinculos: [{ transacao_id: id(), papel: "bruto" }], sem_aporte: true, proposta: null, movimentos: [] }];
}

function respostaDaRevisao(): RespostaSimulada {
  semearRevisaoDaBolsa();
  return { status: 200, corpo: {
    propostas: propostasDaRevisao,
    sem_par: semParDaRevisao,
    confirmados: ligacoesDaRevisao.map(l => ({ id: l.id, operacao_ids: l.operacao_ids, vinculos: l.vinculos, sem_aporte: l.sem_aporte })),
  } };
}

function criarMovimentosDaProposta(proposta: import("../api/tipos").PropostaDeCasamento, operacoes: import("../api/tipos").OperacaoNaProposta[], casamentoId: string): string[] {
  const referencia = proposta.bruto[0];
  return operacoes.map(o => {
    const movimento: MovimentoGuardado = {
      id: crypto.randomUUID(), usuario_id: donoAtual(), casamento_id: casamentoId, conta_id: CONTA_DA_REVISAO, investimento_id: o.posicao_id,
      tipo: proposta.tipo === "compra_na_bolsa" ? "aporte" : "resgate", origem: "open_finance", categoria: null, revisao_pendente: false,
      descricao: referencia.descricao, valor: reaisParaCentavos(o.valor_bruto), data: referencia.data, transacao_importada_id: referencia.id, partes: [],
    };
    movimentosSimulados.push(movimento);
    return movimento.id;
  });
}

function removerMovimentos(ids: string[]): void {
  movimentosSimulados = movimentosSimulados.filter(m => !ids.includes(m.id));
}

function confirmarRevisaoDaBolsa(requisicao: RequisicaoSimulada): RespostaSimulada {
  exigirDonoDaImportacao(requisicao);
  semearRevisaoDaBolsa();
  const campos = lerCorpo(requisicao.corpo);
  const itens = Array.isArray(campos.itens) ? campos.itens as Record<string, unknown>[] : [];
  if (itens.length < 1 || itens.length > 50) throw requisicaoInvalida([{ campo: "itens", mensagem: "A lista deve ter de 1 a 50 itens." }]);
  const escolhidas = itens.map(item => {
    const proposta = propostasDaRevisao.find(p => p.chave === item.chave && p.versao === item.versao);
    if (!proposta) throw new ErroSimulado(409, "revisao_desatualizada", "A revisão mudou desde que você a abriu. Confira de novo.");
    if (proposta.confianca === "exata") return { proposta, operacoes: proposta.operacoes };
    const ids = Array.isArray(item.operacao_ids) ? item.operacao_ids.map(String) : [];
    const operacoes = proposta.operacoes.filter(o => ids.includes(o.id));
    if (ids.length === 0 || operacoes.length !== ids.length) throw new ErroSimulado(409, "casamento_ambiguo", "Escolha as operações desta ligação.");
    return { proposta, operacoes };
  });
  const confirmados = escolhidas.map(({ proposta, operacoes }) => {
    const id = crypto.randomUUID();
    const movimentos = criarMovimentosDaProposta(proposta, operacoes, id);
    ligacoesDaRevisao.push({ id, operacao_ids: operacoes.map(o => o.id), vinculos: [...proposta.bruto.map(t => ({ transacao_id: t.id, papel: "bruto" })), ...proposta.taxas.map(t => ({ transacao_id: t.id, papel: "taxa" }))], sem_aporte: false, proposta, movimentos });
    propostasDaRevisao = propostasDaRevisao.filter(p => p !== proposta);
    return { casamento_id: id, chave: proposta.chave };
  });
  return { status: 201, corpo: { confirmados } };
}

function desfazerLigacaoDaRevisao(ligacao: LigacaoDaRevisao): void {
  removerMovimentos(ligacao.movimentos);
  ligacoesDaRevisao = ligacoesDaRevisao.filter(l => l !== ligacao);
  if (ligacao.proposta) propostasDaRevisao.push(ligacao.proposta);
}

function refazerLigacaoDaRevisao(requisicao: RequisicaoSimulada, idTexto: string): RespostaSimulada {
  exigirDonoDaImportacao(requisicao);
  semearRevisaoDaBolsa();
  const ligacao = ligacoesDaRevisao.find(l => l.id === idTexto);
  if (!ligacao) throw new ErroSimulado(404, "casamento_nao_encontrado", "Casamento não encontrado.");
  if (!ligacao.sem_aporte) throw new ErroSimulado(409, "movimento_nao_desfazivel", "Esta ligação já registrou aportes ou resgates: use Desfazer ligação.");
  const id = crypto.randomUUID();
  const proposta = ligacao.proposta;
  const operacoes = proposta ? proposta.operacoes : [{ id: ligacao.operacao_ids[0], posicao_id: crypto.randomUUID(), rotulo: "AUPO11", tipo: "COMPRA", data: "2026-10-01", quantidade: "1", valor_bruto: "100.00", custos: "0.00" }];
  const referencia = proposta ?? { tipo: "compra_na_bolsa", bruto: [{ id: ligacao.vinculos[0].transacao_id, descricao: "LIQ BOLSA - VISTA BRUTO - PREGÃO: 01/10/2026", data: "2026-10-02" }] };
  const movimentos = criarMovimentosDaProposta(referencia as import("../api/tipos").PropostaDeCasamento, operacoes, id);
  ligacoesDaRevisao = ligacoesDaRevisao.map(l => l === ligacao ? { ...l, id, sem_aporte: false, movimentos } : l);
  return { status: 200, corpo: { casamento_id: id, chave: proposta?.chave ?? id } };
}

/** `DELETE /casamentos/{id}`: as transações voltam a pendentes; nada é apagado. */
function desfazerCasamentoSimulado(idTexto: string): RespostaSimulada {
  const daRevisao = ligacoesDaRevisao.find(l => l.id === idTexto);
  if (daRevisao) { desfazerLigacaoDaRevisao(daRevisao); return { status: 204 }; }
  const casamento = casamentosSimulados.find(c => c.id === idTexto);
  if (!casamento) throw new ErroSimulado(404, "casamento_nao_encontrado", "Casamento não encontrado.");
  for (const v of casamento.vinculos) { const t = transacoesImportadas.find(x => x.id === v.transacao_id); if (t) t.estado = "pendente"; }
  casamentosSimulados = casamentosSimulados.filter(c => c !== casamento);
  return { status: 204 };
}

/** `POST /transacoes-importadas/{id}/reclassificar`: desfaz a classificação atual e aplica a nova. */
function reclassificarImportada(requisicao: RequisicaoSimulada, idTexto: string): RespostaSimulada {
  exigirDonoDaImportacao(requisicao);
  const campos = lerCorpo(requisicao.corpo);
  const rotulo = String(campos.rotulo ?? "");
  const rotulos = ["gasto", "ganho", "transferencia_para_investimento", "imposto", "custo", "rendimento_da_posicao"];
  if (!rotulos.includes(rotulo)) throw new ErroSimulado(422, "transacao_importada_invalida", "Escolha um rótulo válido para a transação.");
  if (["imposto", "custo", "rendimento_da_posicao"].includes(rotulo) && !campos.investimento_id) throw new ErroSimulado(422, "transacao_importada_invalida", "Escolha o investimento desta operação.");
  desfazerImportada({ ...requisicao, corpo: JSON.stringify({ versao_esperada: campos.versao_esperada, desfazer_divisao_inteira: campos.desfazer_divisao_inteira === true, desfazer_dependencias: campos.desfazer_dependencias === true }) }, idTexto);
  const comoMovimento = ["transferencia_para_investimento", "imposto", "custo", "rendimento_da_posicao"].includes(rotulo);
  const tipo = rotulo === "rendimento_da_posicao" ? "rendimento" : rotulo === "imposto" ? "imposto" : rotulo === "custo" ? "custo" : undefined;
  const resultado = aceitarUma({ ...(comoMovimento ? { como_investimento: true, investimento_id: campos.investimento_id ?? undefined } : {}), ...(tipo ? { tipo_de_movimento: tipo } : {}), ...(campos.movimento_relacionado_id ? { movimento_relacionado_id: campos.movimento_relacionado_id } : {}), tags: [] }, idTexto);
  return { status: 200, corpo: resultado };
}

/** `DELETE /movimentos-de-investimento/{id}`: só o saldo inicial se desfaz. */
function desfazerSaldoInicial(idTexto: string): RespostaSimulada {
  const posicao = movimentosSimulados.findIndex((m) => m.id === normalizarUuid(idTexto));
  if (posicao < 0) {
    throw new ErroSimulado(404, "movimento_de_investimento_nao_encontrado", "Movimento não encontrado.");
  }
  const movimento = movimentosSimulados[posicao];
  if (movimento.origem !== "saldo_inicial") {
    throw new ErroSimulado(409, "movimento_nao_desfazivel", "Só o saldo inicial pode ser desfeito.");
  }
  const principais = principaisDoInvestimento(movimento.investimento_id as string);
  for (const parte of movimento.partes) {
    if ((principais.get(parte.tag) ?? 0n) < parte.valor) {
      throw principalInsuficiente(
        `Não dá para desfazer: a destinação «${parte.tag}» já não tem esse valor (uma realocação ou um resgate o usou).`,
      );
    }
  }
  movimentosSimulados.splice(posicao, 1);
  return { status: 204 };
}

// --- autenticação --------------------------------------------------------------

/** Usuário de exemplo da simulação (documentado no frontend/.env.example; não é segredo). */
const USUARIO_DE_EXEMPLO: Usuario = {
  id: "5b0c3e8a-2f4d-4c1b-9a7e-3d2f1e0c9b8a",
  email: "voce@exemplo.com",
  nome: "Você",
};
const SENHA_DE_EXEMPLO = "senha-de-exemplo-123";
// Política de senha e de nome do backend (domain/senha.py e Usuario).
const TAMANHO_MINIMO_DA_SENHA = 10;
const TAMANHO_MAXIMO_DA_SENHA = 128;

// Os números do backend: GASTOBA_DURACAO_DA_SESSAO_HORAS e GASTOBA_TENTATIVAS_DE_LOGIN
// (padrões 12 e 5) e JANELA_DE_TENTATIVAS_DE_LOGIN (15 min) em api/app.py.
const DURACAO_DA_SESSAO_MS = 12 * 60 * 60 * 1000;
const LIMITE_DE_TENTATIVAS = 5;
const JANELA_DE_TENTATIVAS_MS = 15 * 60 * 1000;
/** A simulação tem um só cliente; no backend, a chave é o IP de quem chama. */
const CHAVE_DA_ORIGEM = "origem:simulacao";

const CABECALHO_ANTI_CSRF = "X-Gastoba-Requisicao";
const METODOS_DE_LEITURA = new Set(["GET", "HEAD", "OPTIONS"]);
const TAMANHO_MAXIMO_DO_NOME_DA_CHAVE = 60;
const TAMANHO_MINIMO_DO_EMAIL = 3;
const TAMANHO_MAXIMO_DO_EMAIL = 254;

const naoAutenticado = () =>
  new ErroSimulado(401, "nao_autenticado", "Credencial ausente, inválida ou expirada.");
const credenciaisInvalidas = () =>
  new ErroSimulado(401, "credenciais_invalidas", "E-mail ou senha incorretos.");

/** Token da sessão → instante (ms) em que expira. */
let sessoes = new Map<string, number>();
/** Token da sessão → a pessoa dona dela. */
let donosDasSessoes = new Map<string, Usuario>();
/** Quem se cadastrou na simulação (e-mail normalizado → pessoa e senha). Os dados de contas e gastos são compartilhados: a simulação não isola pessoas. */
let cadastrados = new Map<string, { usuario: Usuario; senha: string }>();
/** O cookie `gastoba_sessao` que o "navegador" guardou. */
let cookieDaSessao: string | null = null;
/** Instantes (ms) das tentativas de entrar, por chave (e-mail e origem). */
let tentativas = new Map<string, number[]>();

type ChaveGuardada = ChaveDeApi & { criadaEmMs: number; revogada: boolean };
let chaves: ChaveGuardada[] = [];

/** Texto aleatório em base64 url-safe, como o `secrets.token_urlsafe(32)` do backend. */
function aleatorio(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

const ALFABETO_DO_PREFIXO = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function prefixoAleatorio(): string {
  return [...crypto.getRandomValues(new Uint8Array(8))]
    .map((byte) => ALFABETO_DO_PREFIXO[byte % ALFABETO_DO_PREFIXO.length])
    .join("");
}

/** `Email.de_texto` do backend: o e-mail normalizado, ou `null` se o formato for inválido. */
function emailNormalizado(texto: string): string | null {
  const email = aparar(texto).toLowerCase();
  const tamanho = [...email].length;
  if (tamanho < TAMANHO_MINIMO_DO_EMAIL || tamanho > TAMANHO_MAXIMO_DO_EMAIL) return null;
  const arroba = email.indexOf("@");
  if (arroba <= 0 || arroba === email.length - 1 || email.includes("@", arroba + 1)) return null;
  if (/[\p{C}\p{Z}\s]/u.test(email)) return null;
  return email;
}

/** Espera (ms) até a chave aceitar outra tentativa; esquece as mais antigas que a janela. */
function esperaDaChave(chave: string, agora: number): number {
  const instantes = tentativas.get(chave);
  if (!instantes) return 0;
  while (instantes.length > 0 && instantes[0] <= agora - JANELA_DE_TENTATIVAS_MS) instantes.shift();
  if (instantes.length < LIMITE_DE_TENTATIVAS) return 0;
  return instantes[0] + JANELA_DE_TENTATIVAS_MS - agora;
}

/** `LimitadorDeTentativasEmMemoria.registrar_tentativa`: 429 acima do limite, senão conta. */
function registrarTentativa(chavesDoLimite: readonly string[]): void {
  const agora = Date.now();
  const espera = Math.max(0, ...chavesDoLimite.map((chave) => esperaDaChave(chave, agora)));
  if (espera > 0) {
    const segundos = Math.max(1, Math.ceil(espera / 1000));
    throw new ErroSimulado(
      429,
      "muitas_tentativas",
      "Muitas tentativas de entrar. Tente de novo mais tarde.",
      undefined,
      { "Retry-After": String(segundos) },
    );
  }
  for (const chave of chavesDoLimite) {
    const instantes = tentativas.get(chave) ?? [];
    instantes.push(agora);
    if (instantes.length > LIMITE_DE_TENTATIVAS) instantes.shift();
    tentativas.set(chave, instantes);
  }
}

function abrirSessao(dono: Usuario = USUARIO_DE_EXEMPLO): Sessao {
  const token = `gsess_${aleatorio()}`;
  const expiraEm = Date.now() + DURACAO_DA_SESSAO_MS;
  sessoes.set(token, expiraEm);
  donosDasSessoes.set(token, dono);
  return { token, expira_em: new Date(expiraEm).toISOString() };
}

/**
 * `obter_autenticacao` do backend, só com o cookie: 401 sem sessão ativa e, numa
 * escrita, 403 sem o cabeçalho anti-CSRF. Devolve o token da sessão.
 */
function autenticar(requisicao: RequisicaoSimulada): string {
  const token = requisicao.enviaCookie ? cookieDaSessao : null;
  const expiraEm = token === null ? undefined : sessoes.get(token);
  if (token === null || expiraEm === undefined || Date.now() >= expiraEm) throw naoAutenticado();
  if (
    !METODOS_DE_LEITURA.has(requisicao.metodo) &&
    requisicao.cabecalhos.get(CABECALHO_ANTI_CSRF) !== "1"
  ) {
    throw new ErroSimulado(
      403,
      "requisicao_invalida_origem",
      `Requisição com cookie sem o cabeçalho ${CABECALHO_ANTI_CSRF}.`,
    );
  }
  return token;
}

function entrar(requisicao: RequisicaoSimulada): RespostaSimulada {
  const validacao = new Validacao("body", lerCorpo(requisicao.corpo));
  const email = validacao.texto("email") as string;
  const senha = validacao.texto("senha") as string;
  validacao.conferir();

  const normalizado = emailNormalizado(email);
  const chaveDoEmail = normalizado === null ? null : `email:${normalizado}`;
  registrarTentativa(chaveDoEmail === null ? [CHAVE_DA_ORIGEM] : [chaveDoEmail, CHAVE_DA_ORIGEM]);
  const conhecido =
    normalizado === USUARIO_DE_EXEMPLO.email
      ? { usuario: USUARIO_DE_EXEMPLO, senha: SENHA_DE_EXEMPLO }
      : cadastrados.get(normalizado ?? "");
  if (conhecido === undefined || senha !== conhecido.senha) throw credenciaisInvalidas();

  // Sucesso: o e-mail volta a ter todas as tentativas; a origem só não perde esta.
  if (chaveDoEmail !== null) tentativas.delete(chaveDoEmail);
  tentativas.get(CHAVE_DA_ORIGEM)?.pop();
  const sessao = abrirSessao(conhecido.usuario);
  // Sem `credentials: "include"`, o navegador descarta o Set-Cookie.
  if (requisicao.enviaCookie) cookieDaSessao = sessao.token;
  return { status: 200, corpo: sessao };
}

/** `POST /auth/cadastro` (aberto na simulação): nome, e-mail e senha no formato do backend. */
function cadastrar(requisicao: RequisicaoSimulada): RespostaSimulada {
  const validacao = new Validacao("body", lerCorpo(requisicao.corpo));
  const nome = validacao.texto("nome") as string;
  const email = validacao.texto("email") as string;
  const senha = validacao.texto("senha") as string;
  validacao.conferir();

  const nomeAparado = aparar(nome);
  if (nomeAparado === "" || [...nomeAparado].length > TAMANHO_MAXIMO_DO_NOME) {
    throw new ErroSimulado(422, "nome_invalido", "O nome precisa ter de 1 a 100 caracteres.");
  }
  const normalizado = emailNormalizado(email);
  if (normalizado === null) {
    throw new ErroSimulado(422, "email_invalido", "O e-mail informado não é válido.");
  }
  const tamanhoDaSenha = [...senha].length;
  if (tamanhoDaSenha < TAMANHO_MINIMO_DA_SENHA || tamanhoDaSenha > TAMANHO_MAXIMO_DA_SENHA) {
    throw new ErroSimulado(
      422,
      "senha_invalida",
      `A senha precisa ter de ${TAMANHO_MINIMO_DA_SENHA} a ${TAMANHO_MAXIMO_DA_SENHA} caracteres.`,
    );
  }
  if (normalizado === USUARIO_DE_EXEMPLO.email || cadastrados.has(normalizado)) {
    throw new ErroSimulado(409, "email_ja_cadastrado", "Já existe um usuário com este e-mail.");
  }
  const usuario: Usuario = { id: crypto.randomUUID(), email: normalizado, nome: nomeAparado };
  cadastrados.set(normalizado, { usuario, senha });
  return { status: 201, corpo: { ...usuario } };
}

function sair(requisicao: RequisicaoSimulada): RespostaSimulada {
  const token = autenticar(requisicao);
  sessoes.delete(token);
  donosDasSessoes.delete(token);
  cookieDaSessao = null;
  return { status: 204 };
}

function chaveResposta(chave: ChaveGuardada): ChaveDeApi {
  return {
    id: chave.id,
    nome: chave.nome,
    prefixo: chave.prefixo,
    escopo: chave.escopo,
    criada_em: chave.criada_em,
    ultimo_uso: chave.ultimo_uso,
    expira_em: chave.expira_em,
  };
}

function criarChave(corpoTexto: string | null): RespostaSimulada {
  const validacao = new Validacao("body", lerCorpo(corpoTexto));
  const nomeTexto = validacao.texto("nome") as string;
  const escopo = validacao.escopo("escopo") as EscopoDaChave;
  const expiraEm = validacao.instanteOpcional("expira_em") as InstanteLido | null;
  validacao.conferir();

  // Mesma ordem das regras da entidade ChaveDeApi.
  const nome = aparar(nomeTexto);
  if (nome === "") {
    throw new ErroSimulado(422, "nome_de_chave_invalido", "O nome da chave de API não pode ser vazio.");
  }
  if ([...nome].length > TAMANHO_MAXIMO_DO_NOME_DA_CHAVE) {
    throw new ErroSimulado(
      422,
      "nome_de_chave_invalido",
      `O nome da chave de API deve ter no máximo ${TAMANHO_MAXIMO_DO_NOME_DA_CHAVE} caracteres.`,
    );
  }
  const agora = Date.now();
  if (expiraEm !== null && !expiraEm.comFuso) {
    throw new ErroSimulado(
      422,
      "expiracao_invalida",
      "A expiração da chave de API precisa ter fuso horário.",
    );
  }
  if (expiraEm !== null && expiraEm.ms <= agora) {
    throw new ErroSimulado(
      422,
      "expiracao_invalida",
      "A chave de API precisa expirar depois de ser criada.",
    );
  }

  const prefixo = prefixoAleatorio();
  const chave: ChaveGuardada = {
    id: crypto.randomUUID(),
    nome,
    prefixo,
    escopo,
    criada_em: new Date(agora).toISOString(),
    ultimo_uso: null,
    expira_em: expiraEm === null ? null : new Date(expiraEm.ms).toISOString(),
    criadaEmMs: agora,
    revogada: false,
  };
  chaves.push(chave);
  const criada: ChaveDeApiCriada = { ...chaveResposta(chave), segredo: `gapi_${prefixo}_${aleatorio()}` };
  return { status: 201, corpo: criada };
}

function listarChaves(): RespostaSimulada {
  const ativas = chaves
    .filter((chave) => !chave.revogada)
    .sort((a, b) => b.criadaEmMs - a.criadaEmMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { status: 200, corpo: ativas.map(chaveResposta) };
}

function revogarChave(idTexto: string): RespostaSimulada {
  const validacao = new Validacao("path", { chave_id: idTexto });
  const id = validacao.uuid("chave_id") as string;
  validacao.conferir();

  const chave = chaves.find((candidata) => candidata.id === id);
  if (!chave || chave.revogada) {
    throw new ErroSimulado(404, "chave_de_api_nao_encontrada", "Chave de API não encontrada.");
  }
  chave.revogada = true;
  return { status: 204 };
}

// --- entrada -------------------------------------------------------------------

type Rota = {
  metodo: string;
  padrao: RegExp;
  /** Pública: não exige sessão (`POST /auth/entrar` e `POST /auth/cadastro`). */
  publica?: boolean;
  manipular: (requisicao: RequisicaoSimulada, parametroDoCaminho: string) => RespostaSimulada;
};


type TransferenciaGuardada = import("../api/tipos").TransferenciaEntreContas & { usuario_id: string; ativa: boolean };
let transferenciasSimuladas: TransferenciaGuardada[] = [];
function transferenciaResposta(t: TransferenciaGuardada): import("../api/tipos").TransferenciaEntreContas {
 const { usuario_id: _usuario, ativa: _ativa, ...resposta } = t;
 return resposta;
}
function papelDaContaSimulado(r: RequisicaoSimulada, id: string): RespostaSimulada {
 const conta = encontrarConta(normalizarUuid(id) ?? "");
 const papel = lerCorpo(r.corpo).papel;
 if (papel !== "corrente" && papel !== "investimento") throw requisicaoInvalida([{campo:"body.papel",mensagem:"Escolha corrente ou investimento."}]);
 if (conta.tipo === "cartao") throw new ErroSimulado(422, "transacao_importada_invalida", "Cartão não é conta de investimento.");
 conta.papel = papel;
 return { status: 200, corpo: contaResposta(conta) };
}
function pontaDaTransferencia(id: string): TransacaoImportadaGuardada {
 const t = transacoesImportadas.find(t => t.id === normalizarUuid(id));
 if (!t) throw new ErroSimulado(404,"transacao_importada_nao_encontrada","Transação importada não encontrada.");
 encontrarConta(t.conta_id);
 if (t.estado === "aceita") throw new ErroSimulado(422,"transacao_importada_invalida","Esta transação já está classificada.");
 return t;
}
function montarTransferenciaSimulada(t: TransacaoImportadaGuardada, contraparte: string, par?: TransacaoImportadaGuardada): TransferenciaGuardada {
 const conta = encontrarConta(t.conta_id), outra = encontrarConta(contraparte);
 if (conta.id === outra.id || !conta.papel || !outra.papel || conta.tipo === "cartao" || outra.tipo === "cartao" || !saldoEDoBanco(conta) || !saldoEDoBanco(outra)) throw new ErroSimulado(422,"transacao_importada_invalida","Confirme duas contas bancárias distintas e os seus papéis.");
 if (par && (par.conta_id !== outra.id || par.sentido === t.sentido || par.valor !== t.valor)) throw new ErroSimulado(422,"transacao_importada_invalida","Confira valor, sentido e conta do par.");
 const [origem, destino] = t.sentido === "saida" ? [conta, outra] : [outra, conta];
 const [saida, entrada] = t.sentido === "saida" ? [t, par] : [par, t];
 const pontaInvestimento = destino.papel === "investimento" ? entrada : saida;
 const liquido = origem.papel === destino.papel ? 0n : destino.papel === "investimento" ? t.valor : -t.valor;
 return { id: crypto.randomUUID(), usuario_id: donoAtual(), ativa: true, conta_origem_id: origem.id, conta_destino_id: destino.id,
  papel_origem: origem.papel!, papel_destino: destino.papel!, valor: deCentavos(t.valor), data: pontaInvestimento?.data ?? t.data,
  aporte_liquido: deCentavos(liquido), transacao_origem_id: saida?.id ?? null, transacao_destino_id: entrada?.id ?? null, competencia_provisoria: !pontaInvestimento };
}
function classificarTransferenciaSimulada(r: RequisicaoSimulada, id: string): RespostaSimulada {
 exigirDonoDaImportacao(r);
 const campos = lerCorpo(r.corpo), v = new Validacao("body", campos);
 const contraparte = v.uuid("conta_contraparte_id");
 const parId = campos.par_transacao_id == null ? undefined : v.uuid("par_transacao_id"); v.conferir();
 const t = pontaDaTransferencia(id), par = parId ? pontaDaTransferencia(parId) : undefined;
 const nova = montarTransferenciaSimulada(t, contraparte!, par);
 t.estado = "aceita"; if (par) par.estado = "aceita";
 transferenciasSimuladas.push(nova);
 return { status: 200, corpo: transferenciaResposta(nova) };
}
function listarTransferenciasSimuladas(r: RequisicaoSimulada): RespostaSimulada {
 exigirDonoDaImportacao(r);
 const { inicio, fim } = periodoDaConsulta(r.parametros);
 return { status: 200, corpo: transferenciasSimuladas.filter(t => t.usuario_id === donoAtual() && t.ativa && t.data >= inicio && t.data <= fim).map(transferenciaResposta) };
}
function completarParSimulado(r: RequisicaoSimulada, id: string): RespostaSimulada {
 exigirDonoDaImportacao(r);
 const t = transferenciasSimuladas.find(t => t.id === normalizarUuid(id) && t.ativa && t.usuario_id === donoAtual());
 if (!t || (t.transacao_origem_id && t.transacao_destino_id)) throw new ErroSimulado(422,"transacao_importada_invalida","Transferência sem ponta disponível.");
 const v = new Validacao("body", lerCorpo(r.corpo)), parId = v.uuid("transacao_id"); v.conferir();
 const nova = pontaDaTransferencia(parId!);
 const existente = transacoesImportadas.find(p => p.id === (t.transacao_origem_id ?? t.transacao_destino_id))!;
 const completa = montarTransferenciaSimulada(existente, t.transacao_origem_id ? t.conta_destino_id : t.conta_origem_id, nova);
 Object.assign(t, completa, { id: t.id }); nova.estado = "aceita";
 return { status: 200, corpo: transferenciaResposta(t) };
}


type ReferenciaGuardada = { saldo_inicial: string; saldo_final: string; periodo_completo: boolean };
let referenciasDeCaixinhas = new Map<string, ReferenciaGuardada>();
function definirCaixinhaSimulada(r: RequisicaoSimulada): RespostaSimulada {
 exigirDonoDaImportacao(r);
 const campos = lerCorpo(r.corpo), v = new Validacao("body", campos);
 const contaId = v.uuid("conta_id"), saldoTexto = v.texto("saldo_remunerado"), data = v.data("data_do_saldo"); v.conferir();
 const conta = encontrarConta(contaId!), saldo = reaisParaCentavos(saldoTexto!);
 if (!saldoEDoBanco(conta) || saldo < 0n) throw new ErroSimulado(422,"transacao_importada_invalida","Confirme uma conta bancária e saldo de investimentos não negativo.");
 let inv = investimentosSimulados.find(i => i.tipo === "CAIXINHA" && i.conta_id === conta.id);
 if (!inv) {
  const id = adicionarInvestimentoSimulado({ nome: `Conta investimentos (${conta.nome})`, tipo: "CAIXINHA", saldo: saldoTexto! });
  inv = investimentosSimulados.find(i => i.id === id)!; inv.conta_id = conta.id;
  historicoSimulado = historicoSimulado.filter(h => h.investimento_id !== id);
 }
 const ultimo = historicoSimulado.filter(h => h.investimento_id === inv.id).sort((a, b) => b.data.localeCompare(a.data))[0];
 if (ultimo && ultimo.data > data!) throw new ErroSimulado(422,"transacao_importada_invalida","O saldo informado é anterior ao último saldo observado.");
 conta.tipo = "remunerada";
 inv.saldo = saldo;
 historicoSimulado = historicoSimulado.filter(h => h.investimento_id !== inv.id || h.data !== data);
 historicoSimulado.push({ investimento_id: inv.id, data: data!, saldo });
 return { status: 200, corpo: { id: inv.id, nome: inv.nome, saldo: deCentavos(saldo) } };
}
function referenciaDaCaixinhaSimulada(r: RequisicaoSimulada, idTexto: string): RespostaSimulada {
 exigirDonoDaImportacao(r);
 const [id, mes] = idTexto.split("/");
 const inv = investimentosSimulados.find(i => i.id === normalizarUuid(id) && (i.usuario_id ?? USUARIO_DE_EXEMPLO.id) === donoAtual());
 if (!inv) throw investimentoNaoEncontrado();
 if (inv.tipo !== "CAIXINHA") throw new ErroSimulado(422,"transacao_importada_invalida","Escolha a conta investimentos.");
 mesValido(mes);
 const campos = lerCorpo(r.corpo), v = new Validacao("body", campos);
 const inicial = v.texto("saldo_inicial"), final = v.texto("saldo_final"); v.conferir();
 if (typeof campos.periodo_completo !== "boolean") throw requisicaoInvalida([{campo:"body.periodo_completo",mensagem:"Confirme a completude do período."}]);
 if (reaisParaCentavos(inicial!) < 0n || reaisParaCentavos(final!) < 0n) throw valorInvalido("Saldo não pode ser negativo.");
 const referencia = { saldo_inicial: inicial!, saldo_final: final!, periodo_completo: campos.periodo_completo };
 referenciasDeCaixinhas.set(`${id}:${mes}`, referencia);
 return { status: 200, corpo: { investimento_id: id, mes, ...referencia } };
}
function reconciliarCaixinhaSimulada(r: RequisicaoSimulada, id: string): RespostaSimulada {
 exigirDonoDaImportacao(r);
 const inv = investimentosSimulados.find(i => i.id === normalizarUuid(id) && (i.usuario_id ?? USUARIO_DE_EXEMPLO.id) === donoAtual());
 if (!inv) throw investimentoNaoEncontrado();
 const mes = r.parametros.get("mes") ?? "", { inicio, fim } = mesValido(mes);
 const referencia = referenciasDeCaixinhas.get(`${id}:${mes}`);
 if (!referencia || inv.tipo !== "CAIXINHA") throw new ErroSimulado(422,"transacao_importada_invalida","Informe os saldos inicial e final do extrato mensal da caixinha.");
 const movimentos = movimentosSimulados.filter(m => m.investimento_id === id && m.data >= inicio && m.data <= fim && m.origem !== "saldo_inicial");
 const saldo = movimentos.reduce((s, m) => s + (m.tipo === "aporte" || m.tipo === "rendimento" ? m.valor : -m.valor), reaisParaCentavos(referencia.saldo_inicial));
 const diferenca = reaisParaCentavos(referencia.saldo_final) - saldo;
 const completo = referencia.periodo_completo && !transacoesImportadas.some(t => t.conta_id === inv.conta_id && t.estado === "pendente" && t.data >= inicio && t.data <= fim);
 return { status: 200, corpo: { saldo_inicial: referencia.saldo_inicial, saldo_observado: referencia.saldo_final, saldo_calculado: deCentavos(saldo), diferenca: deCentavos(diferenca), completo, conciliado: completo && diferenca === 0n } };
}

const ROTAS: readonly Rota[] = [
  { metodo: "POST", padrao: /^\/auth\/entrar$/, publica: true, manipular: entrar },
  { metodo: "POST", padrao: /^\/auth\/cadastro$/, publica: true, manipular: cadastrar },
  {
    metodo: "GET",
    padrao: /^\/auth\/eu$/,
    manipular: (requisicao) => ({
      status: 200,
      corpo: {
        ...donoDaRequisicao(requisicao),
        importacao_bancaria: ehDonoDaImportacao(donoDaRequisicao(requisicao)),
        gestao_de_investimentos: ehDonoDaImportacao(donoDaRequisicao(requisicao)) || investimentosSimulados.some((i) => i.usuario_id === donoDaRequisicao(requisicao).id) || movimentosSimulados.some((m) => m.usuario_id === donoDaRequisicao(requisicao).id),
      },
    }),
  },
  { metodo: "POST", padrao: /^\/auth\/sair$/, manipular: sair },
  { metodo: "GET", padrao: /^\/chaves-de-api$/, manipular: listarChaves },
  { metodo: "POST", padrao: /^\/chaves-de-api$/, manipular: (requisicao) => criarChave(requisicao.corpo) },
  { metodo: "DELETE", padrao: /^\/chaves-de-api\/([^/]+)$/, manipular: (_requisicao, id) => revogarChave(id) },
  { metodo: "POST", padrao: /^\/contas$/, manipular: (requisicao) => criarConta(requisicao.corpo) },
  { metodo: "POST", padrao: /^\/caixinhas$/, manipular: definirCaixinhaSimulada },
  { metodo: "PUT", padrao: /^\/investimentos\/([^/]+\/referencias-da-caixinha\/[^/]+)$/, manipular: (r, trecho) => { const [id, , mes] = trecho.split("/"); return referenciaDaCaixinhaSimulada(r, `${id}/${mes}`); } },
  { metodo: "GET", padrao: /^\/investimentos\/([^/]+)\/reconciliacao$/, manipular: reconciliarCaixinhaSimulada },
  { metodo: "PUT", padrao: /^\/contas\/([^/]+)\/papel$/, manipular: papelDaContaSimulado },
  { metodo: "POST", padrao: /^\/transacoes-importadas\/([^/]+)\/aceitar-como-transferencia$/, manipular: classificarTransferenciaSimulada },
  { metodo: "GET", padrao: /^\/transferencias-entre-contas$/, manipular: listarTransferenciasSimuladas },
  { metodo: "POST", padrao: /^\/transferencias-entre-contas\/([^/]+)\/completar-par$/, manipular: completarParSimulado },
  { metodo: "GET", padrao: /^\/contas$/, manipular: listarContas },
  { metodo: "DELETE", padrao: /^\/contas\/([^/]+)$/, manipular: (_requisicao, id) => excluirConta(id) },
  { metodo: "POST", padrao: /^\/gastos$/, manipular: (requisicao) => registrarGasto(requisicao.corpo) },
  { metodo: "GET", padrao: /^\/gastos$/, manipular: (requisicao) => listarGastos(requisicao.parametros) },
  { metodo: "POST", padrao: /^\/ganhos$/, manipular: (requisicao) => registrarGanho(requisicao.corpo) },
  { metodo: "GET", padrao: /^\/ganhos$/, manipular: (requisicao) => listarGanhos(requisicao.parametros) },
  { metodo: "DELETE", padrao: /^\/ganhos\/([^/]+)$/, manipular: (_requisicao, id) => excluirGanho(id) },
  {
    metodo: "GET",
    padrao: /^\/transacoes-importadas$/,
    manipular: (requisicao) => listarTransacoesImportadas(requisicao),
  },
  {
    metodo: "POST",
    padrao: /^\/transacoes-importadas\/([^/]+)\/aceitar$/,
    manipular: (requisicao, id) => aceitarTransacaoImportada(requisicao, id),
  },
  {
    metodo: "POST",
    padrao: /^\/transacoes-importadas\/([^/]+)\/dividir$/,
    manipular: (requisicao, id) => dividirTransacao(requisicao, id),
  },
  {
    metodo: "POST",
    padrao: /^\/transacoes-importadas\/aceitar-em-lote$/,
    manipular: (requisicao) => aceitarEmLote(requisicao),
  },
  {
    metodo: "POST",
    padrao: /^\/transacoes-importadas\/([^/]+)\/ignorar$/,
    manipular: (requisicao, id) => ignorarTransacaoImportada(requisicao, id),
  },
  {
    metodo: "POST",
    padrao: /^\/transacoes-importadas\/([^/]+)\/restaurar$/,
    manipular: (requisicao, id) => restaurarTransacaoImportada(requisicao, id),
  },
  {
    metodo: "POST",
    padrao: /^\/sincronizacoes$/,
    manipular: (requisicao) => sincronizarContasBancarias(requisicao),
  },
  { metodo: "GET", padrao: /^\/investimentos$/, manipular: listarInvestimentos },
  { metodo: "GET", padrao: /^\/investimentos\/resumo$/, manipular: (requisicao) => resumirInvestimentos(requisicao.parametros) },
  { metodo: "GET", padrao: /^\/investimentos\/historico$/, manipular: (requisicao) => historicoDeInvestimentos(requisicao.parametros) },
  { metodo: "POST", padrao: /^\/investimentos\/([^/]+)\/alocar-sem-caixinha$/, manipular: (r, id) => alocarSemCaixinhaSimulado(id, r.corpo) },
  { metodo: "GET", padrao: /^\/aportes-sem-investimento$/, manipular: () => aportesSemInvestimentoSimulados() },
  { metodo: "POST", padrao: /^\/aportes-sem-investimento\/([^/]+\/(?:mesclar|excluir|desfazer))$/, manipular: (r, trecho) => { const [id, acao] = trecho.split("/"); return tratarAporteSimulado(id, acao, r.corpo); } },
  { metodo: "GET", padrao: /^\/casamentos$/, manipular: () => ({ status: 200, corpo: casamentosSimulados.filter(c => c.vinculos.every(v => transacoesImportadas.some(t => t.id === v.transacao_id && (contas.find(a => a.id === t.conta_id)?.usuario_id ?? USUARIO_DE_EXEMPLO.id) === donoAtual()))) }) },
  { metodo: "GET", padrao: /^\/investimentos\/([^/]+)\/operacoes$/, manipular: (_r, id) => listarOperacoesSimuladas(id) },
  { metodo: "POST", padrao: /^\/investimentos\/([^/]+)\/operacoes$/, manipular: (r, id) => salvarOperacaoSimulada(id, r.corpo) },
  { metodo: "PUT", padrao: /^\/operacoes\/([^/]+)$/, manipular: (r, id) => salvarOperacaoSimulada(id, r.corpo, true) },
  { metodo: "DELETE", padrao: /^\/operacoes\/([^/]+)$/, manipular: (_r, id) => excluirOperacaoSimulada(id) },
  { metodo: "GET", padrao: /^\/investimentos\/([^/]+)\/realocacoes$/, manipular: (_requisicao, id) => listarRealocacoes(id) },
  { metodo: "POST", padrao: /^\/investimentos\/([^/]+)\/destinacoes$/, manipular: (requisicao, id) => definirDestinacoesIniciais(id, requisicao.corpo) },
  { metodo: "POST", padrao: /^\/investimentos\/([^/]+)\/realocacoes$/, manipular: (requisicao, id) => realocarDestinacao(id, requisicao.corpo) },
  { metodo: "GET", padrao: /^\/reaplicacoes-de-resgates$/, manipular: () => ({status:200,corpo:reaplicacoesSimuladas.filter(r=>r.usuario_id===donoAtual()).map(({usuario_id:_dono,...r})=>r)}) },
  { metodo: "POST", padrao: /^\/reaplicacoes-de-resgates$/, manipular: r => confirmarReaplicacaoSimulada(r.corpo) },
  { metodo: "DELETE", padrao: /^\/reaplicacoes-de-resgates\/([^/]+)$/, manipular: (_r,id) => removerReaplicacaoSimulada(id) },
  { metodo: "GET", padrao: /^\/movimentos-de-investimento\/([^/]+)\/resgates-para-reaplicar$/, manipular: (_r,id) => candidatosDaReaplicacao(id) },
  { metodo: "GET", padrao: /^\/movimentos-de-investimento$/, manipular: (requisicao) => listarMovimentosDeInvestimento(requisicao.parametros) },
  { metodo: "DELETE", padrao: /^\/investimentos\/([^/]+\/realocacoes\/[^/]+)$/, manipular: (_requisicao, caminho) => desfazerRealocacao(...(caminho.split("/realocacoes/") as [string, string])) },
  { metodo: "GET", padrao: /^\/transacoes-importadas\/([^/]+)\/impacto-da-reversao$/, manipular: (r, id) => previaDaReversao(r, id) },
  { metodo: "POST", padrao: /^\/transacoes-importadas\/([^/]+)\/desfazer-classificacao$/, manipular: (r, id) => desfazerImportada(r, id) },
  { metodo: "POST", padrao: /^\/transacoes-importadas\/([^/]+)\/reclassificar$/, manipular: (r, id) => reclassificarImportada(r, id) },
  { metodo: "GET", padrao: /^\/revisao-da-bolsa$/, manipular: (r) => { exigirDonoDaImportacao(r); return respostaDaRevisao(); } },
  { metodo: "POST", padrao: /^\/revisao-da-bolsa\/confirmar$/, manipular: confirmarRevisaoDaBolsa },
  { metodo: "POST", padrao: /^\/casamentos\/([^/]+)\/refazer$/, manipular: (r, id) => refazerLigacaoDaRevisao(r, id) },
  { metodo: "DELETE", padrao: /^\/casamentos\/([^/]+)$/, manipular: (_r, id) => desfazerCasamentoSimulado(id) },
  { metodo: "POST", padrao: /^\/movimentos-de-investimento\/([^/]+)\/desfazer-classificacao$/, manipular: (requisicao, id) => desfazerClassificacao(requisicao, id) },
  { metodo: "DELETE", padrao: /^\/movimentos-de-investimento\/([^/]+)$/, manipular: (_requisicao, id) => desfazerSaldoInicial(id) },
  { metodo: "POST", padrao: /^\/movimentos-de-investimento\/([^/]+)\/destinacoes$/, manipular: (requisicao, id) => associarMovimento(id, requisicao.corpo) },
  { metodo: "POST", padrao: /^\/recorrencias$/, manipular: (requisicao) => criarRecorrencia(requisicao.corpo) },
  { metodo: "GET", padrao: /^\/recorrencias$/, manipular: listarRecorrencias },
  {
    metodo: "PUT",
    padrao: /^\/recorrencias\/([^/]+)$/,
    manipular: (requisicao, id) => alterarRecorrencia(id, requisicao.corpo),
  },
  { metodo: "DELETE", padrao: /^\/recorrencias\/([^/]+)$/, manipular: (_requisicao, id) => encerrarRecorrencia(id) },
  { metodo: "GET", padrao: /^\/faturas$/, manipular: listarFaturas },
  { metodo: "GET", padrao: /^\/faturas\/([^/]+)$/, manipular: obterFatura },
  { metodo: "GET", padrao: /^\/renda-base$/, manipular: consultarRendaBase },
  { metodo: "PUT", padrao: /^\/renda-base$/, manipular: (requisicao) => definirRendaBase(requisicao.corpo) },
  { metodo: "DELETE", padrao: /^\/renda-base$/, manipular: removerRendaBase },
  { metodo: "GET", padrao: /^\/metas\/alvos$/, manipular: () => ({status:200,corpo:ALVOS}) },
  { metodo: "GET", padrao: /^\/metas$/, manipular: listarMetas },
  { metodo: "GET", padrao: /^\/metas\/historico$/, manipular: () => ({status:200,corpo:historicoDeMetas.filter(r=>r.usuario_id===donoAtual()).slice(0,100).map(({usuario_id: _dono,...r})=>r)}) },
  { metodo: "GET", padrao: /^\/metas\/progresso$/, manipular: (requisicao) => consultarProgressoDasMetas(requisicao.parametros) },
  {
    metodo: "PUT",
    padrao: /^\/metas\/([^/]+)$/,
    manipular: (requisicao, categoria) => definirMeta(categoria, requisicao.corpo),
  },
  { metodo: "DELETE", padrao: /^\/metas\/([^/]+)$/, manipular: (_requisicao, categoria) => removerMeta(categoria) },
  {metodo:"PUT",padrao:/^\/movimentos-de-investimento\/([^/]+)\/natureza-do-resgate$/,manipular:(r,p)=>{
   const m = movimentosSimulados.find(m=>m.id===normalizarUuid(p)&&(m.usuario_id??USUARIO_DE_EXEMPLO.id)===donoAtual());
   if(!m) throw new ErroSimulado(404,"movimento_de_investimento_nao_encontrado","Movimento não encontrado.");
   const corpo = lerCorpo(r.corpo);
   if(m.tipo!=="resgate"||(typeof corpo.tipo !== "string" || !["resgate","vencimento"].includes(corpo.tipo))) throw new ErroSimulado(422,"transacao_importada_invalida","Escolha a natureza de um resgate.");
   m.vencimento_confirmado = corpo.tipo === "vencimento";
   return {status:204};
  }},
  {metodo:"GET",padrao:/^\/resgates-sem-destinacao$/,manipular:()=>listarResgatesSemDestinacaoSimulados()},
  {metodo:"PUT",padrao:/^\/cores-das-destinacoes$/,manipular:r=>definirCorSimulada(r.corpo)},
  {metodo:"DELETE",padrao:/^\/cores-das-destinacoes$/,manipular:r=>removerCorSimulada(r.parametros)},
  {metodo:"GET",padrao:/^\/revisao-de-investimentos$/,manipular:listarRevisao},
  {metodo:"POST",padrao:/^\/revisao-de-investimentos\/aportes\/([^/]+)$/,manipular:(r,id)=>revisarSimulado("aportes",id,r.corpo)},
  {metodo:"POST",padrao:/^\/revisao-de-investimentos\/gastos\/([^/]+)$/,manipular:(r,id)=>revisarSimulado("gastos",id,r.corpo)},
  {metodo:"POST",padrao:/^\/revisao-de-investimentos\/recorrencias\/([^/]+)$/,manipular:(r,id)=>revisarSimulado("recorrencias",id,r.corpo)},
  {metodo:"GET",padrao:/^\/reservas-das-destinacoes$/,manipular:r=>consultarReservas(r.parametros)},
  {metodo:"POST",padrao:/^\/gastos\/([^/]+)\/coberturas$/,manipular:(r,id)=>associarCompraSimulada(id,r.corpo)},
  {metodo:"DELETE",padrao:/^\/gastos\/([^/]+)\/coberturas\/([^/]+)$/,manipular:(r,id)=>desassociarCompraSimulada(id,r.caminho.split("/").at(-1)!)},
  { metodo: "GET", padrao: /^\/resumos\/tags$/, manipular: (requisicao) => resumirGastosPorTag(requisicao.parametros) },
  { metodo: "GET", padrao: /^\/tags$/, manipular: listarTags },
  {
    metodo: "GET",
    padrao: /^\/categorias$/,
    manipular: () => ({ status: 200, corpo: CATEGORIAS.map((categoria) => ({ ...categoria })) }),
  },
];

function decodificar(texto: string): string {
  try {
    return decodeURIComponent(texto);
  } catch {
    return texto;
  }
}

/**
 * Responde a uma requisição à API simulada. Rotas que não existem respondem 404
 * `rota_nao_simulada`, sem exigir sessão (como o 404 do backend).
 */
export function responder(requisicao: RequisicaoSimulada): RespostaSimulada {
  const metodo = requisicao.metodo.toUpperCase();
  const pedido = { ...requisicao, metodo };
  try {
    for (const rota of ROTAS) {
      const encontrado = rota.metodo === metodo ? rota.padrao.exec(requisicao.caminho) : null;
      if (!encontrado) continue;
      if (!rota.publica) autenticar(pedido);
      return rota.manipular(pedido, decodificar(encontrado[1] ?? ""));
    }
    throw new ErroSimulado(
      404,
      "rota_nao_simulada",
      `A rota ${metodo} ${requisicao.caminho} não existe na simulação da API.`,
    );
  } catch (erro) {
    if (!(erro instanceof ErroSimulado)) throw erro;
    const corpoDoErro: Record<string, unknown> = { codigo: erro.codigo, mensagem: erro.message };
    if (erro.detalhes && erro.detalhes.length > 0) corpoDoErro.detalhes = erro.detalhes;
    const cabecalhos: Record<string, string> = { ...erro.cabecalhos };
    if (erro.status === 401) cabecalhos["WWW-Authenticate"] = "Bearer";
    return { status: erro.status, corpo: { erro: corpoDoErro }, cabecalhos };
  }
}

/** Deixa a simulação com a sessão do usuário de exemplo ativa (para os testes e o desenvolvimento). */
export function entrarNaSimulacao(): void {
  cookieDaSessao = abrirSessao().token;
}

// --- dados de exemplo ----------------------------------------------------------

/** Dia do mês atual `diasAtras` dias antes de hoje (no máximo até o dia 1). */
function diaDoMesAtual(diasAtras: number): string {
  const hoje = new Date();
  const dia = Math.max(1, hoje.getDate() - diasAtras);
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  return `${hoje.getFullYear()}-${mes}-${String(dia).padStart(2, "0")}`;
}

function adicionarExemplos(): void {
  const nubank = guardarConta("Nubank", 420000n);
  const carteira = guardarConta("Carteira", 15000n);
  const exemplos: [ContaGuardada, bigint, string, number, string, string[]][] = [
    [nubank, 31245n, "Mercado do mês", 0, "conforto", ["mercado", "pix"]],
    [carteira, 1800n, "Café com amigos", 0, "lazer", ["café"]],
    [nubank, 8990n, "Curso de TypeScript", 1, "conhecimento", ["curso", "cartão"]],
    [nubank, 145000n, "Aluguel", 3, "gasto_fixo", ["moradia", "pix"]],
    [carteira, 4200n, "Cinema", 6, "lazer", ["cartão"]],
    [nubank, 15632n, "Conta de luz", 8, "gasto_fixo", ["moradia", "boleto"]],
  ];
  for (const [conta, valor, descricao, diasAtras, categoria, tags] of exemplos) {
    guardarGasto({ conta_id: conta.id, valor, descricao, data: diaDoMesAtual(diasAtras), categoria, tags });
  }
  adicionarCartoesDeExemplo(diaDoMesAtual(0));
  const lci = adicionarInvestimentoSimulado(
    {
      nome: "LCI 100% CDI",
      tipo: "FIXED_INCOME",
      subtipo: "LCI",
      saldo: "12500.00",
      valor_aplicado: "12000.00",
      rendimento: "500.00",
      taxa: { percentual: "100", indexador: "CDI", adicional_anual: null },
    },
    45,
  );
  adicionarInvestimentoSimulado({ nome: "Fundo de ações", tipo: "MUTUAL_FUND", saldo: "3200.50" }, 45);
  const aporte = { tipo: "aporte" as const, valor: 300000n };
  movimentosSimulados.push({
    id: crypto.randomUUID(),
    conta_id: nubank.id,
    investimento_id: lci,
    origem: "open_finance",
    ...aporte,
    descricao: "Aplicação na LCI",
    data: diaDoMesAtual(5),
    partes: prepararPartes(aporte, lci, [
      { tag: "reserva", percentual: 60 },
      { tag: "viagem", percentual: 40 },
    ]),
  });
}

/**
 * Volta a simulação ao estado inicial, sempre sem sessão (o usuário de exemplo
 * precisa entrar): vazia, ou com duas contas e gastos do mês atual.
 */
export function reiniciarSimulacao(opcoes: { comExemplos?: boolean } = {}): void {
  contas = [];
  gastos = [];
  coberturasSimuladas = [];
  coresSimuladas = new Map();
  ganhos = [];
  referenciasDeCaixinhas = new Map();
  transferenciasSimuladas = [];
  transacoesImportadas = [];
  casamentosSimulados = [];
  revisaoDaBolsaSemeada = false;
  propostasDaRevisao = [];
  semParDaRevisao = [];
  ligacoesDaRevisao = [];
  semearRevisaoDaBolsa();
  revisoesDasClassificacoes = new Map();
  faturasSimuladas = [];
  investimentosSimulados = [];
  movimentosSimulados = [];
  reaplicacoesSimuladas = [];
  realocacoesSimuladas = [];
  operacoesSimuladas = [];
  alocacoesSimuladas = new Map();
  tratamentosDeAporteSimulados = new Map();
  historicoSimulado = [];
  recorrencias = [];
  metas = [];
  historicoDeMetas = [];
  rendaBase = null;
  chaves = [];
  sessoes = new Map();
  donosDasSessoes = new Map();
  cadastrados = new Map();
  cookieDaSessao = null;
  tentativas = new Map();
  if (opcoes.comExemplos) adicionarExemplos();
}


/** Fixtures exclusivamente locais para testes de métricas e E2E, sem serviços externos. */
export function prepararCenarioLiberdadeFinanceira(opcoes:{valorCompra?:string;valorAporte?:string;tags?:string[];coberto?:string;data?:string;pendente?:boolean}={}) {
 reiniciarSimulacao(); entrarNaSimulacao();
 const conta=guardarConta("Carteira fictícia",90000n);
 const investimentoId=adicionarInvestimentoSimulado({nome:"Reserva fictícia",tipo:"FIXED_INCOME",saldo:"105.00",valor_aplicado:"100.00",rendimento:"5.00"});
 const dia=opcoes.data??"2026-11-10";
 const g=guardarGasto({conta_id:conta.id,valor:reaisParaCentavos(opcoes.valorCompra??"80.00"),descricao:"Compra fictícia",data:dia,categoria:"conforto",tags:opcoes.tags??["loja"]});
 const valorAporte=reaisParaCentavos(opcoes.valorAporte??"100.00");
 const movimento:MovimentoGuardado={id:crypto.randomUUID(),usuario_id:donoAtual(),conta_id:conta.id,investimento_id:investimentoId,tipo:"aporte",origem:"manual",categoria:"conforto",revisao_pendente:false,descricao:"Aporte fictício",valor:valorAporte,data:dia,partes:[{tag:"celular",valor:valorAporte}]};
 movimentosSimulados.push(movimento);
 if(opcoes.coberto)coberturasSimuladas.push({id:crypto.randomUUID(),gasto_id:g.id,tag:"celular",valor:opcoes.coberto});
 metas=[{categoria:"conforto",nome:"Conforto",percentual:50},{categoria:"liberdade_financeira",nome:"Liberdade financeira",percentual:50}];
 if(opcoes.pendente)movimentosSimulados.push({...movimento,id:crypto.randomUUID(),categoria:null,revisao_pendente:true,valor:2000n,partes:[],investimento_id:null,descricao:"Aporte para revisar"});
 return {gastoId:g.id,movimentoId:movimento.id,investimentoId,contaId:conta.id};
}


/**
 * Cenário de testes das caixinhas: Computador vinculado a Conforto (18% de uma renda-base de R$ 5.300,
 * limite de R$ 954); aporte de R$ 3.500 em outubro; resgate tagueado de R$ 3.700 em novembro (abatendo
 * R$ 3.500 de principal); compra de R$ 4.200 em Conforto; e, com `semTag`, um saque sem tag.
 */
export function prepararCenarioDeCaixinha(opcoes:{semTag?:boolean}={}) {
 reiniciarSimulacao(); entrarNaSimulacao();
 const conta=guardarConta("Carteira fictícia",0n);
 const investimentoId=adicionarInvestimentoSimulado({nome:"LCI fictícia",tipo:"FIXED_INCOME",saldo:"37.00",valor_aplicado:"35.00",rendimento:"2.00"});
 const compra=guardarGasto({conta_id:conta.id,valor:420000n,descricao:"Computador fictício",data:"2026-11-05",categoria:"conforto",tags:[]});
 const base={usuario_id:donoAtual(),conta_id:conta.id,investimento_id:investimentoId,origem:"open_finance" as const,categoria:null,revisao_pendente:false};
 movimentosSimulados.push({...base,id:crypto.randomUUID(),tipo:"aporte",descricao:"Aporte fictício",valor:350000n,data:"2026-10-10",partes:[{tag:"computador",valor:350000n,categoria:"conforto"}]});
 const resgate:MovimentoGuardado={...base,id:crypto.randomUUID(),tipo:"resgate",descricao:"Resgate fictício",valor:370000n,data:"2026-11-05",partes:[{tag:"computador",valor:-370000n,principal:-350000n}]};
 movimentosSimulados.push(resgate);
 let semTagId:string|null=null;
 if(opcoes.semTag){movimentosSimulados.push({...base,id:crypto.randomUUID(),tipo:"aporte",descricao:"Aporte da reserva fictícia",valor:10000n,data:"2026-10-11",partes:[{tag:"reserva",valor:10000n}]});semTagId=crypto.randomUUID();movimentosSimulados.push({...base,investimento_id:null,id:semTagId,tipo:"resgate",descricao:"Saque fictício",valor:10000n,data:"2026-11-06",partes:[]});}
 rendaBase=530000n;
 metas=[{categoria:"conforto",nome:"Conforto",percentual:18}];
 return {gastoId:compra.id,resgateId:resgate.id,semTagId,contaId:conta.id,investimentoId};
}

function reservasDaCategoria(categoria:string){
 exigirCategoriaAtiva(categoria);
 const reservado=new Map<string,bigint>(),coberto=new Map<string,bigint>();
 for(const m of movimentosSimulados)if((m.usuario_id??USUARIO_DE_EXEMPLO.id)===donoAtual() && m.tipo==="aporte"){const vinculada=m.partes.some(p=>p.categoria!==undefined);for(const p of m.partes)if(p.valor>0n&&(p.categoria===categoria||(p.categoria===undefined&&!vinculada&&m.categoria===categoria)))reservado.set(p.tag,(reservado.get(p.tag)??0n)+p.valor);}
 for(const c of coberturasSimuladas){const g=gastos.find(g=>g.id===c.gasto_id);if(g && gastoDoDono(g) && g.categoria===categoria)coberto.set(c.tag,(coberto.get(c.tag)??0n)+(c.principal??reaisParaCentavos(c.valor)));}
 return [...reservado].filter(([,v])=>v>0n).map(([tag,v])=>({tag,reservado:deCentavos(v),coberto:deCentavos(coberto.get(tag)??0n),disponivel:deCentavos(v-(coberto.get(tag)??0n)),cor:coresSimuladas.get(chaveDaCor(tag))??null})).sort((a,b)=>{const x=reaisParaCentavos(a.disponivel),y=reaisParaCentavos(b.disponivel);return x===y?compararCodePoints(a.tag,b.tag):x>y?-1:1;});
}
function consultarReservas(parametros:URLSearchParams):RespostaSimulada{
 const v=new Validacao("query",{categoria:parametros.get("categoria")});const categoria=v.categoria("categoria");v.conferir();return {status:200,corpo:reservasDaCategoria(categoria!)};
}
function associarCompraSimulada(id:string,corpo:string|null):RespostaSimulada{
 const campos=lerCorpo(corpo);const v=new Validacao("body",campos);const tag=v.texto("tag"),texto=v.texto("valor");v.conferir();
 const movimentoId=typeof campos.movimento_id==="string"?normalizarUuid(campos.movimento_id):null;
 const g=gastos.find(g=>g.id===normalizarUuid(id)&&gastoDoDono(g));if(!g)throw new ErroSimulado(404,"gasto_nao_encontrado","Gasto não encontrado.");
 exigirCategoriaAtiva(g.categoria);const destino=tagDoTexto(tag!);const valor=reaisParaCentavos(texto!);
 if(coberturasSimuladas.some(c=>c.gasto_id===g.id&&c.tag===destino))throw new ErroSimulado(409,"cobertura_ja_existe","Esta destinação já cobre a compra: desfaça antes de alterar.");
 const reserva=reservasDaCategoria(g.categoria).find(r=>r.tag===destino);
 if(movimentoId!==null){
  const m=movimentosSimulados.find(x=>x.id===movimentoId&&(x.usuario_id??USUARIO_DE_EXEMPLO.id)===donoAtual());
  if(!m)throw new ErroSimulado(404,"movimento_de_investimento_nao_encontrado","Resgate não encontrado.");
  if(m.tipo!=="resgate")throw new ErroSimulado(422,"cobertura_invalida","Só um resgate pode pagar uma compra.");
  const parte=m.partes.find(p=>p.tag===destino&&p.valor<0n);
  if(!parte)throw new ErroSimulado(422,"cobertura_invalida","Este resgate não está classificado com esta tag.");
  const dinheiro=-parte.valor,principalDoResgate=-(parte.principal??parte.valor);
  const usado=coberturasSimuladas.filter(c=>c.movimento_id===m.id&&c.tag===destino).reduce((s,c)=>s+reaisParaCentavos(c.valor),0n);
  if(valor<=0n||valor>g.valor-totalCoberto(g.id)||valor>dinheiro-usado)throw new ErroSimulado(422,"cobertura_invalida","O valor deve ser positivo e caber no restante da compra e no que o resgate ainda tem desta destinação.");
  const totalUsado=coberturasSimuladas.filter(c=>c.movimento_id===m.id).reduce((s,c)=>s+reaisParaCentavos(c.valor),0n);
  const reaplicado=reaplicacoesSimuladas.filter(r=>r.resgate_id===m.id).reduce((s,r)=>s+reaisParaCentavos(r.valor),0n);
  if(valor>m.valor-totalUsado-reaplicado)throw new ErroSimulado(422,"cobertura_invalida","O valor passa do resgate disponível após coberturas e reaplicação.");
  const principal=principalDoResgate*valor/dinheiro;
  const cobertura={id:crypto.randomUUID(),gasto_id:g.id,tag:destino,valor:deCentavos(valor),movimento_id:m.id,principal};coberturasSimuladas.push(cobertura);
  return {status:201,corpo:{id:cobertura.id,tag:destino,valor:cobertura.valor,movimento_id:m.id}};
 }
 if(valor<=0n||valor>g.valor-totalCoberto(g.id)||valor>reaisParaCentavos(reserva?.disponivel??"0.00"))throw new ErroSimulado(422,"cobertura_invalida","O valor deve caber no restante do gasto e no disponível da reserva.");
 const cobertura={id:crypto.randomUUID(),gasto_id:g.id,tag:destino,valor:deCentavos(valor)};coberturasSimuladas.push(cobertura);return {status:201,corpo:{id:cobertura.id,tag:destino,valor:cobertura.valor,movimento_id:null}};
}
function listarResgatesSemDestinacaoSimulados():RespostaSimulada{
 return {status:200,corpo:movimentosSimulados.filter(m=>(m.usuario_id??USUARIO_DE_EXEMPLO.id)===donoAtual()&&m.tipo==="resgate"&&m.partes.length===0).sort((a,b)=>compararCodePoints(b.data,a.data)).map(m => ({...movimentoResposta(m),tipo:m.vencimento_confirmado ? "vencimento" : "resgate",investimento_nome:investimentosSimulados.find(i => i.id === m.investimento_id)?.nome ?? null}))};
}
function desassociarCompraSimulada(id:string,coberturaId:string):RespostaSimulada{
 const g=gastos.find(g=>g.id===normalizarUuid(id)&&gastoDoDono(g));const c=coberturasSimuladas.find(c=>c.id===normalizarUuid(coberturaId)&&c.gasto_id===g?.id);
 if(!c)throw new ErroSimulado(404,"cobertura_nao_encontrada","Cobertura não encontrada.");coberturasSimuladas=coberturasSimuladas.filter(x=>x.id!==c.id);return {status:204};
}


function listarRevisao():RespostaSimulada{
 return {status:200,corpo:{aportes:movimentosSimulados.filter(m=>(m.usuario_id??USUARIO_DE_EXEMPLO.id)===donoAtual()&&m.tipo==="aporte"&&m.origem!=="saldo_inicial"&&m.revisao_pendente).map(movimentoResposta),gastos:gastos.filter(g=>gastoDoDono(g)&&g.categoria==="investimentos").map(gastoResposta),recorrencias:recorrencias.filter(r=>r.categoria==="investimentos").map(r=>({...r,valor:deCentavos(r.valor)}))}};
}
function revisarSimulado(tipo:"aportes"|"gastos"|"recorrencias",id:string,corpo:string|null):RespostaSimulada{
 const campos=lerCorpo(corpo);const v=new Validacao("body",campos);
 const categoria=campos.categoria===null&&tipo==="aportes"?undefined:v.categoria("categoria",tipo==="aportes");
 const investimentoId=tipo==="aportes"?v.uuid("investimento_id",true):undefined;
 const destinacoes=tipo==="aportes"?lerDestinacoes(campos,v):[];v.conferir();
 if(tipo==="aportes"){
  const m=movimentosSimulados.find(m=>m.id===normalizarUuid(id)&&(m.usuario_id??USUARIO_DE_EXEMPLO.id)===donoAtual());
  if(!m)throw new ErroSimulado(404,"movimento_de_investimento_nao_encontrado","Movimento não encontrado.");
  if(!m.revisao_pendente)throw new ErroSimulado(409,"revisao_nao_pendente","Este aporte não está pendente de revisão.");
  if(categoria)throw new ErroSimulado(422,"transacao_importada_invalida","Aporte e resgate não têm categoria de despesa.");
  if(investimentoId&&m.investimento_id)throw new ErroSimulado(409,"movimento_ja_associado","Este movimento já está associado a um investimento.");
  if(!investimentoId&&destinacoes.length)throw new ErroSimulado(422,"transacao_importada_invalida","Escolha o investimento para destinar o valor.");
  const partes=investimentoId?prepararPartes(m,investimentoId,destinacoes):m.partes;
  m.categoria=categoria??null;m.revisao_pendente=false;if(investimentoId)m.investimento_id=investimentoId;m.partes=partes;
  return {status:200,corpo:movimentoResposta(m)};
 }
 const registro=tipo==="gastos"?gastos.find(g=>g.id===normalizarUuid(id)&&gastoDoDono(g)):recorrencias.find(r=>r.id===normalizarUuid(id));
 if(!registro)throw new ErroSimulado(404,tipo==="gastos"?"gasto_nao_encontrado":"recorrencia_nao_encontrada","Registro não encontrado.");
 if(registro.categoria!=="investimentos")throw new ErroSimulado(409,"revisao_nao_pendente","Este registro não está pendente de revisão.");
 exigirCategoriaAtiva(categoria!);registro.categoria=categoria!;
 return {status:200,corpo:tipo==="gastos"?gastoResposta(registro as GastoGuardado):{...registro,valor:deCentavos(registro.valor)}};
}


function definirCorSimulada(corpo:string|null):RespostaSimulada{
 const campos=lerCorpo(corpo),v=new Validacao("body",campos);const texto=v.texto("tag"),cor=v.texto("cor");v.conferir();const tag=tagDoTexto(texto!);
 if(!Object.hasOwn(HEX_DA_COR,cor!))throw requisicaoInvalida([{campo:"body.cor",mensagem:"Escolha uma cor da paleta."}]);
 coresSimuladas.set(chaveDaCor(tag),cor as CorDaDestinacao);return {status:200,corpo:{tag,cor}};
}
function removerCorSimulada(parametros:URLSearchParams):RespostaSimulada{
 const v=new Validacao("query",{tag:parametros.get("tag")});const texto=v.texto("tag");v.conferir();coresSimuladas.delete(chaveDaCor(tagDoTexto(texto!)));return {status:204};
}

// --- faturas do cartão (somente leitura) -------------------------------------------

type CompraGuardada = {
  id: string;
  data: string;
  descricao: string;
  valor: bigint;
  sentido: "entrada" | "saida";
  parcela_numero: number | null;
  parcela_total: number | null;
  estado: "pendente" | "aceita" | "ignorada";
};

type FaturaGuardada = {
  id: string;
  conta_id: string;
  inicio: string | null;
  fechamento: string;
  vencimento: string | null;
  total: bigint;
  fonte: "banco" | "estimada";
  pagamentos: { data: string; valor: bigint; forma: string | null }[];
  compras: CompraGuardada[];
};

let faturasSimuladas: FaturaGuardada[] = [];

function pagoDaFatura(fatura: FaturaGuardada): bigint {
  return fatura.pagamentos.reduce((soma, pagamento) => soma + pagamento.valor, 0n);
}

/** `Fatura.situacao` do backend: aberta até o dia do fechamento; depois paga, vencida ou fechada. */
function situacaoDaFatura(fatura: FaturaGuardada, hoje: string): string {
  if (hoje <= fatura.fechamento) return "aberta";
  if (pagoDaFatura(fatura) >= fatura.total) return "paga";
  if (fatura.vencimento !== null && hoje > fatura.vencimento) return "vencida";
  return "fechada";
}

function faturaResposta(fatura: FaturaGuardada, hoje: string) {
  const pago = pagoDaFatura(fatura);
  return {
    id: fatura.id,
    inicio: fatura.inicio,
    fechamento: fatura.fechamento,
    vencimento: fatura.vencimento,
    total: deCentavos(fatura.total),
    pago: deCentavos(pago),
    restante: deCentavos(pago >= fatura.total ? 0n : fatura.total - pago),
    a_favor: deCentavos(pago > fatura.total ? pago - fatura.total : 0n),
    minimo: null,
    situacao: situacaoDaFatura(fatura, hoje),
    fonte: fatura.fonte,
    quantidade_de_compras: fatura.compras.length,
  };
}

function lerHoje(parametros: URLSearchParams): string {
  const hoje = parametros.get("hoje");
  if (hoje === null || !dataValida(hoje)) {
    throw requisicaoInvalida([
      { campo: "query.hoje", mensagem: hoje === null ? PYDANTIC.ausente : PYDANTIC.data },
    ]);
  }
  return hoje;
}

function faturasDoDono(): FaturaGuardada[] {
  const ids = new Set(contas.filter((c) => (c.usuario_id ?? USUARIO_DE_EXEMPLO.id) === donoAtual()).map((c) => c.id));
  return faturasSimuladas.filter((f) => ids.has(f.conta_id));
}

function listarFaturas(requisicao: RequisicaoSimulada): RespostaSimulada {
  exigirDonoDaImportacao(requisicao);
  const hoje = lerHoje(requisicao.parametros);
  const filtro = requisicao.parametros.get("conta_id");
  const idDoFiltro = filtro === null ? null : normalizarUuid(filtro);
  if (filtro !== null && idDoFiltro === null) {
    throw requisicaoInvalida([{ campo: "query.conta_id", mensagem: PYDANTIC.uuid }]);
  }
  if (idDoFiltro !== null && !contas.some((c) => c.id === idDoFiltro && (c.usuario_id ?? USUARIO_DE_EXEMPLO.id) === donoAtual())) {
    throw contaNaoEncontrada();
  }
  const cartoes = contas
    .filter((c) => c.tipo === "cartao" && (c.usuario_id ?? USUARIO_DE_EXEMPLO.id) === donoAtual())
    .filter((c) => idDoFiltro === null || c.id === idDoFiltro)
    .sort((a, b) => compararCodePoints(a.nome, b.nome));
  const doDono = faturasDoDono();
  return {
    status: 200,
    corpo: {
      cartoes: cartoes.map((cartao) => ({
        conta_id: cartao.id,
        conta_nome: cartao.nome,
        valor_devido: deCentavos(cartao.saldo < 0n ? -cartao.saldo : 0n),
        faturas: doDono
          .filter((f) => f.conta_id === cartao.id)
          .sort((a, b) => (a.fechamento < b.fechamento ? 1 : -1))
          .map((f) => faturaResposta(f, hoje)),
      })),
    },
  };
}

function obterFatura(requisicao: RequisicaoSimulada, idTexto: string): RespostaSimulada {
  exigirDonoDaImportacao(requisicao);
  const hoje = lerHoje(requisicao.parametros);
  const id = normalizarUuid(idTexto);
  const fatura = faturasDoDono().find((f) => f.id === id);
  if (!fatura) throw new ErroSimulado(404, "fatura_nao_encontrada", "Fatura não encontrada.");
  return {
    status: 200,
    corpo: {
      ...faturaResposta(fatura, hoje),
      compras: [...fatura.compras]
        .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0))
        .map((c) => ({ ...c, valor: deCentavos(c.valor) })),
      pagamentos: fatura.pagamentos.map((p) => ({ data: p.data, valor: deCentavos(p.valor), forma: p.forma })),
    },
  };
}

function guardarCartaoDeExemplo(nome: string, faturas: Omit<FaturaGuardada, "id" | "conta_id">[], devido: bigint): ContaGuardada {
  const conta = guardarConta(nome, -devido);
  conta.origem = "open_finance";
  conta.id_externo = `externo-${nome}`;
  conta.tipo = "cartao";
  for (const fatura of faturas) faturasSimuladas.push({ ...fatura, id: crypto.randomUUID(), conta_id: conta.id });
  return conta;
}

function compraDeExemplo(data: string, descricao: string, valor: bigint, extra: Partial<CompraGuardada> = {}): CompraGuardada {
  return { id: crypto.randomUUID(), data, descricao, valor, sentido: "saida", parcela_numero: null, parcela_total: null, estado: "pendente", ...extra };
}

/** Dois cartões inventados com faturas calculadas a partir de `hoje` ("AAAA-MM-DD"). */
function adicionarCartoesDeExemplo(hoje: string): void {
  const [ano, mes, dia] = hoje.split("-").map((parte) => Number.parseInt(parte, 10));
  // O fechamento é todo dia 15: o próximo é neste mês (se ainda não passou) ou no seguinte.
  const deslocar = (meses: number, diaDoMes: number) => {
    const indice = ano * 12 + (mes - 1) + meses;
    const a = Math.floor(indice / 12);
    const m = (indice % 12) + 1;
    return textoDaData(a, m, Math.min(diaDoMes, ultimoDiaDoMes(a, m)));
  };
  const base = dia <= 15 ? 0 : 1;
  const fecha = (n: number) => deslocar(base + n, 15);
  const vence = (n: number) => deslocar(base + n, 22);
  const inicia = (n: number) => deslocar(base + n - 1, 16);
  guardarCartaoDeExemplo(
    "FREE VISA",
    [
      {
        inicio: inicia(0), fechamento: fecha(0), vencimento: vence(0), total: 12218n, fonte: "estimada", pagamentos: [],
        compras: [
          compraDeExemplo(inicia(0), "Anthropic Claude", 11805n),
          compraDeExemplo(deslocar(base - 1, 20), "Padaria", 413n, { estado: "aceita" }),
        ],
      },
      {
        inicio: inicia(-1), fechamento: fecha(-1), vencimento: vence(-1), total: 5000n, fonte: "banco",
        pagamentos: [{ data: deslocar(base - 1, 20), valor: 5000n, forma: null }],
        compras: [compraDeExemplo(deslocar(base - 2, 20), "Curso online", 6000n, { parcela_numero: 2, parcela_total: 10 }), compraDeExemplo(deslocar(base - 2, 25), "Estorno do curso", 1000n, { sentido: "entrada" })],
      },
    ],
    12218n,
  );
  guardarCartaoDeExemplo(
    "Cartão Roxo",
    [
      {
        inicio: inicia(0), fechamento: fecha(0), vencimento: vence(0), total: 0n, fonte: "estimada", pagamentos: [], compras: [],
      },
      {
        inicio: inicia(-1), fechamento: fecha(-1), vencimento: deslocar(base - 1, 16), total: 30000n, fonte: "banco", pagamentos: [],
        compras: [compraDeExemplo(deslocar(base - 2, 20), "Notebook", 30000n, { estado: "ignorada" })],
      },
    ],
    30000n,
  );
}

/** Cenário fixo para testes e E2E: "hoje" é 2026-11-05 e há dois cartões inventados. */
export function prepararCenarioDeFaturas(): void {
  reiniciarSimulacao();
  entrarNaSimulacao();
  adicionarCartoesDeExemplo("2026-11-05");
}

/** Somente dados de exemplo: reproduz uma classificação anterior à proibição de categoria. */
export function definirCategoriaHistoricaSimulada(movimentoId: string, categoria: string): void {
  const movimento = movimentosSimulados.find(m => m.id === movimentoId);
  if (!movimento) throw new Error("Movimento de exemplo não encontrado.");
  movimento.categoria = categoria;
}


function movimentoDaReaplicacao(id:string): MovimentoGuardado {
  const m=movimentosSimulados.find(m=>m.id===normalizarUuid(id) && (m.usuario_id??USUARIO_DE_EXEMPLO.id)===donoAtual());
  if(!m)throw new ErroSimulado(404,"movimento_de_investimento_nao_encontrado","Movimento não encontrado.");
  return m;
}
function livreDoResgate(m:MovimentoGuardado): bigint {
  return m.valor-coberturasSimuladas.filter(c=>c.movimento_id===m.id).reduce((s,c)=>s+reaisParaCentavos(c.valor),0n);
}
function conferirReaplicacaoSimulada(aporte:MovimentoGuardado,resgate:MovimentoGuardado,valor:bigint):void {
  const origem=investimentosSimulados.find(i=>i.id===resgate.investimento_id&&(i.usuario_id??USUARIO_DE_EXEMPLO.id)===donoAtual());
  const destino=investimentosSimulados.find(i=>i.id===aporte.investimento_id&&(i.usuario_id??USUARIO_DE_EXEMPLO.id)===donoAtual());
  const invalida=(mensagem:string)=>new ErroSimulado(422,"reaplicacao_invalida",mensagem);
  if(resgate.tipo!=="resgate"||aporte.tipo!=="aporte"||aporte.origem==="saldo_inicial"||!origem||!destino||origem.id===destino.id||origem.tipo==="CAIXINHA"||destino.tipo==="CAIXINHA")throw invalida("Escolha um resgate e um aporte de investimentos distintos, fora de conta investimentos e saldo inicial.");
  if(resgate.data>aporte.data)throw invalida("O resgate precisa ocorrer na mesma data ou antes do aporte.");
  if(valor<=0n||valor>aporte.valor||valor>livreDoResgate(resgate))throw invalida("O valor deve ser positivo e caber no aporte e no resgate ainda livre de coberturas.");
}
function confirmarReaplicacaoSimulada(corpo:string|null): RespostaSimulada {
  const v=new Validacao("body",lerCorpo(corpo));
  const aporteId=v.uuid("aporte_id"),resgateId=v.uuid("resgate_id"),texto=v.texto("valor");v.conferir();
  const valor=reaisParaCentavos(texto!);
  const aporte=movimentoDaReaplicacao(aporteId!),resgate=movimentoDaReaplicacao(resgateId!);
  if(reaplicacoesSimuladas.some(r=>[r.aporte_id,r.resgate_id].some(id=>id===aporte.id||id===resgate.id)))throw new ErroSimulado(409,"reaplicacao_ja_existe","Um destes movimentos já tem reaplicação. Desfaça o vínculo antes de alterar.");
  conferirReaplicacaoSimulada(aporte,resgate,valor);
  const r={id:crypto.randomUUID(),aporte_id:aporte.id,resgate_id:resgate.id,valor:deCentavos(valor)};
  reaplicacoesSimuladas.push({...r,usuario_id:donoAtual()});return {status:201,corpo:r};
}
function candidatosDaReaplicacao(aporteId:string): RespostaSimulada {
  const aporte=movimentoDaReaplicacao(aporteId);
  if(reaplicacoesSimuladas.some(r=>r.aporte_id===aporte.id||r.resgate_id===aporte.id))return {status:200,corpo:[]};
  const candidatos=[];
  for(const m of movimentosSimulados){
    if((m.usuario_id??USUARIO_DE_EXEMPLO.id)!==donoAtual()||reaplicacoesSimuladas.some(r=>r.resgate_id===m.id||r.aporte_id===m.id))continue;
    try{conferirReaplicacaoSimulada(aporte,m,1n);}catch{continue;}
    candidatos.push({id:m.id,data:m.data,descricao:m.descricao,valor:deCentavos(m.valor),disponivel:deCentavos(livreDoResgate(m)),investimento_nome:investimentosSimulados.find(i=>i.id===m.investimento_id)!.nome});
  }
  candidatos.sort((a,b)=>compararCodePoints(b.data,a.data)||compararCodePoints(a.id,b.id));
  return {status:200,corpo:candidatos};
}
function removerReaplicacaoSimulada(id:string): RespostaSimulada {
  const posicao=reaplicacoesSimuladas.findIndex(r=>r.id===normalizarUuid(id)&&r.usuario_id===donoAtual());
  if(posicao<0)throw new ErroSimulado(404,"reaplicacao_nao_encontrada","Reaplicação não encontrada.");
  reaplicacoesSimuladas.splice(posicao,1);return {status:204};
}

/** Cenário fictício: resgate de outubro e aporte de novembro, sem confirmação automática. */
export function prepararCenarioDeReaplicacao(){
  reiniciarSimulacao();entrarNaSimulacao();
  const conta=guardarConta("Carteira fictícia",123456n);
  const origem=adicionarInvestimentoSimulado({nome:"Investimento de origem",tipo:"FIXED_INCOME",saldo:"100.00"});
  const destino=adicionarInvestimentoSimulado({nome:"Investimento de destino",tipo:"FIXED_INCOME",saldo:"150.00"});
  const base={usuario_id:donoAtual(),conta_id:conta.id,origem:"manual" as const,partes:[]};
  const resgate:MovimentoGuardado={...base,id:crypto.randomUUID(),investimento_id:origem,tipo:"resgate",valor:10000n,data:"2026-10-31",descricao:"Resgate fictício"};
  const aporte:MovimentoGuardado={...base,id:crypto.randomUUID(),investimento_id:destino,tipo:"aporte",valor:15000n,data:"2026-11-01",descricao:"Aporte fictício"};
  movimentosSimulados.push(resgate,aporte);rendaBase=100000n;
  metas=[{categoria:"liberdade_financeira",nome:"Liberdade financeira",percentual:25}];
  return {aporteId:aporte.id,resgateId:resgate.id,contaId:conta.id};
}


/** Dados inventados para testar os tratamentos sem tocar em conta ou movimento existente. */
export function adicionarAporteSemInvestimentoSimulado(valor = "100.00", data = hojeLocal()): string {
  const conta = contas.find(c => (c.usuario_id ?? USUARIO_DE_EXEMPLO.id) === donoAtual());
  if (!conta) throw new ErroSimulado(404, "conta_nao_encontrada", "Conta não encontrada.");
  const id = crypto.randomUUID();
  movimentosSimulados.push({ id, usuario_id: donoAtual(), conta_id: conta.id, investimento_id: null, tipo: "aporte", origem: "manual", descricao: "Aporte de teste", valor: reaisParaCentavos(valor), data, partes: [] });
  return id;
}
