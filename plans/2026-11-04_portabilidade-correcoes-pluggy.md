# Portabilidade das correções de configuração Pluggy

## Objetivo e escopo

Ajustar a normalização da configuração opcional da Pluggy e melhorar o diagnóstico seguro de falhas, sem alterar o contrato HTTP, dados financeiros, esquema do banco ou regra de negócio. A mensagem exibida ao usuário permanece genérica; os logs podem identificar apenas a etapa fixa, o status HTTP ou o tipo da exceção de rede.

A configuração remove espaços e quebras de linha de credenciais, e-mail e identificadores de itens; entradas vazias são tratadas como ausentes. A integração continua opcional e desativada quando incompleta. Nenhuma chamada real à Pluggy é feita nos testes.

## Proteções

- Nunca registrar corpo da resposta, URL, credenciais, identificadores ou conteúdo financeiro.
- Preservar arquitetura em camadas, mensagens genéricas ao cliente, precisão monetária e isolamento entre usuários.
- Não adicionar dependências nem alterar esquema ou infraestrutura.
- Manter o README em conformidade com o Artigo X da Constituição: objetivo/público, demonstração fictícia ou executável, escopo sem serviço hospedado, decisões técnicas com alternativas e instruções verificáveis com limitações; sem segredos, dados reais ou caminhos privados.

## Verificação

- Testes focados de configuração, transporte Pluggy simulado e sincronização: 52 passaram.
- Ruff check e `ruff format --check` nos arquivos alterados passaram.
- A revisão do README confirmou os cinco requisitos do Artigo X e corrigiu a descrição do primeiro usuário. Mídia e links foram preservados; `git diff --check` passou.
- A execução do Codex reportou 657 testes de backend e 1.025 testes de frontend, além de tipos e build aprovados. A suíte backend completa não terminou: travou ao inicializar `TestClient` e foi encerrada por timeout. Portanto, a suíte completa não é declarada aprovada.
- O scanner de segredos não estava disponível durante a revisão; não foram acrescentados segredos ou dados reais.

## Estado da entrega

Alterações preparadas para revisão e publicação na cópia pública. O repositório privado não foi alterado. Commit, push, PR, merge e deploy são etapas distintas e não fazem parte deste plano.
