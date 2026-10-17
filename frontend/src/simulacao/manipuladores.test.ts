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
import { reiniciarSimulacao } from "./manipuladores";

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
    expect(conta).toEqual({ id: conta.id, nome: "Nubank", saldo: "0.00", origem: "manual", tipo: "corrente" });
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
      conta_id: conta.id,
      valor: "25.90",
      descricao: "Feira",
      data: "2026-10-10",
      categoria: "conforto",
      tags: ["pix", "mercado livre"],
      origem: "manual",
      recorrencia_id: null,
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
      { codigo: "investimentos", nome: "Investimentos" },
      { codigo: "lazer", nome: "Lazer" },
      { codigo: "conhecimento", nome: "Conhecimento" },
      { codigo: "conforto", nome: "Conforto" },
      { codigo: "gasto_fixo", nome: "Gasto fixo" },
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
    expect(await listarContas()).toHaveLength(2);
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
    expect(primeira.corpo).toEqual({ categoria: "lazer", percentual: 20 });
    expect((await pedir("GET", "/metas")).corpo).toEqual([
      { categoria: "investimentos", percentual: 10 },
      { categoria: "lazer", percentual: 25 },
      { categoria: "gasto_fixo", percentual: 30 },
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
      mes: "2026-10",
      renda: "5000.00",
      metas: [
        { categoria: "lazer", percentual: 10, limite: "500.00", gasto: "450.00", restante: "50.00", percentual_usado: 90, situacao: "alerta" },
        { categoria: "conforto", percentual: 5, limite: "250.00", gasto: "0.00", restante: "250.00", percentual_usado: 0, situacao: "dentro" },
        { categoria: "gasto_fixo", percentual: 40, limite: "2000.00", gasto: "2100.00", restante: "-100.00", percentual_usado: 105, situacao: "estourou" },
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
      },
      {
        id: expect.any(String),
        nome: "Visa Gold",
        saldo: "-820.00",
        origem: "open_finance",
        tipo: "cartao",
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

