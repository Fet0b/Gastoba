import { expect, type Page } from "@playwright/test";

import { semearCaixinhas } from "../apoio";
import type { Ambiente, Estado } from "./comparar";

/** As telas e as vistas extras do plano §5.1 da 070. `slug` nomeia o arquivo de `pendencias/`. */
export type Vista = {
  slug: string;
  caminho: string;
  titulo: string;
  /** Estados auditados; as vistas extras só têm dados. */
  estados: readonly Estado[];
  /** Larguras em que a vista existe (a folha "Mais" só existe no celular). */
  larguras?: readonly number[];
  abrir?: (page: Page, ambiente: Ambiente) => Promise<void>;
  /** Ambientes em que o estado existe; padrão: os dois. */
  ambientes?: readonly Ambiente[];
};

const TODOS: readonly Estado[] = ["dados", "vazio", "carregando"];
const SO_DADOS: readonly Estado[] = ["dados"];

async function abrirCaixa(page: Page, ambiente: Ambiente): Promise<void> {
  await page.getByRole("button", { name: /^Caixa de entrada/ }).click();
  if (ambiente === "simulacao") {
    await page.getByRole("button", { name: "Sincronizar agora", exact: true }).click();
    await expect(page.getByRole("listitem", { name: "Mercado Extra", exact: true })).toBeVisible();
  }
}

/** Entrada pendente como "Resgate" + "Rendimento": o botão de aceitar fica desabilitado até escolher o investimento. */
async function abrirEntradaComoRendimento(page: Page, ambiente: Ambiente): Promise<void> {
  await abrirCaixa(page, ambiente);
  const cartao = page.locator('li[data-sentido="entrada"]').first();
  await cartao.getByRole("radio", { name: "Resgate" }).click({ force: true });
  await cartao.getByRole("radio", { name: /Rendimento/ }).click({ force: true });
  await expect(cartao.getByRole("button", { name: /^Aceitar como rendimento/ })).toBeDisabled();
}

export const VISTAS: readonly Vista[] = [
  { slug: "inicio", caminho: "/inicio", titulo: "Seu mês, com clareza.", estados: TODOS },
  { slug: "transacoes", caminho: "/transacoes", titulo: "Transações", estados: TODOS },
  { slug: "orcamento", caminho: "/orcamento", titulo: "Orçamento", estados: TODOS },
  { slug: "contas", caminho: "/contas", titulo: "Contas", estados: TODOS },
  { slug: "investimentos", caminho: "/investimentos", titulo: "Investimentos", estados: TODOS },
  {
    // 077: a tela Caixinhas. Na simulação os dados vêm de `semearCaixinhas`; no ambiente de teste, dos dados dele.
    slug: "caixinhas",
    caminho: "/caixinhas",
    titulo: "Caixinhas",
    estados: TODOS,
    abrir: async (page, ambiente) => {
      if (ambiente === "simulacao") await semearCaixinhas(page);
    },
  },
  {
    slug: "caixinhas-detalhe",
    caminho: "/caixinhas",
    titulo: "Caixinhas",
    estados: SO_DADOS,
    ambientes: ["simulacao"],
    abrir: async (page) => {
      await semearCaixinhas(page);
      await page.getByRole("group", { name: "Caixinhas", exact: true }).getByRole("button", { name: /^Viagem$|^Viagem\b/ }).first().click();
      await expect(page.getByRole("region", { name: "Investimentos em Viagem" })).toBeVisible();
    },
  },
  {
    slug: "caixinhas-aparencia",
    caminho: "/caixinhas",
    titulo: "Caixinhas",
    estados: SO_DADOS,
    ambientes: ["simulacao"],
    abrir: async (page) => {
      await semearCaixinhas(page);
      await page.getByRole("button", { name: "Mais ações de viagem", exact: true }).click();
      await page.getByRole("menuitem", { name: "Mudar ícone e cor" }).click();
      await expect(page.getByRole("dialog", { name: "Mudar ícone e cor de Viagem" })).toBeVisible();
    },
  },
  {
    slug: "caixinhas-criar",
    caminho: "/caixinhas",
    titulo: "Caixinhas",
    estados: SO_DADOS,
    ambientes: ["simulacao"],
    abrir: async (page) => {
      await semearCaixinhas(page);
      await page.getByRole("button", { name: "Criar caixinha", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Criar caixinha" })).toBeVisible();
    },
  },
  { slug: "faturas", caminho: "/faturas", titulo: "Faturas", estados: TODOS },
  { slug: "tags", caminho: "/tags", titulo: "Tags", estados: TODOS },
  { slug: "recorrencias", caminho: "/recorrencias", titulo: "Recorrências", estados: TODOS },
  { slug: "perfil", caminho: "/perfil", titulo: "Perfil", estados: TODOS },
  {
    slug: "transacoes-caixa",
    caminho: "/transacoes",
    titulo: "Transações",
    estados: SO_DADOS,
    abrir: abrirCaixa,
  },
  {
    // O ambiente de teste da 067 não tem entrada pendente na caixa: o estado só existe na simulação.
    slug: "transacoes-caixa-rendimento",
    caminho: "/transacoes",
    titulo: "Transações",
    estados: SO_DADOS,
    ambientes: ["simulacao"],
    abrir: abrirEntradaComoRendimento,
  },
  {
    slug: "transacoes-aportes",
    caminho: "/transacoes",
    titulo: "Transações",
    estados: SO_DADOS,
    abrir: async (page) => {
      await page.getByRole("button", { name: "Aportes e resgates", exact: true }).click();
    },
  },
  {
    slug: "novo-gasto",
    caminho: "/inicio",
    titulo: "Seu mês, com clareza.",
    estados: SO_DADOS,
    abrir: async (page) => {
      await page.getByRole("button", { name: "Novo gasto", exact: true }).first().click();
      await expect(page.getByRole("dialog", { name: "Novo gasto" })).toBeVisible();
    },
  },
  {
    slug: "sininho",
    caminho: "/inicio",
    titulo: "Seu mês, com clareza.",
    estados: SO_DADOS,
    abrir: async (page) => {
      await page.getByRole("button", { name: /^Avisos/ }).first().click();
    },
  },
  {
    slug: "folha-mais",
    caminho: "/inicio",
    titulo: "Seu mês, com clareza.",
    estados: SO_DADOS,
    larguras: [390],
    abrir: async (page) => {
      await page.getByRole("button", { name: "Mais", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Mais telas" })).toBeVisible();
    },
  },
  {
    slug: "menu-de-linha",
    caminho: "/transacoes",
    titulo: "Transações",
    estados: SO_DADOS,
    abrir: async (page) => {
      await page.getByRole("button", { name: /^Mais ações/ }).first().click();
      await expect(page.getByRole("menu").first()).toBeVisible();
    },
  },
];

export const LARGURAS = [1366, 390] as const;

/** Espera a tela assentar: sem carregamento (nos estados com dados) e sem números animando. */
export async function assentar(page: Page, estado: Estado): Promise<void> {
  if (estado !== "carregando") {
    await expect(page.getByRole("status", { name: /^Carregando/ })).toHaveCount(0, { timeout: 15_000 });
  }
  await expect(page.locator("span.valor[data-animando]")).toHaveCount(0);
  await page.waitForTimeout(250);
}
