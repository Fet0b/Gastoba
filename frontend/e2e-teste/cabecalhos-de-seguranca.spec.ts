import { expect, test } from "@playwright/test";

// Spec 075 (FR-003): os três cabeçalhos de segurança vêm em toda resposta do nginx, inclusive nas
// que têm Cache-Control próprio (/ e /assets/) e nas da API. Roda contra o ambiente de teste (067).
const ESPERADOS: Record<string, string> = {
  "content-security-policy":
    "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

test("o nginx envia os cabeçalhos de segurança em todo tipo de resposta", async ({ request }) => {
  const inicio = await request.get("/");
  const html = await inicio.text();
  const arquivo = /\/assets\/[^"']+\.(?:js|css)/.exec(html)?.[0];
  expect(arquivo, "o index.html referencia um arquivo de /assets/").toBeTruthy();

  const caminhos = ["/", "/inicio", arquivo as string, "/api/health"];
  for (const caminho of caminhos) {
    const resposta = await request.get(caminho);
    expect(resposta.status(), caminho).toBe(200);
    for (const [nome, valor] of Object.entries(ESPERADOS)) {
      expect(resposta.headers()[nome], `${nome} em ${caminho}`).toBe(valor);
    }
  }
});
