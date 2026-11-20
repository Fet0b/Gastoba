// Gera os arquivos de `pendencias/` a partir do relatório da auditoria (só leitura do relatório).
//   GASTOBA_AUDITORIA_RELATORIO=/caminho/relatorio.jsonl GASTOBA_E2E_PORTA=5175 npx playwright test e2e/auditoria-geometrica.spec.ts
//   node e2e/auditoria/gerar-pendencias.mjs /caminho/relatorio.jsonl
// Os dois ambientes ficam no mesmo arquivo por vista; rode o gerador com o relatório de cada ambiente
// (ele só reescreve a lista do ambiente que está no relatório e preserva a do outro).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** @typedef {{ ambiente: "simulacao" | "teste", vista: string, estado: string, largura: number, regra: string | null }} Linha */

const ORDEM_DOS_ESTADOS = ["dados", "vazio", "carregando"];
const aqui = dirname(fileURLToPath(import.meta.url));
const relatorio = process.argv[2];
if (!relatorio) throw new Error("Informe o relatório .jsonl.");
/** @type {Linha[]} */
const linhas = readFileSync(relatorio, "utf-8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));
const ambientes = new Set(linhas.map((l) => l.ambiente));
const vistas = new Set(linhas.map((l) => l.vista));

function lerLista(arquivo, nome) {
  if (!existsSync(arquivo)) return "[]";
  const texto = readFileSync(arquivo, "utf-8");
  const m = new RegExp(`export const ${nome}: Pendencia\\[\\] = (\\[[\\s\\S]*?\\n?\\]);`).exec(texto);
  return m?.[1] ?? "[]";
}

for (const vista of vistas) {
  const arquivo = join(aqui, "pendencias", `${vista}.ts`);
  const listas = {};
  for (const ambiente of ["simulacao", "teste"]) {
    if (!ambientes.has(ambiente)) {
      listas[ambiente] = lerLista(arquivo, ambiente);
      continue;
    }
    const itens = linhas
      .filter((l) => l.ambiente === ambiente && l.vista === vista && l.regra)
      .map((l) => ({ regra: l.regra, largura: l.largura, estado: l.estado }))
      .sort((a, b) => a.regra.localeCompare(b.regra, "pt", { numeric: true }) || b.largura - a.largura || ORDEM_DOS_ESTADOS.indexOf(a.estado) - ORDEM_DOS_ESTADOS.indexOf(b.estado));
    listas[ambiente] = itens.length
      ? `[\n${itens.map((i) => `  { regra: "${i.regra}", largura: ${i.largura}${i.estado === "dados" ? "" : `, estado: "${i.estado}"`} },`).join("\n")}\n]`
      : "[]";
  }
  writeFileSync(
    arquivo,
    `import type { Pendencia } from "../comparar";\n\nexport const simulacao: Pendencia[] = ${listas.simulacao};\n\nexport const teste: Pendencia[] = ${listas.teste};\n`,
  );
}

const todas = [
  "inicio", "transacoes", "orcamento", "contas", "investimentos", "faturas", "tags", "recorrencias", "perfil",
  "transacoes-caixa", "transacoes-caixa-rendimento", "transacoes-aportes", "novo-gasto", "sininho", "folha-mais", "menu-de-linha",
];
const identificador = (slug) => slug.replace(/-(\w)/g, (_, c) => c.toUpperCase());
const indice = `import type { Pendencia } from "../comparar";
${todas.map((s) => `import * as ${identificador(s)} from "./${s}";`).join("\n")}

/** Uma entrada por vista; cada faixa da 070 só edita o arquivo da sua tela. A fase final apaga tudo. */
export const PENDENCIAS: Record<string, { simulacao: Pendencia[]; teste: Pendencia[] }> = {
${todas.map((s) => `  "${s}": ${identificador(s)},`).join("\n")}
};
`;
writeFileSync(join(aqui, "pendencias", "index.ts"), indice);
