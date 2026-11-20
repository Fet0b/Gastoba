import { expect, test } from "@playwright/test";

import { entrar } from "./apoio";
import { compararComPendencias, registrar } from "./auditoria/comparar";
import { instalarEstado } from "./auditoria/estados";
import { auditar } from "./auditoria/regras";
import { assentar, LARGURAS, VISTAS } from "./auditoria/vistas";

// Frente 070, T007: a auditoria geométrica (Art. XI.10 item 6) sobre a simulação. Cada vista é medida
// em 1366 e 390 px nos estados com dados, vazio e carregando. O teste falha com achado fora da lista
// de `auditoria/pendencias/<vista>.ts` e com item da lista que sumiu (aí é só tirá-lo).

for (const vista of VISTAS) {
  if (vista.ambientes && !vista.ambientes.includes("simulacao")) continue;
  for (const estado of vista.estados) {
    for (const largura of LARGURAS) {
      if (vista.larguras && !vista.larguras.includes(largura)) continue;
      test(`${vista.slug}: auditoria geométrica ${estado} em ${largura}px`, async ({ page }, info) => {
        test.skip(info.project.name !== "desktop", "a largura vem do teste, não do projeto");
        await page.setViewportSize({ width: largura, height: 900 });
        await instalarEstado(page, estado);
        await entrar(page, vista.caminho);
        await expect(page.getByRole("heading", { name: vista.titulo, exact: true })).toBeVisible();
        await assentar(page, estado);
        if (vista.abrir) {
          await vista.abrir(page, "simulacao");
          await assentar(page, estado);
        }
        const achados = await auditar(page);
        registrar("simulacao", vista.slug, estado, largura, achados);
        const { novas, sumidas } = compararComPendencias(achados, vista.slug, "simulacao", largura, estado);
        expect(novas, "achados fora da lista de pendências").toEqual([]);
        expect(sumidas, "pendências que a auditoria não acusa mais: tire-as do arquivo").toEqual([]);
      });
    }
  }
}
