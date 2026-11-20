# Plano de melhoria do README público

## Objetivo e escopo

Quem chega ao projeto deve entender, já na abertura, que pode registrar gastos manualmente ou revisar transações bancárias importadas via Open Finance com a Pluggy. Hoje a primeira imagem mostra o painel, mas a importação aparece só mais adiante na lista de recursos. A entrega proposta abrange o README em português e as capturas em `Docs/imagens/`. A execução usa a aplicação e os dados de demonstração existentes.

## Sequência de execução

1. Reescrever a abertura com o problema, o público e as duas formas de registrar movimentações. Identificar o projeto como uma ferramenta pessoal para instalação própria e oferecer um atalho para a demonstração local.
2. Criar, antes da lista geral de recursos, uma seção “Open Finance com a Pluggy”. Explicar o percurso real da pessoa responsável pela importação. A autorização ocorre no provedor. O Gastoba consulta as movimentações e as apresenta em **Transações → Caixa de entrada**. A pessoa revisa cada item e decide se aceita ou ignora. Usar os rótulos da versão pública e conferir o fluxo em `frontend/src/componentes/Importadas/CaixaDeEntrada.tsx`. Descrever a integração real como opcional, dependente da configuração no backend e de uma conta compatível no provedor. A demonstração usa respostas simuladas.
3. Preparar as capturas em um perfil de navegador limpo, com a versão de Node de `frontend/.nvmrc`, `npm ci` e `npm run dev` em `frontend/`. Confirmar que a simulação está ativa e entrar com o usuário fictício documentado no README. Registrar a tela Início com o resumo financeiro visível e a Caixa de entrada com uma movimentação fictícia pendente e suas ações. Se necessário, usar **Sincronizar agora** na simulação antes da segunda captura. Conferir o painel existente e reaproveitá-lo se corresponder à versão pública atual.
4. Salvar as imagens em PNG, com enquadramento legível e sem a barra do navegador. Junto a cada figura, incluir texto alternativo que descreva a tela e legenda que identifique os dados como fictícios. Colocar a imagem da Caixa de entrada junto à explicação do fluxo e a do painel junto à apresentação do produto.
5. Manter visíveis os comandos da demonstração, a configuração do backend real, os testes, as limitações de implantação e as decisões técnicas com alternativas previstas no artigo X da Constituição. Conferir os comandos contra os scripts e arquivos de exemplo desta cópia pública.

## Critérios de aceite e verificação

- O primeiro parágrafo menciona o registro manual, o Open Finance e a Pluggy. Antes das instruções de instalação, o leitor encontra a sequência que vai da sincronização à decisão de aceitar ou ignorar.
- Uma pessoa consegue seguir o exemplo executável e reproduzir as duas telas com dados fictícios e sem credenciais bancárias. Se a Caixa de entrada estiver oculta, verificar o usuário da simulação e a condição de acesso em `frontend/src/paginas/Transacoes.tsx`.
- As duas imagens abrem por caminhos relativos na prévia Markdown. Em largura de celular, verificar se é possível identificar as telas e ler as legendas. Inspecionar os PNGs em tamanho integral e conferir que nomes, valores e descrições pertencem ao cenário de demonstração e que nenhum segredo ou identificador privado aparece.
- Conferir as afirmações sobre o provedor em `backend/src/gastoba/infrastructure/pluggy/provedor_pluggy.py`, revisar os cinco requisitos do artigo X e executar `git diff --check`. Registrar os comandos efetivamente executados e o resultado da inspeção visual.

## Estado da execução

A abertura, a navegação e a seção de Open Finance foram atualizadas no README. As capturas foram feitas no Chromium com Playwright, usando a prévia compilada em modo de desenvolvimento do frontend da `main` pública e a simulação local. A tela Início foi capturada após o login fictício. A Caixa de entrada foi capturada após clicar em **Sincronizar agora**, com quatro transações fictícias pendentes. As duas imagens foram inspecionadas visualmente.

Os dois caminhos relativos do README apontam para arquivos PNG válidos. A verificação com `git diff --check` passou.

Com as dependências travadas, passaram `pytest` (1.065 testes), `ruff check .` e `ruff format --check .` no backend. No frontend, com Node 24.21.0, passaram `npm run tipos`, `npm test -- --maxWorkers=2` (1.025 testes) e `npm run build`.
