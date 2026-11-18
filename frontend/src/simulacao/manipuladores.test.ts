import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { URL_BASE } from "../api/cliente";
import type {
  Categoria,
  ChaveDeApi,
  ChaveDeApiCriada,
  Conta,
  ErroDaApi,
  Gasto,
  Sessao,
  Usuario,
} from "../api/tipos";
import { limites, periodoAtual } from "../periodo/periodo";
import { entrarNaSimulacao, fetchSimulado } from "./fetchSimulado";
import { definirCategoriaHistoricaSimulada, adicionarInvestimentoSimulado, prepararCenarioDeFaturas, reiniciarSimulacao } from "./manipuladores";

// Os testes falam com a simulação só pelo fetchSimulado, como o cliente da API.
// O preparar.ts reinicia a simulação (vazia e sem sessão) depois de cada teste;
// aqui, cada teste começa com a sessão do usuário de exemplo, como um navegador
// que já entrou, exceto onde a autenticação é o assunto.
beforeEach(() => {
  entrarNaSimulacao();
});

const ID_INEXISTENTE = "00000000-0000-4000-8000-000000000000";
const EMAIL_DE_EXEMPLO = "voce@exemplo.com";
const SENHA_DE_EXEMPLO = "senha-de-exemplo-123";
const MENSAGEM_DE_NAO_AUTENTICADO = "Credencial ausente, inválida ou expirada.";
const MENSAGEM_DE_CREDENCIAIS_INVALIDAS = "E-mail ou senha incorretos.";

type Resposta = { status: number; corpo: unknown; tipo: string | null; cabecalhos: Headers; texto: string };

type OpcoesDoPedido = {
  /** Cabeçalho anti-CSRF; padrão: "1" em todo método que não é GET. */
  antiCsrf?: string | null;
  /** Padrão: "include", como o cliente da API (o cookie só vai com ele). */
  credenciais?: RequestCredentials;
};

async function pedir(
  metodo: string,
  caminho: string,
  corpo?: unknown,
  opcoes: OpcoesDoPedido = {},
): Promise<Resposta> {
  const { antiCsrf = metodo === "GET" ? null : "1", credenciais = "include" } = opcoes;
  const cabecalhos: Record<string, string> = { "content-type": "application/json" };
  if (antiCsrf !== null) cabecalhos["X-Gastoba-Requisicao"] = antiCsrf;
  const resposta = await fetchSimulado(`${URL_BASE}${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    credentials: credenciais,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await resposta.text();
  return {
    status: resposta.status,
    corpo: texto === "" ? undefined : JSON.parse(texto),
    tipo: resposta.headers.get("content-type"),
    cabecalhos: resposta.headers,
    texto,
  };
}

function erroDe(resposta: Resposta): ErroDaApi["erro"] {
  return (resposta.corpo as ErroDaApi).erro;
}

async function criarConta(nome: string, saldoInicial?: string): Promise<Conta> {
  const corpo = saldoInicial === undefined ? { nome } : { nome, saldo_inicial: saldoInicial };
  const resposta = await pedir("POST", "/contas", corpo);
  expect(resposta.status).toBe(201);
  return resposta.corpo as Conta;
}

function novoGasto(contaId: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    conta_id: contaId,
    valor: "10.00",
    descricao: "Mercado",
    data: "2026-10-10",
    categoria: "conforto",
    tags: [],
    ...extra,
  };
}

async function registrar(contaId: string, extra: Record<string, unknown> = {}): Promise<Gasto> {
  const resposta = await pedir("POST", "/gastos", novoGasto(contaId, extra));
  expect(resposta.status).toBe(201);
  return resposta.corpo as Gasto;
}

async function listarContas(): Promise<Conta[]> {
  return (await pedir("GET", "/contas")).corpo as Conta[];
}

async function listarGastos(consulta: string): Promise<Gasto[]> {
  const resposta = await pedir("GET", `/gastos?${consulta}`);
  expect(resposta.status).toBe(200);
  return resposta.corpo as Gasto[];
}

describe("POST /contas", () => {
  it("cria a conta com 201, saldo padrão 0.00 e nome sem espaços nas pontas", async () => {
    const resposta = await pedir("POST", "/contas", { nome: "  Nubank  " });

    expect(resposta.status).toBe(201);
    expect(resposta.tipo).toContain("application/json");
    const conta = resposta.corpo as Conta;
    expect(conta).toEqual({ id: conta.id, nome: "Nubank", saldo: "0.00", origem: "manual", tipo: "corrente", papel: null });
    expect(conta.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(await listarContas()).toEqual([conta]);
  });

  it.each([
    ["-10.50", "-10.50"],
    ["0", "0.00"],
    ["1.500", "1.50"],
    ["974.1", "974.10"],
    // O Decimal do Python também aceita estas formas, e o backend as aceita.
    ["1e2", "100.00"],
    [" 5 ", "5.00"],
    ["1_000", "1000.00"],
    ["+.5", "0.50"],
    ["-0", "0.00"],
    ["1000000000000.00", "1000000000000.00"],
  ])("aceita o saldo inicial %j (fica %j)", async (saldoInicial, saldo) => {
    expect((await criarConta("Carteira", saldoInicial)).saldo).toBe(saldo);
  });

  it.each([
    ["25,90", "Valor monetário não numérico: '25,90'."],
    ["NaN", "Valor monetário não finito: 'NaN'."],
    ["1.555", "Valor monetário com centavos fracionários: '1.555'."],
    ["1e13", "Valor monetário acima do limite de R$ 1000000000000.00: '1e13'."],
    ["1000000000000.001", "Valor monetário acima do limite de R$ 1000000000000.00: '1000000000000.001'."],
  ])("recusa %j com a mesma mensagem do backend", async (saldoInicial, mensagem) => {
    const resposta = await pedir("POST", "/contas", { nome: "Nubank", saldo_inicial: saldoInicial });

    expect(erroDe(resposta)).toEqual({ codigo: "valor_invalido", mensagem });
  });

  it.each([
    ["vazio", ""],
    ["só com espaços", "   "],
    ["com 101 caracteres", "a".repeat(101)],
  ])("recusa nome %s com 422 nome_invalido", async (_caso, nome) => {
    const resposta = await pedir("POST", "/contas", { nome });

    expect(resposta.status).toBe(422);
    expect(erroDe(resposta).codigo).toBe("nome_invalido");
    expect(await listarContas()).toEqual([]);
  });

  it("conta o tamanho do nome em code points", async () => {
    expect((await criarConta("😀".repeat(100))).nome).toBe("😀".repeat(100));
  });

  it("recusa nome repetido com 409, comparando exato depois de aparar", async () => {
    await criarConta("Nubank");

    const repetida = await pedir("POST", "/contas", { nome: "  Nubank " });
    expect(repetida.status).toBe(409);
    expect(erroDe(repetida)).toEqual({
      codigo: "conta_ja_existe",
      mensagem: "Já existe uma conta com o nome 'Nubank'.",
    });

    expect((await criarConta("nubank")).nome).toBe("nubank");
  });

  it("recusa número JSON no saldo e campo ausente com requisicao_invalida e detalhes", async () => {
    const resposta = await pedir("POST", "/contas", { saldo_inicial: 10 });

    expect(resposta.status).toBe(422);
    const erro = erroDe(resposta);
    expect(erro.codigo).toBe("requisicao_invalida");
    expect(erro.detalhes?.map((detalhe) => detalhe.campo)).toEqual([
      "body.nome",
      "body.saldo_inicial",
    ]);
  });

  it("recusa a requisição sem corpo", async () => {
    const resposta = await pedir("POST", "/contas");

    expect(resposta.status).toBe(422);
    expect(erroDe(resposta).codigo).toBe("requisicao_invalida");
    expect(erroDe(resposta).detalhes?.[0].campo).toBe("body");
  });

  it.each(["25,90", "1.555", "1000000000000.01", "abc", ""])(
    "recusa o saldo inicial %j com valor_invalido",
    async (saldoInicial) => {
      const resposta = await pedir("POST", "/contas", { nome: "Nubank", saldo_inicial: saldoInicial });

      expect(resposta.status).toBe(422);
      expect(erroDe(resposta).codigo).toBe("valor_invalido");
      expect(erroDe(resposta).detalhes).toBeUndefined();
    },
  );
});

describe("POST /gastos", () => {
  it("registra com 201, normaliza as tags e debita o saldo em centavos exatos", async () => {
    const conta = await criarConta("Nubank", "100.00");

    const gasto = await registrar(conta.id, {
      valor: "25.90",
      descricao: "  Feira  ",
      tags: ["  Pix ", "pix", "Mercado  Livre"],
    });

    expect(gasto).toEqual({
      id: gasto.id,
      transacao_importada_id: null,
      conta_id: conta.id,
      valor: "25.90",
      descricao: "Feira",
      data: "2026-10-10",
      categoria: "conforto",
      tags: ["pix", "mercado livre"],
      origem: "manual",
      recorrencia_id: null,
    valor_coberto: "0.00", coberturas: [],
    });
    await registrar(conta.id, { valor: "0.11" });
    expect((await listarContas())[0].saldo).toBe("73.99");
  });

  it("aceita 1.500, tags ausentes e o valor no limite", async () => {
    const conta = await criarConta("Nubank");
    const corpo = novoGasto(conta.id, { valor: "1.500" });
    delete corpo.tags;

    const resposta = await pedir("POST", "/gastos", corpo);
    expect(resposta.status).toBe(201);
    expect((resposta.corpo as Gasto).valor).toBe("1.50");
    expect((resposta.corpo as Gasto).tags).toEqual([]);

    expect((await registrar(conta.id, { valor: "999999999998.50" })).valor).toBe(
      "999999999998.50",
    );
    expect((await listarContas())[0].saldo).toBe("-1000000000000.00");
  });

  it("recusa número JSON no valor com requisicao_invalida em body.valor", async () => {
    const conta = await criarConta("Nubank");

    const resposta = await pedir("POST", "/gastos", novoGasto(conta.id, { valor: 25.9 }));

    expect(resposta.status).toBe(422);
    expect(erroDe(resposta).codigo).toBe("requisicao_invalida");
    expect(erroDe(resposta).detalhes?.[0].campo).toBe("body.valor");
  });

  it.each(["25,90", "1.555", "0", "0.00", "-1", "1000000000000.01", "abc", ""])(
    "recusa o valor %j com valor_invalido",
    async (valor) => {
      const conta = await criarConta("Nubank");

      const resposta = await pedir("POST", "/gastos", novoGasto(conta.id, { valor }));

      expect(resposta.status).toBe(422);
      expect(erroDe(resposta).codigo).toBe("valor_invalido");
    },
  );

  it("recusa o gasto que levaria o saldo além do limite, sem gravar nada", async () => {
    const conta = await criarConta("Nubank", "-1000000000000.00");

    const resposta = await pedir("POST", "/gastos", novoGasto(conta.id, { valor: "0.01" }));

    expect(resposta.status).toBe(422);
    expect(erroDe(resposta).codigo).toBe("valor_invalido");
    expect((await listarContas())[0].saldo).toBe("-1000000000000.00");
    expect(await listarGastos("inicio=2026-10-01&fim=2026-10-31")).toEqual([]);
  });

  it.each([
    ["vazia", "   "],
    ["com 201 caracteres", "d".repeat(201)],
  ])("recusa descrição %s com descricao_invalida", async (_caso, descricao) => {
    const conta = await criarConta("Nubank");

    const resposta = await pedir("POST", "/gastos", novoGasto(conta.id, { descricao }));

    expect(resposta.status).toBe(422);
    expect(erroDe(resposta).codigo).toBe("descricao_invalida");
  });

  it("aceita descrição de 200 caracteres", async () => {
    const conta = await criarConta("Nubank");
    expect((await registrar(conta.id, { descricao: "d".repeat(200) })).descricao).toHaveLength(200);
  });

  it.each([
    ["categoria desconhecida", { categoria: "mercado" }, "body.categoria"],
    ["categoria ausente", { categoria: undefined }, "body.categoria"],
    ["conta_id malformado", { conta_id: "123" }, "body.conta_id"],
    ["data inexistente", { data: "2026-02-30" }, "body.data"],
    ["data fora do formato", { data: "10/10/2026" }, "body.data"],
    ["tags que não são lista", { tags: "pix" }, "body.tags"],
    ["tag que não é texto", { tags: ["pix", 1] }, "body.tags.1"],
  ])("recusa %s com requisicao_invalida", async (_caso, extra, campo) => {
    const conta = await criarConta("Nubank");

    const resposta = await pedir("POST", "/gastos", novoGasto(conta.id, extra));

    expect(resposta.status).toBe(422);
    expect(erroDe(resposta).codigo).toBe("requisicao_invalida");
    expect(erroDe(resposta).detalhes?.map((detalhe) => detalhe.campo)).toEqual([campo]);
  });

  it.each([
    ["11 tags distintas", Array.from({ length: 11 }, (_, i) => `tag ${i}`)],
    ["uma tag de 31 caracteres", ["a".repeat(31)]],
    ["uma tag vazia", ["  "]],
    ["uma tag com caractere de controle", ["pi\u0007x"]],
  ])("recusa %s com tag_invalida", async (_caso, tags) => {
    const conta = await criarConta("Nubank");

    const resposta = await pedir("POST", "/gastos", novoGasto(conta.id, { tags }));

    expect(resposta.status).toBe(422);
    expect(erroDe(resposta).codigo).toBe("tag_invalida");
  });

  it("aceita 11 tags que viram 10 depois de remover as repetidas", async () => {
    const conta = await criarConta("Nubank");
    const tags = [...Array.from({ length: 10 }, (_, i) => `tag ${i}`), "TAG 0"];

    expect((await registrar(conta.id, { tags })).tags).toHaveLength(10);
  });

  it("recusa conta inexistente com 404, sem gravar nem debitar", async () => {
    const conta = await criarConta("Nubank", "50.00");

    const resposta = await pedir("POST", "/gastos", novoGasto(ID_INEXISTENTE));

    expect(resposta.status).toBe(404);
    expect(erroDe(resposta)).toEqual({
      codigo: "conta_nao_encontrada",
      mensagem: "Conta não encontrada.",
    });
    expect(await listarContas()).toEqual([conta]);
    expect(await listarGastos("inicio=2026-10-01&fim=2026-10-31")).toEqual([]);
  });

  it("segue a precedência do backend: formato, valor, conta e então as regras do gasto", async () => {
    const conta = await criarConta("Nubank");

    // Formato da requisição vem antes de tudo.
    const formato = await pedir(
      "POST",
      "/gastos",
      novoGasto(ID_INEXISTENTE, { valor: "25,90", categoria: "mercado" }),
    );
    expect(erroDe(formato).codigo).toBe("requisicao_invalida");

    // O valor é convertido na rota, antes de procurar a conta.
    const valor = await pedir("POST", "/gastos", novoGasto(ID_INEXISTENTE, { valor: "25,90" }));
    expect(erroDe(valor).codigo).toBe("valor_invalido");

    // Valor zero só é recusado pela entidade Gasto, depois da busca da conta.
    const conta404 = await pedir(
      "POST",
      "/gastos",
      novoGasto(ID_INEXISTENTE, { valor: "0", descricao: "", tags: [""] }),
    );
    expect(erroDe(conta404).codigo).toBe("conta_nao_encontrada");

    // Na conta que existe: cada tag, depois a descrição, o valor positivo e a quantidade.
    const tag = await pedir("POST", "/gastos", novoGasto(conta.id, { descricao: "", tags: [""] }));
    expect(erroDe(tag).codigo).toBe("tag_invalida");
    const descricao = await pedir("POST", "/gastos", novoGasto(conta.id, { valor: "0", descricao: "" }));
    expect(erroDe(descricao).codigo).toBe("descricao_invalida");
  });
});

describe("GET /gastos", () => {
  it.each([
    ["sem inicio", "fim=2026-10-31", ["query.inicio"]],
    ["sem inicio nem fim", "", ["query.inicio", "query.fim"]],
    ["com inicio malformado", "inicio=2026-13-01&fim=2026-10-31", ["query.inicio"]],
    ["com conta_id malformado", "inicio=2026-10-01&fim=2026-10-31&conta_id=x", ["query.conta_id"]],
    [
      "com categoria desconhecida",
      "inicio=2026-10-01&fim=2026-10-31&categoria=mercado",
      ["query.categoria"],
    ],
  ])("recusa a consulta %s com requisicao_invalida", async (_caso, consulta, campos) => {
    const resposta = await pedir("GET", `/gastos?${consulta}`);

    expect(resposta.status).toBe(422);
    expect(erroDe(resposta).codigo).toBe("requisicao_invalida");
    expect(erroDe(resposta).detalhes?.map((detalhe) => detalhe.campo)).toEqual(campos);
  });

  it("recusa inicio depois de fim com periodo_invalido, antes de procurar a conta", async () => {
    const resposta = await pedir(
      "GET",
      `/gastos?inicio=2026-10-31&fim=2026-10-01&conta_id=${ID_INEXISTENTE}`,
    );

    expect(resposta.status).toBe(422);
    expect(erroDe(resposta).codigo).toBe("periodo_invalido");
  });

  it("recusa conta_id inexistente com 404", async () => {
    const resposta = await pedir(
      "GET",
      `/gastos?inicio=2026-10-01&fim=2026-10-31&conta_id=${ID_INEXISTENTE}`,
    );

    expect(resposta.status).toBe(404);
    expect(erroDe(resposta).codigo).toBe("conta_nao_encontrada");
  });

  it.each(["", "a".repeat(31)])("recusa a tag %j do filtro com tag_invalida", async (tag) => {
    const resposta = await pedir("GET", `/gastos?inicio=2026-10-01&fim=2026-10-31&tag=${tag}`);

    expect(resposta.status).toBe(422);
    expect(erroDe(resposta).codigo).toBe("tag_invalida");
  });

  it("filtra pelo período inclusivo, por tag normalizada, categoria e conta", async () => {
    const nubank = await criarConta("Nubank");
    const carteira = await criarConta("Carteira");
    await registrar(nubank.id, { descricao: "Antes", data: "2026-09-30" });
    const primeiro = await registrar(nubank.id, {
      descricao: "Primeiro dia",
      data: "2026-10-01",
      tags: ["pix"],
    });
    const ultimo = await registrar(carteira.id, {
      descricao: "Último dia",
      data: "2026-10-31",
      categoria: "lazer",
      tags: ["Pix", "ifood"],
    });
    await registrar(nubank.id, { descricao: "Depois", data: "2026-11-01" });
    const periodo = "inicio=2026-10-01&fim=2026-10-31";

    expect(await listarGastos(periodo)).toEqual([ultimo, primeiro]);
    expect(await listarGastos(`${periodo}&tag=%20PIX%20`)).toEqual([ultimo, primeiro]);
    expect(await listarGastos(`${periodo}&tag=ifood`)).toEqual([ultimo]);
    expect(await listarGastos(`${periodo}&categoria=conforto`)).toEqual([primeiro]);
    expect(await listarGastos(`${periodo}&conta_id=${carteira.id}`)).toEqual([ultimo]);
    expect(await listarGastos(`${periodo}&conta_id=${nubank.id}&categoria=lazer`)).toEqual([]);
  });

  it("ordena por data decrescente e, no mesmo dia, pelo id", async () => {
    const conta = await criarConta("Nubank");
    const antigo = await registrar(conta.id, { data: "2026-10-02" });
    const doDia = [
      await registrar(conta.id, { data: "2026-10-05" }),
      await registrar(conta.id, { data: "2026-10-05" }),
      await registrar(conta.id, { data: "2026-10-05" }),
    ].sort((a, b) => (a.id < b.id ? -1 : 1));

    expect(await listarGastos("inicio=2026-10-01&fim=2026-10-31")).toEqual([...doDia, antigo]);
  });
});

describe("GET /contas, /tags e /categorias", () => {
  it("lista contas e tags em ordem binária de code points, sem localeCompare", async () => {
    for (const nome of ["b", "Á", "a", "B", "😀", "\u{ff21}"]) await criarConta(nome);
    const conta = (await listarContas())[0];
    await registrar(conta.id, { tags: ["b", "Z", "á"] });
    await registrar(conta.id, { tags: ["a", "b", "😀", "\u{ff41}"] });

    expect((await listarContas()).map((c) => c.nome)).toEqual([
      "B",
      "a",
      "b",
      "Á",
      "\u{ff21}",
      "😀",
    ]);
    expect((await pedir("GET", "/tags")).corpo).toEqual(["a", "b", "z", "á", "\u{ff41}", "😀"]);
  });

  it("lista as categorias na ordem fixa do backend", async () => {
    const resposta = await pedir("GET", "/categorias");

    expect(resposta.status).toBe(200);
    expect(resposta.corpo as Categoria[]).toEqual([
      { codigo: "investimentos", nome: "Investimentos (antiga)", legada: true },
      { codigo: "lazer", nome: "Lazer", legada: false },
      { codigo: "conhecimento", nome: "Conhecimento", legada: false },
      { codigo: "conforto", nome: "Conforto", legada: false },
      { codigo: "gasto_fixo", nome: "Gasto fixo", legada: false },
    ]);
  });
});

describe("fetchSimulado", () => {
  it.each([
    ["GET", "/usuarios"],
    ["DELETE", "/contas"],
    ["GET", "/contas/"],
  ])("responde 404 rota_nao_simulada para %s %s", async (metodo, caminho) => {
    const resposta = await pedir(metodo, caminho);

    expect(resposta.status).toBe(404);
    expect(erroDe(resposta).codigo).toBe("rota_nao_simulada");
  });

  it("aceita Request e URL, como o fetch", async () => {
    const pedido = new Request(`${URL_BASE}/contas`, {
      method: "POST",
      credentials: "include",
      headers: { "X-Gastoba-Requisicao": "1" },
      body: JSON.stringify({ nome: "Nubank" }),
    });
    expect((await fetchSimulado(pedido)).status).toBe(201);
    const lista = await fetchSimulado(new URL(`${URL_BASE}/contas`), { credentials: "include" });
    expect(await lista.json()).toHaveLength(1);
  });

  it("responde 204 sem corpo e sem content-type", async () => {
    const resposta = await fetchSimulado(`${URL_BASE}/auth/sair`, {
      method: "POST",
      credentials: "include",
      headers: { "X-Gastoba-Requisicao": "1" },
    });

    expect(resposta.status).toBe(204);
    expect(resposta.headers.get("content-type")).toBeNull();
    expect(await resposta.text()).toBe("");
  });

  it("rejeita com AbortError quando o sinal já foi abortado", async () => {
    const controle = new AbortController();
    controle.abort();

    await expect(
      fetchSimulado(`${URL_BASE}/contas`, { signal: controle.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("reiniciarSimulacao", () => {
  it("volta ao estado vazio e sem sessão", async () => {
    await criarConta("Nubank");
    await pedir("POST", "/chaves-de-api", { nome: "script", escopo: "leitura" });

    reiniciarSimulacao();

    expect((await pedir("GET", "/contas")).status).toBe(401);
    entrarNaSimulacao();
    expect(await listarContas()).toEqual([]);
    expect((await pedir("GET", "/chaves-de-api")).corpo).toEqual([]);
  });

  it("com exemplos, começa sem sessão e mantém os dados de exemplo", async () => {
    reiniciarSimulacao({ comExemplos: true });

    expect((await pedir("GET", "/auth/eu")).status).toBe(401);
    expect((await pedir("POST", "/auth/entrar", { email: EMAIL_DE_EXEMPLO, senha: SENHA_DE_EXEMPLO })).status).toBe(200);
    // Duas contas de exemplo e dois cartões inventados (com as faturas).
    expect((await listarContas()).map((conta) => conta.nome)).toEqual([
      "Carteira",
      "Cartão Roxo",
      "FREE VISA",
      "Nubank",
    ]);
    const { inicio, fim } = limites(periodoAtual());
    const gastos = await listarGastos(`inicio=${inicio}&fim=${fim}`);
    expect(new Set(gastos.map((gasto) => gasto.categoria)).size).toBeGreaterThanOrEqual(3);
    expect(((await pedir("GET", "/tags")).corpo as string[]).length).toBeGreaterThanOrEqual(3);
  });
});

// --- autenticação --------------------------------------------------------------

async function entrar(email = EMAIL_DE_EXEMPLO, senha = SENHA_DE_EXEMPLO, opcoes?: OpcoesDoPedido) {
  return pedir("POST", "/auth/entrar", { email, senha }, opcoes);
}

function confereNaoAutenticado(resposta: Resposta): void {
  expect(resposta.status).toBe(401);
  expect(resposta.cabecalhos.get("www-authenticate")).toBe("Bearer");
  expect(resposta.corpo).toEqual({
    erro: { codigo: "nao_autenticado", mensagem: MENSAGEM_DE_NAO_AUTENTICADO },
  });
}

describe("sem sessão", () => {
  beforeEach(() => {
    reiniciarSimulacao();
  });

  it.each([
    ["GET", "/contas"],
    ["POST", "/contas"],
    ["GET", "/gastos?inicio=2026-10-01&fim=2026-10-31"],
    ["GET", "/gastos"],
    ["POST", "/gastos"],
    ["GET", "/tags"],
    ["GET", "/categorias"],
    ["GET", "/auth/eu"],
    ["POST", "/auth/sair"],
    ["GET", "/chaves-de-api"],
    ["POST", "/chaves-de-api"],
    ["DELETE", `/chaves-de-api/${ID_INEXISTENTE}`],
    ["DELETE", "/chaves-de-api/nao-e-uuid"],
  ])("%s %s responde 401 nao_autenticado, antes de validar a requisição", async (metodo, caminho) => {
    confereNaoAutenticado(await pedir(metodo, caminho, metodo === "GET" ? undefined : {}));
  });

  it("rota inexistente continua 404 rota_nao_simulada", async () => {
    const resposta = await pedir("GET", "/usuarios");

    expect(resposta.status).toBe(404);
    expect(erroDe(resposta).codigo).toBe("rota_nao_simulada");
  });
});

describe("POST /auth/entrar", () => {
  beforeEach(() => {
    reiniciarSimulacao();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 12, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("abre a sessão: devolve token e expiração em 12 h, e o cookie passa a autenticar", async () => {
    const resposta = await entrar();

    expect(resposta.status).toBe(200);
    const sessao = resposta.corpo as Sessao;
    expect(Object.keys(sessao).sort()).toEqual(["expira_em", "token"]);
    expect(sessao.token).toMatch(/^gsess_[A-Za-z0-9_-]{43}$/);
    expect(new Date(sessao.expira_em).getTime() - Date.now()).toBe(12 * 3600 * 1000);
    const eu = await pedir("GET", "/auth/eu");
    expect(eu.status).toBe(200);
    const usuario = eu.corpo as Usuario;
    expect(usuario).toEqual({
      id: usuario.id,
      email: EMAIL_DE_EXEMPLO,
      nome: "Você",
      importacao_bancaria: true,
      gestao_de_investimentos: true,
    });
    expect(usuario.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("normaliza o e-mail (pontas e caixa) e não exige o cabeçalho anti-CSRF", async () => {
    const resposta = await entrar("  VOCE@Exemplo.COM ", SENHA_DE_EXEMPLO, { antiCsrf: null });

    expect(resposta.status).toBe(200);
  });

  it.each([
    ["senha errada", EMAIL_DE_EXEMPLO, "outra-senha-123"],
    ["e-mail inexistente", "bia@exemplo.com", SENHA_DE_EXEMPLO],
    ["e-mail sem @", "sem-arroba", SENHA_DE_EXEMPLO],
    ["senha curta", EMAIL_DE_EXEMPLO, "curta"],
  ])("%s dá 401 credenciais_invalidas com a mensagem única, sem abrir sessão", async (_caso, email, senha) => {
    const resposta = await entrar(email, senha);

    expect(resposta.status).toBe(401);
    expect(resposta.cabecalhos.get("www-authenticate")).toBe("Bearer");
    expect(resposta.corpo).toEqual({
      erro: { codigo: "credenciais_invalidas", mensagem: MENSAGEM_DE_CREDENCIAIS_INVALIDAS },
    });
    expect(resposta.texto).not.toContain(senha);
    confereNaoAutenticado(await pedir("GET", "/auth/eu"));
  });

  it("corpo fora do formato dá 422 requisicao_invalida e não conta como tentativa", async () => {
    const resposta = await pedir("POST", "/auth/entrar", { email: 1 });

    expect(resposta.status).toBe(422);
    expect(erroDe(resposta).codigo).toBe("requisicao_invalida");
    expect(erroDe(resposta).detalhes?.map((detalhe) => detalhe.campo)).toEqual(["body.email", "body.senha"]);
    for (let i = 0; i < 6; i++) await pedir("POST", "/auth/entrar", {});
    expect((await entrar()).status).toBe(200);
  });

  it("5 falhas do mesmo e-mail bloqueiam com 429 e Retry-After de 15 min, mesmo com a senha certa", async () => {
    for (let i = 0; i < 5; i++) expect((await entrar(EMAIL_DE_EXEMPLO, "senha-errada-1")).status).toBe(401);

    const bloqueada = await entrar();

    expect(bloqueada.status).toBe(429);
    expect(bloqueada.corpo).toEqual({
      erro: {
        codigo: "muitas_tentativas",
        mensagem: "Muitas tentativas de entrar. Tente de novo mais tarde.",
      },
    });
    expect(bloqueada.cabecalhos.get("retry-after")).toBe("900");
    confereNaoAutenticado(await pedir("GET", "/auth/eu"));

    vi.setSystemTime(Date.now() + 10 * 60 * 1000);
    expect((await entrar()).cabecalhos.get("retry-after")).toBe("300");

    vi.setSystemTime(Date.now() + 5 * 60 * 1000);
    expect((await entrar()).status).toBe(200);
  });

  it("5 falhas de e-mails diferentes bloqueiam pela origem", async () => {
    for (let i = 0; i < 5; i++) await entrar(`pessoa${i}@exemplo.com`, SENHA_DE_EXEMPLO);

    expect((await entrar()).status).toBe(429);
  });

  it("entrar zera as falhas do e-mail; a origem só não perde a tentativa certa", async () => {
    for (let i = 0; i < 4; i++) await entrar(EMAIL_DE_EXEMPLO, "senha-errada-1");
    expect((await entrar()).status).toBe(200);

    expect(erroDe(await entrar(EMAIL_DE_EXEMPLO, "senha-errada-1")).codigo).toBe("credenciais_invalidas");
    expect(erroDe(await entrar(EMAIL_DE_EXEMPLO, "senha-errada-1")).codigo).toBe("muitas_tentativas");
  });

  it("a sessão expira em 12 h", async () => {
    await entrar();

    vi.setSystemTime(Date.now() + 12 * 3600 * 1000);

    confereNaoAutenticado(await pedir("GET", "/contas"));
  });

  it("sem credentials include o navegador não guarda nem envia o cookie", async () => {
    expect((await entrar(EMAIL_DE_EXEMPLO, SENHA_DE_EXEMPLO, { credenciais: "same-origin" })).status).toBe(200);
    confereNaoAutenticado(await pedir("GET", "/auth/eu"));

    await entrar();
    expect((await pedir("GET", "/auth/eu")).status).toBe(200);
    confereNaoAutenticado(await pedir("GET", "/auth/eu", undefined, { credenciais: "omit" }));
  });

  it("cada entrada abre uma sessão nova, com outro token", async () => {
    const primeira = (await entrar()).corpo as Sessao;
    const segunda = (await entrar()).corpo as Sessao;

    expect(segunda.token).not.toBe(primeira.token);
  });
});

describe("proteção contra CSRF", () => {
  it.each([
    ["sem o cabeçalho", null],
    ["com o valor 0", "0"],
    ["com o valor true", "true"],
    ["vazio", ""],
  ])("escrita pelo cookie %s dá 403 requisicao_invalida_origem e não grava", async (_caso, antiCsrf) => {
    const resposta = await pedir("POST", "/contas", { nome: "Nubank" }, { antiCsrf });

    expect(resposta.status).toBe(403);
    expect(resposta.corpo).toEqual({
      erro: {
        codigo: "requisicao_invalida_origem",
        mensagem: "Requisição com cookie sem o cabeçalho X-Gastoba-Requisicao.",
      },
    });
    expect(await listarContas()).toEqual([]);
  });

  it("vale também para sair, criar e revogar chaves; leitura não exige", async () => {
    expect((await pedir("POST", "/auth/sair", undefined, { antiCsrf: null })).status).toBe(403);
    expect(
      (await pedir("POST", "/chaves-de-api", { nome: "a", escopo: "leitura" }, { antiCsrf: null })).status,
    ).toBe(403);
    expect((await pedir("DELETE", `/chaves-de-api/${ID_INEXISTENTE}`, undefined, { antiCsrf: null })).status).toBe(403);
    expect((await pedir("GET", "/auth/eu")).status).toBe(200);
  });

  it("sem sessão, o 401 vem antes do 403", async () => {
    reiniciarSimulacao();

    confereNaoAutenticado(await pedir("POST", "/contas", { nome: "Nubank" }, { antiCsrf: null }));
  });
});

describe("POST /auth/sair e GET /auth/eu", () => {
  it("entrarNaSimulacao deixa a sessão do usuário de exemplo ativa", async () => {
    const eu = await pedir("GET", "/auth/eu");

    expect(eu.status).toBe(200);
    expect(eu.corpo).toMatchObject({ email: EMAIL_DE_EXEMPLO, nome: "Você" });
  });

  it("sair responde 204 sem corpo, encerra a sessão e sair de novo dá 401", async () => {
    const resposta = await pedir("POST", "/auth/sair");

    expect(resposta.status).toBe(204);
    expect(resposta.texto).toBe("");
    confereNaoAutenticado(await pedir("GET", "/contas"));
    confereNaoAutenticado(await pedir("POST", "/auth/sair"));
  });

  it("depois de sair, entrar de novo devolve os mesmos dados do usuário", async () => {
    await criarConta("Nubank");
    await pedir("POST", "/chaves-de-api", { nome: "script", escopo: "leitura" });
    await pedir("POST", "/auth/sair");

    expect((await entrar()).status).toBe(200);

    expect((await listarContas()).map((conta) => conta.nome)).toEqual(["Nubank"]);
    expect(((await pedir("GET", "/chaves-de-api")).corpo as ChaveDeApi[]).map((c) => c.nome)).toEqual([
      "script",
    ]);
  });
});

describe("chaves de API", () => {
  async function criarChave(nome = "script", escopo = "escrita"): Promise<ChaveDeApiCriada> {
    const resposta = await pedir("POST", "/chaves-de-api", { nome, escopo });
    expect(resposta.status).toBe(201);
    return resposta.corpo as ChaveDeApiCriada;
  }

  it("POST cria com 201 e devolve o segredo, com nome aparado e sem expiração", async () => {
    const chave = await criarChave("  Planilha  ", "leitura");

    expect(Object.keys(chave).sort()).toEqual([
      "criada_em",
      "escopo",
      "expira_em",
      "id",
      "nome",
      "prefixo",
      "segredo",
      "ultimo_uso",
    ]);
    expect(chave.nome).toBe("Planilha");
    expect(chave.escopo).toBe("leitura");
    expect(chave.prefixo).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(chave.segredo).toMatch(new RegExp(`^gapi_${chave.prefixo}_[A-Za-z0-9_-]{43}$`));
    expect(chave.ultimo_uso).toBeNull();
    expect(chave.expira_em).toBeNull();
    expect(Number.isNaN(new Date(chave.criada_em).getTime())).toBe(false);
  });

  it("a listagem nunca traz o segredo e vem da mais nova para a mais antiga", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      entrarNaSimulacao();
      vi.setSystemTime(new Date(2026, 9, 12, 12, 0, 0));
      const antiga = await criarChave("A");
      vi.setSystemTime(new Date(2026, 9, 12, 12, 0, 1));
      const nova = await criarChave("B");

      const resposta = await pedir("GET", "/chaves-de-api");

      expect(resposta.status).toBe(200);
      const chaves = resposta.corpo as ChaveDeApi[];
      expect(chaves.map((chave) => chave.nome)).toEqual(["B", "A"]);
      for (const chave of chaves) expect(chave).not.toHaveProperty("segredo");
      expect(resposta.texto).not.toContain(antiga.segredo.split("_").at(-1));
      expect(resposta.texto).not.toContain(nova.segredo.split("_").at(-1));
      const { segredo: _segredo, ...semSegredo } = nova;
      expect(chaves[0]).toEqual(semSegredo);
    } finally {
      vi.useRealTimers();
    }
  });

  it("DELETE revoga com 204 sem corpo; revogar de novo dá 404", async () => {
    const chave = await criarChave();

    const resposta = await pedir("DELETE", `/chaves-de-api/${chave.id}`);

    expect(resposta.status).toBe(204);
    expect(resposta.texto).toBe("");
    expect((await pedir("GET", "/chaves-de-api")).corpo).toEqual([]);
    const segunda = await pedir("DELETE", `/chaves-de-api/${chave.id}`);
    expect(segunda.status).toBe(404);
    expect(erroDe(segunda)).toEqual({
      codigo: "chave_de_api_nao_encontrada",
      mensagem: "Chave de API não encontrada.",
    });
  });

  it("DELETE de chave inexistente dá 404; de id que não é UUID, 422", async () => {
    expect(erroDe(await pedir("DELETE", `/chaves-de-api/${ID_INEXISTENTE}`)).codigo).toBe(
      "chave_de_api_nao_encontrada",
    );
    const malformado = await pedir("DELETE", "/chaves-de-api/123");
    expect(malformado.status).toBe(422);
    expect(erroDe(malformado).codigo).toBe("requisicao_invalida");
    expect(erroDe(malformado).detalhes?.map((detalhe) => detalhe.campo)).toEqual(["path.chave_id"]);
  });

  it.each([
    ["vazio", "   ", "O nome da chave de API não pode ser vazio."],
    ["com 61 caracteres", "x".repeat(61), "O nome da chave de API deve ter no máximo 60 caracteres."],
  ])("nome %s dá 422 nome_de_chave_invalido", async (_caso, nome, mensagem) => {
    const resposta = await pedir("POST", "/chaves-de-api", { nome, escopo: "leitura" });

    expect(resposta.status).toBe(422);
    expect(erroDe(resposta)).toEqual({ codigo: "nome_de_chave_invalido", mensagem });
  });

  it("aceita nome de 60 caracteres, contados em code points", async () => {
    expect((await criarChave("😀".repeat(60))).nome).toBe("😀".repeat(60));
  });

  it("escopo desconhecido ou campos ausentes dão 422 requisicao_invalida", async () => {
    const escopo = await pedir("POST", "/chaves-de-api", { nome: "a", escopo: "admin" });
    expect(erroDe(escopo).codigo).toBe("requisicao_invalida");
    expect(erroDe(escopo).detalhes).toEqual([
      { campo: "body.escopo", mensagem: "Input should be 'leitura' or 'escrita'" },
    ]);

    const vazio = await pedir("POST", "/chaves-de-api", {});
    expect(erroDe(vazio).detalhes?.map((detalhe) => detalhe.campo)).toEqual(["body.nome", "body.escopo"]);
  });

  it("aceita expira_em futura com fuso e recusa a sem fuso ou no passado", async () => {
    const futura = await pedir("POST", "/chaves-de-api", {
      nome: "a",
      escopo: "leitura",
      expira_em: "2999-01-01T00:00:00Z",
    });
    expect(futura.status).toBe(201);
    expect((futura.corpo as ChaveDeApiCriada).expira_em).not.toBeNull();

    const semFuso = await pedir("POST", "/chaves-de-api", {
      nome: "a",
      escopo: "leitura",
      expira_em: "2999-01-01T00:00:00",
    });
    expect(erroDe(semFuso)).toEqual({
      codigo: "expiracao_invalida",
      mensagem: "A expiração da chave de API precisa ter fuso horário.",
    });

    const passada = await pedir("POST", "/chaves-de-api", {
      nome: "a",
      escopo: "leitura",
      expira_em: "2020-01-01T00:00:00Z",
    });
    expect(erroDe(passada)).toEqual({
      codigo: "expiracao_invalida",
      mensagem: "A chave de API precisa expirar depois de ser criada.",
    });
  });
});

describe("POST /auth/cadastro", () => {
  const dados = { nome: "Ana", email: "Ana@Exemplo.com ", senha: "uma-senha-bem-grande" };

  it("cria a pessoa sem exigir sessão, com o e-mail normalizado, e ela consegue entrar", async () => {
    reiniciarSimulacao();

    const resposta = await pedir("POST", "/auth/cadastro", dados);
    expect(resposta.status).toBe(201);
    expect(resposta.corpo).toMatchObject({ nome: "Ana", email: "ana@exemplo.com" });
    expect(JSON.stringify(resposta.corpo)).not.toContain(dados.senha);

    const entrada = await pedir("POST", "/auth/entrar", { email: "ana@exemplo.com", senha: dados.senha });
    expect(entrada.status).toBe(200);
    expect((await pedir("GET", "/auth/eu")).corpo).toMatchObject({ nome: "Ana" });
  });

  it("e-mail repetido, inclusive o do usuário de exemplo, dá 409", async () => {
    expect((await pedir("POST", "/auth/cadastro", dados)).status).toBe(201);
    const repetido = await pedir("POST", "/auth/cadastro", dados);
    expect(repetido.status).toBe(409);
    expect((repetido.corpo as ErroDaApi).erro.codigo).toBe("email_ja_cadastrado");

    const exemplo = await pedir("POST", "/auth/cadastro", { ...dados, email: EMAIL_DE_EXEMPLO });
    expect(exemplo.status).toBe(409);
  });

  it("valida nome, e-mail e senha com os códigos do backend", async () => {
    const codigo = async (corpo: unknown) =>
      ((await pedir("POST", "/auth/cadastro", corpo)).corpo as ErroDaApi).erro.codigo;

    expect(await codigo({ ...dados, nome: "   " })).toBe("nome_invalido");
    expect(await codigo({ ...dados, email: "sem-arroba" })).toBe("email_invalido");
    expect(await codigo({ ...dados, senha: "curta" })).toBe("senha_invalida");
    expect(await codigo({ ...dados, senha: "x".repeat(129) })).toBe("senha_invalida");
    expect(await codigo({ nome: "Ana" })).toBe("requisicao_invalida");
  });
});

describe("POST /ganhos e GET /ganhos", () => {
  const novoGanho = (contaId: string, extra: Record<string, unknown> = {}) => ({
    conta_id: contaId,
    valor: "5000.00",
    descricao: "Salário",
    data: "2026-10-05",
    tags: [],
    ...extra,
  });
  const codigoDe = (resposta: Resposta) => (resposta.corpo as ErroDaApi).erro.codigo;

  it("registra com 201, normaliza as tags e credita o saldo em centavos exatos", async () => {
    const conta = await criarConta("Nubank", "0.10");

    const resposta = await pedir(
      "POST",
      "/ganhos",
      novoGanho(conta.id, { valor: "0.20", descricao: "  Troco  ", tags: ["  Pix ", "pix", "Salário  CLT"] }),
    );

    expect(resposta.status).toBe(201);
    expect(resposta.corpo).toEqual({
      id: (resposta.corpo as { id: string }).id,
      transacao_importada_id: null,
      conta_id: conta.id,
      valor: "0.20",
      descricao: "Troco",
      data: "2026-10-05",
      tags: ["pix", "salário clt"],
      origem: "manual",
      recorrencia_id: null,
    });
    expect((await listarContas())[0].saldo).toBe("0.30");
  });

  it("valida na ordem do backend: conta, descrição, valor", async () => {
    const conta = await criarConta("Nubank");

    expect(codigoDe(await pedir("POST", "/ganhos", novoGanho(ID_INEXISTENTE)))).toBe("conta_nao_encontrada");
    expect(codigoDe(await pedir("POST", "/ganhos", novoGanho(conta.id, { descricao: "  " })))).toBe(
      "descricao_invalida",
    );
    expect(codigoDe(await pedir("POST", "/ganhos", novoGanho(conta.id, { valor: "0.00" })))).toBe(
      "valor_invalido",
    );
    expect(codigoDe(await pedir("POST", "/ganhos", novoGanho(conta.id, { tags: [" "] })))).toBe("tag_invalida");
    expect((await listarContas())[0].saldo).toBe("0.00");
  });

  it("valor como número JSON e campo ausente dão 422 requisicao_invalida", async () => {
    const conta = await criarConta("Nubank");

    expect(codigoDe(await pedir("POST", "/ganhos", novoGanho(conta.id, { valor: 10 })))).toBe(
      "requisicao_invalida",
    );
    expect(codigoDe(await pedir("POST", "/ganhos", { conta_id: conta.id }))).toBe("requisicao_invalida");
  });

  it("credito acima do limite dá 422 valor_invalido sem alterar o saldo", async () => {
    const conta = await criarConta("Nubank", "999999999999.99");

    const resposta = await pedir("POST", "/ganhos", novoGanho(conta.id, { valor: "10.00" }));

    expect(resposta.status).toBe(422);
    expect(codigoDe(resposta)).toBe("valor_invalido");
    expect((await listarContas())[0].saldo).toBe("999999999999.99");
  });

  it("lista só o período e a conta pedidos, do mais recente ao mais antigo, e não mistura com gastos", async () => {
    const uma = await criarConta("Uma");
    const outra = await criarConta("Outra");
    await pedir("POST", "/ganhos", novoGanho(uma.id, { descricao: "Antes", data: "2026-09-30" }));
    await pedir("POST", "/ganhos", novoGanho(uma.id, { descricao: "Primeiro", data: "2026-10-01" }));
    await pedir("POST", "/ganhos", novoGanho(outra.id, { descricao: "Último", data: "2026-10-31" }));

    const todos = await pedir("GET", "/ganhos?inicio=2026-10-01&fim=2026-10-31");
    const daUma = await pedir("GET", `/ganhos?inicio=2026-10-01&fim=2026-10-31&conta_id=${uma.id}`);
    const gastos = await pedir("GET", "/gastos?inicio=2026-10-01&fim=2026-10-31");

    expect((todos.corpo as { descricao: string }[]).map((g) => g.descricao)).toEqual(["Último", "Primeiro"]);
    expect((daUma.corpo as { descricao: string }[]).map((g) => g.descricao)).toEqual(["Primeiro"]);
    expect(gastos.corpo).toEqual([]);
  });

  it("período invertido, conta inexistente e período ausente", async () => {
    expect(codigoDe(await pedir("GET", "/ganhos?inicio=2026-10-31&fim=2026-10-01"))).toBe("periodo_invalido");
    expect(
      codigoDe(await pedir("GET", `/ganhos?inicio=2026-10-01&fim=2026-10-31&conta_id=${ID_INEXISTENTE}`)),
    ).toBe("conta_nao_encontrada");
    expect(codigoDe(await pedir("GET", "/ganhos"))).toBe("requisicao_invalida");
  });

  it("exige a sessão, como as demais rotas de negócio", async () => {
    reiniciarSimulacao();

    const resposta = await pedir("GET", "/ganhos?inicio=2026-10-01&fim=2026-10-31");

    expect(resposta.status).toBe(401);
    expect(codigoDe(resposta)).toBe("nao_autenticado");
  });
});

describe("recorrências na simulação", () => {
  const nova = (contaId: string, extra: Record<string, unknown> = {}) => ({
    tipo: "ganho",
    conta_id: contaId,
    valor: "5000.00",
    descricao: "Salário",
    dia_do_mes: 5,
    inicio: "2999-01-01",
    tags: [],
    ...extra,
  });
  const codigoDe = (resposta: Resposta) => (resposta.corpo as ErroDaApi).erro.codigo;

  it("cria com 201 e devolve a recorrência; no futuro não gera nada", async () => {
    const conta = await criarConta("Nubank");

    const resposta = await pedir("POST", "/recorrencias", nova(conta.id, { tags: ["Pix", "pix"] }));

    expect(resposta.status).toBe(201);
    expect(resposta.corpo).toEqual({
      id: (resposta.corpo as { id: string }).id,
      tipo: "ganho",
      conta_id: conta.id,
      valor: "5000.00",
      descricao: "Salário",
      dia_do_mes: 5,
      inicio: "2999-01-01",
      fim: null,
      categoria: null,
      tags: ["pix"],
      ativa: true,
    });
    expect((await pedir("GET", "/ganhos?inicio=2000-01-01&fim=2999-12-31")).corpo).toEqual([]);
  });

  it("com início no passado gera um ganho por mês vencido e credita a conta", async () => {
    const conta = await criarConta("Nubank", "0.00");
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1);
    const texto = `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, "0")}-01`;

    await pedir("POST", "/recorrencias", nova(conta.id, { inicio: texto, dia_do_mes: 1, valor: "10.00" }));

    const gerados = (await pedir("GET", "/ganhos?inicio=2000-01-01&fim=2999-12-31")).corpo as { data: string }[];
    expect(gerados).toHaveLength(3); // o dia 1º dos 3 meses, o último já vencido hoje
    expect((await listarContas())[0].saldo).toBe("30.00");
  });

  it("gasto exige categoria e ganho não pode ter; as regras do domínio têm códigos próprios", async () => {
    const conta = await criarConta("Nubank");

    expect(codigoDe(await pedir("POST", "/recorrencias", nova(conta.id, { tipo: "gasto" })))).toBe("recorrencia_invalida");
    expect(codigoDe(await pedir("POST", "/recorrencias", nova(conta.id, { categoria: "lazer" })))).toBe("recorrencia_invalida");
    expect(codigoDe(await pedir("POST", "/recorrencias", nova(conta.id, { dia_do_mes: 32 })))).toBe("recorrencia_invalida");
    expect(codigoDe(await pedir("POST", "/recorrencias", nova(conta.id, { fim: "2998-01-01" })))).toBe("recorrencia_invalida");
    expect(codigoDe(await pedir("POST", "/recorrencias", nova(conta.id, { inicio: "2000-01-01" })))).toBe("recorrencia_invalida");
    expect(codigoDe(await pedir("POST", "/recorrencias", nova(conta.id, { valor: "0.00" })))).toBe("valor_invalido");
    expect(codigoDe(await pedir("POST", "/recorrencias", nova(conta.id, { descricao: " " })))).toBe("descricao_invalida");
    expect(codigoDe(await pedir("POST", "/recorrencias", nova(ID_INEXISTENTE)))).toBe("conta_nao_encontrada");
    expect((await pedir("GET", "/recorrencias")).corpo).toEqual([]);
  });

  it("corpo malformado dá 422 requisicao_invalida", async () => {
    const conta = await criarConta("Nubank");

    for (const extra of [{ valor: 5000 }, { dia_do_mes: "5" }, { tipo: "outro" }, { categoria: "viagens" }, { inicio: "01/01/2999" }]) {
      expect(codigoDe(await pedir("POST", "/recorrencias", nova(conta.id, extra)))).toBe("requisicao_invalida");
    }
  });

  it("limita a 50 recorrências ativas", async () => {
    const conta = await criarConta("Nubank");
    for (let i = 0; i < 50; i += 1) {
      expect((await pedir("POST", "/recorrencias", nova(conta.id, { descricao: `R${i}` }))).status).toBe(201);
    }

    const resposta = await pedir("POST", "/recorrencias", nova(conta.id, { descricao: "Extra" }));

    expect(resposta.status).toBe(422);
    expect(codigoDe(resposta)).toBe("recorrencia_invalida");
  });

  it("lista por descrição; altera e encerra (idempotente); inexistente dá 404", async () => {
    const conta = await criarConta("Nubank");
    const b = (await pedir("POST", "/recorrencias", nova(conta.id, { descricao: "Bolsa" }))).corpo as { id: string };
    await pedir("POST", "/recorrencias", nova(conta.id, { descricao: "Antiga" }));

    const alterada = await pedir("PUT", `/recorrencias/${b.id}`, {
      valor: "6000.00",
      descricao: "Bolsa nova",
      dia_do_mes: 10,
      tags: ["fixo"],
      fim: "2999-12-31",
    });
    expect(alterada.status).toBe(200);
    expect(alterada.corpo).toMatchObject({ valor: "6000.00", descricao: "Bolsa nova", dia_do_mes: 10, fim: "2999-12-31", tags: ["fixo"], inicio: "2999-01-01" });
    expect(((await pedir("GET", "/recorrencias")).corpo as { descricao: string }[]).map((r) => r.descricao)).toEqual(["Antiga", "Bolsa nova"]);

    expect((await pedir("DELETE", `/recorrencias/${b.id}`)).status).toBe(204);
    expect((await pedir("DELETE", `/recorrencias/${b.id}`)).status).toBe(204);
    expect(((await pedir("GET", "/recorrencias")).corpo as { ativa: boolean }[]).map((r) => r.ativa)).toEqual([true, false]);
    expect(codigoDe(await pedir("DELETE", `/recorrencias/${ID_INEXISTENTE}`))).toBe("recorrencia_nao_encontrada");
    expect(codigoDe(await pedir("PUT", `/recorrencias/${ID_INEXISTENTE}`, { valor: "1.00", descricao: "x", dia_do_mes: 1 }))).toBe("recorrencia_nao_encontrada");
    expect(codigoDe(await pedir("DELETE", "/recorrencias/nao-e-uuid"))).toBe("requisicao_invalida");
  });
});

describe("metas na simulação", () => {
  const codigoDe = (resposta: Resposta) => (resposta.corpo as ErroDaApi).erro.codigo;
  const registrarGanho = async (contaId: string, valor: string, data = "2026-10-05") =>
    pedir("POST", "/ganhos", { conta_id: contaId, valor, descricao: "Salário", data, tags: [] });
  const registrarGasto = async (contaId: string, valor: string, categoria: string, data = "2026-10-10") =>
    pedir("POST", "/gastos", { conta_id: contaId, valor, descricao: "Compra", data, categoria, tags: [] });

  it("define, troca o percentual e lista na ordem das categorias", async () => {
    await pedir("PUT", "/metas/gasto_fixo", { percentual: 30 });
    await pedir("PUT", "/metas/investimentos", { percentual: 10 });
    const primeira = await pedir("PUT", "/metas/lazer", { percentual: 20 });
    await pedir("PUT", "/metas/lazer", { percentual: 25 });

    expect(primeira.status).toBe(200);
    expect(primeira.corpo).toEqual({ categoria: "lazer", nome: "Lazer", percentual: 20 });
    expect((await pedir("GET", "/metas")).corpo).toEqual([
      { categoria: "liberdade_financeira", nome: "Liberdade financeira", percentual: 10 },
      { categoria: "lazer", nome: "Lazer", percentual: 25 },
      { categoria: "gasto_fixo", nome: "Gasto fixo", percentual: 30 },
    ]);
  });

  it("valida o percentual e a categoria", async () => {
    for (const percentual of [0, -1, 101]) {
      expect(codigoDe(await pedir("PUT", "/metas/lazer", { percentual }))).toBe("percentual_invalido");
    }
    for (const corpo of [{ percentual: "20" }, { percentual: 20.5 }, { percentual: true }, {}]) {
      expect(codigoDe(await pedir("PUT", "/metas/lazer", corpo))).toBe("requisicao_invalida");
    }
    expect(codigoDe(await pedir("PUT", "/metas/viagens", { percentual: 10 }))).toBe("requisicao_invalida");
    expect((await pedir("GET", "/metas")).corpo).toEqual([]);
  });

  it("a soma não passa de 100%: 100 exato pode, 101 não, e trocar a própria não conta em dobro", async () => {
    await pedir("PUT", "/metas/gasto_fixo", { percentual: 60 });
    expect((await pedir("PUT", "/metas/lazer", { percentual: 40 })).status).toBe(200);

    const excedeu = await pedir("PUT", "/metas/conforto", { percentual: 1 });
    expect(codigoDe(excedeu)).toBe("percentuais_excedem_100");
    expect((excedeu.corpo as ErroDaApi).erro.mensagem).toContain("101%");
    expect(codigoDe(await pedir("PUT", "/metas/lazer", { percentual: 41 }))).toBe("percentuais_excedem_100");
    expect((await pedir("PUT", "/metas/lazer", { percentual: 40 })).status).toBe(200);
  });

  it("remove e responde 404 para a que não existe", async () => {
    await pedir("PUT", "/metas/lazer", { percentual: 20 });

    expect((await pedir("DELETE", "/metas/lazer")).status).toBe(204);
    expect(codigoDe(await pedir("DELETE", "/metas/lazer"))).toBe("meta_nao_encontrada");
    expect(codigoDe(await pedir("DELETE", "/metas/viagens"))).toBe("requisicao_invalida");
  });

  it("o progresso traz renda, limite, gasto, restante, percentual usado e situação do mês", async () => {
    const conta = await criarConta("Nubank");
    await registrarGanho(conta.id, "5000.00");
    await pedir("PUT", "/metas/lazer", { percentual: 10 });
    await pedir("PUT", "/metas/gasto_fixo", { percentual: 40 });
    await pedir("PUT", "/metas/conforto", { percentual: 5 });
    await registrarGasto(conta.id, "450.00", "lazer");
    await registrarGasto(conta.id, "2100.00", "gasto_fixo");
    await registrarGasto(conta.id, "30.00", "lazer", "2026-11-01"); // outro mês

    const resposta = await pedir("GET", "/metas/progresso?mes=2026-10");

    expect(resposta.status).toBe(200);
    expect(resposta.corpo).toEqual({
      aportes_do_mes: "0.00",
      mes: "2026-10",
      renda: "5000.00",
      renda_base: null,
      renda_de_referencia: "5000.00",
      metas: [
        { categoria: "lazer", nome:"Lazer", percentual: 10, limite: "500.00", gasto: "450.00", restante: "50.00", percentual_usado: 90, situacao: "alerta", gasto_bruto: "450.00", limite_adicional: "0.00", caixinhas: [], rentabilidade: null },
        { categoria: "conforto", nome:"Conforto", percentual: 5, limite: "250.00", gasto: "0.00", restante: "250.00", percentual_usado: 0, situacao: "dentro", gasto_bruto: "0.00", limite_adicional: "0.00", caixinhas: [], rentabilidade: null },
        { categoria: "gasto_fixo", nome:"Gasto fixo", percentual: 40, limite: "2000.00", gasto: "2100.00", restante: "-100.00", percentual_usado: 105, situacao: "estourou", gasto_bruto: "2100.00", limite_adicional: "0.00", caixinhas: [], rentabilidade: null },
      ],
    });
  });

  it("sem renda no mês a situação é sem_renda; mês inválido ou ausente é 422", async () => {
    const conta = await criarConta("Nubank");
    await pedir("PUT", "/metas/lazer", { percentual: 20 });
    await registrarGasto(conta.id, "10.00", "lazer");

    const semRenda = (await pedir("GET", "/metas/progresso?mes=2026-10")).corpo as { metas: { situacao: string }[] };
    expect(semRenda.metas[0].situacao).toBe("sem_renda");
    for (const mes of ["2026-13", "2026-00", "0000-01", "outubro", "2026-1"]) {
      expect(codigoDe(await pedir("GET", `/metas/progresso?mes=${mes}`))).toBe("mes_invalido");
    }
    expect(codigoDe(await pedir("GET", "/metas/progresso"))).toBe("requisicao_invalida");
  });

  it("exige a sessão", async () => {
    reiniciarSimulacao();

    expect((await pedir("GET", "/metas")).status).toBe(401);
    expect((await pedir("PUT", "/metas/lazer", { percentual: 10 })).status).toBe(401);
    expect((await pedir("GET", "/recorrencias")).status).toBe(401);
  });
});


describe("GET /resumos/tags", () => {
  const periodo = "inicio=2026-10-01&fim=2026-10-31";

  it("sem gastos, devolve total zero e nenhuma fatia", async () => {
    const resposta = await pedir("GET", `/resumos/tags?${periodo}`);

    expect(resposta.status).toBe(200);
    expect(resposta.corpo).toEqual({ inicio: "2026-10-01", fim: "2026-10-31", total: "0.00", fatias: [] });
  });

  it("divide o gasto entre as tags com o resto na primeira e separa o sem tag (mesmos exemplos do backend)", async () => {
    const conta = await criarConta("Nubank", "1000.00");
    await registrar(conta.id, { valor: "10.00", tags: ["mercado", "pix", "casa"] });
    await registrar(conta.id, { valor: "5.00", tags: [] });
    await registrar(conta.id, { valor: "0.01", tags: ["a", "b"] });

    const resposta = await pedir("GET", `/resumos/tags?${periodo}`);

    expect(resposta.corpo).toEqual({
      inicio: "2026-10-01",
      fim: "2026-10-31",
      total: "15.01",
      fatias: [
        { tag: null, valor: "5.00" },
        { tag: "mercado", valor: "3.34" },
        { tag: "casa", valor: "3.33" },
        { tag: "pix", valor: "3.33" },
        { tag: "a", valor: "0.01" },
      ],
    });
  });

  it("filtra por conta e por categoria e recusa período invertido e conta inexistente", async () => {
    const nubank = await criarConta("Nubank", "1000.00");
    const carteira = await criarConta("Carteira", "1000.00");
    await registrar(nubank.id, { valor: "10.00", tags: ["a"] });
    await registrar(carteira.id, { valor: "20.00", tags: ["b"], categoria: "lazer" });

    const porConta = await pedir("GET", `/resumos/tags?${periodo}&conta_id=${carteira.id}`);
    const porCategoria = await pedir("GET", `/resumos/tags?${periodo}&categoria=lazer`);
    const invertido = await pedir("GET", "/resumos/tags?inicio=2026-11-01&fim=2026-10-01");
    const inexistente = await pedir("GET", `/resumos/tags?${periodo}&conta_id=${ID_INEXISTENTE}`);

    expect((porConta.corpo as { fatias: unknown[] }).fatias).toEqual([{ tag: "b", valor: "20.00" }]);
    expect((porCategoria.corpo as { fatias: unknown[] }).fatias).toEqual([{ tag: "b", valor: "20.00" }]);
    expect(invertido.status).toBe(422);
    expect(erroDe(invertido).codigo).toBe("periodo_invalido");
    expect(inexistente.status).toBe(404);
  });
});

describe("DELETE /ganhos/{id}", () => {
  async function registrarGanho(contaId: string, valor = "100.00") {
    const resposta = await pedir("POST", "/ganhos", {
      conta_id: contaId,
      valor,
      descricao: "Salário",
      data: "2026-10-05",
      tags: [],
    });
    expect(resposta.status).toBe(201);
    return resposta.corpo as { id: string };
  }

  it("apaga o ganho e devolve o saldo da conta", async () => {
    const conta = await criarConta("Nubank", "50.00");
    const ganho = await registrarGanho(conta.id, "100.00");
    expect((await listarContas())[0].saldo).toBe("150.00");

    const resposta = await pedir("DELETE", `/ganhos/${ganho.id}`);

    expect(resposta.status).toBe(204);
    expect((await listarContas())[0].saldo).toBe("50.00");
    const ganhos = (await pedir("GET", "/ganhos?inicio=2026-10-01&fim=2026-10-31")).corpo;
    expect(ganhos).toEqual([]);
  });

  it("ganho inexistente é 404 e id malformado é 422", async () => {
    const inexistente = await pedir("DELETE", `/ganhos/${ID_INEXISTENTE}`);
    const malformado = await pedir("DELETE", "/ganhos/abc");

    expect(inexistente.status).toBe(404);
    expect(erroDe(inexistente).codigo).toBe("ganho_nao_encontrado");
    expect(malformado.status).toBe(422);
  });

  it("o ganho gerado por uma recorrência é recusado com 409 e o saldo não muda", async () => {
    const conta = await criarConta("Nubank", "0.00");
    const ano = new Date().getFullYear() - 1;
    const recorrencia = await pedir("POST", "/recorrencias", {
      tipo: "ganho",
      conta_id: conta.id,
      valor: "10.00",
      descricao: "Bolsa",
      dia_do_mes: 1,
      inicio: `${ano}-01-01`,
    });
    expect(recorrencia.status).toBe(201);
    const saldoAntes = (await listarContas())[0].saldo;
    const gerados = (await pedir("GET", "/ganhos?inicio=2000-01-01&fim=2999-12-31")).corpo as { id: string }[];

    const resposta = await pedir("DELETE", `/ganhos/${gerados[0].id}`);

    expect(resposta.status).toBe(409);
    expect(erroDe(resposta).codigo).toBe("ganho_de_recorrencia");
    expect((await listarContas())[0].saldo).toBe(saldoAntes);
  });

  type NaCaixa = { id: string; descricao: string; estado: string };

  async function salarioDaCaixa(): Promise<NaCaixa> {
    expect((await pedir("POST", "/sincronizacoes")).status).toBe(200);
    const pendentes = (await pedir("GET", "/transacoes-importadas")).corpo as NaCaixa[];
    return pendentes.find((t) => t.descricao === "Salário") as NaCaixa;
  }

  async function idsNoEstado(estado: string): Promise<string[]> {
    const lista = (await pedir("GET", `/transacoes-importadas?estado=${estado}`)).corpo as NaCaixa[];
    return lista.map((t) => t.id).sort();
  }

  it("excluir o ganho aceito da caixa devolve a transação a pendente", async () => {
    const salario = await salarioDaCaixa();
    const aceite = await pedir("POST", `/transacoes-importadas/${salario.id}/aceitar`, { tags: [] });
    expect(aceite.status).toBe(201);
    const ganhoId = (aceite.corpo as { id: string }).id;
    expect(await idsNoEstado("aceita")).toContain(salario.id);

    const resposta = await pedir("DELETE", `/ganhos/${ganhoId}`);

    expect(resposta.status).toBe(204);
    expect(await idsNoEstado("pendente")).toContain(salario.id);
    expect(await idsNoEstado("aceita")).not.toContain(salario.id);
  });

  it("com outra parte da divisão restante, a transação continua aceita", async () => {
    const salario = await salarioDaCaixa();
    const divisao = await pedir("POST", `/transacoes-importadas/${salario.id}/dividir`, {
      partes: [{ percentual: 50 }, { percentual: 50 }],
    });
    expect(divisao.status).toBe(201);
    const [primeiro] = (divisao.corpo as { criados: { id: string }[] }).criados;

    const resposta = await pedir("DELETE", `/ganhos/${primeiro.id}`);

    expect(resposta.status).toBe(204);
    expect(await idsNoEstado("aceita")).toContain(salario.id);
    expect(await idsNoEstado("pendente")).not.toContain(salario.id);
  });

  it("excluir um ganho manual não mexe na caixa de entrada", async () => {
    await salarioDaCaixa();
    const conta = await criarConta("Carteira", "0.00");
    const ganho = await registrarGanho(conta.id, "20.00");
    const antes = {
      pendente: await idsNoEstado("pendente"),
      aceita: await idsNoEstado("aceita"),
      ignorada: await idsNoEstado("ignorada"),
    };

    const resposta = await pedir("DELETE", `/ganhos/${ganho.id}`);

    expect(resposta.status).toBe(204);
    expect({
      pendente: await idsNoEstado("pendente"),
      aceita: await idsNoEstado("aceita"),
      ignorada: await idsNoEstado("ignorada"),
    }).toEqual(antes);
  });
});

describe("importação bancária simulada", () => {
  type Importada = {
    id: string;
    descricao: string;
    sentido: string;
    valor: string;
    estado: string;
    sugerir_descarte: boolean;
    possivel_duplicado: boolean;
    conta_id: string;
  };

  async function sincronizar() {
    const resposta = await pedir("POST", "/sincronizacoes");
    expect(resposta.status).toBe(200);
    return resposta.corpo as { contas: number; transacoes_novas: number; falhas: number };
  }

  async function caixa(consulta = ""): Promise<Importada[]> {
    return (await pedir("GET", `/transacoes-importadas${consulta}`)).corpo as Importada[];
  }

  const da = (lista: Importada[], descricao: string) =>
    lista.find((t) => t.descricao === descricao) as Importada;

  it("no começo do mês, em que as datas se igualam, a caixa mantém a ordem do banco", async () => {
    // Dia 2: as seis transações simuladas "de dias atrás" caem todas no dia 1. O desempate não
    // pode ser aleatório (o id é um UUID novo a cada rodada), ou a ordem e o foco do teclado
    // mudam de uma execução para outra.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 2, 12, 0, 0));
    try {
      await sincronizar();
      const descricoes = (await caixa()).map((t) => t.descricao);
      expect(descricoes).toEqual(["Mercado Extra", "Salário", "Farmácia", "Estorno de compra"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sincronizar cria a conta do banco com o saldo dele e enche a caixa, sem duplicar", async () => {
    expect(await sincronizar()).toEqual({ contas: 2, transacoes_novas: 4, falhas: 0 });

    const contasDepois = await listarContas();
    expect(contasDepois).toEqual([
      {
        id: expect.any(String),
        nome: "Conta Corrente",
        saldo: "1500.00",
        origem: "open_finance",
        tipo: "corrente",
        papel: null,
      },
      {
        id: expect.any(String),
        nome: "Visa Gold",
        saldo: "-820.00",
        origem: "open_finance",
        tipo: "cartao",
        papel: null,
      },
    ]);
    expect((await caixa()).length).toBe(4);
    expect((await sincronizar()).transacoes_novas).toBe(0);
    expect((await caixa()).length).toBe(4);
  });

  it("transferência entre as próprias contas e pagamento de fatura nascem ignorados", async () => {
    await sincronizar();

    expect((await caixa()).map((t) => t.descricao).sort()).toEqual([
      "Estorno de compra",
      "Farmácia",
      "Mercado Extra",
      "Salário",
    ]);
    expect((await caixa("?estado=ignorada")).map((t) => t.descricao).sort()).toEqual([
      "Pagamento recebido",
      "Transferência entre contas",
    ]);
  });

  it("marca o que provavelmente se ignora e o possível duplicado de lançamento manual", async () => {
    await sincronizar();
    const conta = (await listarContas())[0];
    const mercado = da(await caixa(), "Mercado Extra");
    const dataDoMercado = (
      (await pedir("GET", "/transacoes-importadas")).corpo as { descricao: string; data: string }[]
    ).find((t) => t.descricao === "Mercado Extra")?.data as string;
    await registrar(conta.id, { valor: "87.35", data: dataDoMercado });

    const lista = await caixa();

    expect(da(lista, "Estorno de compra").sugerir_descarte).toBe(true);
    expect(da(lista, "Salário").sugerir_descarte).toBe(false);
    expect(da(lista, "Mercado Extra").possivel_duplicado).toBe(true);
    expect(da(lista, "Farmácia").possivel_duplicado).toBe(false);
    expect(mercado.conta_id).toBe(conta.id);
  });

  it("aceitar a saída cria o gasto com origem open_finance e não mexe no saldo do banco", async () => {
    await sincronizar();
    const farmacia = da(await caixa(), "Farmácia");

    const resposta = await pedir("POST", `/transacoes-importadas/${farmacia.id}/aceitar`, {
      categoria: "conforto",
      tags: ["Saúde"],
    });

    expect(resposta.status).toBe(201);
    expect((resposta.corpo as { tipo: string }).tipo).toBe("gasto");
    const gastos = (await pedir("GET", "/gastos?inicio=2000-01-01&fim=2999-12-31")).corpo as Gasto[];
    expect(gastos.map((g) => [g.descricao, g.valor, g.origem, g.tags])).toEqual([
      ["Farmácia", "45.90", "open_finance", ["saúde"]],
    ]);
    expect((await listarContas())[0].saldo).toBe("1500.00");
    expect((await caixa()).some((t) => t.descricao === "Farmácia")).toBe(false);
  });

  it("aceitar a entrada cria o ganho; categoria na entrada e falta dela na saída dão 422", async () => {
    await sincronizar();
    const lista = await caixa();

    const semCategoria = await pedir("POST", `/transacoes-importadas/${da(lista, "Farmácia").id}/aceitar`, {});
    const comCategoria = await pedir("POST", `/transacoes-importadas/${da(lista, "Salário").id}/aceitar`, {
      categoria: "lazer",
    });
    const entrada = await pedir("POST", `/transacoes-importadas/${da(lista, "Salário").id}/aceitar`, {});

    expect(semCategoria.status).toBe(422);
    expect(erroDe(semCategoria).codigo).toBe("transacao_importada_invalida");
    expect(comCategoria.status).toBe(422);
    expect(entrada.status).toBe(201);
    expect((entrada.corpo as { tipo: string }).tipo).toBe("ganho");
  });

  it("ignorar tira da caixa; tratar de novo dá 409 e id inexistente dá 404", async () => {
    await sincronizar();
    const estorno = da(await caixa(), "Estorno de compra");

    const ignorada = await pedir("POST", `/transacoes-importadas/${estorno.id}/ignorar`);
    const denovo = await pedir("POST", `/transacoes-importadas/${estorno.id}/ignorar`);
    const inexistente = await pedir("POST", `/transacoes-importadas/${ID_INEXISTENTE}/ignorar`);

    expect(ignorada.status).toBe(204);
    expect(denovo.status).toBe(409);
    expect(erroDe(denovo).codigo).toBe("transacao_ja_tratada");
    expect(inexistente.status).toBe(404);
    expect(erroDe(inexistente).codigo).toBe("transacao_importada_nao_encontrada");
    expect((await caixa("?estado=ignorada")).map((t) => t.descricao).sort()).toEqual([
      "Estorno de compra",
      "Pagamento recebido",
      "Transferência entre contas",
    ]);
    expect((await caixa()).map((t) => t.descricao)).not.toContain("Estorno de compra");
  });

  it("restaurar devolve a ignorada à caixa sem lançamento nem saldo; pendente e aceita dão 409", async () => {
    await sincronizar();
    const lista = await caixa();
    const estorno = da(lista, "Estorno de compra");
    const mercado = da(lista, "Mercado Extra");
    const salario = da(lista, "Salário");
    await pedir("POST", `/transacoes-importadas/${estorno.id}/ignorar`);
    await pedir("POST", `/transacoes-importadas/${salario.id}/aceitar`, {});
    const saldoAntes = (await listarContas())[0].saldo;
    const ganhosAntes = await pedir("GET", "/ganhos?inicio=2000-01-01&fim=2999-12-31");

    const restaurada = await pedir("POST", `/transacoes-importadas/${estorno.id}/restaurar`);
    const daPendente = await pedir("POST", `/transacoes-importadas/${mercado.id}/restaurar`);
    const daAceita = await pedir("POST", `/transacoes-importadas/${salario.id}/restaurar`);
    const inexistente = await pedir("POST", `/transacoes-importadas/${ID_INEXISTENTE}/restaurar`);

    expect(restaurada.status).toBe(204);
    expect(daPendente.status).toBe(409);
    expect(erroDe(daPendente).codigo).toBe("transacao_ja_tratada");
    expect(daAceita.status).toBe(409);
    expect(erroDe(daAceita).codigo).toBe("transacao_ja_tratada");
    expect(inexistente.status).toBe(404);
    const volta = da(await caixa(), "Estorno de compra");
    expect(volta).toEqual({ ...estorno, estado: "pendente" });
    expect((await caixa("?estado=ignorada")).map((t) => t.descricao)).not.toContain(
      "Estorno de compra",
    );
    expect((await listarContas())[0].saldo).toBe(saldoAntes);
    expect(await pedir("GET", "/ganhos?inicio=2000-01-01&fim=2999-12-31")).toEqual(ganhosAntes);
  });

  it("lançar à mão numa conta do banco não mexe no saldo dela", async () => {
    await sincronizar();
    const conta = (await listarContas())[0];

    await registrar(conta.id, { valor: "50.00" });
    await pedir("POST", "/ganhos", {
      conta_id: conta.id,
      valor: "70.00",
      descricao: "Dinheiro vivo",
      data: "2026-10-05",
      tags: [],
    });

    expect((await listarContas())[0].saldo).toBe("1500.00");
  });

  it("estado inválido na consulta dá 422", async () => {
    const resposta = await pedir("GET", "/transacoes-importadas?estado=qualquer");

    expect(resposta.status).toBe(422);
  });

  it("quem não é a dona recebe 404 importacao_desligada e /auth/eu diz que não é dona", async () => {
    const cadastro = await pedir("POST", "/auth/cadastro", {
      nome: "Outra",
      email: "outra@exemplo.com",
      senha: "uma-senha-bem-grande",
    });
    expect(cadastro.status).toBe(201);
    const entrada = await pedir("POST", "/auth/entrar", {
      email: "outra@exemplo.com",
      senha: "uma-senha-bem-grande",
    });
    expect(entrada.status).toBe(200);

    const caixaDaOutra = await pedir("GET", "/transacoes-importadas");
    const eu = await pedir("GET", "/auth/eu");

    expect(caixaDaOutra.status).toBe(404);
    expect(erroDe(caixaDaOutra).codigo).toBe("importacao_desligada");
    expect((eu.corpo as { importacao_bancaria: boolean }).importacao_bancaria).toBe(false);
  });
});


describe("investimentos simulados", () => {
  type Item = {
    id: string;
    descricao: string;
    sentido: string;
  };
  type Posicao = {
    id: string;
    saldo: string;
    destinacoes: { tag: string | null; principal: string; valor_atual: string }[];
  };

  async function preparar(saldo = "410.01") {
    // Antes de sincronizar: a sincronização só cria um investimento de exemplo se não houver nenhum.
    const investimento = adicionarInvestimentoSimulado(
      { nome: "LCI", tipo: "FIXED_INCOME", subtipo: "LCI", saldo },
      2,
    );
    await pedir("POST", "/sincronizacoes");
    const lista = (await pedir("GET", "/transacoes-importadas")).corpo as Item[];
    return { investimento, saidas: lista.filter((t) => t.sentido === "saida"), lista };
  }

  const posicoes = async () => (await pedir("GET", "/investimentos")).corpo as Posicao[];

  it("sem destinação, o saldo todo é 'sem destinação'; o histórico tem um saldo por dia", async () => {
    const { investimento } = await preparar();

    const [posicao] = (await posicoes()).filter((p) => p.id === investimento);

    expect(posicao.destinacoes).toEqual([
      { tag: null, cor:null, principal: "0.00", valor_atual: "410.01", rendimento: "0.00", rentabilidade: null },
    ]);
    const periodo = limites(periodoAtual());
    const historico = (await pedir("GET", "/investimentos/historico?inicio=2000-01-01&fim=2999-12-31"))
      .corpo as { saldo: string }[];
    expect(historico).toHaveLength(3);
    expect(historico.at(-1)?.saldo).toBe("410.01");
    expect(periodo.inicio).toBeTruthy();
  });

  it("aporte com destinações divide em centavos inteiros e ratear o saldo pelo principal", async () => {
    const { investimento, saidas } = await preparar("410.01");
    const [a, b] = saidas;

    const primeiro = await pedir("POST", `/transacoes-importadas/${a.id}/aceitar`, {
      como_investimento: true,
      investimento_id: investimento,
      destinacoes: [{ tag: "Casa", percentual: 100 }],
    });
    await pedir("POST", `/transacoes-importadas/${b.id}/aceitar`, {
      como_investimento: true,
      investimento_id: investimento,
      destinacoes: [{ tag: "viagem", percentual: 100 }],
    });

    expect(primeiro.status).toBe(201);
    expect((primeiro.corpo as { tipo: string }).tipo).toBe("aporte");
    const [posicao] = (await posicoes()).filter((p) => p.id === investimento);
    expect(posicao.destinacoes.map((d) => d.tag).sort()).toEqual(["casa", "viagem"]);
    const soma = posicao.destinacoes.reduce((t, d) => t + Number(d.valor_atual.replace(".", "")), 0);
    expect(soma).toBe(41001);
  });

  it("recusa destinações que não somam 100, investimento inexistente e categoria com aporte", async () => {
    const { investimento, saidas } = await preparar();
    const aceitar = (corpo: unknown) =>
      pedir("POST", `/transacoes-importadas/${saidas[0].id}/aceitar`, corpo);

    const soma = await aceitar({
      como_investimento: true,
      investimento_id: investimento,
      destinacoes: [{ tag: "casa", percentual: 50 }],
    });
    const inexistente = await aceitar({
      como_investimento: true,
      investimento_id: ID_INEXISTENTE,
      destinacoes: [{ tag: "casa", percentual: 100 }],
    });
    const comCategoria = await aceitar({ como_investimento: true, categoria: "investimentos" });
    const aporteComTags = await aceitar({ como_investimento: true, tags: ["x"] });

    expect(erroDe(soma).codigo).toBe("destinacao_invalida");
    expect(erroDe(inexistente).codigo).toBe("investimento_nao_encontrado");
    expect(erroDe(comCategoria).codigo).toBe("categoria_invalida");
    expect(erroDe(aporteComTags).codigo).toBe("transacao_importada_invalida");
  });

  it("realocar move o principal sem mudar o total e não passa do principal", async () => {
    const { investimento, saidas } = await preparar("100.00");
    await pedir("POST", `/transacoes-importadas/${saidas[0].id}/aceitar`, {
      como_investimento: true,
      investimento_id: investimento,
      destinacoes: [{ tag: "casa", percentual: 100 }],
    });

    const feita = await pedir("POST", `/investimentos/${investimento}/realocacoes`, {
      origem: "Casa",
      destino: "viagem",
      percentual: 50,
      data: "2026-10-10",
    });
    const acima = await pedir("POST", `/investimentos/${investimento}/realocacoes`, {
      origem: "casa",
      destino: "viagem",
      valor: "99999.00",
      data: "2026-10-10",
    });

    expect(feita.status).toBe(201);
    expect(erroDe(acima).codigo).toBe("principal_insuficiente");
    const lista = (await pedir("GET", `/investimentos/${investimento}/realocacoes`)).corpo as unknown[];
    expect(lista).toHaveLength(1);
    const [posicao] = (await posicoes()).filter((p) => p.id === investimento);
    expect(posicao.destinacoes.map((d) => d.tag).sort()).toEqual(["casa", "viagem"]);
  });

  it("resumo por destinação e por tipo soma o saldo", async () => {
    const { investimento, saidas } = await preparar("100.00");
    await pedir("POST", `/transacoes-importadas/${saidas[0].id}/aceitar`, {
      como_investimento: true,
      investimento_id: investimento,
      destinacoes: [
        { tag: "casa", percentual: 60 },
        { tag: "viagem", percentual: 40 },
      ],
    });

    const porDestino = (await pedir("GET", "/investimentos/resumo")).corpo as {
      total: string;
      fatias: { rotulo: string | null; valor: string }[];
    };
    const porTipo = (await pedir("GET", "/investimentos/resumo?visao=tipo")).corpo as typeof porDestino;

    expect(porDestino.fatias.map((f) => [f.rotulo, f.valor])).toEqual([
      ["casa", "60.00"],
      ["viagem", "40.00"],
    ]);
    expect(porTipo.fatias).toEqual([{ rotulo: "FIXED_INCOME", cor:null, valor: "100.00" }]);
    expect(erroDe(await pedir("GET", "/investimentos/resumo?visao=xis")).codigo).toBe(
      "requisicao_invalida",
    );
  });

  it("aceitar em lote categoriza todas de uma vez, e é tudo ou nada", async () => {
    const { saidas, lista } = await preparar();
    const ids = saidas.slice(0, 2).map((t) => t.id);

    const ruim = await pedir("POST", "/transacoes-importadas/aceitar-em-lote", {
      transacao_ids: [ids[0], ID_INEXISTENTE],
      categoria: "lazer",
    });
    const entrada = lista.find((t) => t.sentido === "entrada") as Item;
    const comEntrada = await pedir("POST", "/transacoes-importadas/aceitar-em-lote", {
      transacao_ids: [ids[0], entrada.id],
      categoria: "lazer",
    });
    const boa = await pedir("POST", "/transacoes-importadas/aceitar-em-lote", {
      transacao_ids: ids,
      categoria: "lazer",
      tags: ["Pix"],
    });

    expect(erroDe(ruim).codigo).toBe("transacao_importada_nao_encontrada");
    expect(erroDe(comEntrada).codigo).toBe("transacao_importada_invalida");
    expect(boa.status).toBe(201);
    expect((boa.corpo as { aceitas: { tipo: string }[] }).aceitas.map((a) => a.tipo)).toEqual([
      "gasto",
      "gasto",
    ]);
    const restantes = (await pedir("GET", "/transacoes-importadas")).corpo as Item[];
    expect(restantes.some((t) => ids.includes(t.id))).toBe(false);
  });

  it("registrar gasto com a categoria investimentos é recusado", async () => {
    const conta = (await pedir("POST", "/contas", { nome: "C", saldo_inicial: "10.00" }))
      .corpo as Conta;
    const resposta = await pedir("POST", "/gastos", {
      conta_id: conta.id,
      valor: "1.00",
      descricao: "LCI",
      data: "2026-10-10",
      categoria: "investimentos",
      tags: [],
    });
    expect(erroDe(resposta).codigo).toBe("categoria_invalida");
  });
});

describe("divisão de transação e rentabilidade simuladas", () => {
  type Item = { id: string; descricao: string; sentido: string };

  async function caixa() {
    await pedir("POST", "/sincronizacoes");
    const lista = (await pedir("GET", "/transacoes-importadas")).corpo as Item[];
    return (descricao: string) => lista.find((t) => t.descricao === descricao) as Item;
  }

  const gastosDoMes = async () =>
    (await pedir("GET", "/gastos?inicio=2000-01-01&fim=2999-12-31")).corpo as {
      descricao: string;
      valor: string;
      categoria: string;
      tags: string[];
    }[];

  it("dividir uma saída cria um gasto por parte, somando o valor", async () => {
    const da = await caixa();
    const farmacia = da("Farmácia");

    const resposta = await pedir("POST", `/transacoes-importadas/${farmacia.id}/dividir`, {
      partes: [
        { categoria: "conforto", tags: ["Remédio"], percentual: 33 },
        { categoria: "lazer", nome:"Lazer", percentual: 33 },
        { categoria: "conhecimento", percentual: 34 },
      ],
    });

    expect(resposta.status).toBe(201);
    expect((resposta.corpo as { criados: { tipo: string }[] }).criados).toHaveLength(3);
    const gastos = await gastosDoMes();
    expect(gastos.map((g) => [g.descricao, g.valor, g.categoria]).sort()).toEqual([
      ["Farmácia (1/3)", "15.15", "conforto"],
      ["Farmácia (2/3)", "15.15", "lazer"],
      ["Farmácia (3/3)", "15.60", "conhecimento"],
    ]);
    expect(gastos.find((g) => g.descricao === "Farmácia (1/3)")?.tags).toEqual(["remédio"]);
    const restantes = (await pedir("GET", "/transacoes-importadas")).corpo as Item[];
    expect(restantes.some((t) => t.id === farmacia.id)).toBe(false);
  });

  it("dividir uma entrada cria ganhos sem categoria", async () => {
    const da = await caixa();
    const resposta = await pedir("POST", `/transacoes-importadas/${da("Salário").id}/dividir`, {
      partes: [{ percentual: 50 }, { percentual: 50 }],
    });
    expect((resposta.corpo as { criados: { tipo: string }[] }).criados.map((c) => c.tipo)).toEqual([
      "ganho",
      "ganho",
    ]);
  });

  it("recusa divisão inválida sem tratar a transação", async () => {
    const da = await caixa();
    const id = da("Farmácia").id;
    const enviar = (partes: unknown) =>
      pedir("POST", `/transacoes-importadas/${id}/dividir`, { partes });

    const uma = await enviar([{ categoria: "lazer", nome:"Lazer", percentual: 100 }]);
    const soma = await enviar([
      { categoria: "lazer", nome:"Lazer", percentual: 50 },
      { categoria: "lazer", nome:"Lazer", percentual: 40 },
    ]);
    const semCategoria = await enviar([{ percentual: 50 }, { percentual: 50 }]);
    const investimentos = await enviar([
      { como_investimento: true, tags: ["x"], percentual: 50 },
      { categoria: "lazer", nome:"Lazer", percentual: 50 },
    ]);
    const semPartes = await pedir("POST", `/transacoes-importadas/${id}/dividir`, {});

    expect([uma, soma].map((r) => erroDe(r).codigo)).toEqual(["divisao_invalida", "divisao_invalida"]);
    expect(erroDe(semCategoria).codigo).toBe("transacao_importada_invalida");
    expect(erroDe(investimentos).codigo).toBe("transacao_importada_invalida");
    expect(erroDe(semPartes).codigo).toBe("requisicao_invalida");
    expect(await gastosDoMes()).toEqual([]);
  });

  it("traz a rentabilidade do investimento e das destinações", async () => {
    const id = adicionarInvestimentoSimulado({
      nome: "LCI",
      tipo: "FIXED_INCOME",
      saldo: "1043.21",
      valor_aplicado: "1000.00",
      rendimento: "43.21",
    });
    const da = await caixa();
    await pedir("POST", `/transacoes-importadas/${da("Farmácia").id}/aceitar`, {
      como_investimento: true,
      investimento_id: id,
      destinacoes: [{ tag: "casa", percentual: 100 }],
    });

    const [posicao] = (
      (await pedir("GET", "/investimentos")).corpo as {
        id: string;
        valor_aplicado: string | null;
        rendimento: string | null;
        rentabilidade: string | null;
        destinacoes: { tag: string; rendimento: string; rentabilidade: string | null }[];
      }[]
    ).filter((p) => p.id === id);

    expect([posicao.valor_aplicado, posicao.rendimento, posicao.rentabilidade]).toEqual([
      "1000.00",
      "43.21",
      "4.32",
    ]);
    expect(posicao.destinacoes[0].rendimento).toBe("997.31");
  });
});

describe("aporte pela categoria, sugestão e saldo inicial simulados", () => {
  type Item = {
    id: string;
    descricao: string;
    sentido: string;
    investimento_sugerido_id: string | null;
  };
  type Movimento = {
    id: string;
    conta_id: string | null;
    investimento_id: string | null;
    tipo: string;
    origem: string;
    descricao: string;
    valor: string;
    destinacoes: { tag: string; valor: string }[];
  };
  type Posicao = {
    id: string;
    destinacoes: { tag: string | null; principal: string; valor_atual: string }[];
  };

  async function caixa() {
    await pedir("POST", "/sincronizacoes");
    const lista = (await pedir("GET", "/transacoes-importadas")).corpo as Item[];
    return (descricao: string) => lista.find((t) => t.descricao === descricao) as Item;
  }

  const movimentos = async () =>
    (await pedir("GET", "/movimentos-de-investimento?inicio=2000-01-01&fim=2999-12-31"))
      .corpo as Movimento[];
  const gastos = async () =>
    (await pedir("GET", "/gastos?inicio=2000-01-01&fim=2999-12-31")).corpo as Gasto[];
  const posicao = async (id: string) =>
    ((await pedir("GET", "/investimentos")).corpo as Posicao[]).find((p) => p.id === id) as Posicao;

  it("aceitar a saída com marcador registra um aporte, não um gasto", async () => {
    const id = adicionarInvestimentoSimulado({ nome: "LCI", tipo: "FIXED_INCOME", saldo: "100.00" });
    const da = await caixa();

    const resposta = await pedir("POST", `/transacoes-importadas/${da("Farmácia").id}/aceitar`, {
      como_investimento: true,
      investimento_id: id,
      destinacoes: [{ tag: "casa", percentual: 100 }],
    });

    expect(resposta.status).toBe(201);
    expect((resposta.corpo as { tipo: string }).tipo).toBe("aporte");
    expect(await gastos()).toEqual([]);
    const [movimento] = await movimentos();
    expect([movimento.tipo, movimento.origem, movimento.valor]).toEqual(["aporte", "open_finance", "45.90"]);
    expect((await posicao(id)).destinacoes.map((d) => [d.tag, d.principal])).toEqual([["casa", "45.90"]]);
  });

  it("a categoria investimentos não vale na entrada nem com tags", async () => {
    const da = await caixa();

    const comTags = await pedir("POST", `/transacoes-importadas/${da("Farmácia").id}/aceitar`, {
      como_investimento: true,
      tags: ["pix"],
    });
    const entrada = await pedir("POST", `/transacoes-importadas/${da("Salário").id}/aceitar`, {
      como_investimento: true,
      categoria:"conforto",
    });

    expect(erroDe(comTags).codigo).toBe("transacao_importada_invalida");
    expect(erroDe(entrada).codigo).toBe("transacao_importada_invalida");
  });

  it("o lote com o marcador vira aportes", async () => {
    const da = await caixa();

    const resposta = await pedir("POST", "/transacoes-importadas/aceitar-em-lote", {
      transacao_ids: [da("Farmácia").id, da("Mercado Extra").id],
      como_investimento: true,
    });

    expect((resposta.corpo as { aceitas: { tipo: string }[] }).aceitas.map((a) => a.tipo)).toEqual([
      "aporte",
      "aporte",
    ]);
    expect(await gastos()).toEqual([]);
  });

  it("dividir com uma parte de aporte cria o aporte com as destinações e o gasto da outra", async () => {
    const id = adicionarInvestimentoSimulado({ nome: "LCI", tipo: "FIXED_INCOME", saldo: "100.00" });
    const da = await caixa();

    const resposta = await pedir("POST", `/transacoes-importadas/${da("Farmácia").id}/dividir`, {
      partes: [
        {
          como_investimento: true,
          percentual: 70,
          investimento_id: id,
          destinacoes: [{ tag: "reserva", percentual: 100 }],
        },
        { categoria: "lazer", tags: ["pix"], percentual: 30 },
      ],
    });

    expect(resposta.status).toBe(201);
    expect((resposta.corpo as { criados: { tipo: string }[] }).criados.map((c) => c.tipo)).toEqual([
      "aporte",
      "gasto",
    ]);
    const [movimento] = await movimentos();
    expect([movimento.descricao, movimento.valor, movimento.investimento_id]).toEqual([
      "Farmácia (1/2)",
      "32.13",
      id,
    ]);
    expect((await gastos()).map((g) => [g.descricao, g.valor, g.categoria])).toEqual([
      ["Farmácia (2/2)", "13.77", "lazer"],
    ]);
    expect((await posicao(id)).destinacoes.map((d) => [d.tag, d.principal])).toEqual([["reserva", "32.13"]]);
  });

  it("dividir recusa investimento fora do aporte e destinações sem investimento, sem tratar nada", async () => {
    const id = adicionarInvestimentoSimulado({ nome: "LCI", tipo: "FIXED_INCOME", saldo: "100.00" });
    const da = await caixa();
    const farmacia = da("Farmácia").id;
    const enviar = (partes: unknown) =>
      pedir("POST", `/transacoes-importadas/${farmacia}/dividir`, { partes });

    const foraDoAporte = await enviar([
      { categoria: "lazer", nome:"Lazer", percentual: 50, investimento_id: id },
      { categoria: "lazer", nome:"Lazer", percentual: 50 },
    ]);
    const semInvestimento = await enviar([
      { como_investimento: true, percentual: 50, destinacoes: [{ tag: "casa", percentual: 100 }] },
      { categoria: "lazer", nome:"Lazer", percentual: 50 },
    ]);
    const inexistente = await enviar([
      {
        como_investimento: true,
        percentual: 50,
        investimento_id: ID_INEXISTENTE,
        destinacoes: [{ tag: "casa", percentual: 100 }],
      },
      { categoria: "lazer", nome:"Lazer", percentual: 50 },
    ]);

    expect(erroDe(foraDoAporte).codigo).toBe("transacao_importada_invalida");
    expect(erroDe(semInvestimento).codigo).toBe("transacao_importada_invalida");
    expect(erroDe(inexistente).codigo).toBe("investimento_nao_encontrado");
    expect(await gastos()).toEqual([]);
    expect(await movimentos()).toEqual([]);
  });

  it("sugere o investimento cujo nome aparece na descrição e cujo aplicado é o valor", async () => {
    const sugerido = adicionarInvestimentoSimulado({
      nome: "FARMACIA",
      tipo: "FIXED_INCOME",
      saldo: "46.00",
      valor_aplicado: "45.90",
    });
    adicionarInvestimentoSimulado({
      nome: "Mercado",
      tipo: "FIXED_INCOME",
      saldo: "90.00",
      valor_aplicado: "90.00",
    });
    const da = await caixa();

    expect(da("Farmácia").investimento_sugerido_id).toBe(sugerido);
    // O valor aplicado não bate: sem sugestão. A entrada nunca tem.
    expect(da("Mercado Extra").investimento_sugerido_id).toBeNull();
    expect(da("Salário").investimento_sugerido_id).toBeNull();
  });

  it("não sugere quando duas posições casam nem quando a posição já tem movimento", async () => {
    const um = { nome: "Farmácia", tipo: "FIXED_INCOME", saldo: "46.00", valor_aplicado: "45.90" };
    adicionarInvestimentoSimulado(um);
    const outro = adicionarInvestimentoSimulado(um);
    let da = await caixa();
    expect(da("Farmácia").investimento_sugerido_id).toBeNull();

    // Com movimento associado, a segunda deixa de ser candidata e a primeira volta a ser única.
    await pedir("POST", `/transacoes-importadas/${da("Mercado Extra").id}/aceitar`, {
      como_investimento: true,
      investimento_id: outro,
      destinacoes: [{ tag: "casa", percentual: 100 }],
    });
    da = await caixa();
    expect(da("Farmácia").investimento_sugerido_id).not.toBeNull();
    expect(da("Farmácia").investimento_sugerido_id).not.toBe(outro);
  });

  it("definir as destinações iniciais reparte o aplicado num saldo inicial sem conta", async () => {
    const id = adicionarInvestimentoSimulado({
      nome: "LCI",
      tipo: "FIXED_INCOME",
      saldo: "1043.21",
      valor_aplicado: "1000.00",
    });

    const resposta = await pedir("POST", `/investimentos/${id}/destinacoes`, {
      destinacoes: [
        { tag: "Viagem", percentual: 30 },
        { tag: "casa", percentual: 70 },
      ],
    });

    expect(resposta.status).toBe(201);
    const movimento = resposta.corpo as Movimento;
    expect([movimento.origem, movimento.conta_id, movimento.descricao, movimento.tipo]).toEqual([
      "saldo_inicial",
      null,
      "Saldo inicial",
      "aporte",
    ]);
    expect(movimento.valor).toBe("1000.00");
    expect(movimento.destinacoes).toEqual([
      { tag: "casa", valor: "700.00", categoria: null, coberto: null },
      { tag: "viagem", valor: "300.00", categoria: null, coberto: null },
    ]);
    expect((await movimentos()).map((m) => m.origem)).toEqual(["saldo_inicial"]);
    expect((await posicao(id)).destinacoes.map((d) => [d.tag, d.principal])).toEqual([
      ["casa", "700.00"],
      ["viagem", "300.00"],
    ]);
  });

  it("sem aplicado, a base é o saldo; sem nada a destinar, 409", async () => {
    const id = adicionarInvestimentoSimulado({ nome: "Fundo", tipo: "MUTUAL_FUND", saldo: "50.00" });
    const destinar = () =>
      pedir("POST", `/investimentos/${id}/destinacoes`, { destinacoes: [{ tag: "casa", percentual: 100 }] });

    const primeira = await destinar();
    const segunda = await destinar();

    expect((primeira.corpo as Movimento).valor).toBe("50.00");
    expect(segunda.status).toBe(409);
    expect(erroDe(segunda).codigo).toBe("sem_valor_a_destinar");
  });

  it("recusa investimento inexistente, destinações inválidas e corpo sem destinações", async () => {
    const id = adicionarInvestimentoSimulado({ nome: "Fundo", tipo: "MUTUAL_FUND", saldo: "50.00" });

    const inexistente = await pedir("POST", `/investimentos/${ID_INEXISTENTE}/destinacoes`, {
      destinacoes: [{ tag: "casa", percentual: 100 }],
    });
    const soma = await pedir("POST", `/investimentos/${id}/destinacoes`, {
      destinacoes: [{ tag: "casa", percentual: 50 }],
    });
    const semCorpo = await pedir("POST", `/investimentos/${id}/destinacoes`, {});

    expect(erroDe(inexistente).codigo).toBe("investimento_nao_encontrado");
    expect(erroDe(soma).codigo).toBe("destinacao_invalida");
    expect(erroDe(semCorpo).codigo).toBe("requisicao_invalida");
    expect(await movimentos()).toEqual([]);
  });

  it("aporte de posição conta na meta financeira e saldo inicial fica fora", async () => {
    const id = adicionarInvestimentoSimulado({ nome: "Fundo", tipo: "MUTUAL_FUND", saldo: "50.00" });
    const da = await caixa();
    const conta = (await pedir("GET", "/contas")).corpo as Conta[];
    const hoje = limites(periodoAtual());
    await pedir("POST", "/ganhos", {
      conta_id: conta[0].id,
      valor: "1000.00",
      descricao: "Salário",
      data: hoje.inicio,
      tags: [],
    });
    await pedir("PUT", "/metas/investimentos", { percentual: 10 });
    await pedir("POST", `/investimentos/${id}/destinacoes`, {
      destinacoes: [{ tag: "casa", percentual: 100 }],
    });
    await pedir("POST", `/transacoes-importadas/${da("Farmácia").id}/aceitar`, {
      como_investimento: true,
    });

    const mes = hoje.inicio.slice(0, 7);
    const resumo = (await pedir("GET", `/metas/progresso?mes=${mes}`)).corpo as {
      metas: { categoria: string; gasto: string }[];
    };

    expect(resumo.metas).toEqual([expect.objectContaining({ categoria:"liberdade_financeira", gasto: "45.90" })]);
  });

  it("desfaz uma realocação e recusa se o destino já usou o valor", async () => {
    const id = adicionarInvestimentoSimulado({ nome: "Fundo", tipo: "MUTUAL_FUND", saldo: "100.00" });
    await pedir("POST", `/investimentos/${id}/destinacoes`, {
      destinacoes: [{ tag: "casa", percentual: 100 }],
    });
    const nova = async (origem: string, destino: string) =>
      (
        await pedir("POST", `/investimentos/${id}/realocacoes`, {
          origem,
          destino,
          percentual: 100,
          data: "2026-10-22",
        })
      ).corpo as { id: string };
    const primeira = await nova("casa", "viagem");
    await nova("viagem", "celular");

    const recusada = await pedir("DELETE", `/investimentos/${id}/realocacoes/${primeira.id}`);
    const inexistente = await pedir(
      "DELETE",
      `/investimentos/${id}/realocacoes/00000000-0000-4000-8000-000000000000`,
    );

    expect(recusada.status).toBe(422);
    expect((recusada.corpo as { erro: { codigo: string } }).erro.codigo).toBe("principal_insuficiente");
    expect(inexistente.status).toBe(404);
    expect((inexistente.corpo as { erro: { codigo: string } }).erro.codigo).toBe("realocacao_nao_encontrada");
  });

  it("só o saldo inicial se desfaz, e desfazê-lo libera o valor", async () => {
    const id = adicionarInvestimentoSimulado({ nome: "Fundo", tipo: "MUTUAL_FUND", saldo: "100.00" });
    const da = await caixa();
    const aporte = (
      await pedir("POST", `/transacoes-importadas/${da("Farmácia").id}/aceitar`, {
        como_investimento: true,
      })
    ).corpo as { id: string };
    const inicial = (
      await pedir("POST", `/investimentos/${id}/destinacoes`, {
        destinacoes: [{ tag: "casa", percentual: 100 }],
      })
    ).corpo as { id: string };

    const doAporte = await pedir("DELETE", `/movimentos-de-investimento/${aporte.id}`);
    const feito = await pedir("DELETE", `/movimentos-de-investimento/${inicial.id}`);
    const denovo = await pedir("POST", `/investimentos/${id}/destinacoes`, {
      destinacoes: [{ tag: "viagem", percentual: 100 }],
    });

    expect(doAporte.status).toBe(409);
    expect((doAporte.corpo as { erro: { codigo: string } }).erro.codigo).toBe("movimento_nao_desfazivel");
    expect(feito.status).toBe(204);
    expect(denovo.status).toBe(201);
  });
});

describe("renda-base mensal", () => {
  it("define, altera e remove sem mudar os registros financeiros", async () => {
    await criarConta("Conta exemplo", "123.45");
    const antes = await listarContas();
    expect((await pedir("GET", "/renda-base")).corpo).toEqual({ valor: null });
    for (const valor of ["5000.00", "7000.01"]) {
      const resposta = await pedir("PUT", "/renda-base", { valor });
      expect(resposta.status).toBe(200);
      expect(resposta.corpo).toEqual({ valor });
      expect((await pedir("GET", "/renda-base")).corpo).toEqual({ valor });
    }
    for (let vez = 0; vez < 2; vez++) {
      expect((await pedir("DELETE", "/renda-base")).status).toBe(204);
    }
    expect((await pedir("GET", "/renda-base")).corpo).toEqual({ valor: null });
    expect(await listarContas()).toEqual(antes);
    expect((await pedir("GET", "/ganhos?inicio=2026-10-01&fim=2026-10-31")).corpo).toEqual([]);
  });

  it.each(["0.00", "-1.00", "1,5", "1000000000000.01", "0.001"])("recusa %s sem substituir a base", async (valor) => {
    expect((await pedir("PUT", "/renda-base", { valor: "5000.00" })).status).toBe(200);
    const resposta = await pedir("PUT", "/renda-base", { valor });
    expect(resposta.status).toBe(422);
    expect(erroDe(resposta).codigo).toBe("valor_invalido");
    expect((await pedir("GET", "/renda-base")).corpo).toEqual({ valor: "5000.00" });
  });

  it.each([{ valor: 5000 }, { valor: true }, { valor: null }, {}])("exige string decimal: %j", async (corpo) => {
    const resposta = await pedir("PUT", "/renda-base", corpo);
    expect(resposta.status).toBe(422);
    expect(erroDe(resposta).codigo).toBe("requisicao_invalida");
  });

  it("mantém renda real e usa a base em qualquer mês, inclusive sem ganhos", async () => {
    const conta = await criarConta("Conta exemplo");
    await pedir("POST", "/ganhos", { conta_id: conta.id, valor: "7000.00", descricao: "Ganho exemplo", data: "2026-10-05" });
    await pedir("PUT", "/metas/lazer", { percentual: 20 });
    await pedir("PUT", "/renda-base", { valor: "5000.00" });
    for (const [mes, renda] of [["2026-10", "7000.00"], ["2025-01", "0.00"]]) {
      const resposta = await pedir("GET", `/metas/progresso?mes=${mes}`);
      expect(resposta.corpo).toMatchObject({ renda, renda_base: "5000.00", renda_de_referencia: "5000.00", metas: [{ limite: "1000.00", situacao: "dentro" }] });
    }
    await pedir("DELETE", "/renda-base");
    expect((await pedir("GET", "/metas/progresso?mes=2026-10")).corpo).toMatchObject({ renda: "7000.00", renda_base: null, renda_de_referencia: "7000.00", metas: [{ limite: "1400.00" }] });
  });

  it("exige autenticação e proteção de origem nas escritas", async () => {
    expect((await pedir("PUT", "/renda-base", { valor: "5000.00" }, { antiCsrf: null })).status).toBe(403);
    reiniciarSimulacao();
    for (const metodo of ["GET", "PUT", "DELETE"]) {
      expect((await pedir(metodo, "/renda-base", { valor: "5000.00" })).status).toBe(401);
    }
  });
});

describe("desfazer classificação de investimento", () => {
  type Movimento = { id: string; transacao_importada_id: string | null; descricao: string };
  const periodo = "inicio=2000-01-01&fim=2999-12-31";
  const movimentos = async () => (await pedir("GET", `/movimentos-de-investimento?${periodo}`)).corpo as Movimento[];
  const desfazer = (id: string, corpo?: unknown) => pedir("POST", `/movimentos-de-investimento/${id}/desfazer-classificacao`, corpo);
  async function preparar(descricao = "Farmácia", dados: Record<string, unknown> = {}) {
    await pedir("POST", "/sincronizacoes");
    const caixa = (await pedir("GET", "/transacoes-importadas")).corpo as { id: string; descricao: string; sentido: string }[];
    const transacao = caixa.find((t) => t.descricao === descricao)!;
    const aceite = await pedir("POST", `/transacoes-importadas/${transacao.id}/aceitar`, { como_investimento: true, ...dados });
    expect(aceite.status).toBe(201);
    return { transacao, id: (aceite.corpo as { id: string }).id };
  }
  async function fotografia() {
    return Promise.all(["/contas", `/gastos?${periodo}`, `/ganhos?${periodo}`, `/movimentos-de-investimento?${periodo}`, "/investimentos", "/transacoes-importadas?estado=aceita"].map(async (rota) => (await pedir("GET", rota)).corpo));
  }
  it.each(["Farmácia", "Salário"])("reabre %s sem mudar saldo nem outros lançamentos", async (descricao) => {
    const { transacao, id } = await preparar(descricao);
    expect((await movimentos()).find((m) => m.id === id)?.transacao_importada_id).toBe(transacao.id);
    const antes = await fotografia();
    expect(await desfazer(id)).toMatchObject({ status: 200, corpo: { transacao_id: transacao.id, estado: "pendente", lancamentos_removidos: 1 } });
    const depois = await fotografia();
    expect(depois.slice(0, 3)).toEqual(antes.slice(0, 3));
    expect((await pedir("GET", "/transacoes-importadas")).corpo).toContainEqual(expect.objectContaining(transacao));
    expect((await movimentos()).some((m) => m.id === id)).toBe(false);
    expect((await desfazer(id)).status).toBe(404);
    expect((await pedir("POST", `/transacoes-importadas/${transacao.id}/aceitar`, descricao === "Salário" ? {} : { categoria: "lazer" })).status).toBe(201);
  });
  it("a divisão só sai inteira depois de confirmação explícita, inclusive gastos e destinações", async () => {
    const investimento = adicionarInvestimentoSimulado({ nome: "Reserva", tipo: "FIXED_INCOME", saldo: "100.00" });
    await pedir("POST", "/sincronizacoes");
    const caixa = (await pedir("GET", "/transacoes-importadas")).corpo as { id: string; descricao: string }[];
    const t = caixa.find((t) => t.descricao === "Farmácia")!;
    const r = await pedir("POST", `/transacoes-importadas/${t.id}/dividir`, { partes: [
      { categoria: "lazer", nome:"Lazer", percentual: 40 },
      { como_investimento: true, percentual: 30, investimento_id: investimento, destinacoes: [{ tag: "reserva", percentual: 100 }] },
      { como_investimento: true, percentual: 30, investimento_id: investimento, destinacoes: [{ tag: "reserva", percentual: 100 }] },
    ] });
    expect(r.status).toBe(201);
    const [m] = await movimentos();
    expect(m.transacao_importada_id).toBe(t.id);
    const antes = await fotografia();
    const resposta = await desfazer(m.id);
    expect(resposta.status).toBe(409);
    expect(erroDe(resposta)).toMatchObject({ codigo: "divisao_exige_confirmacao", mensagem: expect.stringContaining("3 partes") });
    expect(await fotografia()).toEqual(antes);
    expect(await desfazer(m.id, { desfazer_divisao_inteira: true })).toMatchObject({ status: 200, corpo: { lancamentos_removidos: 3 } });
    expect(await movimentos()).toEqual([]);
    expect((await pedir("GET", `/gastos?${periodo}`)).corpo).toEqual([]);
    const posicoes = (await pedir("GET", "/investimentos")).corpo as { destinacoes: { principal: string }[] }[];
    expect(posicoes.every((p) => p.destinacoes.every((d) => d.principal === "0.00"))).toBe(true);
  });
  it("confere o principal do grupo somado antes de remover qualquer parte", async () => {
    const investimento = adicionarInvestimentoSimulado({ nome: "Reserva", tipo: "FIXED_INCOME", saldo: "100.00" });
    const { id } = await preparar("Farmácia", { investimento_id: investimento, destinacoes: [{ tag: "casa", percentual: 100 }] });
    await pedir("POST", `/investimentos/${investimento}/realocacoes`, { origem: "casa", destino: "viagem", valor: "1.00", data: "2026-10-29" });
    const antes = await fotografia();
    const resposta = await desfazer(id);
    expect(resposta.status).toBe(422);
    expect(erroDe(resposta).codigo).toBe("principal_insuficiente");
    expect(await fotografia()).toEqual(antes);
  });
  it("grava vínculo também no lote de aportes", async () => {
    await pedir("POST", "/sincronizacoes");
    const caixa = (await pedir("GET", "/transacoes-importadas")).corpo as { id: string; sentido: string }[];
    const ids = caixa.filter((t) => t.sentido === "saida").slice(0, 2).map((t) => t.id);
    expect((await pedir("POST", "/transacoes-importadas/aceitar-em-lote", { transacao_ids: ids, como_investimento: true })).status).toBe(201);
    expect((await movimentos()).map((m) => m.transacao_importada_id).sort()).toEqual([...ids].sort());
  });
  it("saldo inicial e legado sem candidato seguro dão 409 sem escrita", async () => {
    reiniciarSimulacao({ comExemplos: true }); entrarNaSimulacao();
    const [legado] = await movimentos();
    const antes = await fotografia();
    expect(erroDe(await desfazer(legado.id)).codigo).toBe("movimento_nao_desfazivel");
    expect(await fotografia()).toEqual(antes);
    const investimento = adicionarInvestimentoSimulado({ nome: "Saldo", tipo: "FIXED_INCOME", saldo: "20.00" });
    const saldo = await pedir("POST", `/investimentos/${investimento}/destinacoes`, { destinacoes: [{ tag: "casa", percentual: 100 }] });
    expect(erroDe(await desfazer((saldo.corpo as { id: string }).id)).codigo).toBe("movimento_nao_desfazivel");
  });
  it("exige sessão e CSRF; sem caixa não altera o grupo", async () => {
    const { id } = await preparar();
    const antes = await fotografia();
    expect((await pedir("POST", `/movimentos-de-investimento/${id}/desfazer-classificacao`, undefined, { credenciais: "omit" })).status).toBe(401);
    expect((await pedir("POST", `/movimentos-de-investimento/${id}/desfazer-classificacao`, undefined, { antiCsrf: null })).status).toBe(403);
    expect(await fotografia()).toEqual(antes);
    expect((await pedir("POST", "/auth/cadastro", { nome: "Outra", email: "outra@exemplo.com", senha: "senha-de-exemplo-123" })).status).toBe(201);
    expect((await pedir("POST", "/auth/entrar", { email: "outra@exemplo.com", senha: "senha-de-exemplo-123" })).status).toBe(200);
    const resposta = await desfazer(id);
    expect(resposta.status).toBe(409);
    expect(erroDe(resposta).codigo).toBe("movimento_nao_desfazivel");
  });
});

describe("gestão de investimentos no perfil simulado", () => {
  it("dona tem gestão; outra pessoa não herda posições da dona", async () => {
    adicionarInvestimentoSimulado({ nome: "Exemplo", tipo: "OTHER", saldo: "1.00" });
    expect((await pedir("GET", "/auth/eu")).corpo).toMatchObject({ gestao_de_investimentos: true });
    await pedir("POST", "/auth/cadastro", { nome: "Outra", email: "outra@exemplo.com", senha: SENHA_DE_EXEMPLO });
    await pedir("POST", "/auth/entrar", { email: "outra@exemplo.com", senha: SENHA_DE_EXEMPLO });
    expect((await pedir("GET", "/auth/eu")).corpo).toMatchObject({ gestao_de_investimentos: false, importacao_bancaria: false });
    adicionarInvestimentoSimulado({ nome: "Da outra pessoa", tipo: "OTHER", saldo: "2.00" });
    expect((await pedir("GET", "/auth/eu")).corpo).toMatchObject({ gestao_de_investimentos: true, importacao_bancaria: false });
  });
});

it("resumo simulado usa o líquido e preserva lançamentos",async()=>{
 const {prepararCenarioLiberdadeFinanceira}=await import("./manipuladores");
 prepararCenarioLiberdadeFinanceira({valorCompra:"80.01",tags:["loja","online"],coberto:"30.00"});
 const periodo="?inicio=2026-11-01&fim=2026-11-30";
 const resumo=await pedir("GET","/resumos/tags"+periodo);
 expect(resumo.status).toBe(200);
 expect(resumo.corpo).toEqual({inicio:"2026-11-01",fim:"2026-11-30",total:"50.01",fatias:[{tag:"loja",valor:"25.01"},{tag:"online",valor:"25.00"}]});
 const lista=await pedir("GET","/gastos"+periodo);
 expect((lista.corpo as Gasto[])[0].valor).toBe("80.01");
 expect((lista.corpo as Gasto[])[0].valor_coberto).toBe("30.00");
});

it("cobrir e desfazer na simulação preserva saldos movimentos posições e Tags brutas",async()=>{
 const {prepararCenarioLiberdadeFinanceira}=await import("./manipuladores");
 const {gastoId}=prepararCenarioLiberdadeFinanceira();
 const periodo="?inicio=2026-11-01&fim=2026-11-30";
 const antes=await Promise.all([pedir("GET","/contas"),pedir("GET","/investimentos"),pedir("GET","/movimentos-de-investimento"+periodo)]);
 const c=await pedir("POST",`/gastos/${gastoId}/coberturas`,{tag:"celular",valor:"30.00"});
 expect(c.status).toBe(201);
 expect((await pedir("GET","/resumos/tags"+periodo)).corpo).toMatchObject({total:"50.00"});
 const reserva=await pedir("GET","/reservas-das-destinacoes?categoria=conforto");
 expect(reserva.corpo).toEqual([{tag:"celular",reservado:"100.00",coberto:"30.00",disponivel:"70.00",cor:null}]);
 expect((await pedir("POST",`/gastos/${gastoId}/coberturas`,{tag:"celular",valor:"1.00"})).status).toBe(409);
 expect((await pedir("DELETE",`/gastos/${gastoId}/coberturas/${(c.corpo as {id:string}).id}`)).status).toBe(204);
 expect((await pedir("GET","/resumos/tags"+periodo)).corpo).toMatchObject({total:"80.00"});
 const depois=await Promise.all([pedir("GET","/contas"),pedir("GET","/investimentos"),pedir("GET","/movimentos-de-investimento"+periodo)]);
 expect(depois.map(r=>r.corpo)).toEqual(antes.map(r=>r.corpo));
});

it("recusa desfazer aporte cuja reserva já cobre compra sem mudar registros",async()=>{
 await pedir("POST","/sincronizacoes");
 const caixa=(await pedir("GET","/transacoes-importadas")).corpo as {id:string;descricao:string}[];
 const t=caixa.find(t=>t.descricao==="Farmácia")!;
 const inv=adicionarInvestimentoSimulado({nome:"Reserva fictícia",tipo:"FIXED_INCOME",saldo:"100.00"});
 const aporte=await pedir("POST",`/transacoes-importadas/${t.id}/aceitar`,{como_investimento:true,investimento_id:inv,destinacoes:[{tag:"celular",percentual:100}]});
 expect(aporte.status).toBe(201);
 definirCategoriaHistoricaSimulada((aporte.corpo as {id:string}).id, "conforto");
 const conta=await criarConta("Carteira fictícia","100.00");
 const g=await pedir("POST","/gastos",{conta_id:conta.id,valor:"20.00",descricao:"Compra fictícia",data:"2026-10-10",categoria:"conforto",tags:[]});
 expect((await pedir("POST",`/gastos/${(g.corpo as Gasto).id}/coberturas`,{tag:"celular",valor:"10.00"})).status).toBe(201);
 const antes=(await pedir("GET","/investimentos")).corpo;
 const resultado=await pedir("POST",`/movimentos-de-investimento/${(aporte.corpo as {id:string}).id}/desfazer-classificacao`);
 expect(resultado.status).toBe(409);
 expect(erroDe(resultado).mensagem).toContain("já cobre compras");
 expect((await pedir("GET","/investimentos")).corpo).toEqual(antes);
});

describe("resgate por custo médio simulado", () => {
  type Item = { id: string; descricao: string };
  type Posicao = {
    id: string;
    destinacoes: {
      tag: string | null;
      principal: string;
      valor_atual: string;
      rentabilidade: string | null;
    }[];
  };

  /** Cria a posição, reparte o aplicado (saldo inicial) e devolve o resgate pronto para classificar. */
  async function preparar(
    posicao: { saldo: string; aplicado: string; saldo_anterior?: string },
    tags: { tag: string; percentual: number }[],
  ) {
    const investimento = adicionarInvestimentoSimulado({
      nome: "Renda variável",
      tipo: "EQUITY",
      saldo: posicao.saldo,
      valor_aplicado: posicao.aplicado,
      saldo_anterior: posicao.saldo_anterior,
    });
    await pedir("POST", "/sincronizacoes");
    const definida = await pedir("POST", `/investimentos/${investimento}/destinacoes`, {
      destinacoes: tags,
    });
    expect(definida.status).toBe(201);
    const caixa = (await pedir("GET", "/transacoes-importadas")).corpo as Item[];
    const resgatar = (descricao: string, destinacoes: { tag: string; percentual: number }[]) =>
      pedir(
        "POST",
        `/transacoes-importadas/${(caixa.find((t) => t.descricao === descricao) as Item).id}/aceitar`,
        { como_investimento: true, investimento_id: investimento, destinacoes },
      );
    return { investimento, resgatar };
  }

  const destinacoesDe = async (investimento: string) =>
    ((await pedir("GET", "/investimentos")).corpo as Posicao[]).find((p) => p.id === investimento)
      ?.destinacoes as Posicao["destinacoes"];

  it("abate o principal na proporção do valor da tag (CT0 em escala)", async () => {
    // Cada tag: principal 8.000,00 e valor 10.000,00. O resgate de 5.000,00 é metade do valor da
    // viagem: abate metade do dinheiro em principal proporcional (4.000,00), não 5.000,00.
    const { investimento, resgatar } = await preparar(
      { saldo: "15000.00", aplicado: "16000.00", saldo_anterior: "20000.00" },
      [
        { tag: "viagem", percentual: 50 },
        { tag: "casa", percentual: 50 },
      ],
    );

    const resposta = await resgatar("Salário", [{ tag: "viagem", percentual: 100 }]);

    expect(resposta.status).toBe(201);
    const porTag = new Map((await destinacoesDe(investimento)).map((d) => [d.tag, d]));
    expect(porTag.get("viagem")?.principal).toBe("4000.00");
    expect(porTag.get("casa")?.principal).toBe("8000.00");
    expect(porTag.get("viagem")?.valor_atual).toBe("5000.00");
    expect(porTag.get("casa")?.valor_atual).toBe("10000.00");
    expect(porTag.get("viagem")?.rentabilidade).toBe("25.00");
    expect(porTag.get("casa")?.rentabilidade).toBe("25.00");
  });

  it("aceita o resgate total da tag mesmo com lucro e zera o principal", async () => {
    const { investimento, resgatar } = await preparar(
      { saldo: "1.00", aplicado: "4000.00", saldo_anterior: "5000.00" },
      [{ tag: "viagem", percentual: 100 }],
    );

    const resposta = await resgatar("Salário", [{ tag: "viagem", percentual: 100 }]);

    expect(resposta.status).toBe(201);
    expect((await destinacoesDe(investimento)).map((d) => d.tag)).toEqual([null]);
  });

  it("recusa a parte em dinheiro maior que o valor da tag", async () => {
    const { investimento, resgatar } = await preparar(
      { saldo: "3000.00", aplicado: "2000.00", saldo_anterior: "3000.00" },
      [{ tag: "viagem", percentual: 100 }],
    );

    const resposta = await resgatar("Salário", [{ tag: "viagem", percentual: 100 }]);

    expect(resposta.status).toBe(422);
    const erro = (resposta.corpo as { erro: { codigo: string; mensagem: string } }).erro;
    expect(erro.codigo).toBe("resgate_maior_que_o_valor");
    expect(erro.mensagem).toContain("viagem");
    expect((await destinacoesDe(investimento))[0].principal).toBe("2000.00");
  });

  it("sem histórico anterior, vale a regra antiga: o dinheiro abate o principal e não passa dele", async () => {
    const { investimento, resgatar } = await preparar(
      { saldo: "3000.00", aplicado: "3000.00" },
      [{ tag: "viagem", percentual: 100 }],
    );

    const acima = await resgatar("Estorno de compra", [{ tag: "viagem", percentual: 100 }]);
    expect(acima.status).toBe(201);
    expect((await destinacoesDe(investimento))[0].principal).toBe("2980.10");

    const demais = await resgatar("Salário", [{ tag: "viagem", percentual: 100 }]);
    expect(demais.status).toBe(422);
    expect((demais.corpo as { erro: { codigo: string } }).erro.codigo).toBe("principal_insuficiente");
  });

  it("abate ao menos 1 centavo de principal quando o custo médio trunca para zero", async () => {
    const { investimento, resgatar } = await preparar(
      { saldo: "100.00", aplicado: "0.02", saldo_anterior: "100.00" },
      [{ tag: "viagem", percentual: 100 }],
    );

    const resposta = await resgatar("Estorno de compra", [{ tag: "viagem", percentual: 100 }]);

    expect(resposta.status).toBe(201);
    expect((await destinacoesDe(investimento))[0].principal).toBe("0.01");
  });
});


// --- faturas -------------------------------------------------------------------

describe("faturas", () => {
  it("exige o hoje válido, a conta existente e a fatura da pessoa", async () => {
    prepararCenarioDeFaturas();

    for (const caminho of ["/faturas", "/faturas?hoje=ontem", "/faturas?hoje=2026-13-01"]) {
      const resposta = await pedir("GET", caminho);
      expect(resposta.status).toBe(422);
      expect((resposta.corpo as { erro: { codigo: string } }).erro.codigo).toBe("requisicao_invalida");
    }
    const semConta = await pedir("GET", `/faturas?hoje=2026-11-05&conta_id=${crypto.randomUUID()}`);
    expect(semConta.status).toBe(404);
    expect((semConta.corpo as { erro: { codigo: string } }).erro.codigo).toBe("conta_nao_encontrada");
    const semFatura = await pedir("GET", `/faturas/${crypto.randomUUID()}?hoje=2026-11-05`);
    expect(semFatura.status).toBe(404);
    expect((semFatura.corpo as { erro: { codigo: string } }).erro.codigo).toBe("fatura_nao_encontrada");
  });

  it("calcula a situação com o hoje enviado", async () => {
    prepararCenarioDeFaturas();

    type Lista = { cartoes: { conta_nome: string; faturas: { situacao: string }[] }[] };
    const situacoes = async (hoje: string, nome: string) =>
      ((await pedir("GET", `/faturas?hoje=${hoje}`)).corpo as Lista).cartoes
        .find((cartao) => cartao.conta_nome === nome)
        ?.faturas.map((fatura) => fatura.situacao);

    // Fechamento em 15/11 e vencimento em 22/11: aberta até o dia do fechamento, fechada até o
    // dia do vencimento e vencida depois. A fatura de total zero não deve nada, então é paga.
    expect(await situacoes("2026-11-15", "FREE VISA")).toEqual(["aberta", "paga"]);
    expect(await situacoes("2026-11-22", "FREE VISA")).toEqual(["fechada", "paga"]);
    expect(await situacoes("2026-11-30", "FREE VISA")).toEqual(["vencida", "paga"]);
    expect(await situacoes("2026-11-30", "Cartão Roxo")).toEqual(["paga", "vencida"]);
  });
});

it('ignora com motivo, filtra e limpa o motivo ao restaurar', async () => {
  await pedir('POST', '/sincronizacoes');
  const caixa = await pedir('GET', '/transacoes-importadas');
  const [t] = caixa.corpo as {id:string}[];
  expect((await pedir('POST', `/transacoes-importadas/${t.id}/ignorar`, {motivo:'transferencia_entre_contas'})).status).toBe(204);
  const ignoradas = await pedir('GET','/transacoes-importadas?estado=ignorada&motivo=transferencia_entre_contas');
  expect((ignoradas.corpo as {id:string}[]).map(x=>x.id)).toEqual([t.id]);
  expect((await pedir('POST',`/transacoes-importadas/${t.id}/restaurar`)).status).toBe(204);
  const restauradas = await pedir('GET','/transacoes-importadas');
  expect((restauradas.corpo as {id:string;motivo_ignorada:string|null}[]).find(x=>x.id===t.id)?.motivo_ignorada).toBeNull();
});

it('histórico de metas registra só alterações efetivas', async () => {
  await pedir('PUT','/metas/lazer',{percentual:19});
  await pedir('PUT','/metas/lazer',{percentual:19});
  await pedir('PUT','/metas/lazer',{percentual:20});
  await pedir('DELETE','/metas/lazer');
  const historico = await pedir('GET','/metas/historico');
  expect(historico.status).toBe(200);
  expect((historico.corpo as {acao:string}[]).map(r=>r.acao)).toEqual(['removida','alterada','criada']);
});
