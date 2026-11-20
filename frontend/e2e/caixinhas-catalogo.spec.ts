import { expect, test, type Page } from "@playwright/test";
import { entrar, focarPeloTeclado, irPara } from "./apoio";

// Frente 077, US1 a US3 portadas do antigo diálogo "Gerenciar caixinhas" para a tela Caixinhas.

type Caixinha = { id: string; nome: string; icone?: string | null; cor?: string | null };
type PedidoDaFixture = { method: string; path: string; body: string | null };
type RespostaDaFixture = { status: number; corpo?: unknown; perder?: boolean } | null;

async function clicarNavegacaoSemAguardarDestino(page: Page, nome: string) {
  const botao = page.getByRole("navigation", { name: "Telas" }).getByRole("link", { name: nome, exact: true });
  if (await botao.count()) await botao.click();
  else {
    await page.getByRole("button", { name: "Mais", exact: true }).click();
    await page.getByRole("dialog", { name: "Mais telas" }).getByRole("link", { name: nome, exact: true }).click();
  }
}

async function lerContasEInvestimentos(page: Page) {
  return page.evaluate(async () => Promise.all([
    fetch("http://localhost:8000/contas").then((resposta) => resposta.json()),
    fetch("http://localhost:8000/investimentos").then((resposta) => resposta.json()),
  ]));
}

async function instalarCatalogoDeTeste(page: Page, catalogo: Caixinha[] = []) {
  let perderProximaRespostaDeCriacao = false;
  let falhaDaProximaExclusao: 404 | 409 | null = null;
  let expirarProximaLeitura = false;
  let pessoaAtual: string | null = null;
  const catalogosPorPessoa = new Map<string, Caixinha[]>([["voce@exemplo.com", catalogo]]);
  const escritasFinanceiras: string[] = [];

  await page.exposeBinding("__responderCatalogoE2E", (_origem, pedido: PedidoDaFixture): RespostaDaFixture => {
    const caminho = pedido.path;
    if (pedido.method === "POST" && caminho === "/auth/entrar") {
      pessoaAtual = (JSON.parse(pedido.body ?? "{}") as { email?: string }).email ?? null;
      return null;
    }
    if (pedido.method === "POST" && caminho === "/auth/sair") {
      pessoaAtual = null;
      return null;
    }
    if (pedido.method !== "GET" && ["/contas", "/investimentos", "/movimentos-de-investimento", "/operacoes", "/ativos", "/ganhos", "/gastos"].some((prefixo) => caminho === prefixo || caminho.startsWith(`${prefixo}/`))) {
      escritasFinanceiras.push(`${pedido.method} ${caminho}`);
    }
    if (pedido.method === "GET" && (caminho === "/contas" || caminho === "/investimentos")) {
      return { status: 200, corpo: [] };
    }
    if (caminho === "/contas" || caminho === "/investimentos" || caminho.startsWith("/investimentos/")) {
      return null;
    }
    if (!caminho.startsWith("/destinacoes-cadastradas")) return null;
    if (!pessoaAtual) {
      return { status: 401, corpo: { erro: { codigo: "nao_autenticado", mensagem: "Credencial ausente, inválida ou expirada." } } };
    }
    let catalogoDaPessoa = catalogosPorPessoa.get(pessoaAtual);
    if (!catalogoDaPessoa) {
      catalogoDaPessoa = [];
      catalogosPorPessoa.set(pessoaAtual, catalogoDaPessoa);
    }
    if (pedido.method === "GET" && caminho === "/destinacoes-cadastradas") {
      if (expirarProximaLeitura) {
        expirarProximaLeitura = false;
        return { status: 401, corpo: { erro: { codigo: "nao_autenticado", mensagem: "Credencial ausente, inválida ou expirada." } } };
      }
      return { status: 200, corpo: catalogoDaPessoa };
    }
    if (pedido.method === "POST" && caminho === "/destinacoes-cadastradas") {
      const entrada = JSON.parse(pedido.body ?? "{}") as { nome: string };
      const nome = entrada.nome.trim().replace(/\s+/g, " ").toLowerCase();
      const existente = catalogoDaPessoa.find((item) => item.nome === nome);
      if (existente) {
        return { status: 409, corpo: { erro: { codigo: "destinacao_ja_cadastrada", mensagem: "Já existe uma caixinha com esse nome." } } };
      }
      catalogoDaPessoa.push({ id: crypto.randomUUID(), nome, icone: null, cor: null });
      if (perderProximaRespostaDeCriacao) {
        perderProximaRespostaDeCriacao = false;
        return { status: 0, perder: true };
      }
      return { status: 201, corpo: catalogoDaPessoa.at(-1) };
    }
    if (pedido.method === "DELETE" && caminho.startsWith("/destinacoes-cadastradas/")) {
      const id = decodeURIComponent(caminho.split("/").at(-1)!);
      const indice = catalogoDaPessoa.findIndex((item) => item.id === id);
      if (falhaDaProximaExclusao !== null) {
        const status = falhaDaProximaExclusao;
        falhaDaProximaExclusao = null;
        if (status === 404 && indice >= 0) catalogoDaPessoa.splice(indice, 1);
        return { status, corpo: { erro: { codigo: status === 409 ? "destinacao_em_uso" : "destinacao_cadastrada_nao_encontrada", mensagem: status === 409 ? "Esta caixinha tem uso ou histórico e não pode ser excluída." : "A caixinha não foi encontrada." } } };
      }
      if (indice < 0) {
        return { status: 404, corpo: { erro: { codigo: "destinacao_cadastrada_nao_encontrada", mensagem: "A caixinha não foi encontrada." } } };
      } else {
        catalogoDaPessoa.splice(indice, 1);
        return { status: 204 };
      }
    }
    return null;
  });
  await page.addInitScript(() => {
    type Responder = (pedido: PedidoDaFixture) => Promise<RespostaDaFixture>;
    const responder = (window as Window & { __responderCatalogoE2E?: Responder }).__responderCatalogoE2E;
    if (!responder) throw new Error("Fixture da API de caixinhas não instalada.");
    let fetchAtual: typeof window.fetch = window.fetch.bind(window);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      get: () => fetchAtual,
      set: (fetchOriginal: typeof window.fetch) => {
        fetchAtual = async (entrada: RequestInfo | URL, opcoes?: RequestInit) => {
          const requisicao = entrada instanceof Request ? entrada : null;
          const url = new URL(requisicao?.url ?? String(entrada), window.location.href);
          const method = opcoes?.method ?? requisicao?.method ?? "GET";
          const body = opcoes?.body === undefined ? null : String(opcoes.body);
          const resposta = await responder({ method, path: url.pathname, body });
          if (resposta?.perder) throw new TypeError("Failed to fetch");
          if (resposta) {
            return new Response(resposta.status === 204 ? null : JSON.stringify(resposta.corpo), {
              status: resposta.status,
              headers: resposta.status === 204 ? undefined : { "content-type": "application/json" },
            });
          }
          return fetchOriginal(entrada, opcoes);
        };
      },
    });
  });
  return {
    catalogo,
    catalogosPorPessoa,
    escritasFinanceiras,
    perderProximaResposta() { perderProximaRespostaDeCriacao = true; },
    falharProximaExclusao(status: 404 | 409) { falhaDaProximaExclusao = status; },
    expirarProximaLeitura() { expirarProximaLeitura = true; },
  };
}

const novoCartao = (page: Page, nome: string) => page.getByRole("group", { name: "Caixinhas", exact: true }).getByRole("button", { name: new RegExp(`^${nome}`, "i") });
const criarDoCabecalho = (page: Page) => page.getByRole("button", { name: "Criar caixinha", exact: true });

test("cria caixinha vazia sem posição e encontra o catálogo após recarregar", async ({ page }, testInfo) => {
  const fixture = await instalarCatalogoDeTeste(page);
  await entrar(page);
  await irPara(page, "Caixinhas");

  await expect(page.getByText("Nenhuma caixinha ainda", { exact: true })).toBeVisible();
  const antes = await lerContasEInvestimentos(page);
  expect(antes).toEqual([[], []]);
  await testInfo.attach("caixinhas-vazio", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  await criarDoCabecalho(page).click();
  const dialogo = page.getByRole("dialog", { name: "Criar caixinha" });
  await dialogo.getByLabel("Nome", { exact: true }).fill("  VIAGEM   São João ");
  await dialogo.getByRole("button", { name: "Salvar caixinha", exact: true }).click();
  await expect(dialogo).toBeHidden();
  await expect(novoCartao(page, "Viagem são joão")).toBeVisible();
  await testInfo.attach("caixinhas-com-cadastro", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  expect(await lerContasEInvestimentos(page)).toEqual(antes);
  expect(fixture.escritasFinanceiras).toEqual([]);
  expect(fixture.catalogo).toHaveLength(1);

  await page.reload();
  await entrar(page, "/caixinhas");
  await expect(novoCartao(page, "Viagem são joão")).toBeVisible();
});

test("limpa o cache ao trocar de pessoa e mantém catálogos isolados", async ({ page }) => {
  const fixture = await instalarCatalogoDeTeste(page, [{ id: "id-da-primeira-pessoa", nome: "viagem" }]);
  await entrar(page);
  await irPara(page, "Caixinhas");
  await expect(novoCartao(page, "Viagem")).toBeVisible();

  await irPara(page, "Perfil");
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Bia");
  await page.getByLabel("E-mail", { exact: true }).fill("bia-caixinhas@exemplo.com");
  await page.getByLabel("Senha", { exact: true }).fill("senha-de-exemplo-123");
  await page.getByLabel("Confirme a senha", { exact: true }).fill("senha-de-exemplo-123");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Metas do mês" })).toBeVisible();
  await irPara(page, "Caixinhas");
  await expect(page.getByText("Nenhuma caixinha ainda", { exact: true })).toBeVisible();
  await expect(novoCartao(page, "Viagem")).toHaveCount(0);
  expect(fixture.catalogosPorPessoa.get("bia-caixinhas@exemplo.com")).toEqual([]);

  await irPara(page, "Perfil");
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("form", { name: "Entrar no Gastoba", exact: true })).toBeVisible();
  await page.getByLabel("E-mail", { exact: true }).fill("voce@exemplo.com");
  await page.getByLabel("Senha", { exact: true }).fill("senha-de-exemplo-123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Metas do mês" })).toBeVisible();
  await irPara(page, "Caixinhas");
  await expect(novoCartao(page, "Viagem")).toBeVisible();
});

test("expiração durante a leitura encerra a sessão e não mostra catálogo em cache", async ({ page }) => {
  const fixture = await instalarCatalogoDeTeste(page, [{ id: "id-expirado", nome: "reserva" }]);
  await entrar(page);
  fixture.expirarProximaLeitura();
  await clicarNavegacaoSemAguardarDestino(page, "Caixinhas");
  await expect(page.getByRole("heading", { name: "Gastoba", exact: true })).toBeVisible();
  await expect(page.getByLabel("E-mail", { exact: true })).toBeVisible();
  await expect(page.getByText("reserva", { exact: true })).toHaveCount(0);
  await expect(criarDoCabecalho(page)).toHaveCount(0);
});

test("abre e fecha o criar pelo teclado devolvendo o foco ao gatilho", async ({ page }) => {
  const fixture = await instalarCatalogoDeTeste(page, [{ id: "id-existente", nome: "casa" }]);
  await entrar(page);
  await irPara(page, "Caixinhas");
  const gatilho = criarDoCabecalho(page);
  await focarPeloTeclado(page, gatilho);
  await page.keyboard.press("Enter");
  const dialogo = page.getByRole("dialog", { name: "Criar caixinha" });
  await expect(dialogo.getByLabel("Nome", { exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialogo).toBeHidden();
  await expect(gatilho).toBeFocused();
  expect(fixture.catalogo).toHaveLength(1);
});

test("conflito após resposta perdida mantém uma única identidade e permite corrigir/repetir", async ({ page }) => {
  const fixture = await instalarCatalogoDeTeste(page);
  await entrar(page);
  await irPara(page, "Caixinhas");
  await criarDoCabecalho(page).click();
  const dialogo = page.getByRole("dialog", { name: "Criar caixinha" });
  const nome = dialogo.getByLabel("Nome", { exact: true });
  await nome.fill("Viagem");
  fixture.perderProximaResposta();
  await dialogo.getByRole("button", { name: "Salvar caixinha", exact: true }).click();
  await expect(dialogo.getByText("Não foi possível falar com o servidor.")).toBeVisible();
  await dialogo.getByRole("button", { name: "Salvar caixinha", exact: true }).click();
  await expect(dialogo.getByText("Já existe uma caixinha com esse nome.")).toBeVisible();
  await expect(nome).toHaveValue("Viagem");
  expect(fixture.catalogo).toHaveLength(1);
});

test("cancelar conserva caixinha; confirmar exclui sem uso e recriar o nome gera outra identidade", async ({ page }) => {
  const fixture = await instalarCatalogoDeTeste(page, [{ id: "id-viagem-original", nome: "viagem" }]);
  await entrar(page);
  await irPara(page, "Caixinhas");
  const menu = page.getByRole("button", { name: "Mais ações de viagem", exact: true });
  await menu.click();
  await page.getByRole("menuitem", { name: "Excluir caixinha" }).click();
  let confirmacao = page.getByRole("dialog", { name: "Excluir viagem?" });
  await expect(confirmacao).toBeVisible();
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  const cancelar = confirmacao.getByRole("button", { name: "Cancelar", exact: true });
  await expect(cancelar).toBeFocused();
  await cancelar.click();
  await expect(confirmacao).toBeHidden();
  await expect(menu).toBeFocused();
  expect(fixture.catalogo.map((item) => item.id)).toEqual(["id-viagem-original"]);

  await menu.click();
  await page.getByRole("menuitem", { name: "Excluir caixinha" }).click();
  confirmacao = page.getByRole("dialog", { name: "Excluir viagem?" });
  await expect(confirmacao).toBeVisible();
  await confirmacao.getByRole("button", { name: "Excluir definitivamente", exact: true }).click();
  await expect(page.getByText("Nenhuma caixinha ainda", { exact: true })).toBeVisible();
  expect(fixture.catalogo).toEqual([]);

  await criarDoCabecalho(page).click();
  const dialogo = page.getByRole("dialog", { name: "Criar caixinha" });
  await dialogo.getByLabel("Nome", { exact: true }).fill("Viagem");
  await dialogo.getByRole("button", { name: "Salvar caixinha", exact: true }).click();
  await expect(novoCartao(page, "Viagem")).toBeVisible();
  expect(fixture.catalogo).toHaveLength(1);
  expect(fixture.catalogo[0]!.id).not.toBe("id-viagem-original");
});

test("409 após abrir confirmação preserva item e explica que há uso ou histórico", async ({ page }) => {
  const fixture = await instalarCatalogoDeTeste(page, [{ id: "id-estudos", nome: "estudos" }]);
  await entrar(page);
  await irPara(page, "Caixinhas");
  await page.getByRole("button", { name: "Mais ações de estudos", exact: true }).click();
  await page.getByRole("menuitem", { name: "Excluir caixinha" }).click();
  const confirmacao = page.getByRole("dialog", { name: "Excluir estudos?" });
  await expect(confirmacao).toBeVisible();
  fixture.falharProximaExclusao(409);
  await confirmacao.getByRole("button", { name: "Excluir definitivamente", exact: true }).click();
  await expect(confirmacao.getByRole("alert")).toContainText("uso ou histórico");
  await expect(confirmacao.getByRole("button", { name: "Excluir definitivamente", exact: true })).toBeDisabled();
  await expect(confirmacao.getByRole("button", { name: "Cancelar", exact: true })).toBeFocused();
  expect(fixture.catalogo).toHaveLength(1);
  await confirmacao.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(novoCartao(page, "Estudos")).toBeVisible();
});

test("404 concorrente atualiza catálogo e devolve foco quando o cartão desaparece", async ({ page }) => {
  const fixture = await instalarCatalogoDeTeste(page, [{ id: "id-reserva", nome: "reserva" }]);
  await entrar(page);
  await irPara(page, "Caixinhas");
  await page.getByRole("button", { name: "Mais ações de reserva", exact: true }).click();
  await page.getByRole("menuitem", { name: "Excluir caixinha" }).click();
  const confirmacao = page.getByRole("dialog", { name: "Excluir reserva?" });
  await expect(confirmacao).toBeVisible();
  fixture.falharProximaExclusao(404);
  await confirmacao.getByRole("button", { name: "Excluir definitivamente", exact: true }).click();
  await expect(page.getByText("Nenhuma caixinha ainda", { exact: true })).toBeVisible();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(criarDoCabecalho(page)).toBeFocused();
  expect(fixture.catalogo).toEqual([]);
});
