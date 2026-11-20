import { expect, test } from "@playwright/test";
import { entrar, irPara } from "./apoio";

// U28: com o cursor fora do fim (clique ou toque), cada dígito ainda entra pela direita.
test("clicar no campo Valor e digitar 4590 dá 45,90 e registra R$ 45,90", async ({ page }) => {
  await entrar(page);
  await irPara(page, "Transações");
  await page.getByRole("button", { name: "Novo gasto", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Novo gasto" });
  const valor = dialogo.getByLabel("Valor", { exact: true });
  // Clique no início do campo, como a pessoa faz com o mouse ou o dedo.
  const caixa = await valor.boundingBox();
  if (!caixa) throw new Error("campo Valor sem caixa");
  await page.mouse.click(caixa.x + 4, caixa.y + caixa.height / 2);
  if (test.info().project.use.hasTouch) await valor.tap({ position: { x: 4, y: caixa.height / 2 } });
  await valor.pressSequentially("4590");
  await expect(valor).toHaveValue("45,90");
  await dialogo.getByLabel("Descrição", { exact: true }).fill("Teste do cursor");
  await dialogo.getByRole("radio", { name: "Lazer" }).check({ force: true });
  await dialogo.getByRole("button", { name: "Registrar gasto", exact: true }).click();
  await expect(page.getByText("Gasto registrado.", { exact: true })).toBeVisible();
  const linha = page.getByText("Teste do cursor", { exact: true }).first();
  await expect(linha).toBeVisible();
  await expect(page.getByText(/45,90/).first()).toBeVisible();
});
