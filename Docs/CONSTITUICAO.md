# Constituição do Gastoba

**Versão**: 1.1.0 · **Ratificada em**: 2026-10-07 · **Última emenda**: 2026-10-20

Este documento define os princípios inegociáveis do Gastoba. Todo plano (`plans/`), toda implementação e toda revisão de código devem respeitá-los. Em caso de conflito entre esta constituição e qualquer outro documento do projeto, a constituição prevalece; para mudá-la, siga a seção "Governança".

## Propósito

O Gastoba é uma plataforma web de controle de gastos pessoais. Permite registrar gastos manualmente e, via Open Finance (Pluggy), importar transações bancárias, para que a pessoa entenda para onde vai o seu dinheiro.

## Artigo I: Arquitetura em camadas (DDD)

1. O backend é organizado em `domain` → `application` → `infrastructure`, mais a camada de entrada `api`.
2. A dependência aponta sempre para dentro. O `domain` importa só a biblioteca padrão; a `application` importa só o `domain`; a `infrastructure` implementa as portas do `domain`; a `api` é o único ponto que monta as implementações concretas (composition root).
3. Toda integração externa (banco de dados, Pluggy, e-mail, etc.) entra no sistema por uma **porta** (`Protocol`) definida no `domain` e implementada na `infrastructure`.
4. Esta regra é verificada por um teste de arquitetura automatizado. Um teste de arquitetura falhando bloqueia o merge.
5. Se uma mudança exigir quebrar a regra de dependência, o trabalho para e a decisão volta para o dono do projeto antes de seguir.

## Artigo II: Linguagem ubíqua

1. Classes, métodos, variáveis e mensagens de erro de negócio usam o vocabulário do negócio, em português (`Gasto`, `Dinheiro`, `RegistrarGasto`).
2. Termos técnicos consagrados podem ficar em inglês quando a tradução atrapalharia (`/health`, `engine`, `middleware`), com justificativa no plano.
3. Um conceito tem um único nome em todo o sistema: backend, frontend, banco e documentação.

## Artigo III: Dinheiro é exato

1. Valores monetários nunca usam `float`, em nenhuma camada.
2. No backend, quantias são sempre o value object `Dinheiro`, armazenado em centavos inteiros; a conversão de texto ou número usa `Decimal`.
3. Na API, valores monetários trafegam como string decimal (ex.: `"25.90"`), nunca como número JSON, para que o frontend não introduza imprecisão.
4. Regras de negócio sobre valores (ex.: "gasto tem valor positivo") vivem nas entidades do `domain`, não em rotas nem no frontend.

## Artigo IV: Dados financeiros são sensíveis

1. Credenciais bancárias do usuário nunca passam pelo backend do Gastoba: a conexão com bancos é feita fora dele, pelo Meu Pluggy ou pelo widget da Pluggy no navegador.
2. Segredos (chaves da Pluggy, credenciais de banco de dados, chaves de sessão) ficam só em variáveis de ambiente ou `.env` local, nunca no repositório. Todo segredo novo ganha uma entrada sem valor real no `.env.example`.
3. Logs não registram valores, descrições de transações, identificadores de contas nem tokens.
4. A API só aceita chamadas de navegador vindas das origens explicitamente configuradas (CORS); nunca `*`.
5. Dados de um usuário nunca são visíveis para outro, assim que houver mais de um usuário.

## Artigo V: A API é o contrato

1. O backend é uma API HTTP/JSON. O frontend (SPA em React, em `frontend/`) fala com ela exclusivamente por HTTP; não há acesso direto ao banco nem código compartilhado entre os dois.
2. O contrato é a especificação OpenAPI gerada pelo FastAPI. Toda rota declara schemas de entrada e saída explícitos.
3. Uma mudança que quebra o contrato atualiza backend e frontend no mesmo PR.
4. Erros seguem um formato consistente e nunca expõem stack trace ou detalhes internos ao cliente.

## Artigo VI: Testes são obrigatórios

1. Toda regra de negócio do `domain` tem teste unitário, incluindo os casos de borda.
2. Todo caso de uso da `application` tem teste unitário usando fakes das portas, sem banco real.
3. Toda rota da `api` tem teste de integração cobrindo sucesso e erro, com banco SQLite temporário.
4. Integrações externas (Pluggy) são testadas sem chamar o serviço real; chamadas reais ficam fora da suíte padrão.
5. Nenhum código entra na `main` com teste, lint (`ruff check`) ou formatação (`ruff format --check`) falhando.

## Artigo VII: O esquema do banco evolui por migrations

1. Toda mudança de esquema é uma migration do Alembic versionada no repositório.
2. Modelos ORM são separados das entidades do `domain`; o repositório converte entre eles.
3. Nenhum banco é alterado à mão.

## Artigo VIII: Planejar antes de implementar

1. Toda funcionalidade ou mudança não trivial começa por um plano em `plans/AAAA-MM-DD_slug.md`, revisado antes da implementação.
2. O plano diz o que muda, o que não muda, os casos de borda e os testes; a implementação segue o plano, e desvios são registrados nele.
3. Cada sessão de trabalho usa uma branch nova a partir da `main`, no padrão `<tipo>/<descricao-em-kebab-case>`.
4. Commits seguem Conventional Commits, em português, com o resumo no imperativo da 2ª pessoa (`feat(domain): adiciona ...`, `fix: corrige ...`), um por mudança lógica, sem atribuição ao Claude. O mesmo vale para descrições de PR.

## Artigo IX: Simplicidade

1. Construir só o que o plano atual pede; nada de abstrações "para o futuro" sem uso concreto.
2. Nova dependência só entra com justificativa no plano (o que resolve, por que não dá com o que já existe).
3. Diante de duas soluções corretas, prefere-se a mais simples de entender.

## Artigo X: O README é a porta de entrada

Todo README do projeto, em português, deve conter:

1. **O que resolve e para quem**: o problema e o público a que se destina.
2. **Demonstração**: ao menos uma imagem real da interface (com dados fictícios) e um exemplo executável.
3. **Papel e escopo**: o papel de quem mantém o projeto e o que ele cobre, incluindo se é de uso pessoal ou uma cópia pública de código, sem prometer serviço hospedado que não exista.
4. **Decisões técnicas**: duas ou três decisões relevantes com as alternativas consideradas, sustentadas pelo código ou pelos documentos do repositório.
5. **Execução, verificação e limitações**: como executar e verificar, como rodar os testes e quais são as limitações conhecidas, com comandos conferidos contra os arquivos do repositório.

Nenhum README inclui segredos, dados reais, caminhos privados ou afirmações que o repositório não comprove.

## Governança

1. Esta constituição prevalece sobre `Docs/CLAUDE.md`, planos e convenções informais. Instruções globais do dono do projeto continuam valendo; se houver conflito com elas, a constituição deve ser emendada.
2. Emendas são feitas por PR com commit `docs(constituicao): <resumo>`, explicando o motivo e atualizando a versão e a data no topo.
3. Versionamento semântico: **MAJOR** remove ou redefine um princípio; **MINOR** adiciona princípio ou artigo; **PATCH** corrige redação sem mudar sentido.
4. Toda revisão de plano e de código verifica conformidade com esta constituição; violações são corrigidas ou justificadas explicitamente no plano.
