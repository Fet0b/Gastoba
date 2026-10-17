# Publicação independente

Objetivo: publicar uma cópia revisada do código, com histórico novo, documentação reproduzível, logo e captura da interface com dados fictícios. A instalação original e seus workflows permanecem separados.

Critérios: excluir configuração e narrativa da infraestrutura pessoal, credenciais, bancos e dados reais; revisar autenticação e dependências; executar suites backend/frontend e varredura de segredos; capturar a simulação local; conferir conteúdo e autoria antes de publicar. Não há nova funcionalidade.

Tarefas: sanitizar documentação e metadados; validar código e dependências; gerar imagem; conferir arquivos; criar commit independente e publicar.

Verificações: backend 1065 testes, ruff check e ruff format --check aprovados; frontend 1025 testes em 72 arquivos, tipos e build aprovados; pip-audit e npm audit --omit=dev sem achados. As quatro entradas conhecidas de tooling npm foram mantidas segundo a política de 60 dias e documentadas em SECURITY.md. O build não leva simulação. Removidos docs/planos/infra específicos da instalação e o e-mail pessoal; CI público executa apenas testes/build em runners hospedados, sem deploy. Corrigida a URL local de desenvolvimento para localhost, em conformidade com o cookie SameSite e a documentação. Screenshot capturado na interface real em desenvolvimento, com simulação local e somente exemplos fictícios; logo nativo SVG incluído no README. Gitleaks verificou o único commit público: nenhum segredo identificado (1,94 MB inspecionados). Histórico privado fonte também sem achados no scan anterior. Nenhum deploy particular foi alterado.
