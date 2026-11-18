# Sincroniza Gastobs/main para Gastoba

## Origem e objetivo

- Origem: snapshot local integrado de `Gastobs/main`, commit `67de13b5e7da60a3f8a77cbc4ed4983af5e0fcc9` (merge #64, 2026-11-11).
- Base: `Gastoba/main` público, commit `5419acd`.
- Objetivo: atualizar a cópia pública de aplicação e documentação de API/modelo com os recursos integrados até a origem identificada, sem transferir histórico Git.

## Escopo transferido

- `backend/`: código, migrations, testes, dependências travadas, configuração de desenvolvimento e Dockerfile de aplicação.
- `frontend/`: código, testes, configuração e dependências travadas.
- `Docs/API.md`, `Docs/MODELO_DO_BANCO.md` e `README.md`.

A lista de arquivos de origem foi gerada da árvore do commit `main`, sem usar a árvore de trabalho. Foram excluídos dados de banco, ambientes virtuais, caches, `.env.development`, dados de teste privados e o Dockerfile específico de teste.

## Exclusões e preservação

Preservados os arquivos públicos próprios do Gastoba, incluindo `AGENTS.md`, `SECURITY.md`, `compose.yaml`, `.github/workflows/`, documentos operacionais e todo o histórico Git. Não foram copiados `infra/`, `.claude/`, instruções privadas, planos do Gastobs ou commits ancestrais. O snapshot privado usado já estava antigo em relação à branch de trabalho atual e ao checkout `Gastobs/main` local: esta cópia não contém mudanças posteriores a 11/11/2026.

## Verificação

- [x] Conferir diff, `git diff --check` e ausência de caminhos privados/deploy; busca local por padrões comuns de chave/token não encontrou ocorrências. `backend/.env.example` é apenas placeholder, revisado em separado. A captura antiga `Docs/imagens/painel.png` foi removida, pois não havia captura atual no snapshot de origem.
- [ ] Backend: `uv run pytest`, `uv run ruff check .`, `uv run ruff format --check .`. Não executados: `uv run --frozen pytest` parou antes de iniciar ao não baixar `certifi==2026.10.23` por falta de DNS/rede.
- [x] Frontend: `npm ci` passou com Node `22.22.1` (abaixo do `.nvmrc` `24.21.0`); `npm run tipos` passou; `npm test -- --maxWorkers=2` executou e apresentou 4 falhas em `sistemaVisual.test.ts`; `npm run build` passou. Chromium não iniciou (`Operation not permitted`), então captura atualizada não pôde ser gerada.
- [ ] Revisar se a CI pública continua compatível sem alterar deploy.

## Limitações

A suíte frontend tem quatro falhas preexistentes no snapshot migrado em `sistemaVisual.test.ts`; portanto a migração ainda precisa de revisão antes de integração.

A captura atual da interface ficou pendente porque o Chromium foi bloqueado pelo ambiente (`Operation not permitted`); o README informa essa ausência e mantém a demonstração executável.

A tentativa de acesso remoto ao GitHub falhou por indisponibilidade de DNS nesta sessão. A origem usada é a referência local `Gastobs/main`, commit integrado identificado acima; atualidade em relação ao GitHub não pôde ser confirmada. Nenhuma publicação, PR, commit ou deploy foi realizado.
