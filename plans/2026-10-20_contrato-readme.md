# Plano: contrato e atualização do README

## Objetivo
Formalizar um padrão mínimo para o README e deixar a documentação do Gastoba autoexplicativa, precisa e verificável.

## Escopo
- Adicionar à Constituição um artigo com os cinco requisitos obrigatórios de README; atualizar a versão semântica para 1.1.0 e a data da emenda para 2026-10-20.
- Reestruturar o README desta cópia pública usando apenas o conteúdo e a implementação deste repositório.
- Manter intactas as referências e os arquivos de imagem já existentes (`Docs/imagens/painel.png` e `frontend/public/favicon.svg`).
- Explicitar propósito e público, demonstração, papel/escopo, duas ou três decisões técnicas com alternativas, execução/verificação/testes e limitações.
- Descrever somente comportamento comprovável; identificar claramente qualquer limitação.

## Fora de escopo
- Alterar código, configurações de ambiente, dados, segredos ou integrações.
- Importar arquivos de outro repositório, copiar configuração privada ou criar novas imagens.

## Critérios de aceitação
1. O README contém todos os cinco itens exigidos pela Constituição.
2. A captura do painel e o favicon continuam referenciados e os arquivos permanecem sem alterações.
3. As decisões e alternativas são compatíveis com a arquitetura e os comandos existentes.
4. Nenhum segredo, dado pessoal, caminho privado ou instrução de instalação particular é introduzido.
5. `git diff --check` passa; executar scanner de segredos já disponível, sem instalar dependências.

## Verificação
- Conferir a diferença contra `origin/main`, inclusive referências de imagem e arquivos alterados.
- Validar que os comandos de execução e testes citados correspondem aos arquivos e scripts deste repositório.
- Como a mudança é documental, não alterar nem executar a suíte de aplicação; relatar essa limitação no PR.
