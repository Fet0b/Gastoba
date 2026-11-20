# Sincronização do Gastobs para o Gastoba

## Origem

Sincronizar a cópia pública com o commit `95ee94e29b6984938ddb4379d893f48c6ef84d4d` da branch `main` do Gastobs, consultado no GitHub em 20/11/2026.

## Escopo

Copiar `backend/`, `frontend/`, `Docs/API.md`, `Docs/MODELO_DO_BANCO.md` e `README.md`. Preservar instruções, segurança, composição Docker, histórico, planos públicos e imagens próprias do Gastoba. Excluir arquivos de ambiente, bancos, caches e artefatos de execução.

## Verificação

Executar pytest e Ruff no backend, tipos, testes e build do frontend com ferramentas travadas. Conferir o diff, caminhos privados, e a Caixa de entrada e Caixinhas na interface simulada.

## Limites conhecidos

A origem é o último commit disponível na branch remota `main` do Gastobs nesta sincronização. Arquivos locais não rastreados ou modificados no checkout Gastobs não fazem parte da origem.
