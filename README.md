# Gastoba

Plataforma web de controle de gastos pessoais: crie suas contas, registre seus gastos (com uma categoria e tags) e seus ganhos, deixe o salário e os gastos fixos se repetirem todo mês, defina quanto da sua renda cada categoria pode usar e veja para onde vai o seu dinheiro, inclusive num gráfico por tag. Há login por e-mail e senha, chaves de API e isolamento entre as pessoas. Também há importação de transações bancárias via Open Finance (Pluggy, pelo Meu Pluggy), só para a pessoa dona da instalação: está implementada e testada contra simulações, mas **ainda não foi conferida com o Meu Pluggy real** (veja "Como verificar e limitações").

## Que problema resolve e para quem

Quem controla o próprio dinheiro em planilhas ou de cabeça perde de vista para onde ele vai. O Gastoba junta contas com saldo, gastos (categoria fixa e tags livres), ganhos, recorrências mensais e metas por categoria como porcentagem da renda do mês, num lugar só, com API para scripts. O público é uma pessoa (ou um pequeno grupo de confiança) que hospeda a própria instalação, em `localhost` ou numa rede confiável. O cadastro vem fechado por padrão e a importação bancária é só para a pessoa dona da instalação.

## Visão geral do monorepo

O repositório reúne as duas partes do produto, cada uma com seu próprio tooling:

- `backend/`: API HTTP/JSON em Python com FastAPI. Tem login, chaves de API, contas com saldo, gastos com categoria fixa e tags livres, ganhos, recorrências mensais (o servidor cria sozinho o gasto ou o ganho de cada mês), metas por categoria com renda-base mensal opcional, movimentos de investimento, o resumo dos gastos por tag e a rota de saúde `GET /health`.
- `frontend/`: SPA em React + TypeScript (Vite e Vitest), com login e chaves de API, contas, gastos, ganhos, recorrências, metas com renda-base opcional (e a situação delas na tela inicial), investimentos e as barras interativas por tags.

As duas partes conversam só por HTTP/JSON. O backend publica a especificação OpenAPI em `/openapi.json` (e a documentação interativa em `/docs`), que é o contrato da API; essas rotas exigem entrar antes (sessão ou chave de API). Como a SPA roda em outra origem durante o desenvolvimento (o Vite usa `http://localhost:5173`), a API libera CORS apenas para as origens configuradas em `GASTOBA_ORIGENS_PERMITIDAS`.

Outras pastas: `Docs/` (constituição, instruções do projeto e a [referência da API](Docs/API.md)) e `specs/` (uma pasta por frente, no padrão do Spec Kit: `spec.md`, `plan.md`, `tasks.md`). Na raiz também ficam o `compose.yaml` (backend em contêiner) e o `.gitignore`.

O guia de [deploy em LXC no Proxmox](Docs/DEPLOY_PROXMOX.md) documenta o CI/CD, os pré-requisitos no Proxmox, runner, secrets e aprovação do plano Terraform. A API fica só em loopback; o frontend (nginx) é publicado conforme o guia.

## Aviso de segurança

Toda rota de negócio exige login (sessão) ou chave de API, e uma pessoa nunca vê os dados de outra. Mesmo assim, a API **não tem HTTPS próprio**: use só em `localhost` ou numa rede confiável (por exemplo, uma VPN), nunca exposta à internet. O deploy publica o frontend por HTTP puro na rede local, com o cookie de sessão sem `Secure` (`GASTOBA_COOKIE_SEGURO=false`); trocar isso por HTTPS está proposto em `specs/017-https-e-cookie-seguro/plan.md`.

## Início rápido

Só para ver a interface, com uma API simulada em memória (sem backend; os dados somem ao recarregar):

```
cd frontend && npm ci && npm run dev
```

Com o backend de verdade, em dois terminais (o `.env.development.local` desliga a simulação e só precisa ser criado uma vez):

```
cd backend && uv sync && uv run alembic upgrade head && uv run uvicorn gastoba.api.app:criar_app --factory --reload
cd frontend && npm ci && echo "VITE_USAR_SIMULACAO=false" > .env.development.local && npm run dev
```

Nos dois casos, abra `http://localhost:5173` (por `localhost`, não por `127.0.0.1`). Detalhes, alternativas e testes estão nas seções "Backend" e "Frontend".

## Demonstração

O repositório não tem captura de tela nem vídeo da interface (o antigo marcador de lugar foi removido em vez de inventar uma imagem). A demonstração é executável:

- **Interface, sem backend**: `cd frontend && npm ci && npm run dev` abre a SPA com uma API simulada em memória; use `voce@exemplo.com` e `senha-de-exemplo-123`.
- **API de verdade**: o fluxo de `curl` em [Usando a API](#usando-a-api) (entrar, criar conta, registrar gasto, ver o saldo cair de `"1000.00"` para `"974.10"`). Ele usa o e-mail e a senha que você criou no passo 5 do backend; as credenciais `voce@exemplo.com` / `senha-de-exemplo-123` valem só para a API simulada do frontend (conferidas em `frontend/.env.example` e na simulação). **Não reexecutado** ao revisar este README (a execução foi negada neste ambiente); as rotas, campos e o fluxo foram conferidos apenas contra `Docs/CLAUDE.md` e `Docs/API.md`.

## Decisões técnicas

Os princípios completos estão em [`Docs/CONSTITUICAO.md`](Docs/CONSTITUICAO.md); estes três moldam o produto:

1. **Dinheiro exato, sem `float` (Art. III).** No backend é o value object `Dinheiro`, em centavos inteiros, e na API é string decimal (`"25.90"`). *Alternativa considerada:* números JSON e `float`, mais simples, mas que introduzem imprecisão no frontend; por isso o `float` é rejeitado até na conversão. O custo é um pouco de cerimônia em cada rota.
2. **Camadas DDD com portas e teste de arquitetura (Art. I).** `domain` só usa a biblioteca padrão; integrações (banco, Pluggy) entram por `Protocol`s. *Alternativa considerada:* deixar a regra só na revisão manual; o plano preferiu um teste com `ast` que quebra o build ao violar a dependência.
3. **Importação via Meu Pluggy, com caixa de entrada (Art. IV).** Implementada (`infrastructure/pluggy/`, caixa de entrada, sincronização), mas sem conferência com o serviço real. Credenciais bancárias nunca passam pelo backend, e cada transação só vira gasto ou ganho quando a pessoa aceita. *Alternativa considerada:* o plano pago da Pluggy (a partir de R$ 2.500/mês, inviável aqui); sem o plano gratuito, a saída seria importar OFX/CSV trocando só o adaptador. Detalhes em `specs/018-importacao-pluggy-meupluggy/plan.md`.

## Autoria e escopo

Projeto de controle de gastos pessoais (a constituição o define assim e fala em "o dono do projeto"), hospedado pelo próprio dono num LXC no Proxmox (`Docs/DEPLOY_PROXMOX.md`). O histórico git registra commits sob dois nomes de autor ("Fet0b" e "Fernando Toba Lopez"). Os dois nomes aparecem com o mesmo endereço de e-mail em ao menos alguns commits, o que indica uma só pessoa, mas o repositório não declara isso, então a autoria individual é uma inferência, não um fato estabelecido. Também não há licença nem declaração de que serve a estudo. O desenvolvimento usa agentes de IA, orientados por `Docs/CLAUDE.md`, `AGENTS.md` e frentes em `specs/`.

## Backend

### Aviso: sem HTTPS

A API tem login, mas não tem HTTPS próprio. **Não exponha a API à internet**, nem com `--host 0.0.0.0`. Rode só em `127.0.0.1`, o padrão do Uvicorn (ou, num servidor caseiro, no IP de uma VPN). (No contêiner, o Uvicorn escuta em `0.0.0.0` *dentro* dele, mas o `compose.yaml` publica a porta só em `127.0.0.1` da sua máquina; veja "Rodando em contêiner".)

### Pré-requisitos

Só o [uv](https://docs.astral.sh/uv/). Ele instala sozinho o Python 3.14 fixado em `backend/.python-version`, cria o ambiente virtual e instala as dependências travadas em `backend/uv.lock`. A stack é FastAPI, SQLAlchemy 2.x síncrono, Alembic e SQLite.

### Modelo do banco

O banco continua sendo SQLite. O [desenho completo e catálogo das relações](Docs/MODELO_DO_BANCO.md)
acompanha a entrega conjunta de contabilidade e normalização (054/055): destinações com UUIDs e FKs,
conta investimentos ligada explicitamente à conta e tags em associações ordenadas. As pontas ativas de
transferências são uma view, com exclusividade imposta por índices parciais e coerência por triggers.
Os contratos HTTP de nomes e listas permanecem compatíveis. As migrations são verificadas em SQLite
temporário, inclusive downgrade e falha de DDL; aplicação em produção continua uma etapa separada.

### Como rodar o backend

Todos os comandos abaixo rodam de dentro de `backend/`, porque o arquivo `.env` e o banco `gastobs.db` são procurados a partir do diretório atual.

1. Entre na pasta do backend:

   ```
   cd backend
   ```

2. Instale as dependências. O uv baixa o Python correto, se faltar, cria o `.venv` e instala exatamente as versões do `uv.lock`:

   ```
   uv sync
   ```

3. Crie o seu `.env` a partir do exemplo. Ele define `GASTOBA_URL_BANCO` (onde fica o banco, por padrão o arquivo `gastobs.db`), `GASTOBA_ORIGENS_PERMITIDAS` (quais frontends podem chamar a API pelo navegador), `GASTOBA_HOSTS_PERMITIDOS`, `GASTOBA_CADASTRO_ABERTO` (se qualquer pessoa pode se cadastrar; o padrão é `false`), a duração da sessão, `GASTOBA_COOKIE_SEGURO` e o intervalo da geração das recorrências. Todas as variáveis estão comentadas no `.env.example`. **Se você tinha um `.env` do tempo em que o projeto se chamava Gastobs, troque o prefixo `GASTOBS_` por `GASTOBA_`**: as variáveis com o prefixo antigo são ignoradas em silêncio (o banco `gastobs.db` continua o mesmo arquivo). O `.env` não é versionado; sem ele, a API usa os mesmos valores padrão:

   ```
   cp .env.example .env
   ```

4. Aplique as migrations do banco. O Alembic cria o arquivo SQLite, se ainda não existir, e leva o esquema até a versão mais recente (usuários, sessões, chaves de API, contas, gastos, ganhos, recorrências e metas). Sem este passo, as rotas de negócio respondem com erro 500:

   ```
   uv run alembic upgrade head
   ```

5. Crie a primeira pessoa. O cadastro pela API vem fechado, então o primeiro usuário vem deste comando administrativo (a senha é perguntada sem eco, ou vem de `GASTOBA_SENHA_INICIAL`):

   ```
   uv run python -m gastoba.administracao criar-usuario --email voce@exemplo.com --nome Voce
   ```

6. Suba a API em modo de desenvolvimento. O `--factory` diz ao Uvicorn que `criar_app` é uma função que monta a aplicação, e o `--reload` reinicia o servidor a cada mudança no código:

   ```
   uv run uvicorn gastoba.api.app:criar_app --factory --reload
   ```

7. Entre pela SPA (ou crie uma sessão por `POST /auth/entrar`) e abra `http://localhost:8000/docs` no navegador para ver as rotas; a documentação exige credencial e o cookie de sessão só vale em `localhost` (não em `127.0.0.1`). Sem entrar, `/docs` responde 401. A rota `http://127.0.0.1:8000/health` responde `{"status": "ok", "banco": "ok"}` quando a API e o banco estão funcionando (ou HTTP 503 se o banco estiver indisponível).

### Rodando em contêiner

Se preferir não instalar o Python nem o uv, dá para rodar o backend em contêiner com o Docker Compose (o `compose.yaml` fica na raiz do repositório). Você só precisa do Docker com o plugin Compose; no Windows com WSL, ative a integração do Docker Desktop com a sua distro.

1. Na raiz do repositório, construa a imagem e suba a API (com `-d` ela roda em segundo plano):

   ```
   docker compose up --build -d
   ```

   O contêiner aplica as migrations sozinho antes de subir o servidor. Na primeira vez a construção baixa as imagens-base e as dependências.

2. Confira `http://localhost:8000/health` (a documentação em `http://localhost:8000/docs` exige entrar antes). O comando `docker compose ps` deve mostrar o serviço `api` como `healthy` depois de alguns segundos.

3. Para parar sem perder nada, use `docker compose down`. O banco SQLite fica no volume `dados` (dentro do contêiner, em `/dados/gastobs.db`), então os dados sobrevivem a `down` e a novas construções. **`docker compose down -v` apaga o volume e, com ele, todos os dados.**

Detalhes do que a imagem faz e das escolhas de segurança:

- **A porta só é publicada em `127.0.0.1`** (`127.0.0.1:8000:8000`), porque a API não tem HTTPS. Não troque por `8000:8000`.
- A imagem usa duas etapas (a final leva só as dependências de produção, sem testes nem ferramentas de desenvolvimento), roda com um usuário sem privilégios, com o sistema de arquivos somente leitura (exceto o volume `/dados`) e sem capacidades extras do Linux. As imagens-base estão fixadas por digest no `backend/Dockerfile`; para atualizá-las, troque os digests.
- As variáveis `GASTOBA_*` vêm do `compose.yaml` (várias podem ser definidas no seu ambiente antes do comando). O `.env` e arquivos `*.db` nunca entram na imagem.
- Hoje o contêiner só tem o backend; o frontend roda fora do Compose (veja a seção "Frontend").

### Ambiente de teste populado

Para ver o app inteiro com dados **fictícios** (no formato da Pluggy, lidos pelo adaptador real por HTTP simulado), sem tocar nenhum banco real: `docker compose -f compose.teste.yaml up --build -d` e abra `http://localhost:8180` (`teste@exemplo.com` / `senha-de-teste-123`, fictícia). A revisão de consistência é `docker compose -f compose.teste.yaml run --rm api-teste python -m dados_de_teste revisar`, e a conferência de todas as telas de 320 a 1920 px, `npm run e2e:teste` em `frontend/`. Guia completo em `Docs/AMBIENTE_DE_TESTE.md`.

### Usando a API

A referência completa (autenticação, formato de erro, regras de negócio e todas as rotas com seus campos) está em [`Docs/API.md`](Docs/API.md); o contrato vivo fica em `/docs` e `/openapi.json` (só para quem entrou).

Com as migrations aplicadas (`uv run alembic upgrade head`) e a API no ar, o fluxo abaixo, rodado em outro terminal, mostra as rotas principais. Valores em dinheiro sempre vão e voltam como texto (`"25.90"`), nunca como número.

Entre com o e-mail e a senha criados no passo 5 e guarde o `token` da resposta (ele vale por 12 horas). Os comandos seguintes o enviam em `Authorization: Bearer`; sem ele, as rotas respondem 401. Para scripts, uma chave de API (`POST /chaves-de-api`, só por sessão) faz o mesmo papel, com escopo `leitura` ou `escrita`:

```
curl -s -X POST http://127.0.0.1:8000/auth/entrar -H 'content-type: application/json' \
  -d '{"email": "voce@exemplo.com", "senha": "sua-senha"}'
export TOKEN=<token-recebido>
```

Crie uma conta com saldo inicial. A resposta traz o `id` da conta, usado nos próximos passos:

```
curl -s -X POST http://127.0.0.1:8000/contas -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"nome": "Nubank", "saldo_inicial": "1000.00"}'
```

Registre um gasto nessa conta, trocando `<id-da-conta>` pelo `id` recebido. A `categoria` é obrigatória e vem de um conjunto fixo (`lazer`, `conhecimento`, `conforto` ou `gasto_fixo`; `investimentos` é legado somente para leitura/revisão); as `tags` são livres, opcionais e normalizadas em minúsculas (`"Mercado"` vira `"mercado"`):

```
curl -s -X POST http://127.0.0.1:8000/gastos -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"conta_id": "<id-da-conta>", "valor": "25.90", "descricao": "Mercado", "data": "2026-10-10", "categoria": "conforto", "tags": ["pix", "Mercado"]}'
```

Veja o saldo atualizado (o gasto foi debitado, então o saldo passa a `"974.10"`):

```
curl -s http://127.0.0.1:8000/contas -H "Authorization: Bearer $TOKEN"
```

Liste os gastos de um período (`inicio` e `fim` são obrigatórios e inclusivos), filtrando também por tag ou por categoria, se quiser. O filtro `conta_id` também está disponível:

```
curl -s "http://127.0.0.1:8000/gastos?inicio=2026-10-01&fim=2026-10-31" -H "Authorization: Bearer $TOKEN"
curl -s "http://127.0.0.1:8000/gastos?inicio=2026-10-01&fim=2026-10-31&tag=mercado" -H "Authorization: Bearer $TOKEN"
curl -s "http://127.0.0.1:8000/gastos?inicio=2026-10-01&fim=2026-10-31&categoria=conforto" -H "Authorization: Bearer $TOKEN"
```

Liste as tags já usadas e as categorias disponíveis:

```
curl -s http://127.0.0.1:8000/tags -H "Authorization: Bearer $TOKEN"         # ["mercado","pix"]
curl -s http://127.0.0.1:8000/categorias -H "Authorization: Bearer $TOKEN"   # [{"codigo":"investimentos","nome":"Investimentos (antiga)","legada":true}, ...]
```

O restante da API segue o mesmo padrão (a lista completa, com os erros, está em `Docs/CLAUDE.md` e em `/docs`):

- **Ganhos**: `POST /ganhos` (credita a conta), `GET /ganhos?inicio=...&fim=...` e `DELETE /ganhos/{id}` (apaga e devolve o saldo; o ganho gerado por uma recorrência não pode ser apagado). O ganho não tem categoria. A renda do mês é a soma dos ganhos do mês.
- **Recorrências**: `POST /recorrencias` cria um ganho ou um gasto mensal no `dia_do_mes`; o servidor gera o lançamento de cada mês sozinho (ao subir e a cada hora) e recupera os meses perdidos. `GET /recorrencias`, `PUT /recorrencias/{id}` (vale dos próximos meses em diante) e `DELETE /recorrencias/{id}` (encerra).
- **Aparência**: `GET /aparencia/opcoes`, `PUT /aparencia` (`{"matiz": 150, "intensidade": "media", "textura": "grade", "nome": "Meu app", "marca": "cofre"}`) e `DELETE /aparencia` guardam, por pessoa, a cor dominante, a textura, o nome e a logo do app; no Perfil há a seção Aparência com prévia imediata.
- **Renda-base e metas**: `GET`/`PUT`/`DELETE /renda-base` consultam, definem (`{"valor": "5000.00"}`) ou removem a previsão mensal. `PUT /metas/{categoria}` com `{"percentual": 30}` define a porcentagem da referência (sempre a base quando configurada, ou a renda registrada sem base; soma até 100%). A base não registra ganhos nem altera saldos ou projeção financeira. `GET /metas/progresso?mes=2026-10` devolve o limite em reais, o gasto e a situação (`dentro`, `alerta`, `estourou` ou `sem_renda`).
- **Resumo por tag**: `GET /resumos/tags?inicio=...&fim=...` divide o valor de cada gasto em partes iguais entre as suas tags (o gasto sem tag vira `"tag": null`).
- **Importação bancária** (só a pessoa dona, pelo plano gratuito do Meu Pluggy): `POST /sincronizacoes` busca as contas e transações novas; `GET /transacoes-importadas` é a caixa de entrada; `POST /transacoes-importadas/{id}/aceitar` (saída pede `categoria`) cria o gasto ou o ganho, e `.../ignorar` descarta. Como ligar: veja "Importação bancária pela Pluggy" abaixo.
- **Movimentos de investimento**: `GET /movimentos-de-investimento?inicio=...&fim=...` lista aportes/resgates; o POST `/{id}/desfazer-classificacao`, só com sessão e caixa disponível, devolve a transação à caixa sem alterar saldo. Divisão exige confirmar a remoção de todas as partes; origem ambígua é bloqueada.
- **Reaplicação de resgates**: em Aportes e resgates, confirme qual resgate de outro investimento financiou um aporte. Somente a parcela confirmada deixa de consumir a meta Liberdade financeira, no mês do aporte. Um resgate de R$ 100 reaplicado num aporte de R$ 150 deixa R$ 50 na meta. Sem confirmação, o aporte continua inteiro; desfazer o vínculo restaura o progresso, preservando os movimentos e saldos. Coberturas de compras e reaplicação compartilham o valor disponível do resgate. Ver contrato em [Docs/API.md](Docs/API.md) e plano [057](specs/057-reaplicacao-de-resgates/plan.md).
- **Disponível do mês**: “Pode gastar” usa ganhos menos gastos líquidos menos aportes com dinheiro do mês, pela mesma classificação da meta. Saldo inicial, caixinhas e parcelas confirmadas como reaplicação não são descontados como dinheiro novo. O card abre a composição; gastos classificados de cartão permanecem incluídos.
- **Conferência e avisos de investimentos**: “Conta investimentos” mostra saldo/data do extrato e oferece a conferência mensal. Em Aportes e resgates, a pessoa pode confirmar explicitamente que uma entrada é vencimento; o sino distingue vencimentos e resgates sem destinação e abre o mês correspondente. A marca não muda valores ou regras de resgate. Realocações só são consultadas ao expandir seu histórico. Plano [058](specs/058-auditoria-inicio-e-investimentos/plan.md).

- **Chaves de API**: `POST/GET /chaves-de-api` e `DELETE /chaves-de-api/{id}` (só por sessão). O segredo da chave aparece uma única vez.

Erros seguem sempre o formato `{"erro": {"codigo": "...", "mensagem": "..."}}`. Por exemplo, enviar o valor como número (`"valor": 25.9`) devolve 422 com o código `requisicao_invalida`, e registrar um gasto numa conta inexistente devolve 404 com `conta_nao_encontrada`.

### Importação bancária pela Pluggy (opcional)

Importa as transações do **seu** banco, de graça, pelo [Meu Pluggy](https://meu.pluggy.ai) (uso pessoal: até 5 conexões do mesmo titular, só para você; contas de outras pessoas ou uso comercial exigem plano pago). O banco é autorizado no Meu Pluggy: o Gastoba nunca vê credencial bancária.

1. Conecte seus bancos em `meu.pluggy.ai`.
2. No [Dashboard da Pluggy](https://dashboard.pluggy.ai), entre com a **mesma conta**, abra uma aplicação, clique em **Conectar Conta** e escolha o conector **MeuPluggy** (não o banco). Copie o `itemId` de cada item e o Client ID e o Client Secret da aplicação.
3. No `backend/.env`, preencha `GASTOBA_PLUGGY_CLIENT_ID`, `GASTOBA_PLUGGY_CLIENT_SECRET`, `GASTOBA_PLUGGY_ITEM_IDS` (lista JSON) e `GASTOBA_PLUGGY_EMAIL_DO_DONO` (seu e-mail do Gastoba); veja o `.env.example`. Reinicie a API.
4. Na SPA, a **Caixa de entrada** (na aba **Transações**) aparece só para você. "Sincronizar agora" busca o que o Meu Pluggy já atualizou (ele atualiza a cada 24 horas; a API também busca sozinha a cada poucas horas). Cada transação espera a sua decisão: escolha a categoria e aceite, ou ignore. Transferências entre as suas contas no mesmo banco e o pagamento da fatura do cartão já chegam ignorados. O saldo das contas do banco é o do próprio banco.

Detalhes e decisões: `specs/018-importacao-pluggy-meupluggy/plan.md`.

### Testes e lint

De dentro de `backend/`:

```
uv run pytest                  # testes de unidade, integração e arquitetura
uv run ruff check .            # lint
uv run ruff format --check .   # confere a formatação (sem --check, formata os arquivos)
```

### Estrutura em camadas

O código fica em `backend/src/gastoba/`, organizado em camadas de Domain-Driven Design, com a dependência sempre apontando para dentro:

- `domain/`: regras de negócio puras (o value object `Dinheiro`, as entidades `Conta`, `Gasto`, `Ganho`, `Recorrencia`, `Meta` e `Usuario`, as tags, a categoria fixa do gasto, o resumo por tags, exceções e as portas, que são interfaces `Protocol`). Só usa a biblioteca padrão.
- `application/`: casos de uso, um por classe com o método `executar` (ex.: `CriarConta`, `RegistrarGasto`, `ProcessarRecorrencias`, `ConsultarProgressoDasMetas`), que dependem só das portas do `domain`.
- `infrastructure/`: implementações das portas (repositórios e unidade de trabalho com SQLAlchemy e SQLite), configurações e a integração com a Pluggy (`pluggy/provedor_pluggy.py`).
- `api/`: camada de entrada HTTP (FastAPI), com as rotas, os esquemas de entrada e saída e o tratamento de erros. É o único ponto que monta as implementações concretas e as entrega aos casos de uso.

Um teste de arquitetura (`backend/tests/architecture/`) garante essas regras automaticamente. Os detalhes e convenções estão em `Docs/CLAUDE.md`, e os princípios inegociáveis em `Docs/CONSTITUICAO.md`.

## Frontend

### Pré-requisitos

Node.js **24.21.0** (fixado em `frontend/.nvmrc`; com nvm, `nvm install && nvm use` dentro de `frontend/`), que traz o npm junto.

### Como rodar o frontend

De dentro de `frontend/`:

```
npm ci        # instala exatamente o que está no package-lock.json
npm run dev   # sobe o Vite em http://localhost:5173
```

Por padrão o `npm run dev` usa uma **API simulada em memória** (`VITE_USAR_SIMULACAO=true` em `frontend/.env.development`), então funciona sem o backend e os dados somem ao recarregar.

Para falar com a **API real**, suba o backend (seção "Backend") e crie `frontend/.env.development.local` (ignorado pelo git) com:

```
VITE_USAR_SIMULACAO=false
```

Reinicie o `npm run dev` e abra `http://localhost:5173` **por `localhost`, não por `127.0.0.1`**: a API só aceita a origem `http://localhost:5173` (CORS). As variáveis estão documentadas em `frontend/.env.example`.

### Testes e verificação de tipos

De dentro de `frontend/`:

```
npm test          # testes (Vitest)
npm run tipos     # tipos da aplicação e dos E2E; faz o papel de lint
npm run build     # tipos + build de produção (em frontend/dist/, sem a API simulada)
```

Os E2E usam o Playwright fixado pelo lockfile e a versão do Chromium oficial definida por ele. Com Node 24.21.0 e a porta 5173 livre:

```
npm run e2e:navegador  # uma vez: baixa Chromium, headless shell e FFmpeg no cache fora do repo
npm run e2e           # inicia seu próprio servidor local com simulação forçada
```

O download do navegador é separado da instalação npm, que continua com scripts desativados. Se faltarem bibliotecas do sistema, o teste falha: confira as dependências do Chromium com a pessoa responsável pelo ambiente; esses comandos não instalam pacotes de SO. Os testes usam somente dados e credenciais fictícios da simulação, sem backend real nem Pluggy. Cobrem renda-base, ações de meta (contraste e foco), aporte/resgate, desfazer e divisão inteira, atalho de Investimentos e layout das cinco vistas em 1280×800 e 320×640. Capturas de página inteira ficam em `frontend/test-results/`, com traces e screenshots de falhas; sem comparação por pixel (animações desativadas só durante a captura estática). **Não cobrem leitor de tela humano**, Pluggy real, os demais navegadores nem a revisão completa de todas as telas. O E2E é local e ainda não faz parte da CI.

A política npm continua em `frontend/.npmrc`: 60 dias de idade, versões exatas e scripts de instalação desativados. Exceção pontual autorizada em 2026-10-29 apenas para `vite@8.2.4`, correção da alta adicional; suas transitivas alteradas atendem aos 60 dias. Permanecem quatro achados aceitos de desenvolvimento/teste (duas altas: source-map-js/undici; duas moderadas: vitest/@vitest/mocker), fora dessa remediação.

As convenções do frontend (pastas e camadas, dinheiro sem `float`, regras dos pacotes npm) estão em `Docs/CLAUDE.md`.

### O que há nas telas

Depois de entrar com e-mail e senha (ou de criar a conta, se o cadastro estiver aberto; na API simulada use `voce@exemplo.com` e `senha-de-exemplo-123`):

A navegação usa barra lateral no computador e abas embaixo no celular; "Mais" abre as outras cinco telas. Cada tela tem endereço próprio (`/inicio`, `/transacoes`, `/orcamento`, `/contas`, `/investimentos`, `/faturas`, `/tags`, `/recorrencias`, `/perfil`), o mês vai em `?mes=AAAA-MM` e o voltar do navegador funciona, sem biblioteca de roteador. Início, Transações, Orçamento e Tags têm seletor de mês; "Novo gasto" e a tecla `N` valem em todas as telas.

- **Início**: quanto ainda pode gastar no mês, dinheiro nas contas correntes, "Metas do mês" em linhas compactas (cada uma com barra, valor e situação em texto), gráfico do ritmo dos gastos, últimos cinco gastos e aviso da meta perto ou acima do limite.
- **Transações**: linha do tempo de gastos e ganhos em duas linhas por item, com selos de categoria e tags, menu "Mais ações" por linha, chips de conta/categoria/tag, busca, totais filtrados e "Mostrar mais". "Novo gasto" (ou `N`, em qualquer tela) abre o compositor Gasto/Ganho. Ganhos avulsos podem ser excluídos pelo menu, com confirmação. Para quem usa a importação, a **Caixa de entrada** mostra a fila das transações do banco: aceitar saída exige categoria; ignorar descarta; selos indicam possível duplicado ou sugestão de ignorar. A seção **Aportes e resgates** lista os movimentos do mês, filtra por conta, tipo e investimento, permite associar e desfazer (menu e confirmação). Ela também aparece sem importação para quem tem investimentos/movimentos; desfazer classificação exige a caixa disponível.
- **Orçamento**: metas por categoria em lista (leitura por padrão; "Editar metas" abre o modo de edição), painel com os lançamentos de cada meta, renda, gasto e projeção linear pelo ritmo até hoje (a partir do dia 3) e divisão da renda. Soma acima de 100% impede salvar. Renda-base mensal opcional define os limites (inclusive em meses passados), enquanto renda do mês e projeção continuam com os ganhos reais. Remover meta ou renda-base pede confirmação.
- **Contas**: cartões de carteira com rótulo ("Saldo", "Fatura aberta" ou "Fatura fechada", com o selo "Vencida" quando a fatura venceu sem pagar), selos de tipo e conexão bancária, dinheiro total só das correntes, menu "Mais ações" por conta e formulário de nova conta.
- **Investimentos**: posições, destinações, realocações, pizza (legenda em botões, que tiram a parte do gráfico) e evolução; o link "Ver aportes e resgates em Transações", no cabeçalho, abre a gestão na seção correspondente.
- **Faturas**: por cartão, a fatura mais recente em destaque (total, vencimento, pago, restante, situação em texto e compras, com parcela e estorno) e as anteriores recolhidas sob "Faturas anteriores". Somente leitura e só com a importação bancária; sem ela, um estado vazio com "Ver contas". Quando a fatura é calculada pelas compras (e não lida do banco), a tela avisa que as datas são estimadas. Nada daqui entra em saldo, "Pode gastar" nem metas. As faturas só passam a ser preenchidas pela sincronização depois da medição com o Meu Pluggy real (`uv run python -m gastoba.administracao medir-faturas`; ver `specs/050-faturas-do-cartao/`).
- **Tags**: barras horizontais com dicas, seleção de tag e painel dos gastos; Outras expande as tags agrupadas. Há tabela equivalente e suporte a teclado e movimento reduzido.
- **Recorrências**: total comprometido por mês, próximos lançamentos em 30 dias e a lista de recorrências; "Nova recorrência" abre o formulário, alterar é na própria linha e encerrar é pelo menu, com confirmação.
- **Perfil**: cartão da pessoa e Sair; criação, lista e revogação de chaves de API, com identificação de expiradas e segredo exibido uma única vez.

## Como verificar e limitações

Os comandos que a CI (`.github/workflows/ci.yml`) roda são os mesmos das seções de testes acima. Para poupar a cota de minutos do GitHub Actions, mudança só de documentação (`specs/`, `Docs/`, `plans/`, `*.md`) não dispara a CI, e cada job só roda quando a sua pasta muda (`backend/`, `frontend/`, `infra/`; mudar a própria CI roda todos):

```
cd backend && uv sync --frozen && uv run pytest && uv run ruff check . && uv run ruff format --check .
cd frontend && npm ci && npm run tipos && npm test && npm run build
```

Há também jobs de Terraform (`terraform fmt -check`, `terraform validate`) em `infra/proxmox`. O `pytest` do backend tem testes de unidade, integração (SQLite temporário) e arquitetura; a Pluggy é testada sem chamar o serviço real. A retomada da entrega 054/055 aprovou as suítes backend e frontend, tipos, lint/formatação do backend e build. O E2E simulado está bloqueado neste ambiente pela biblioteca `libnspr4.so` ausente; não foi considerado aprovado. Os exemplos `curl` acima não foram reexecutados nesta frente; os contratos são exercitados pelos testes de integração com SQLite temporário.

Limitações:

- Sem HTTPS próprio: use só em `localhost` ou rede confiável (veja "Aviso de segurança").
- A tela **Faturas** já existe, mas a sincronização que guarda as faturas ainda depende de uma medição com o Meu Pluggy real (a unidade dos valores de `/bills` não é documentada); até lá a tela mostra o estado vazio.
- O servidor MCP e o agente de Telegram são uma ideia futura (`specs/019-mcp-e-agente-telegram/plan.md`), não existem.
- A importação bancária é só para a pessoa dona, pelo plano gratuito do Meu Pluggy (até 5 conexões). Está implementada, mas só foi testada com fakes e transporte HTTP simulado, nunca com o Meu Pluggy real; os Termos de Uso da Pluggy não foram lidos na íntegra.
- A revisão humana completa das dez telas, gráficos, movimento reduzido e leitor de tela continua pendente. Os E2E locais conferem os fluxos e as cinco vistas descritos acima, sem substituir essa revisão.
- Não há captura de tela da interface no repositório.

A frente [060 — remodelar investimentos](specs/060-remodelar-investimentos/plan.md) acrescenta
operações manuais, edição da abertura, pendências de histórico e sincronização, casamentos
confirmados e alocação em caixinhas. A revisão de aportes sem investimento abre sob demanda;
mesclas e exclusões são lógicas e só alteram totais após aprovação do relatório pelo dono.
A implementação convive com o legado: migração/backfill e retirada do legado em produção
continuam sujeitos às aprovações do plano. A prévia com `npm run dev` usa dados fictícios;
não aplica essas alterações ao banco real.
