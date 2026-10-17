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
  { codigo: "investimentos", nome: "Investimentos" },
  { codigo: "lazer", nome: "Lazer" },
  { codigo: "conhecimento", nome: "Conhecimento" },
  { codigo: "conforto", nome: "Conforto" },
  { codigo: "gasto_fixo", nome: "Gasto fixo" },
];

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
  id: string;
  nome: string;
  saldo: bigint;
  /** Conta importada do banco: o saldo é do banco e lançamentos não o alteram. */
  origem?: "manual" | "open_finance";
  id_externo?: string;
  tipo?: "corrente" | "cartao";
};

type TransacaoImportadaGuardada = {
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
let gastos: GastoGuardado[] = [];
let ganhos: GanhoGuardado[] = [];

type RecorrenciaGuardada = Omit<Recorrencia, "valor"> & { valor: bigint };
let recorrencias: RecorrenciaGuardada[] = [];
let metas: Meta[] = [];

function contaResposta(conta: ContaGuardada): Conta {
  return {
    id: conta.id,
    nome: conta.nome,
    saldo: deCentavos(conta.saldo),
    origem: conta.origem ?? "manual",
    tipo: conta.tipo ?? "corrente",
  };
}

function gastoResposta(gasto: GastoGuardado): Gasto {
  return {
    id: gasto.id,
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
    id: crypto.randomUUID(),
    nome: aparado,
    saldo,
    tipo: "corrente",
  };
  contas.push(conta);
  return conta;
}

type DadosDoGasto = {
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

function transacaoImportadaResposta(transacao: TransacaoImportadaGuardada) {
  const mesmaOrigemManual = (lancamento: { origem?: string }) =>
    (lancamento.origem ?? "manual") === "manual";
  const lancamentos: { conta_id: string; data: string; valor: bigint; origem?: string }[] =
    transacao.sentido === "saida" ? gastos : ganhos;
  return {
    id: transacao.id,
    conta_id: transacao.conta_id,
    data: transacao.data,
    descricao: transacao.descricao,
    valor: deCentavos(transacao.valor),
    sentido: transacao.sentido,
    tipo_de_operacao: transacao.tipo_de_operacao,
    estado: transacao.estado,
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
  };
}

function listarTransacoesImportadas(requisicao: RequisicaoSimulada): RespostaSimulada {
  exigirDonoDaImportacao(requisicao);
  const estado = requisicao.parametros.get("estado") ?? "pendente";
  if (!["pendente", "aceita", "ignorada"].includes(estado)) {
    throw requisicaoInvalida([{ campo: "query.estado", mensagem: "Valor inválido." }]);
  }
  const encontradas = transacoesImportadas
    .filter((transacao) => transacao.estado === estado)
    .sort((a, b) =>
      a.data !== b.data ? (a.data < b.data ? 1 : -1) : a.id < b.id ? -1 : 1,
    );
  return { status: 200, corpo: encontradas.map(transacaoImportadaResposta) };
}

function encontrarTransacaoImportada(idTexto: string): TransacaoImportadaGuardada {
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
  if (transacao.estado !== "pendente") {
    throw new ErroSimulado(409, "transacao_ja_tratada", "Esta transação já foi tratada.");
  }
  return transacao;
}

function aceitarTransacaoImportada(
  requisicao: RequisicaoSimulada,
  idTexto: string,
): RespostaSimulada {
  exigirDonoDaImportacao(requisicao);
  const validacao = new Validacao("body", lerCorpo(requisicao.corpo));
  const categoria = validacao.categoria("categoria", true);
  const tags = validacao.listaDeTextos("tags") ?? [];
  validacao.conferir();
  const transacao = encontrarTransacaoImportada(idTexto);

  const dados = {
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
  return { status: 201, corpo: { tipo, id } };
}

function ignorarTransacaoImportada(
  requisicao: RequisicaoSimulada,
  idTexto: string,
): RespostaSimulada {
  exigirDonoDaImportacao(requisicao);
  encontrarTransacaoImportada(idTexto).estado = "ignorada";
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
        gasto.data >= inicio &&
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
    if (gasto.data < inicio || gasto.data > fim) continue;
    if (contaId !== undefined && gasto.conta_id !== contaId) continue;
    if (categoria !== undefined && gasto.categoria !== categoria) continue;
    total += gasto.valor;
    if (gasto.tags.length === 0) {
      porTag.set(null, (porTag.get(null) ?? 0n) + gasto.valor);
      continue;
    }
    const quantidade = BigInt(gasto.tags.length);
    const base = gasto.valor / quantidade;
    const resto = Number(gasto.valor % quantidade);
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
  const distintas = [...new Set(gastos.flatMap((gasto) => gasto.tags))];
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

function categoriaDoCaminho(categoriaTexto: string, corpo?: Validacao): string {
  const caminho = new Validacao("path", { categoria: categoriaTexto });
  const categoria = caminho.categoria("categoria");
  const detalhes = [...caminho.detalhes, ...(corpo?.detalhes ?? [])];
  if (detalhes.length > 0) throw requisicaoInvalida(detalhes);
  return categoria as string;
}

function ordemDaCategoria(codigo: string): number {
  return CATEGORIAS.findIndex((categoria) => categoria.codigo === codigo);
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
  if (existente) existente.percentual = percentual as number;
  else metas.push({ categoria, percentual: percentual as number });
  return { status: 200, corpo: { categoria, percentual } };
}

function removerMeta(categoriaTexto: string): RespostaSimulada {
  const categoria = categoriaDoCaminho(categoriaTexto);
  const posicao = metas.findIndex((meta) => meta.categoria === categoria);
  if (posicao < 0) throw new ErroSimulado(404, "meta_nao_encontrada", "Meta não encontrada.");
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

function consultarProgressoDasMetas(parametros: URLSearchParams): RespostaSimulada {
  const validacao = new Validacao("query", { mes: parametros.getAll("mes").at(-1) });
  const mes = validacao.texto("mes");
  validacao.conferir();
  const { inicio, fim } = mesValido(mes as string);

  const renda = ganhos
    .filter((ganho) => ganho.data >= inicio && ganho.data <= fim)
    .reduce((soma, ganho) => soma + ganho.valor, 0n);
  const ordenadas = [...metas].sort((a, b) => ordemDaCategoria(a.categoria) - ordemDaCategoria(b.categoria));
  const progressos: ProgressoDaMeta[] = ordenadas.map((meta) => {
    const gasto = gastos
      .filter((g) => g.categoria === meta.categoria && g.data >= inicio && g.data <= fim)
      .reduce((soma, g) => soma + g.valor, 0n);
    const limite = (renda * BigInt(meta.percentual)) / 100n;
    return {
      categoria: meta.categoria,
      percentual: meta.percentual,
      limite: deCentavos(limite),
      gasto: deCentavos(gasto),
      restante: deCentavos(limite - gasto),
      percentual_usado: gasto <= 0n ? 0 : limite <= 0n ? null : Number((gasto * 100n) / limite),
      situacao: situacaoDaMeta(renda, gasto, limite),
    };
  });
  const resumo: ResumoDasMetas = { mes: mes as string, renda: deCentavos(renda), metas: progressos };
  return { status: 200, corpo: resumo };
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
      },
    }),
  },
  { metodo: "POST", padrao: /^\/auth\/sair$/, manipular: sair },
  { metodo: "GET", padrao: /^\/chaves-de-api$/, manipular: listarChaves },
  { metodo: "POST", padrao: /^\/chaves-de-api$/, manipular: (requisicao) => criarChave(requisicao.corpo) },
  { metodo: "DELETE", padrao: /^\/chaves-de-api\/([^/]+)$/, manipular: (_requisicao, id) => revogarChave(id) },
  { metodo: "POST", padrao: /^\/contas$/, manipular: (requisicao) => criarConta(requisicao.corpo) },
  { metodo: "GET", padrao: /^\/contas$/, manipular: listarContas },
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
    padrao: /^\/transacoes-importadas\/([^/]+)\/ignorar$/,
    manipular: (requisicao, id) => ignorarTransacaoImportada(requisicao, id),
  },
  {
    metodo: "POST",
    padrao: /^\/sincronizacoes$/,
    manipular: (requisicao) => sincronizarContasBancarias(requisicao),
  },
  { metodo: "POST", padrao: /^\/recorrencias$/, manipular: (requisicao) => criarRecorrencia(requisicao.corpo) },
  { metodo: "GET", padrao: /^\/recorrencias$/, manipular: listarRecorrencias },
  {
    metodo: "PUT",
    padrao: /^\/recorrencias\/([^/]+)$/,
    manipular: (requisicao, id) => alterarRecorrencia(id, requisicao.corpo),
  },
  { metodo: "DELETE", padrao: /^\/recorrencias\/([^/]+)$/, manipular: (_requisicao, id) => encerrarRecorrencia(id) },
  { metodo: "GET", padrao: /^\/metas$/, manipular: listarMetas },
  { metodo: "GET", padrao: /^\/metas\/progresso$/, manipular: (requisicao) => consultarProgressoDasMetas(requisicao.parametros) },
  {
    metodo: "PUT",
    padrao: /^\/metas\/([^/]+)$/,
    manipular: (requisicao, categoria) => definirMeta(categoria, requisicao.corpo),
  },
  { metodo: "DELETE", padrao: /^\/metas\/([^/]+)$/, manipular: (_requisicao, categoria) => removerMeta(categoria) },
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
    [nubank, 30000n, "Aporte no Tesouro", 5, "investimentos", ["tesouro"]],
    [carteira, 4200n, "Cinema", 6, "lazer", ["cartão"]],
    [nubank, 15632n, "Conta de luz", 8, "gasto_fixo", ["moradia", "boleto"]],
  ];
  for (const [conta, valor, descricao, diasAtras, categoria, tags] of exemplos) {
    guardarGasto({ conta_id: conta.id, valor, descricao, data: diaDoMesAtual(diasAtras), categoria, tags });
  }
}

/**
 * Volta a simulação ao estado inicial, sempre sem sessão (o usuário de exemplo
 * precisa entrar): vazia, ou com duas contas e gastos do mês atual.
 */
export function reiniciarSimulacao(opcoes: { comExemplos?: boolean } = {}): void {
  contas = [];
  gastos = [];
  ganhos = [];
  transacoesImportadas = [];
  recorrencias = [];
  metas = [];
  chaves = [];
  sessoes = new Map();
  donosDasSessoes = new Map();
  cadastrados = new Map();
  cookieDaSessao = null;
  tentativas = new Map();
  if (opcoes.comExemplos) adicionarExemplos();
}
