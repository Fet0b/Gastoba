# API do Gastoba

Referência da API HTTP/JSON do backend. A fonte da verdade é o contrato OpenAPI que o próprio servidor publica: `GET /openapi.json` (e a página interativa em `GET /docs`). Este documento explica as regras gerais e lista as rotas; se algo divergir, vale o contrato publicado.

- **URL base** (desenvolvimento): `http://localhost:8000`. A API não tem HTTPS próprio e não deve ser exposta à internet (veja o aviso de segurança no `README.md`).
- **Formato**: JSON em UTF-8. Os nomes de campos e os códigos de erro são em português.
- **Rotas síncronas e sem paginação**: as listagens devolvem tudo o que casa com os filtros.

## Convenções

- **Dinheiro** sempre vai e volta como **texto decimal** com duas casas (`"25.90"`), nunca como número JSON; um número no lugar do texto devolve 422 `requisicao_invalida`. O limite é R$ 1 trilhão, e valores com fração de centavo são recusados (`valor_invalido`).
- **Datas** são `AAAA-MM-DD`; o **mês** das metas é `AAAA-MM`. O servidor não calcula "hoje" nas consultas (o cliente informa o período), exceto na geração das recorrências, que usa o dia de Brasília (`America/Sao_Paulo`).
- **Identificadores** são UUIDs.
- **Isolamento**: cada pessoa só enxerga os próprios dados. Um recurso de outra pessoa responde **404**, nunca 403.
- **Categorias** são um conjunto fixo: `investimentos`, `lazer`, `conhecimento`, `conforto` e `gasto_fixo` (`GET /categorias`). **Tags** são texto livre, normalizadas (espaços das pontas removidos, espaços internos colapsados e minúsculas), com 1 a 30 caracteres e no máximo 10 por gasto.

## Autenticação

Toda rota exige credencial, exceto `GET /health`, `POST /auth/cadastro` e `POST /auth/entrar`. A credencial é um token, de dois tipos:

| Tipo | Como obter | Como enviar | Vale |
|---|---|---|---|
| **Sessão** (`gsess_...`) | `POST /auth/entrar` | cookie `gastoba_sessao` (definido na resposta) ou `Authorization: Bearer <token>` | `GASTOBA_DURACAO_DA_SESSAO_HORAS` (padrão 12 h), sem renovação |
| **Chave de API** (`gapi_<prefixo>_...`) | `POST /chaves-de-api` (só com sessão) | só `Authorization: Bearer <chave>` | até revogar ou expirar |

- A chave tem escopo `leitura` (só `GET`, `HEAD` e `OPTIONS`) ou `escrita` (também `POST`, `PUT` e `DELETE`). A sessão tem tudo. O segredo da chave aparece **uma única vez**, na criação. As rotas de `/chaves-de-api` só aceitam sessão; com uma chave, respondem 403 `acesso_negado`.
- **Proteção contra CSRF**: uma requisição autenticada por **cookie** que escreve (`POST`, `PUT`, `DELETE`) precisa do cabeçalho `X-Gastoba-Requisicao: 1`; sem ele, 403 `requisicao_invalida_origem`. Com `Authorization: Bearer` o cabeçalho não é exigido.
- Token ausente, malformado, expirado ou revogado: 401 `nao_autenticado`, com `WWW-Authenticate: Bearer`.
- **Limite de tentativas de login**: depois de `GASTOBA_TENTATIVAS_DE_LOGIN` falhas (padrão 5) em 15 minutos, por e-mail e por IP, responde 429 `muitas_tentativas` com `Retry-After`.
- **Cadastro fechado por padrão**: `POST /auth/cadastro` responde 403 `cadastro_fechado` até `GASTOBA_CADASTRO_ABERTO=true`. O primeiro usuário vem do comando administrativo `python -m gastoba.administracao criar-usuario`.
- **CORS**: só as origens de `GASTOBA_ORIGENS_PERMITIDAS` (com credenciais); métodos `GET`, `POST`, `PUT` e `DELETE`.

Exemplo, com uma sessão obtida por `POST /auth/entrar`:

```
curl -s -X POST http://localhost:8000/auth/entrar -H 'content-type: application/json' \
  -d '{"email": "voce@exemplo.com", "senha": "sua-senha"}'
# {"token": "gsess_...", "expira_em": "2026-10-14T00:00:00Z"}

curl -s http://localhost:8000/contas -H "Authorization: Bearer $TOKEN"
```

## Formato de erro

Toda resposta de erro das rotas de negócio segue o mesmo formato (a rota `/health` mantém o próprio):

```json
{"erro": {"codigo": "conta_nao_encontrada", "mensagem": "Conta não encontrada."}}
```

Erros de validação da requisição trazem também `detalhes`, sem ecoar o valor enviado:

```json
{"erro": {"codigo": "requisicao_invalida", "mensagem": "...", "detalhes": [{"campo": "body.valor", "mensagem": "..."}]}}
```

| Situação | Status | `codigo` |
|---|---|---|
| Sem credencial, ou token inválido, expirado ou revogado | 401 | `nao_autenticado` |
| E-mail inexistente ou senha errada no login (mesma resposta) | 401 | `credenciais_invalidas` |
| Chave sem o escopo do método, ou gerindo chaves com chave | 403 | `acesso_negado` |
| Cadastro com o cadastro fechado | 403 | `cadastro_fechado` |
| Escrita por cookie sem `X-Gastoba-Requisicao: 1` | 403 | `requisicao_invalida_origem` |
| Conta inexistente (ou de outra pessoa) | 404 | `conta_nao_encontrada` |
| Ganho inexistente (ou de outra pessoa) | 404 | `ganho_nao_encontrado` |
| Excluir ganho gerado por uma recorrência | 409 | `ganho_de_recorrencia` |
| Importação desligada, ou pessoa que não é a dona | 404 | `importacao_desligada` |
| Transação importada inexistente (ou de outra pessoa) | 404 | `transacao_importada_nao_encontrada` |
| Aceitar ou ignorar transação já tratada | 409 | `transacao_ja_tratada` |
| Já há uma sincronização rodando | 409 | `sincronizacao_em_andamento` |
| Aceitar saída sem categoria, ou entrada com categoria | 422 | `transacao_importada_invalida` |
| Recorrência inexistente (ou de outra pessoa) | 404 | `recorrencia_nao_encontrada` |
| Meta inexistente | 404 | `meta_nao_encontrada` |
| Chave de API inexistente, revogada ou de outra pessoa | 404 | `chave_de_api_nao_encontrada` |
| Nome de conta repetido | 409 | `conta_ja_existe` |
| E-mail já cadastrado | 409 | `email_ja_cadastrado` |
| `inicio` depois de `fim` | 422 | `periodo_invalido` |
| Valor inválido (zero, negativo, vírgula, acima do limite) | 422 | `valor_invalido` |
| Descrição vazia ou longa demais (acima de 200) | 422 | `descricao_invalida` |
| Nome vazio ou longo demais | 422 | `nome_invalido` |
| Tag inválida ou tags demais | 422 | `tag_invalida` |
| E-mail inválido | 422 | `email_invalido` |
| Senha fora de 10 a 128 caracteres | 422 | `senha_invalida` |
| Nome da chave inválido | 422 | `nome_de_chave_invalido` |
| Expiração da chave que não fica depois da criação | 422 | `expiracao_invalida` |
| Recorrência fora das regras (dia, categoria, fim, início antigo demais, mais de 50 ativas) | 422 | `recorrencia_invalida` |
| Percentual de meta fora de 1 a 100 | 422 | `percentual_invalido` |
| Soma das metas acima de 100% | 422 | `percentuais_excedem_100` |
| `mes` fora de `AAAA-MM` | 422 | `mes_invalido` |
| Outra regra de domínio | 422 | `erro_de_dominio` |
| Campo ausente ou de tipo errado | 422 | `requisicao_invalida` |
| Tentativas de login demais | 429 | `muitas_tentativas` |
| Erro inesperado (sem stack trace) | 500 | `erro_interno` |
| Banco indisponível (só em `/health`) | 503 | — |

## Conceitos de negócio

- **Conta**: nome (1 a 100 caracteres, único por pessoa), saldo, origem (`manual` ou `open_finance`) e tipo (`corrente` ou `cartao`; a criada à mão é `corrente`). O saldo inicial pode ser zero ou negativo.
- **Gasto**: valor positivo, descrição, data, **categoria obrigatória** e tags. Debita o saldo da conta na mesma transação. Não há edição nem remoção.
- **Ganho**: entrada de dinheiro (salário, reembolso): valor positivo, descrição, data e tags, **sem categoria**. Credita o saldo. Pode ser excluído (o saldo da conta é debitado do mesmo valor), exceto o gerado por uma recorrência, que a geração recriaria. Não há edição.
- **Recorrência**: modelo **mensal** que gera um ganho ou um gasto por mês, no `dia_do_mes` (1 a 31; em mês mais curto vale o último dia). O servidor cria os lançamentos sozinho (ao subir e a cada hora), de forma idempotente, e recupera os meses perdidos; criar já gera os meses vencidos desde o início (no máximo 5 anos atrás). Os lançamentos gerados trazem `recorrencia_id`. Alterar vale dos próximos meses em diante; encerrar (`DELETE`) só marca `ativa = false`. No máximo 50 recorrências ativas por pessoa.
- **Meta**: a porcentagem inteira (1 a 100) da **renda do mês** (soma dos ganhos do mês, em todas as contas) que uma categoria pode usar. A soma das metas nunca passa de 100%. Limite = `renda * percentual // 100`. Situação: `dentro` (gasto abaixo de 80% do limite), `alerta` (de 80% ao limite, inclusive), `estourou` (acima do limite) e `sem_renda` (renda zero no mês).
- **Importação bancária** (só a pessoa dona, `GASTOBA_PLUGGY_EMAIL_DO_DONO`; para as outras as rotas dão 404 `importacao_desligada`): as contas e transações vêm da Pluggy (conector MeuPluggy). A conta importada tem origem `open_finance` e **o saldo é o do banco** (no cartão, o negativo do valor devido): aceitar uma transação, lançar à mão ou excluir um ganho nela não o altera. A transação chega **pendente** à caixa de entrada e só vira gasto (saída, com categoria) ou ganho (entrada) quando aceita; transferência entre as próprias contas (`TRANSFERENCIA_MESMA_INSTITUICAO`) e pagamento de fatura (`PAGAMENTO_FATURA`) entram **já ignoradas** (aparecem só em `?estado=ignorada` e não contam em `transacoes_novas`); `sugerir_descarte` marca o estorno (e as duas anteriores), e `possivel_duplicado` marca a que já tem um lançamento manual igual (mesma conta, dia e valor). `GET /auth/eu` traz `importacao_bancaria`.
- **Resumo por tag**: o valor de cada gasto se divide em partes iguais entre as suas tags, em centavos; o resto vai de 1 em 1 centavo às primeiras tags, então a soma das fatias é sempre o total. Gasto sem tag vira a fatia `"tag": null`.

## Rotas

Os tipos abaixo vêm do contrato OpenAPI. "Obrigatório: não" significa que o campo tem valor padrão ou pode ser omitido. Em todas as rotas, `401` (sem credencial) e `403` (escopo da chave) são possíveis; os "Erros possíveis" listam os códigos de status declarados na rota (veja a tabela de erros acima para o significado).

### Saúde

#### `GET /health`

Resposta **200**: `RespostaDeSaude`

**`RespostaDeSaude`**

| Campo | Tipo | Obrigatório |
|---|---|---|
| `status` | `ok` \| `indisponivel` | sim |
| `banco` | `ok` \| `indisponivel` | sim |

### Autenticação

#### `POST /auth/cadastro`

Corpo: `CadastroRequisicao`

**`CadastroRequisicao`**

| Campo | Tipo | Obrigatório |
|---|---|---|
| `nome` | texto | sim |
| `email` | texto | sim |
| `senha` | texto | sim |

Resposta **201**: `UsuarioResposta`

**`UsuarioResposta`**

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | texto (uuid) | sim |
| `email` | texto ou nulo | sim |
| `nome` | texto | sim |

Erros possíveis: `403`, `409`, `422`.

#### `POST /auth/entrar`

Corpo: `EntrarRequisicao`

**`EntrarRequisicao`**

| Campo | Tipo | Obrigatório |
|---|---|---|
| `email` | texto | sim |
| `senha` | texto | sim |

Resposta **200**: `SessaoResposta`

**`SessaoResposta`**

| Campo | Tipo | Obrigatório |
|---|---|---|
| `token` | texto | sim |
| `expira_em` | texto (date-time) | sim |

Erros possíveis: `401`, `429`, `422`.

#### `POST /auth/sair`

Resposta **204** (sem corpo).

Erros possíveis: `401`, `403`.

#### `GET /auth/eu`

Resposta **200**: `PerfilResposta`

**`PerfilResposta`**

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | texto (uuid) | sim |
| `email` | texto ou nulo | sim |
| `nome` | texto | sim |
| `importacao_bancaria` | booleano | não |

Erros possíveis: `401`, `403`.

### Chaves de API

#### `GET /chaves-de-api`

Resposta **200**: `lista de ChaveDeApiResposta`

**`ChaveDeApiResposta`**

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | texto (uuid) | sim |
| `nome` | texto | sim |
| `prefixo` | texto | sim |
| `escopo` | EscopoDaChave | sim |
| `criada_em` | texto (date-time) | sim |
| `ultimo_uso` | texto (date-time) ou nulo | sim |
| `expira_em` | texto (date-time) ou nulo | sim |

Erros possíveis: `401`, `403`.

#### `POST /chaves-de-api`

Corpo: `CriarChaveDeApiRequisicao`

**`CriarChaveDeApiRequisicao`**

| Campo | Tipo | Obrigatório |
|---|---|---|
| `nome` | texto | sim |
| `escopo` | EscopoDaChave | sim |
| `expira_em` | texto (date-time) ou nulo | não |

Resposta **201**: `ChaveDeApiCriadaResposta`

**`ChaveDeApiCriadaResposta`**

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | texto (uuid) | sim |
| `nome` | texto | sim |
| `prefixo` | texto | sim |
| `escopo` | EscopoDaChave | sim |
| `criada_em` | texto (date-time) | sim |
| `ultimo_uso` | texto (date-time) ou nulo | sim |
| `expira_em` | texto (date-time) ou nulo | sim |
| `segredo` | texto | sim |

Erros possíveis: `401`, `403`, `422`.

#### `DELETE /chaves-de-api/{chave_id}`

| Parâmetro | Em | Tipo | Obrigatório |
|---|---|---|---|
| `chave_id` | caminho | texto (uuid) | sim |

Resposta **204** (sem corpo).

Erros possíveis: `401`, `403`, `404`, `422`.

### Contas

#### `GET /contas`

Resposta **200**: `lista de ContaResposta`

**`ContaResposta`**

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | texto (uuid) | sim |
| `nome` | texto | sim |
| `saldo` | texto | sim |
| `origem` | texto | sim |
| `tipo` | texto | sim |

`tipo` é `corrente` ou `cartao`. A conta criada à mão é sempre `corrente`; a importada segue o tipo da conta no banco (cartão de crédito vira `cartao`).

Erros possíveis: `401`, `403`.

#### `POST /contas`

Corpo: `CriarContaRequisicao`

**`CriarContaRequisicao`**

| Campo | Tipo | Obrigatório |
|---|---|---|
| `nome` | texto | sim |
| `saldo_inicial` | texto | não |

Resposta **201**: `ContaResposta`

Erros possíveis: `401`, `403`, `409`, `422`.

### Gastos

#### `POST /gastos`

Corpo: `RegistrarGastoRequisicao`

**`RegistrarGastoRequisicao`**

| Campo | Tipo | Obrigatório |
|---|---|---|
| `conta_id` | texto (uuid) | sim |
| `valor` | texto | sim |
| `descricao` | texto | sim |
| `data` | texto (date) | sim |
| `categoria` | CategoriaDoGasto | sim |
| `tags` | lista de texto | não |

Resposta **201**: `GastoResposta`

**`GastoResposta`**

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | texto (uuid) | sim |
| `conta_id` | texto (uuid) | sim |
| `valor` | texto | sim |
| `descricao` | texto | sim |
| `data` | texto (date) | sim |
| `categoria` | texto | sim |
| `tags` | lista de texto | sim |
| `origem` | texto | sim |
| `recorrencia_id` | texto (uuid) ou nulo | não |

Erros possíveis: `401`, `403`, `404`, `422`.

#### `GET /gastos`

| Parâmetro | Em | Tipo | Obrigatório |
|---|---|---|---|
| `inicio` | query | texto (date) | sim |
| `fim` | query | texto (date) | sim |
| `conta_id` | query | texto (uuid) ou nulo | não |
| `tag` | query | texto ou nulo | não |
| `categoria` | query | CategoriaDoGasto ou nulo | não |

Resposta **200**: `lista de GastoResposta`

Erros possíveis: `401`, `403`, `404`, `422`.

### Ganhos

#### `POST /ganhos`

Corpo: `RegistrarGanhoRequisicao`

**`RegistrarGanhoRequisicao`**

| Campo | Tipo | Obrigatório |
|---|---|---|
| `conta_id` | texto (uuid) | sim |
| `valor` | texto | sim |
| `descricao` | texto | sim |
| `data` | texto (date) | sim |
| `tags` | lista de texto | não |

Resposta **201**: `GanhoResposta`

**`GanhoResposta`**

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | texto (uuid) | sim |
| `conta_id` | texto (uuid) | sim |
| `valor` | texto | sim |
| `descricao` | texto | sim |
| `data` | texto (date) | sim |
| `tags` | lista de texto | sim |
| `origem` | texto | sim |
| `recorrencia_id` | texto (uuid) ou nulo | não |

Erros possíveis: `401`, `403`, `404`, `409`, `422`.

#### `GET /ganhos`

| Parâmetro | Em | Tipo | Obrigatório |
|---|---|---|---|
| `inicio` | query | texto (date) | sim |
| `fim` | query | texto (date) | sim |
| `conta_id` | query | texto (uuid) ou nulo | não |

Resposta **200**: `lista de GanhoResposta`

Erros possíveis: `401`, `403`, `404`, `409`, `422`.

#### `DELETE /ganhos/{ganho_id}`

| Parâmetro | Em | Tipo | Obrigatório |
|---|---|---|---|
| `ganho_id` | caminho | texto (uuid) | sim |

Resposta **204** (sem corpo).

Erros possíveis: `401`, `403`, `404`, `409`, `422`.

### Recorrências

#### `GET /recorrencias`

Resposta **200**: `lista de RecorrenciaResposta`

**`RecorrenciaResposta`**

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | texto (uuid) | sim |
| `tipo` | texto | sim |
| `conta_id` | texto (uuid) | sim |
| `valor` | texto | sim |
| `descricao` | texto | sim |
| `dia_do_mes` | inteiro | sim |
| `inicio` | texto (date) | sim |
| `fim` | texto (date) ou nulo | sim |
| `categoria` | texto ou nulo | sim |
| `tags` | lista de texto | sim |
| `ativa` | booleano | sim |

Erros possíveis: `401`, `403`, `404`, `422`.

#### `POST /recorrencias`

Corpo: `CriarRecorrenciaRequisicao`

**`CriarRecorrenciaRequisicao`**

| Campo | Tipo | Obrigatório |
|---|---|---|
| `tipo` | TipoDeRecorrencia | sim |
| `conta_id` | texto (uuid) | sim |
| `valor` | texto | sim |
| `descricao` | texto | sim |
| `dia_do_mes` | inteiro | sim |
| `inicio` | texto (date) | sim |
| `categoria` | CategoriaDoGasto ou nulo | não |
| `tags` | lista de texto | não |
| `fim` | texto (date) ou nulo | não |

Resposta **201**: `RecorrenciaResposta`

Erros possíveis: `401`, `403`, `404`, `422`.

#### `PUT /recorrencias/{recorrencia_id}`

| Parâmetro | Em | Tipo | Obrigatório |
|---|---|---|---|
| `recorrencia_id` | caminho | texto (uuid) | sim |

Corpo: `AlterarRecorrenciaRequisicao`

**`AlterarRecorrenciaRequisicao`**

| Campo | Tipo | Obrigatório |
|---|---|---|
| `valor` | texto | sim |
| `descricao` | texto | sim |
| `dia_do_mes` | inteiro | sim |
| `categoria` | CategoriaDoGasto ou nulo | não |
| `tags` | lista de texto | não |
| `fim` | texto (date) ou nulo | não |

Resposta **200**: `RecorrenciaResposta`

Erros possíveis: `401`, `403`, `404`, `422`.

#### `DELETE /recorrencias/{recorrencia_id}`

| Parâmetro | Em | Tipo | Obrigatório |
|---|---|---|---|
| `recorrencia_id` | caminho | texto (uuid) | sim |

Resposta **204** (sem corpo).

Erros possíveis: `401`, `403`, `404`, `422`.

### Metas

#### `GET /metas`

Resposta **200**: `lista de MetaResposta`

**`MetaResposta`**

| Campo | Tipo | Obrigatório |
|---|---|---|
| `categoria` | texto | sim |
| `percentual` | inteiro | sim |

Erros possíveis: `401`, `403`, `404`, `422`.

#### `GET /metas/progresso`

| Parâmetro | Em | Tipo | Obrigatório |
|---|---|---|---|
| `mes` | query | texto | sim |

Resposta **200**: `ResumoDasMetasResposta`

**`ResumoDasMetasResposta`**

| Campo | Tipo | Obrigatório |
|---|---|---|
| `mes` | texto | sim |
| `renda` | texto | sim |
| `metas` | lista de ProgressoDaMetaResposta | sim |

Erros possíveis: `401`, `403`, `404`, `422`.

#### `PUT /metas/{categoria}`

| Parâmetro | Em | Tipo | Obrigatório |
|---|---|---|---|
| `categoria` | caminho | CategoriaDoGasto | sim |

Corpo: `DefinirMetaRequisicao`

**`DefinirMetaRequisicao`**

| Campo | Tipo | Obrigatório |
|---|---|---|
| `percentual` | inteiro | sim |

Resposta **200**: `MetaResposta`

Erros possíveis: `401`, `403`, `404`, `422`.

#### `DELETE /metas/{categoria}`

| Parâmetro | Em | Tipo | Obrigatório |
|---|---|---|---|
| `categoria` | caminho | CategoriaDoGasto | sim |

Resposta **204** (sem corpo).

Erros possíveis: `401`, `403`, `404`, `422`.

### Resumos

#### `GET /resumos/tags`

| Parâmetro | Em | Tipo | Obrigatório |
|---|---|---|---|
| `inicio` | query | texto (date) | sim |
| `fim` | query | texto (date) | sim |
| `conta_id` | query | texto (uuid) ou nulo | não |
| `categoria` | query | CategoriaDoGasto ou nulo | não |

Resposta **200**: `ResumoPorTagsResposta`

**`ResumoPorTagsResposta`**

| Campo | Tipo | Obrigatório |
|---|---|---|
| `inicio` | texto (date) | sim |
| `fim` | texto (date) | sim |
| `total` | texto | sim |
| `fatias` | lista de FatiaPorTagResposta | sim |

Erros possíveis: `401`, `403`, `404`, `422`.

### Importação bancária

#### `GET /transacoes-importadas`

| Parâmetro | Em | Tipo | Obrigatório |
|---|---|---|---|
| `estado` | query | EstadoDaTransacaoImportada | não |

Resposta **200**: `lista de TransacaoImportadaResposta`

**`TransacaoImportadaResposta`**

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | texto (uuid) | sim |
| `conta_id` | texto (uuid) | sim |
| `data` | texto (date) | sim |
| `descricao` | texto | sim |
| `valor` | texto | sim |
| `sentido` | texto | sim |
| `tipo_de_operacao` | texto ou nulo | sim |
| `estado` | texto | sim |
| `sugerir_descarte` | booleano | sim |
| `possivel_duplicado` | booleano | sim |

Erros possíveis: `401`, `403`, `404`, `409`, `422`.

#### `POST /transacoes-importadas/{transacao_id}/aceitar`

| Parâmetro | Em | Tipo | Obrigatório |
|---|---|---|---|
| `transacao_id` | caminho | texto (uuid) | sim |

Corpo: `AceitarTransacaoImportadaRequisicao`

**`AceitarTransacaoImportadaRequisicao`**

| Campo | Tipo | Obrigatório |
|---|---|---|
| `categoria` | CategoriaDoGasto ou nulo | não |
| `tags` | lista de texto | não |

Resposta **201**: `AceiteResposta`

**`AceiteResposta`**

| Campo | Tipo | Obrigatório |
|---|---|---|
| `tipo` | texto | sim |
| `id` | texto (uuid) | sim |

Erros possíveis: `401`, `403`, `404`, `409`, `422`.

#### `POST /transacoes-importadas/{transacao_id}/ignorar`

| Parâmetro | Em | Tipo | Obrigatório |
|---|---|---|---|
| `transacao_id` | caminho | texto (uuid) | sim |

Resposta **204** (sem corpo).

Erros possíveis: `401`, `403`, `404`, `409`, `422`.

#### `POST /sincronizacoes`

Resposta **200**: `SincronizacaoResposta`

**`SincronizacaoResposta`**

| Campo | Tipo | Obrigatório |
|---|---|---|
| `contas` | inteiro | sim |
| `transacoes_novas` | inteiro | sim |
| `falhas` | inteiro | sim |

Erros possíveis: `401`, `403`, `404`, `409`, `422`.

### Tags

#### `GET /tags`

Resposta **200**: `lista de texto`

Erros possíveis: `401`, `403`.

### Categorias

#### `GET /categorias`

Resposta **200**: `lista de CategoriaResposta`

**`CategoriaResposta`**

| Campo | Tipo | Obrigatório |
|---|---|---|
| `codigo` | texto | sim |
| `nome` | texto | sim |

Erros possíveis: `401`, `403`.

## Regenerar a lista de rotas

A seção "Rotas" foi gerada a partir de `GET /openapi.json`. Quando uma rota ou um campo mudar, confira o contrato publicado e atualize este arquivo no mesmo PR (Art. V.3 da constituição).
