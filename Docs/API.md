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
- **Categorias** ativas: `lazer`, `conhecimento`, `conforto` e `gasto_fixo`. `GET /categorias` também devolve `investimentos`, com `legada: true` e nome "Investimentos (antiga)", exclusivamente para leitura e revisão; nenhuma escrita nova aceita esse código. **Tags** são texto livre, normalizadas (espaços das pontas removidos, espaços internos colapsados e minúsculas), com 1 a 30 caracteres e no máximo 10 por gasto.

## Autenticação

Toda rota exige credencial, exceto `GET /health`, `POST /auth/cadastro` e `POST /auth/entrar`. A credencial é um token, de dois tipos:

| Tipo | Como obter | Como enviar | Vale |
|---|---|---|---|
| **Sessão** (`gsess_...`) | `POST /auth/entrar` | cookie `gastoba_sessao` (definido na resposta) ou `Authorization: Bearer <token>` | `GASTOBA_DURACAO_DA_SESSAO_HORAS` (padrão 12 h), sem renovação |
| **Chave de API** (`gapi_<prefixo>_...`) | `POST /chaves-de-api` (só com sessão) | só `Authorization: Bearer <chave>` | até revogar ou expirar |

- A chave tem escopo `leitura` (só `GET`, `HEAD` e `OPTIONS`) ou `escrita` (também `POST`, `PUT` e `DELETE`). A sessão tem tudo. O segredo da chave aparece **uma única vez**, na criação. As rotas de `/chaves-de-api` e `POST /movimentos-de-investimento/{id}/desfazer-classificacao` só aceitam sessão; com uma chave, respondem 403 `acesso_negado`.
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
| Chave sem o escopo do método, gerindo chaves ou desfazendo classificação de investimento | 403 | `acesso_negado` |
| Cadastro com o cadastro fechado | 403 | `cadastro_fechado` |
| Escrita por cookie sem `X-Gastoba-Requisicao: 1` | 403 | `requisicao_invalida_origem` |
| Conta inexistente (ou de outra pessoa) | 404 | `conta_nao_encontrada` |
| Ganho inexistente (ou de outra pessoa) | 404 | `ganho_nao_encontrado` |
| Excluir ganho gerado por uma recorrência | 409 | `ganho_de_recorrencia` |
| Importação desligada, ou pessoa que não é a dona | 404 | `importacao_desligada` |
| Transação importada inexistente (ou de outra pessoa) | 404 | `transacao_importada_nao_encontrada` |
| Aceitar ou ignorar transação já tratada, ou restaurar uma que não está ignorada | 409 | `transacao_ja_tratada` |
| Categoria legada `investimentos` em qualquer escrita nova | 422 | `categoria_invalida` |
| Divisão de transação fora das regras (2 a 10 partes, 1 a 100%, soma 100) | 422 | `divisao_invalida` |
| Destinações fora das regras (percentual de 1 a 100, soma 100, tag repetida) | 422 | `destinacao_invalida` |
| Conta remunerada ou rendimento aceito como gasto ou ganho; imposto ou taxa como aporte; conta remunerada ligada a ação ou título | 422 | `movimento_incompativel_com_investimento` |
| Resgate ou realocação acima do principal da destinação | 422 | `principal_insuficiente` |
| Resgate maior que o valor da destinação antes do resgate (há saldo anterior no histórico) | 422 | `resgate_maior_que_o_valor` |
| Investimento inexistente ou de outro usuário | 404 | `investimento_nao_encontrado` |
| Aporte ou resgate inexistente ou de outro usuário | 404 | `movimento_de_investimento_nao_encontrado` |
| Associar movimento que já tem investimento | 409 | `movimento_ja_associado` |
| Desfazer movimento sem origem segura, com caixa indisponível, ou usar o DELETE para origem diferente de saldo inicial | 409 | `movimento_nao_desfazivel` |
| Desfazer transação dividida sem confirmar a divisão inteira | 409 | `divisao_exige_confirmacao` |
| Realocação inexistente ou de outro investimento | 404 | `realocacao_nao_encontrada` |
| Desfazer realocação ou saldo inicial cujo valor a destinação já não tem | 422 | `principal_insuficiente` |
| Definir destinações de posição já coberta pelo principal registrado | 409 | `sem_valor_a_destinar` |
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
- **Renda-base**: previsão mensal positiva, única por pessoa e válida para todos os meses até ser alterada ou removida. Não cria ganhos nem muda saldos. Alterá-la também muda os indicadores consultados em meses passados, sem reescrever lançamentos.
- **Meta**: a porcentagem inteira (1 a 100) da **renda de referência** que uma categoria pode usar. A referência é sempre a renda-base configurada (mesmo com ganhos maiores); sem base, usa a soma dos ganhos registrados no mês, em todas as contas. A soma das metas nunca passa de 100%. Limite = `renda_de_referencia * percentual // 100`. Situação: `dentro` (gasto abaixo de 80% do limite), `alerta` (de 80% ao limite, inclusive), `estourou` (acima do limite) e `sem_renda` (referência zero). A projeção financeira continua usando os ganhos registrados.
- **Importação bancária** (só a pessoa dona, `GASTOBA_PLUGGY_EMAIL_DO_DONO`; para as outras as rotas dão 404 `importacao_desligada`): as contas e transações vêm da Pluggy (conector MeuPluggy). A conta importada tem origem `open_finance` e **o saldo é o do banco** (no cartão, o negativo do valor devido): aceitar uma transação, lançar à mão ou excluir um ganho nela não o altera. A transação chega **pendente** à caixa de entrada e só vira gasto (saída, com categoria) ou ganho (entrada) quando aceita; transferência entre as próprias contas (`TRANSFERENCIA_MESMA_INSTITUICAO`) e pagamento de fatura (`PAGAMENTO_FATURA`) entram **já ignoradas** (aparecem só em `?estado=ignorada` e não contam em `transacoes_novas`); `sugerir_descarte` marca o estorno (e as duas anteriores), `possivel_duplicado` marca a que já tem um lançamento manual igual (mesma conta, dia e valor), e `investimento_sugerido_id` aponta a posição de investimento de que a saída pendente parece ser o aporte (o nome da posição, sem acento nem pontuação, aparece na descrição; o valor aplicado é igual ao da transação; e a posição ainda não tem movimento associado), nulo se nenhuma ou mais de uma casa. A sugestão nunca aceita nada sozinha. `GET /auth/eu` traz `importacao_bancaria`.
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
| `gestao_de_investimentos` | booleano | não |

`gestao_de_investimentos` é verdadeiro para a dona da importação ou para quem tem ao menos um investimento ou movimento próprio. Permite consultar e associar movimentos e desfazer saldo inicial mesmo com a importação desligada. Desfazer classificação exige a caixa de entrada disponível.

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
| `valor_coberto` | texto decimal (soma das coberturas) | sim |
| `coberturas` | lista de CoberturaResposta (`id`, `tag`, `valor`, `movimento_id` ou nulo) | sim |

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

### Renda-base mensal

| Rota | Entrada | Resposta |
|---|---|---|
| `GET /renda-base` | — | 200 `RendaBaseResposta`: `{"valor": "5000.00"}` ou `{"valor": null}` |
| `PUT /renda-base` | `DefinirRendaBaseRequisicao`: `{"valor": "5000.00"}` | 200 `RendaBaseResposta`; cria ou atualiza a mesma base |
| `DELETE /renda-base` | — | 204, também quando não existe base |

`valor` é obrigatório e aceita somente string decimal positiva no PUT, até R$ 1 trilhão. Zero, negativo, vírgula, fração de centavo ou acima do limite: 422 `valor_invalido`; número JSON: 422 `requisicao_invalida`. Sem credencial: 401. Chave de leitura só consulta; PUT/DELETE exigem escrita (403 `acesso_negado` sem o escopo). Escrita por cookie exige CSRF. A base pertence à pessoa autenticada.

### Metas

#### `GET /metas`

Resposta **200**: `lista de MetaResposta`

**`MetaResposta`**

| Campo | Tipo | Obrigatório |
|---|---|---|
| `categoria` | texto | sim |
| `percentual` | inteiro | sim |
| `nome` | texto (nome do alvo) | sim |

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
| `renda` | texto (ganhos registrados) | sim |
| `renda_base` | texto ou nulo | sim |
| `renda_de_referencia` | texto | sim |
| `metas` | lista de ProgressoDaMetaResposta | sim |

`renda` continua sendo a soma real dos ganhos. Limite, restante, percentual usado e situação das metas usam `renda_de_referencia`, igual à base quando definida e a `renda` caso contrário.

Cada item de `metas` traz ainda, para o card mostrar a composição "R$ 4.200 de R$ 954 + R$ 3.500 da caixinha Computador": `gasto_bruto` (o `gasto` líquido mais `limite_adicional`), `limite_adicional` (o que compras pagas por resgate real de uma caixinha somaram no mês da data do gasto), `caixinhas` (`[{tag, valor, rentabilidade}]`: `valor` é o que a caixinha pagou no mês, possivelmente zero) e `rentabilidade` (% com duas casas das caixinhas da meta; em Liberdade financeira, das destinações sem vínculo; nulos sem dado). `gasto`, `percentual_usado`, `restante` e `situacao` seguem líquidos. Partes de aportes vinculados não são despesa; Liberdade financeira usa somente transferências líquidas externas confirmadas.

Erros possíveis: `401`, `403`, `404`, `422`.

#### `PUT /metas/{categoria}`

| Parâmetro | Em | Tipo | Obrigatório |
|---|---|---|---|
| `categoria` | caminho | CodigoDaMetaNaRota (inclui alias obsoleto `investimentos`) | sim |

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
| `categoria` | caminho | CodigoDaMetaNaRota (inclui alias obsoleto `investimentos`) | sim |

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
| `investimento_sugerido_id` | texto (uuid) ou nulo | sim |

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
| `como_investimento` | booleano (padrão `false`) | não |
| `investimento_id` | texto (uuid) ou nulo | não |
| `destinacoes` | lista de `{tag, percentual}` | não |

Com `como_investimento: true`, a saída vira **aporte** e a entrada vira **resgate**, sem categoria de despesa nem tags comuns. Categoria enviada dá 422 `transacao_importada_invalida`. `tipo_de_movimento` permite explicitar `aporte`, `resgate`, `rendimento`, `custo` ou `imposto`; custo/imposto exigem posição e `movimento_relacionado_id` compatível. Nenhuma operação de posição é despesa nem demonstra, por si só, dinheiro novo. `AceiteResposta.tipo` identifica o lançamento criado.

O antigo atalho `categoria: "investimentos"` foi removido: devolve 422 `categoria_invalida`, com ou sem `como_investimento`. Use o marcador explícito. Investimento e destinações continuam opcionais no aporte.

Resposta **201**: `AceiteResposta`

**`AceiteResposta`**

| Campo | Tipo | Obrigatório |
|---|---|---|
| `tipo` | texto | sim |
| `id` | texto (uuid) | sim |

Erros possíveis: `401`, `403`, `404`, `409`, `422`.

#### `POST /transacoes-importadas/{transacao_id}/dividir`

Aceita a transação pendente **dividida por porcentagem**: de 2 a 10 partes, cada uma de 1 a 100%, somando exatamente 100%. Cada parte vira um gasto (saída, com a própria `categoria`, obrigatória), um **aporte** (saída com `como_investimento: true`, sem categoria de despesa nem tags comuns, com `investimento_id` e `destinacoes` opcionais aplicados à fatia da parte) ou um ganho (entrada, sem categoria), com as próprias `tags`, a mesma data e a descrição `"<descrição> (n/N)"`. O valor se divide em centavos inteiros (o resto de 1 em 1 centavo para a primeira parte); parte sem centavo é descartada. Tudo ou nada; o saldo de conta importada não muda.

Corpo: `{"partes": [{"como_investimento", "categoria", "tags", "percentual", "investimento_id", "destinacoes"}]}` (`investimento_id` e `destinacoes` só na parte de aporte). Resposta **201**: `{"criados": [{"tipo", "id"}]}`, na ordem enviada (`tipo` é `gasto`, `ganho` ou `aporte`). Só a dona; erros: `401`, `403`, `404` (inclusive `investimento_nao_encontrado`), `409`, `422` (`divisao_invalida`, `transacao_importada_invalida`).

#### `POST /transacoes-importadas/aceitar-em-lote`

Aceita várias **saídas** pendentes de uma vez, com a mesma categoria e as mesmas tags (ou todas como aporte, com `como_investimento: true` e sem categoria de despesa). Tudo ou nada: se qualquer uma falhar (inexistente, já tratada ou entrada), nenhuma é aceita. De 1 a 200 transações; as entradas continuam sendo aceitas uma a uma.

Corpo: o mesmo de `AceitarTransacaoImportadaRequisicao`, mais `transacao_ids` (lista de uuid, obrigatória).

Resposta **201**: `{"aceitas": [AceiteResposta, ...]}`, na ordem enviada.

Erros possíveis: `401`, `403`, `404`, `409`, `422`.

#### `POST /transacoes-importadas/{transacao_id}/ignorar`

| Parâmetro | Em | Tipo | Obrigatório |
|---|---|---|---|
| `transacao_id` | caminho | texto (uuid) | sim |

Resposta **204** (sem corpo).

Erros possíveis: `401`, `403`, `404`, `409`, `422`.

#### `POST /transacoes-importadas/{transacao_id}/aceitar-como-transferencia`

Registra uma transferência canônica entre contas próprias, sem criar gasto, ganho ou movimento
de posição. Exige sessão da dona, `conta_contraparte_id` no corpo e papéis corrente/investimento
confirmados. `par_transacao_id` é opcional: se faltar, a pessoa confirma a ponta ausente; completar
o par depois atualiza a mesma transferência. `par_sugerido_id` é apenas sugestão e nunca é aceito
implicitamente. As pontas ficam `aceita`, vinculadas ao registro persistido.

Resposta **200** com a transferência (IDs, valor decimal, data, papéis históricos e aporte líquido).
Sem corpo/contraparte: 422 `requisicao_invalida`; par incompatível ou papel não confirmado:
422 `transacao_importada_invalida`; origem inexistente/de outra pessoa: 404. Ver contrato completo
na seção 054/055. Chaves de API recebem 403; escrita por cookie exige CSRF.

#### `POST /transacoes-importadas/{transacao_id}/restaurar`

Devolve à caixa de entrada uma transação **ignorada** (`ignorada` → `pendente`). Só muda o estado: não aceita nem classifica, não cria gasto, ganho ou movimento de investimento e não altera saldo; id, descrição, valor, conta e data ficam como estavam. Transação pendente ou aceita dá 409 `transacao_ja_tratada`. Só a dona da importação.

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

### Faturas

Somente leitura e só para a pessoa dona da importação bancária (as demais recebem 404 `importacao_desligada`). Aceita sessão ou chave de API de qualquer escopo. A situação da fatura (`aberta`, `fechada`, `paga`, `vencida`) é calculada com o `hoje` enviado pelo cliente, por isso `hoje` é obrigatório (ausente ou fora de `AAAA-MM-DD`: 422 `requisicao_invalida`).

#### `GET /faturas`

| Parâmetro | Em | Tipo | Obrigatório |
|---|---|---|---|
| `hoje` | query | texto (date) | sim |
| `conta_id` | query | texto (uuid) | não |

Resposta **200**: `ListaDeFaturasResposta` com `cartoes: lista de CartaoComFaturasResposta`

**`CartaoComFaturasResposta`**

| Campo | Tipo | Obrigatório |
|---|---|---|
| `conta_id` | texto (uuid) | sim |
| `conta_nome` | texto | sim |
| `valor_devido` | texto | sim |
| `faturas` | lista de `FaturaResposta`, da mais recente para a mais antiga | sim |

**`FaturaResposta`**

| Campo | Tipo | Obrigatório |
|---|---|---|
| `id` | texto (uuid) | sim |
| `inicio` | texto (date) ou nulo | sim |
| `fechamento` | texto (date) | sim |
| `vencimento` | texto (date) ou nulo | sim |
| `total`, `pago`, `restante`, `a_favor` | texto | sim |
| `minimo` | texto ou nulo | sim |
| `situacao` | `aberta`, `fechada`, `paga` ou `vencida` | sim |
| `fonte` | `banco` ou `estimada` | sim |
| `quantidade_de_compras` | inteiro | sim |

Erros possíveis: `401`, `404` (`importacao_desligada`, `conta_nao_encontrada`), `422`.

#### `GET /faturas/{fatura_id}`

Query: `hoje` (obrigatória). Resposta **200**: `FaturaDetalhadaResposta` (os campos de `FaturaResposta` mais `compras` e `pagamentos`).

**`CompraDaFaturaResposta`**: `id`, `data`, `descricao`, `valor`, `sentido` (`saida` ou `entrada`; a entrada é estorno e abate o total), `parcela_numero` e `parcela_total` (inteiros ou nulos) e `estado` (`pendente`, `aceita` ou `ignorada`, o da transação importada).

**`PagamentoDaFaturaResposta`**: `data`, `valor`, `forma` (texto ou nulo).

Erros possíveis: `401`, `404` (`importacao_desligada`, `fatura_nao_encontrada`), `422`.

### Investimentos

Posições lidas da Pluggy (só a pessoa dona tem), aportes e resgates com destinações por tag. Um aporte ou resgate **não é gasto nem ganho**. As destinações dividem o valor em porcentagens inteiras que somam 100, em centavos inteiros (o resto vai de 1 em 1 centavo para a primeira); o saldo atual é rateado entre as tags **proporcionalmente ao principal**, então o rendimento acompanha o principal. O **resgate abate o principal por custo médio**: quando há um saldo anterior à data do resgate em `investimentos_historico`, o principal abatido de cada tag é `principal × parte_resgatada ÷ valor_da_tag_antes` (truncado em centavos, no mínimo 1 centavo; resgate total zera o principal), e a parte maior que o valor da tag dá 422 `resgate_maior_que_o_valor`. Sem saldo anterior no histórico, vale a regra antiga (abate o valor em dinheiro, limitado ao principal, com 422 `principal_insuficiente`). Resgates já gravados não são recalculados. O contrato HTTP não muda. `GET /investimentos` traz também `valor_aplicado_das_operacoes` e `rendimento_das_operacoes` (nulos sem histórico completo): o custo médio das compras e o lucro sobre ele, que a tela prefere ao `valor_aplicado` da instituição, que pode estar defasado.

| Rota | Entrada | Sucesso |
|---|---|---|
| `GET /investimentos` | — | 200 lista de posições **abertas** (saldo zero, vencida ou resgatada por inteiro, não aparece; o histórico fica) `{id, nome, tipo, subtipo, saldo, valor_aplicado, rendimento, rentabilidade, origem_da_rentabilidade, taxa, vencimento, atualizado_em, destinacoes: [{tag, principal, valor_atual, rendimento, rentabilidade}]}`; `tag` nula é a parte sem destinação. `valor_aplicado` e `rendimento` são o que a instituição informa (Pluggy: `amountOriginal` e `amountProfit`); sem isso, são **nulos** (a estimativa pelos aportes registrados foi retirada na T075 das posições com operações; nunca um número inventado) e `origem_da_rentabilidade` é `"instituicao"` ou nulo; **só a conta remunerada (`CAIXINHA`), fora do modelo de operações, ainda é estimada pelo principal registrado** (aplicado = principal, rendimento = saldo − aplicado, origem `"aportes"`); com o histórico das operações fechado, use `valor_aplicado_das_operacoes` e `rendimento_das_operacoes`; `taxa` é a remuneração contratada que a instituição informa, `{percentual, indexador, adicional_anual}` (Pluggy: `rate`, `rateType`, `fixedAnnualRate`; lida do registro guardado, sem esperar nova sincronização; nula sem taxa) e o que é zero vem nulo, então `101.2% CDI + 0% a.a.` é `{"percentual": "101.2", "indexador": "CDI", "adicional_anual": null}`; `rentabilidade` é `rendimento / valor_aplicado` em % com duas casas (`"4.32"`, truncada em direção ao zero; nula sem base). Nas destinações, `rendimento = valor_atual − principal` e a rentabilidade é sobre o principal |
| `GET /investimentos/resumo` | query `visao` (`destinacao`, padrão, ou `tipo`) | 200 `{visao, total, fatias: [{rotulo, valor}]}`, maior valor primeiro |
| `GET /investimentos/historico` | query `inicio` e `fim` (obrigatórias) | 200 lista `{investimento_id, data, saldo}`, um saldo por investimento e dia; só existe desde que o Gastoba começou a guardar |
| `GET /investimentos/{id}/realocacoes` | — | 200 lista `{id, investimento_id, origem, destino, valor, data}`, da mais recente |
| `POST /investimentos/{id}/realocacoes` | corpo `{origem, destino, data, valor` **ou** `percentual}` (percentual do principal da origem) | 201 realocação; 422 `principal_insuficiente` |
| `POST /investimentos/{id}/destinacoes` | corpo `{destinacoes: [{tag, percentual}]}` (soma 100, sem tag repetida) | 201 movimento de saldo inicial (`origem` `saldo_inicial`, `conta_id` nulo, `descricao` "Saldo inicial", data de hoje em Brasília) que reparte a parte da posição ainda sem principal: `valor_aplicado` (ou o saldo, se a instituição não informa) menos o principal já registrado; 409 `sem_valor_a_destinar` se não sobra nada. Não muda saldo de conta, gasto nem renda e não conta na meta Liberdade financeira |
| `GET /movimentos-de-investimento` | query `inicio` e `fim` | 200 lista `{id, transacao_importada_id, conta_id, investimento_id, tipo, origem, descricao, valor, data, destinacoes: [{tag, valor}]}`; `origem` é `open_finance`, `manual` (gasto antigo convertido) ou `saldo_inicial`, o único com `conta_id` nulo |
| `POST /movimentos-de-investimento/{id}/destinacoes` | corpo `{investimento_id, destinacoes: [{tag, percentual}]}` | 200 movimento (mesmo formato da lista, com `destinacoes` vazia); só para o que ainda não tem investimento (409 `movimento_ja_associado`) |
| `DELETE /investimentos/{id}/realocacoes/{realocacao_id}` | — | 204; apaga a realocação e o principal volta à destinação de origem; 404 `realocacao_nao_encontrada`; 422 `principal_insuficiente` se o destino já usou o valor |
| `POST /movimentos-de-investimento/{id}/desfazer-classificacao` | corpo opcional `{"desfazer_divisao_inteira": false}`; só sessão | 200 `{"transacao_id": "<uuid>", "estado": "pendente", "lancamentos_removidos": 1}` |
| `DELETE /movimentos-de-investimento/{id}` | — | 204; **por este DELETE, só o saldo inicial** (`origem: saldo_inicial`) se desfaz, e o valor volta a ficar sem destinação; 409 `movimento_nao_desfazivel` no aporte ou resgate da caixa; 422 `principal_insuficiente` se alguma destinação já não tem o valor |

**MovimentoDeInvestimentoResposta**: o campo aditivo obrigatório `transacao_importada_id` é UUID ou nulo, na lista e nas respostas de associação e saldo inicial. Todo aceite novo (único, lote e divisão) guarda esse vínculo nos lançamentos. Os registros antigos permanecem nulos; as respostas de gastos, ganhos e aceites não mudam.

**Desfazer classificação**: somente sessão válida; sem credencial, 401 `nao_autenticado`; chave de API, mesmo de escrita, recebe 403 `acesso_negado` antes de ler ou alterar os lançamentos. Cookie exige `X-Gastoba-Requisicao: 1` (403 `requisicao_invalida_origem` sem ele). A caixa precisa estar disponível para a pessoa; desligada, 409 `movimento_nao_desfazivel`, sem escrita.

O POST apaga o movimento e suas destinações e reabre a transação vinculada. Se dividida, remove **todas** as partes (gastos, ganhos e movimentos) numa transação de banco. A primeira chamada devolve 409 `divisao_exige_confirmacao`, com a contagem e tipos; só repetir com `{"desfazer_divisao_inteira": true}` confirma. Nenhum saldo de conta muda. A transação volta inteira à caixa, onde pode ser aceita novamente ou ignorada. Aporte cujo principal já foi usado dá 422 `principal_insuficiente`, sem remoção parcial; o principal de vários aportes é conferido somado por investimento e tag.

Sem vínculo, só aceita correspondência conservadora: exatamente uma transação aceita da pessoa, da mesma conta/data/valor/descrição e sentido compatível, sem qualquer lançamento vinculado; exatamente um movimento igual sem vínculo; nenhum gasto ou ganho Open Finance igual sem vínculo. Ambiguidade, ausência de candidato e divisão antiga não identificável dão 409 `movimento_nao_desfazivel`. Não há reclassificação automática nem preenchimento retroativo de vínculos. Movimento inexistente ou de outra pessoa dá 404 `movimento_de_investimento_nao_encontrado`; saldo inicial e origem manual são recusados por este POST.

Erros possíveis em todas: `401`, `403`, `404`, `409`, `422`.

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
| `legada` | booleano | sim |

Erros possíveis: `401`, `403`.

## Regenerar a lista de rotas

A seção "Rotas" foi gerada a partir de `GET /openapi.json`. Quando uma rota ou um campo mudar, confira o contrato publicado e atualize este arquivo no mesmo PR (Art. V.3 da constituição).


## Liberdade financeira, reservas, revisão e cores

Contrato conferido contra o OpenAPI gerado localmente em 2026-10-30, sem iniciar servidor, tarefas ou integrações externas.

`GET /metas/alvos` devolve `{codigo, nome}` na ordem `liberdade_financeira`, `lazer`, `conhecimento`, `conforto`, `gasto_fixo`. Meta/progresso mantêm o campo HTTP `categoria` e acrescentam `nome`. `PUT` e `DELETE /metas/investimentos` são aliases compatíveis do alvo `liberdade_financeira`; respostas usam o código novo e exatamente "Liberdade financeira". Código desconhecido dá 422 `requisicao_invalida`. A soma dos percentuais continua limitada a 100.

Liberdade financeira soma transferências próprias ativas pela fronteira corrente/investimento, líquidas e pela competência canônica; pode ser negativa. Compra/venda de posição, saldo inicial, rendimentos, custos e impostos não contam. Categorias ativas somam apenas gastos líquidos. Gastos legados continuam disponíveis para revisão explícita, sem inferência de origem. Campos históricos de categoria nos movimentos permanecem legíveis, mas novas classificações não aceitam categoria de despesa.

`MovimentoDeInvestimentoResposta` acrescenta `categoria: string | null` e `revisao_pendente: boolean`. Destinações em posições e fatias do resumo de investimentos acrescentam `cor: string | null` (nula em "Sem destinação" e na visão por tipo).

As rotas abaixo exigem **sessão**, inclusive os GET. Chaves de API de leitura e escrita recebem 403 `acesso_negado`. Escritas por cookie também exigem `X-Gastoba-Requisicao: 1`.

| Rota | Entrada | Resposta |
|---|---|---|
| `GET /reservas-das-destinacoes` | query `categoria` ativa | 200 `[{tag, reservado, coberto, disponivel, cor}]` |
| `POST /gastos/{id}/coberturas` | `{tag, valor, movimento_id?}` (valor string decimal; `movimento_id` é o resgate real já tagueado) | 201 `{id, tag, valor, movimento_id}` |
| `DELETE /gastos/{id}/coberturas/{cobertura_id}` | — | 204 |
| `GET /revisao-de-investimentos` | — | 200 `{aportes, gastos, recorrencias}` com os schemas das listagens |
| `POST /revisao-de-investimentos/aportes/{id}` | `{categoria: null, investimento_id?, destinacoes?: [{tag, percentual}]}` | 200 movimento revisado |
| `POST /revisao-de-investimentos/gastos/{id}` | `{categoria: ativa}` | 200 gasto revisado |
| `POST /revisao-de-investimentos/recorrencias/{id}` | `{categoria: ativa}` | 200 recorrência revisada |

Reserva de categoria C e tag T = partes positivas da destinação T em aportes categorizados em C; resgates, realocações e saldo inicial não a alteram. Coberto = coberturas de T em gastos de C. Disponível = reservado − coberto. A pessoa escolhe explicitamente tag e valor; nenhuma associação automática. Valor positivo, limitado ao disponível e ao restante do gasto. Pode usar várias tags; repetir a mesma tag no gasto dá 409 `cobertura_ja_existe`. Outros limites dão 422 `cobertura_invalida`; gasto alheio/inexistente dá 404 `gasto_nao_encontrado`; cobertura alheia, inexistente ou de outro gasto dá 404 `cobertura_nao_encontrada`. Desfazer devolve o disponível sem alterar finanças.

Em `GET /gastos`, `valor` permanece bruto; `valor_coberto` e `coberturas` são separados. `GET /resumos/tags` mantém filtros/schema e retorna o líquido (bruto menos soma das coberturas), rateado entre as tags originais em centavos com resto na ordem original. Sem tags, o líquido vai para `tag: null`; zero não contribui. Aportes ficam fora de Tags. `GET /tags` conserva as tags originais, mesmo em gastos totalmente cobertos. Cobertura não muda gasto bruto, conta/saldo, aporte, destinação, posição, resgate ou retorno. Ao apagar um gasto, suas coberturas são removidas na mesma transação. Desfazer aporte que deixaria reserva abaixo do coberto restante dá 409 `movimento_nao_desfazivel`.

Revisão só muda categoria, marca de pendência e associação opcional do aporte ainda sem investimento. Item já revisado dá 409 `revisao_nao_pendente`; associação já existente dá 409 `movimento_ja_associado`. Recorrência legada continua ativa e gerando gastos legados até revisão; qualquer `PUT /recorrencias/{id}` nela dá 409 `recorrencia_em_revisao`. Encerrar continua possível. Revisar recorrência não reclassifica gastos já gerados.

**Contrato histórico da 051 (substituído pela 056 abaixo).** `GET /vinculos-das-destinacoes` (200 `[{tag, categoria}]`), `PUT /vinculos-das-destinacoes` (`{tag, categoria}`, 200) e `DELETE /vinculos-das-destinacoes?tag=...` (204, idempotente) usam a autenticação comum (chave de escrita escreve). Só categorias ativas servem (422 `categoria_invalida`). O vínculo vale só para os aportes classificados depois: cada parte do aporte guarda a categoria vigente (`destinacoes[].categoria` em `GET /movimentos-de-investimento`), então mudar ou remover o vínculo não reescreve o passado; o saldo inicial nunca entra numa categoria. Com `movimento_id`, a cobertura liga a compra a um resgate da pessoa já classificado com a tag: o valor cabe no restante do gasto, no que o resgate tirou da tag e ainda não foi usado (`destinacoes[].coberto` no resgate) e o principal correspondente (proporcional, truncado) cabe no que foi aportado na categoria; senão 422 `cobertura_invalida`. Nada é criado nem alterado em saldo, posição ou principal. Tag com vínculo exige `movimento_id`. Desfazer a classificação de um resgate usado por compra dá 409 `movimento_nao_desfazivel`. `GET /resgates-sem-destinacao` (só sessão) lista os resgates sem nenhuma tag, como `MovimentoDeInvestimentoResposta`, para o sininho de avisos.

Cores usam a autenticação comum: sessão ou chave de escrita; chave de leitura não escreve. `PUT /cores-das-destinacoes` recebe `{tag, cor}` e devolve 200 `{tag, cor}`; `DELETE /cores-das-destinacoes?tag=...` devolve 204 idempotente. Tag no corpo/query admite `/`. Paleta: `ametista`, `menta`, `orquidea`, `ceu`, `ambar`, `coral`, `glicinia`, `esmeralda`; código inválido dá 422 `requisicao_invalida`, tag inválida dá 422 `tag_invalida`. Cor pertence à pessoa/tag e pode se repetir entre destinações; nome acompanha a cor em lista, legenda e tabela. Remover significa "Automática".

## Contabilidade e relações normalizadas — 054/055

A normalização 055 é interna: listas de tags e nomes das destinações continuam no contrato HTTP.
UUIDs e FKs são persistidos no banco, sem JSON multivalorado nas tabelas de gastos/ganhos/recorrências.
A posição remunerada usa FK explícita para a conta, sem depender de prefixo do identificador externo.

As rotas de importação, transferências, caixinhas e revisão abaixo exigem sessão da dona
da importação; definir papel exige sessão da pessoa proprietária da conta. Escritas por
cookie mantêm CSRF.

| Rota | Entrada | Resposta |
|---|---|---|
| `GET /transacoes-importadas/{transacao_id}/impacto-da-reversao` | — | 200 `{transacao_id, versao, lancamentos_removidos, coberturas_removidas, transacoes_reabertas, divisao_inteira}` |
| `POST /transacoes-importadas/{transacao_id}/desfazer-classificacao` | `{versao_esperada?, desfazer_dependencias?, desfazer_divisao_inteira?}` | 200 `{transacao_id, estado, lancamentos_removidos}` |
| `PUT /contas/{conta_id}/papel` | `{papel: corrente ou investimento}` | 200 conta com `papel` |
| `POST /transacoes-importadas/{transacao_id}/aceitar-como-transferencia` | `{conta_contraparte_id, par_transacao_id?}` | 200 transferência |
| `GET /transferencias-entre-contas` | query `inicio`, `fim` | 200 lista de transferências ativas |
| `POST /transferencias-entre-contas/{transferencia_id}/completar-par` | `{transacao_id}` | 200 transferência atualizada |
| `POST /caixinhas` | `{conta_id, saldo_remunerado, data_do_saldo}` | 200 `{id, nome, saldo}` |
| `PUT /investimentos/{investimento_id}/referencias-da-caixinha/{mes}` | `{saldo_inicial, saldo_final, periodo_completo}` | 200 referência mensal |
| `GET /investimentos/{investimento_id}/reconciliacao` | query `mes` | 200 `{saldo_inicial, saldo_observado, saldo_calculado, diferenca, completo, conciliado}` |
| `GET /revisao-contabil` | query `inicio`, `fim` | 200 `{inicio, fim, meses}` com diferenças mensais; não altera dados |

Transferência expõe `id`, contas de origem/destino, `valor`, `data`, `aporte_liquido`, papéis históricos,
pontas opcionais e `competencia_provisoria`. Completar o par atualiza o mesmo registro. Desfazer
qualquer ponta reabre ambas atomicamente e preserva histórico, liberando sua exclusividade ativa.
Contas, pontas e lançamento precisam ser coerentes quanto a dono, conta, sentido e valor.

A prévia de reversão informa o grupo e as coberturas. Versão obsoleta ou dependências sem
confirmação são recusadas; a divisão inteira exige confirmação explícita. Cobertura derivada
pode ser removida com confirmação; dependência financeira posterior deve ser revertida antes.
O saldo bancário permanece o observado pela instituição. Gastos e ganhos listados expõem
`transacao_importada_id`; movimentos incluem `movimento_relacionado_id` e `revisao_contabil_pendente`.
`GET /metas/progresso` inclui `classificacoes_para_revisar`.

O [modelo físico atualizado](MODELO_DO_BANCO.md) registra FKs, índices parciais e a view de pontas;
a aplicação da migration em produção não faz parte da verificação local.


### Reversibilidade de saldo inicial na integração 052–055

Aporte importado que substitui principal já representado pelo saldo inicial grava snapshots
antes/depois na auditoria da classificação. Desfazer restaura IDs, datas, centavos e rateio do
saldo inicial na mesma transação de banco. Se houver alterações posteriores independentes,
a reversão é recusada com 409 `movimento_nao_desfazivel`, sem escrita parcial, e pede desfazer
as operações posteriores primeiro. Snapshots não alteram o contrato HTTP nem o saldo bancário.
A prévia continua necessária para confirmar divisões, dependências e a versão da classificação.


## Contrato vigente da 056: metas, histórico e descarte

- `GET /metas/progresso?mes=AAAA-MM`: contrato de resposta preservado. Liberdade financeira soma os aportes elegíveis de `somar_aportes` (sem CAIXINHA nem saldo inicial, incluindo sem posição), mais gastos legados de Investimentos. Resgate, rendimento, imposto e custo não alteram o gasto. Percentual usado pode superar 100 e restante pode ser negativo. Categorias ativas somam só gastos líquidos.
- `GET /metas/historico`: autenticação comum, 200 lista de até 100 registros do próprio usuário, do mais recente ao mais antigo: `{categoria, nome, acao, percentual_anterior, percentual_novo, instante}`. `acao`: `criada|alterada|removida`; percentuais são inteiros ou nulos; `instante` em ISO 8601 UTC. Sem credencial: 401. Mesmo percentual não escreve histórico; soma inválida também não. A escrita e a auditoria compartilham a mesma transação. O histórico começa vazio e não reconstrói o passado.
- `/vinculos-das-destinacoes` foi removida (GET/PUT/DELETE retornam 404); investimentos e partes novas não recebem categoria. Colunas históricas são preservadas.
- `POST /gastos/{id}/coberturas` com `movimento_id` continua ligando a compra a um resgate existente e tagueado, independente de categoria antiga. Valor limitado ao restante da compra e ao valor livre da tag nesse resgate; não cria resgate nem altera saldo/posição. Sem `movimento_id`, só reserva histórica da categoria é válida; sem reserva disponível, 422 `cobertura_invalida`. Desfazer libera o resgate.
- `POST /transacoes-importadas/{id}/ignorar`: corpo opcional `{ "motivo": "transferencia_entre_contas" }`; sem corpo ou motivo nulo mantém compatibilidade. 204 no sucesso, 422 para motivo inválido, 409 para transação já tratada. Não cria lançamentos, transferências ou mudanças de saldo.
- `GET /transacoes-importadas` acrescenta `motivo_ignorada` nulo ou `transferencia_entre_contas`; filtro opcional `motivo=transferencia_entre_contas`, combinado com `estado=ignorada`. Restaurar limpa o motivo e volta a pendente. Permissões do dono da importação permanecem.
- `GET /investimentos/resumo` acrescenta `aportes_sem_destino: {total: string decimal, quantidade: inteiro}`: aportes do próprio usuário, sem partes de destinação e fora de saldo inicial, inclusive sem posição. É um resumo de movimentos, separado do total de saldo das posições; nenhuma tag é criada automaticamente.

## Reaplicação confirmada de resgates — 057

Um resgate pode financiar um aporte em outra posição da mesma pessoa. A pessoa confirma o vínculo e a parcela reaplicada; nada é pareado automaticamente. O valor confirmado reduz somente o gasto da Liberdade financeira no mês da data do aporte. Resgate de outubro usado em aporte de novembro reduz novembro. Exemplo fictício: resgate de `"100.00"`, aporte de `"150.00"`, parcela confirmada de `"100.00"` → gasto da meta `"50.00"`.

Todas as rotas abaixo exigem **sessão**, inclusive os GET. Sem credencial: 401; chaves de API: 403; escritas por cookie exigem `X-Gastoba-Requisicao: 1`. Recurso individual inexistente ou de outra pessoa é 404.

| Método e rota | Entrada | Resposta |
|---|---|---|
| `GET /reaplicacoes-de-resgates` | nenhuma | 200 lista de `{id, aporte_id, resgate_id, valor}` do próprio usuário |
| `GET /movimentos-de-investimento/{aporte_id}/resgates-para-reaplicar` | UUID do aporte | 200 lista de `{id, data, descricao, investimento_nome, valor, disponivel}`; candidatos sem vínculo e com dinheiro livre, inclusive de meses anteriores |
| `POST /reaplicacoes-de-resgates` | `{aporte_id, resgate_id, valor}` | 201 `{id, aporte_id, resgate_id, valor}` |
| `DELETE /reaplicacoes-de-resgates/{id}` | UUID do vínculo | 204; vínculo inexistente/alheio é 404 `reaplicacao_nao_encontrada` |

`valor` e `disponivel` são strings decimais; número JSON não é aceito. Vínculo exige resgate e aporte de posições existentes e distintas, fora de CAIXINHA e saldo inicial. O resgate deve ocorrer na mesma data ou antes do aporte. Cada ponta participa de no máximo um vínculo, mesmo com valor parcial; para corrigir, desfaça e confirme novamente. Duplicação: 409 `reaplicacao_ja_existe`; regras incoerentes ou valor fora do disponível: 422 `reaplicacao_invalida`.

Compras cobertas e reaplicação compartilham o dinheiro do resgate: a soma não pode superar seu valor. Coberturas continuam respeitando também a parcela da tag. Remover o vínculo libera as pontas e restaura o progresso original; não desfaz movimentos. Reverter uma classificação ou divisão com ponta vinculada é 409 `movimento_nao_desfazivel`, orientando remover a reaplicação primeiro. Alterar o vínculo muda a versão da prévia de reversão. `movimento_relacionado_id` permanece exclusivo de custos/impostos.

A migration inicia sem vínculos e não deduz dados antigos. O fluxo mantém valores, saldos, posições, destinações e percentuais intactos. Limite, restante e percentual usado das metas continuam no contrato anterior.

### Total de aportes do mês (058)

`GET /metas/progresso` acrescenta `aportes_do_mes` (string decimal): soma elegível de aportes menos reaplicações confirmadas, pela competência do aporte, mesmo sem meta configurada. Exclui saldo inicial e CAIXINHA, como a meta; não inclui gastos legados. O Início usa ganhos − gastos líquidos − esse total.

`GET /investimentos` expõe `conta_id` nulo para posições comuns e a FK da conta para CAIXINHA. O resumo da conferência usa essa relação, sem inferir pelo nome ou id externo.

### Classificação explícita de vencimento (058)

`PUT /movimentos-de-investimento/{id}/natureza-do-resgate` recebe `{"tipo":"resgate"}` ou `{"tipo":"vencimento"}` e retorna 204. Só sessão; cookie exige CSRF. Movimento alheio/inexistente: 404; movimento que não seja resgate: 422. Não altera valor, data, destinações, custos, reaplicação ou saldo. A lista de movimentos mantém `tipo=resgate` financeiro e acrescenta `vencimento_confirmado` booleano. `GET /resgates-sem-destinacao` usa `tipo=resgate|vencimento` e acrescenta `investimento_nome` (nulo sem posição). Antigos resgates não são classificados automaticamente.

`GET /investimentos` acrescenta `data_de_aplicacao` opcional: data do primeiro aporte registrado para a posição, excluído saldo inicial, nulo sem registro. Usada apenas para distinguir opções de Evolução; não é uma reconstrução do extrato histórico.

### Posição pelas operações em `GET /investimentos` (060)

Campos acrescentados (aditivos; os antigos seguem iguais): `quantidade` (texto decimal ou nulo; renda fixa usa `"1"`), `custo_medio` (texto decimal ou nulo; custo médio ponderado com custos somados à compra), `historico_completo` (booleano), `rentabilidade_do_periodo` e `rentabilidade_anualizada` (percentual com duas casas em texto, ex.: `"32.38"`), `motivo_sem_rentabilidade` (`"historico_incompleto"` ou nulo) e `pendencias: [{tipo, quantidade_estimada}]` com `tipo` `faltam_cotas` ou `sobram_cotas`.

Regras: sem histórico completo a rentabilidade é nula com o motivo `historico_incompleto` (nunca um número inventado) e a pendência diz quantas cotas faltam. Uma quantidade **estimada** (abertura migrada) nunca fecha o histórico. O retorno do período sai com histórico completo; o anualizado (% a.a.) só com mais de 12 meses de histórico. O campo `rentabilidade` é o da instituição (sem estimativa pelos aportes nas posições com operações, retirada na T075; a conta remunerada mantém a estimativa pelo principal).

### Casamento de operações da corretora (060)

Só sessão (chave de API recebe 403 `acesso_negado`); escrita por cookie exige o cabeçalho de CSRF.

| Rota | Entrada | Sucesso |
|---|---|---|
| `DELETE /casamentos/{id}` | — | 204; as transações voltam a pendentes na caixa, o vínculo sai, nada é apagado e dá para casar de novo |

Regras: só casa com **exatamente um** candidato (zero ou vários não casam sozinhos); a tolerância padrão é valor exato e pregão até D+2; o resgate de renda fixa casa pelo bruto, aceita crédito dividido e nunca usa o líquido. O custo da operação vem só das despesas dela ou, se vazias, dos débitos de taxa casados; nunca das duas somadas.

Erros: 404 `operacao_nao_encontrada` e `casamento_nao_encontrado`; 409 `casamento_ja_existe`, `casamento_ambiguo` e `transacao_ja_tratada`; 422 `operacao_invalida`.

### Reclassificar uma transação já aceita (060)

`POST /transacoes-importadas/{id}/reclassificar`, só sessão (a pessoa dona da importação; chave de API recebe 403; cookie exige o cabeçalho de CSRF). Corpo: `{rotulo, versao_esperada, categoria?, tags?, investimento_id?, movimento_relacionado_id?, destinacoes?, desfazer_divisao_inteira?, desfazer_dependencias?}`; resposta 200 `{tipo, id}` do novo lançamento.

- `rotulo`: `gasto`, `ganho`, `transferencia_para_investimento` (aporte, ou resgate na entrada; sem categoria de despesa), `imposto`, `custo` e `rendimento_da_posicao` (a entrada de rendimento de um título: sai da renda e vira movimento da posição). Imposto, custo e rendimento exigem `investimento_id`; imposto e custo exigem também `movimento_relacionado_id`.
- Numa **só transação**: desfaz a classificação atual (com as mesmas regras e a mesma `versao_esperada` de `GET …/impacto-da-reversao`) e aplica a nova; se a nova falhar, a antiga continua intacta. Divisão exige `desfazer_divisao_inteira`; resgate que paga compras exige `desfazer_dependencias`; reaplicação, recorrência e saldo bancário seguem as recusas do desfazer. Não altera o saldo de conta importada e é desfazível.
- Erros: 404 `transacao_importada_nao_encontrada`; 409 `movimento_nao_desfazivel` (versão mudou, ou o grupo não pode ser desfeito) e `divisao_exige_confirmacao`; 422 `transacao_importada_invalida` (rótulo inválido, investimento ausente).

### Operações de investimento (060)

Só sessão; escrita por cookie exige o cabeçalho de CSRF.

| Rota | Entrada | Sucesso |
|---|---|---|
| `GET /investimentos/{id}/operacoes` | — | 200 `[{id, investimento_id, tipo, data, quantidade, valor, custos, origem, editavel, quantidade_estimada, operacao_relacionada_id}]`, da mais antiga para a mais recente |
| `POST /investimentos/{id}/operacoes` | `{tipo, data, quantidade, valor, custos?, operacao_relacionada_id?, confirmar_duplicidade?}` | 201 operação manual (compra, venda, provento, taxa, imposto ou vencimento) |
| `PUT /operacoes/{id}` | `{data?, quantidade?, valor?, custos?}` | 200; `manual` e `abertura`, e das `pluggy` só a quantidade que a corretora omitiu (`quantidade_confirmavel: true`, estimada pela posição); editar a quantidade a confirma |
| `DELETE /operacoes/{id}` | — | 204; só `manual` e `abertura`; as caixinhas não mudam |

`quantidade` é decimal em texto (renda fixa usa `"1"`). Taxa e imposto exigem `operacao_relacionada_id` da mesma posição. Lançar uma operação igual a uma da corretora (mesmo tipo, dia, valor e quantidade) é recusado como possível duplicidade; `confirmar_duplicidade: true` confirma que é outra operação. Excluir a abertura deixa a posição com histórico incompleto e a pendência visível. O DELETE antigo `/movimentos-de-investimento/{id}` (saldo inicial) continua e também remove a abertura estimada do modelo novo.

Erros: 404 `investimento_nao_encontrado` e `operacao_nao_encontrada`; 409 `operacao_da_corretora_imutavel` e `operacao_possivelmente_duplicada`; 422 `operacao_invalida` (tipo, quantidade, valor, taxa sem operação relacionada, exclusão com taxa ligada).

### Caixinhas como fração da posição (060)

`GET /investimentos`: quando a posição já tem alocações (`alocacoes_de_caixinha`, criadas pelo backfill), `destinacoes` vem do modelo novo: cada caixinha é uma fração da posição, o rendimento acompanha o da posição e a **compra nova** aparece como `tag: null` ("sem caixinha") até ser alocada; com a compra alocada ou sem compra nova, o resultado é igual ao de antes (0 centavo). Sem alocações, vale o cálculo antigo.

`POST /investimentos/{id}/alocar-sem-caixinha` com `{destinacoes: [{tag, percentual}]}` (soma 100, caixinhas que já existem): reparte a parte sem caixinha em centavos inteiros e soma ao peso de cada caixinha; 204. Erros: 409 `sem_valor_a_destinar` (nada sem caixinha), 422 `destinacao_invalida` (caixinha inexistente ou percentuais que não somam 100), 404 `investimento_nao_encontrado`.

### Aportes sem investimento (060)

Só sessão. `GET /aportes-sem-investimento` lista os aportes antigos sem investimento, com `duplicado_sugerido_id` (mesma conta, dia e valor), `descricao` (o texto do banco) e `natureza` (`liquidacao_de_bolsa`, `imposto_ou_taxa`, `conta_remunerada`, `vencimento`, `rendimento` ou `outra`; frente 061, aditivo). `POST …/{id}/mesclar` (`{mantido_id}`), `POST …/{id}/excluir` e `POST …/{id}/desfazer` são **lógicos e reversíveis**: nada é apagado, o original fica guardado e o aporte só sai das listas e dos totais depois que o dono aprova pelo comando `tratar-aportes-sem-investimento --aprovar` (o padrão do comando é `--dry-run`). Associar a um investimento reusa `POST /movimentos-de-investimento/{id}/destinacoes`. Erros: 404 `tratamento_nao_encontrado`; 409 `aporte_ja_tratado`; 422 `mescla_invalida`.

### Complementos aditivos da 060 — 2026-11-11

- `GET /casamentos`: só sessão, 200 `[{id, operacao_ids, vinculos: [{transacao_id, papel}]}]` (frente 061: `operacao_id` virou a lista `operacao_ids`, pois um casamento pode ligar várias operações; quebra de contrato entregue com o frontend),
  apenas do próprio usuário. Inclui operações de posições encerradas. Vínculos têm ordem estável.
  Chaves de API recebem 403; sem sessão, 401. O Desfazer da interface usa o DELETE existente.
- `GET /reaplicacoes/sugestoes`: só sessão, 200 `[{operacao_id, aporte_id, valor}]`. `valor` é
  dinheiro decimal em texto. Sugere a saída sem investimento, da mesma conta, com valor líquido
  igual ao do resgate casado, da data do crédito a D+2. Ambiguidade em qualquer ponta não sugere.
  É somente leitura: não cria movimento nem confirma reaplicação. Associar o aporte e confirmar
  o vínculo continuam sujeitos às regras da 057; os identificadores de operação e movimento
  pertencem a modelos distintos e não são intercambiáveis.
- `GET /investimentos` acrescenta `alocacao_por_fracao` (booleano) e `pendencias_de_operacoes`
  (`[{tipo, data, motivo}]`). Motivos: `tipo_sem_traducao`, `resgate_sem_historico`,
  `possivel_duplicidade`. O retrato é substituído em sincronização válida, preservado quando o
  provedor falha e não contém ids externos ou descrições. Sem pendências novas nem retrato
  anterior, o registro bruto é preservado sem mudanças.
- Frente 061 (fatia F0): `GET /investimentos` acrescenta `acao_do_historico` (`confirmar_quantidade`
  com alguma operação de quantidade estimada, `conferir_operacoes` com "sobram cotas" ou
  `possivel_duplicidade`, `completar` com "faltam cotas", ou nulo com histórico completo, caixinha
  ou nada a fazer). `GET /movimentos-de-investimento` (e as respostas que reutilizam o mesmo
  esquema) acrescenta `natureza` (`liquidacao_de_bolsa`, `imposto_ou_taxa`, `conta_remunerada`,
  `vencimento`, `rendimento` ou `outra`, derivada da descrição) e `casamento_id` (UUID ou nulo;
  por ora sempre nulo).
- Frente 061 (fatia F4): **`GET /casamentos-sugeridos` e `POST /casamentos` foram removidos** (a SPA passou a usar a Revisão da bolsa, abaixo). `DELETE /casamentos/{id}` e `GET /casamentos` continuam.
- Frente 061 (fatia F3), **Revisão da bolsa**. Todas as rotas abaixo exigem **sessão** (chave de
  API recebe 403, até no `GET`) e, por cookie, o cabeçalho `X-Gastoba-Requisicao: 1` nas escritas.
  Dinheiro em string; nenhum log traz valores, descrições nem ids.
  - `GET /revisao-da-bolsa`: 200 `{propostas, sem_par, confirmados}`. Cada proposta traz `chave`
    (estável), `versao` (muda quando muda o estado de qualquer transação ou lançamento dela), `tipo`
    (`compra_na_bolsa`, `venda_na_bolsa` ou `resgate_de_renda_fixa`), `data_do_pregao`, `operacoes`
    (`id`, `posicao_id`, `rotulo`, `tipo`, `data`, `quantidade`, `valor_bruto`, `custos`), `bruto` e
    `taxas` (`id`, `data`, `descricao`, `valor`, `situacao`), `diferenca` e `diferenca_de_custo`
    (dinheiro **com sinal**: conta menos operações), `confianca` (`exata` ou `precisa_escolher`),
    `motivo` e `efeitos` (`[{transacao_id, codigo}]`, com `aporte_passa_a_ser_da_posicao`,
    `taxa_deixa_de_ser_aporte`, `ganho_deixa_de_ser_renda` ou `aceita_a_pendente`). `sem_par` lista
    `{motivo, operacao_id, transacao_id, descricao, data, valor}` só para informar: `descricao` diz o que é
    ("Compra de AUVP11 (3)" ou o texto do banco), com `data` e `valor` em dinheiro decimal. `confirmados` lista as ligações
    existentes `{id, operacao_ids, vinculos, sem_aporte}`; `sem_aporte` é verdadeiro na ligação antiga
    que não registrou aporte nem resgate.
  - `POST /revisao-da-bolsa/confirmar`: corpo `{itens: [{chave, versao, operacao_ids?}]}` (1 a 50;
    `operacao_ids` só vale em `precisa_escolher`). 201 `{confirmados: [{casamento_id, chave}]}`.
    **Tudo ou nada.** Cria o casamento, aceita as transações e registra **um aporte (compra) ou resgate
    (venda ou vencimento) por operação**, ligado à posição e sem destinações; taxa e imposto não geram
    movimento. Lançamento que já estava aceito é desfeito antes, com a reversão registrada. Não muda
    saldo, destinações, alocações nem o custo das operações. Erros: 409 `revisao_desatualizada`
    (proposta inexistente ou de versão diferente), 409 `casamento_ambiguo` (falta a escolha ou ela é
    inválida), 409 `movimento_nao_desfazivel` (reaplicação ou cobertura dependente), 422 para lista vazia
    ou com mais de 50 itens.
  - `POST /casamentos/{id}/refazer`: 200 `{casamento_id, chave}`. Para ligação antiga **sem movimento**:
    desfaz e confirma de novo na mesma transação. 409 `casamento_ambiguo` se a proposta recalculada não
    for exata com as mesmas operações (nada muda); 409 `movimento_nao_desfazivel` se a ligação já tem
    aportes ou resgates (use `DELETE /casamentos/{id}`); 404 `casamento_nao_encontrado`.
  - `DELETE /casamentos/{id}` agora remove **só os movimentos que a ligação criou** e devolve todas as
    transações a pendentes; recusa (409) com reaplicação, cobertura ou destinações dependentes.
  - `POST /movimentos-de-investimento/{id}/desfazer-classificacao` e a reclassificação recusam
    transação ligada com 409 `transacao_casada` ("Desfaça a ligação na Revisão da bolsa.").
  - `GET /movimentos-de-investimento` preenche `casamento_id` quando o movimento pertence a uma ligação.
    `aportes_sem_destino` e o aviso de resgates sem destinação ignoram movimento de transação ligada.
- Venda parcial de renda fixa usa o último saldo estritamente anterior para a fração da quantidade;
  sem saldo válido mantém pendência. A fração é calculada com `Fraction` e convertida em `Decimal`
  com precisão explícita de 50 dígitos para o contrato textual existente. Resgate total mantém 1.
- Na reclassificação para `imposto` ou `custo`, a interface envia `movimento_relacionado_id`
  selecionado explicitamente entre aportes/resgates da mesma posição. Esse id é de movimento,
  diferente de `operacao_relacionada_id` dos lançamentos manuais de operação.
