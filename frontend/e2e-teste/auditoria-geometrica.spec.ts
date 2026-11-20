import { expect, test } from "@playwright/test";

import { compararComPendencias, registrar } from "../e2e/auditoria/comparar";
import { instalarEstado } from "../e2e/auditoria/estados";
import { auditar } from "../e2e/auditoria/regras";
import { assentar, LARGURAS, VISTAS } from "../e2e/auditoria/vistas";

// Frente 070, T008: a mesma auditoria geométrica da simulação, agora contra o ambiente de teste
// populado da 067 (nomes longos, caixa alta de banco, muitas posições): é onde a maioria dos achados
// aparece. Pessoa fictícia do ambiente; nada sai de localhost:8180. Não entra no CI.

const PESSOA = { email: "teste@exemplo.com", senha: "senha-de-teste-123" };

for (const vista of VISTAS) {
  if (vista.ambientes && !vista.ambientes.includes("teste")) continue;
  for (const estado of vista.estados) {
    for (const largura of LARGURAS) {
      if (vista.larguras && !vista.larguras.includes(largura)) continue;
      test(`${vista.slug}: auditoria geométrica ${estado} em ${largura}px (ambiente de teste)`, async ({ page }) => {
        const origem = new URL(test.info().project.use.baseURL ?? "http://localhost:8180").origin;
        await page.route("**/*", (rota) =>
          new URL(rota.request().url()).origin === origem ? rota.continue() : rota.abort("blockedbyclient"),
        );
        await page.setViewportSize({ width: largura, height: 900 });
        await instalarEstado(page, estado);
        await page.goto("/");
        await page.getByLabel("E-mail", { exact: true }).fill(PESSOA.email);
        await page.getByLabel("Senha", { exact: true }).fill(PESSOA.senha);
        await page.getByRole("button", { name: "Entrar", exact: true }).click();
        await expect(page.getByRole("navigation", { name: "Telas" })).toBeVisible();
        // A sessão é cookie: o link direto da vista vale depois do login.
        await page.goto(vista.caminho);
        await expect(page.getByRole("heading", { name: vista.titulo, exact: true })).toBeVisible();
        await page.waitForLoadState("networkidle").catch(() => undefined);
        await assentar(page, estado);
        if (vista.abrir) {
          await vista.abrir(page, "teste");
          await assentar(page, estado);
        }
        const achados = await auditar(page);
        registrar("teste", vista.slug, estado, largura, achados);
        const { novas, sumidas } = compararComPendencias(achados, vista.slug, "teste", largura, estado);
        expect(novas, "achados fora da lista de pendências").toEqual([]);
        expect(sumidas, "pendências que a auditoria não acusa mais: tire-as do arquivo").toEqual([]);
      });
    }
  }
}
