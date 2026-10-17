# Instruções de desenvolvimento

Leia a [constituição](CONSTITUICAO.md) e as [instruções do repositório](../AGENTS.md).

Use português para conceitos de negócio, mantenha a arquitetura em camadas e não utilize ponto flutuante para dinheiro. As dependências e runtimes estão travados nos arquivos de cada pacote. As variáveis disponíveis estão nos arquivos `.env.example`. Testes de integrações externas não usam serviços reais.

Mudanças não triviais seguem especificação, plano em `plans/`, testes, implementação e verificação. A cópia pública não contém infraestrutura nem rotinas de deploy da instalação particular.
