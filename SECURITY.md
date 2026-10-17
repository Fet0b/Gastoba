# Segurança

## Revisão da cópia pública — 16/10/2026

A revisão cobriu os arquivos exportados, configurações, autenticação, autorização por usuário, tratamento de erros e dependências travadas. Foram removidos os guias, planos e arquivos da infraestrutura particular, além do e-mail pessoal nos metadados. Nenhum banco, arquivo de ambiente real, token ou chave privada faz parte desta publicação. A captura usa exclusivamente dados fictícios da simulação. O histórico público é independente.

Controles conferidos no código e na suíte: senhas com scrypt e sal aleatório; tokens gerados com fonte criptográfica e armazenados por hash; sessão HttpOnly/SameSite com Secure por padrão; validação de escopo de chaves; CSRF para escrita por cookie; CORS e hosts explícitos; cadastro fechado; limite de login por e-mail e origem; consultas e alterações isoladas pelo usuário; erros públicos sem detalhes internos. Não há renderização HTML arbitrária na interface. Integrações bancárias usam provedor simulado nos testes.

Validações executadas:

- Backend: **1065 testes passaram**, incluindo isolamento entre usuários, autorização, CSRF, hosts, CORS, migrations e proteção de logs; Ruff lint e formatação passaram.
- Frontend: **1025 testes passaram em 72 arquivos**, verificação de tipos e build passaram. O build não contém os manipuladores de simulação.
- `pip-audit`: nenhuma vulnerabilidade conhecida nas dependências instaladas do backend; o pacote local não está em índice de advisories.
- `npm audit --omit=dev`: nenhuma vulnerabilidade conhecida nas dependências de produção.
- `npm audit` completo: quatro entradas no tooling de desenvolvimento, descritas abaixo.
- Gitleaks: nenhum segredo identificado no commit público; histórico fonte também foi verificado separadamente sem achados.

## Pendências conhecidas

As dependências de desenvolvimento têm **duas entradas altas** (`source-map-js`, negação de serviço no processamento de source maps; `undici`, transporte usado por jsdom) e **duas moderadas** (`vitest` e `@vitest/mocker`, leitura arbitrária no servidor de mocks). Elas não fazem parte das dependências de produção nem do bundle entregue ao navegador. Não exponha Vite, Vitest ou servidores de teste a redes não confiáveis e não processe conteúdo não confiável com o tooling afetado.

O lockfile original foi preservado conforme a política do projeto de versões com pelo menos 60 dias e a aceitação temporária já registrada antes da exportação. Reavalie as versões corrigidas assim que satisfizerem essa janela; a ferramenta de auditoria indica as correções disponíveis. Não execute `npm audit fix --force` sem revisar a alteração de versões e repetir as verificações.

A API não oferece HTTPS próprio. Use localhost ou rede privada protegida; qualquer acesso remoto exige TLS e cookie Secure. O limitador de tentativas e as tarefas periódicas suportam uma réplica. Cadastro público não tem limite próprio por IP e deve permanecer desativado. O isolamento e testes automatizados reduzem risco, mas esta revisão não equivale a um pentest nem garante ausência de falhas.

## Relatar um problema

Não publique tokens, bancos, dados bancários, logs completos ou prova de conceito com dados pessoais em issues. Use o canal privado de relato de vulnerabilidades do GitHub, quando disponível.
