// Só o que os testes de arquivos estáticos usam do Node (o tsconfig não carrega @types/node).
declare module "node:fs" {
  export function readFileSync(caminho: string, codificacao: "utf-8"): string;
}
