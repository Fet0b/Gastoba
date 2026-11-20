"""O adaptador da Pluggy contra um transporte HTTP simulado: nenhuma chamada real (Art. VI.4)."""

import json
import logging
from datetime import date

import httpx
import pytest

from gastoba.domain.conta import TipoDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ProvedorIndisponivel
from gastoba.domain.transacao_importada import SentidoDaTransacao
from gastoba.infrastructure.pluggy.provedor_pluggy import ProvedorPluggy

SEGREDO = "segredo-super-secreto"


class Servidor:
    """Pluggy de mentira: guarda os pedidos e responde com o que o teste definir."""

    def __init__(self):
        self.pedidos: list[httpx.Request] = []
        self.chave_atual = "chave-1"
        self.contas: dict[str, object] = {"results": []}
        self.investimentos: dict[str, object] = {"results": []}
        self.paginas: list[dict] = []
        self.status_da_auth = 200
        self.rejeitar_a_chave: set[str] = set()
        self.status_forcado: int | None = None
        self.corpo_bruto: bytes | None = None

    def __call__(self, pedido: httpx.Request) -> httpx.Response:
        self.pedidos.append(pedido)
        if pedido.url.path == "/auth":
            if self.status_da_auth != 200:
                return httpx.Response(self.status_da_auth, json={"message": SEGREDO})
            chave = self.chave_atual
            return httpx.Response(200, json={"apiKey": chave})
        if pedido.headers.get("X-API-KEY") in self.rejeitar_a_chave:
            return httpx.Response(401, json={})
        if self.status_forcado is not None:
            return httpx.Response(self.status_forcado, json={})
        if self.corpo_bruto is not None:
            return httpx.Response(200, content=self.corpo_bruto)
        if pedido.url.path == "/accounts":
            return httpx.Response(200, content=json.dumps(self.contas).encode())
        if pedido.url.path == "/investments":
            return httpx.Response(200, content=json.dumps(self.investimentos).encode())
        indice = int(pedido.url.params.get("after", 0))
        return httpx.Response(200, content=json.dumps(self.paginas[indice]).encode())

    def pedidos_a(self, caminho: str) -> list[httpx.Request]:
        return [p for p in self.pedidos if p.url.path == caminho]


@pytest.fixture
def servidor():
    return Servidor()


@pytest.fixture
def provedor(servidor):
    cliente = httpx.Client(transport=httpx.MockTransport(servidor))
    return ProvedorPluggy("meu-id", SEGREDO, cliente=cliente)


def transacao(id="t1", valor=25.9, tipo="DEBIT", data="2026-10-10T00:00:00.000Z", **extra):
    base = {
        "id": id,
        "description": "Mercado",
        "currencyCode": "BRL",
        "amount": valor,
        "date": data,
        "type": tipo,
        "status": "POSTED",
    }
    base.update(extra)
    return base


def pagina(*resultados, proxima=None):
    """Página por cursor: `proxima` é o índice da página seguinte (o cursor), ou None no fim."""
    seguinte = None if proxima is None else f"?accountId=conta-1&after={proxima}"
    return {"results": list(resultados), "next": seguinte}


def listar(provedor, desde=date(2026, 10, 1)):
    return provedor.listar_transacoes("conta-1", desde)


# --- autenticação ---


def test_troca_as_credenciais_por_uma_chave_e_a_envia_no_cabecalho(servidor, provedor):
    servidor.paginas = [pagina()]

    listar(provedor)

    [auth] = servidor.pedidos_a("/auth")
    assert json.loads(auth.content) == {"clientId": "meu-id", "clientSecret": SEGREDO}
    [pedido] = servidor.pedidos_a("/v2/transactions")
    assert pedido.headers["X-API-KEY"] == "chave-1"


def test_reaproveita_a_chave_nos_pedidos_seguintes(servidor, provedor):
    servidor.paginas = [pagina()]

    listar(provedor)
    listar(provedor)

    assert len(servidor.pedidos_a("/auth")) == 1


def test_renova_a_chave_ao_receber_401_e_tenta_de_novo(servidor, provedor):
    servidor.paginas = [pagina(transacao())]
    listar(provedor)
    servidor.rejeitar_a_chave = {"chave-1"}
    servidor.chave_atual = "chave-2"

    transacoes = listar(provedor)

    assert len(transacoes) == 1
    assert len(servidor.pedidos_a("/auth")) == 2
    assert servidor.pedidos_a("/v2/transactions")[-1].headers["X-API-KEY"] == "chave-2"


def test_credencial_recusada_vira_provedor_indisponivel_sem_vazar_o_segredo(servidor, provedor):
    servidor.status_da_auth = 403

    with pytest.raises(ProvedorIndisponivel) as erro:
        listar(provedor)

    assert SEGREDO not in str(erro.value)


# --- contas ---


def test_lista_a_conta_corrente_com_o_saldo_em_centavos_exatos(servidor, provedor):
    servidor.contas = {
        "results": [
            {
                "id": "c1",
                "type": "BANK",
                "name": "Conta Corrente",
                "balance": 1209.5,
                "currencyCode": "BRL",
            }
        ]
    }

    [conta] = provedor.listar_contas("item-1")

    assert (conta.id_externo, conta.nome, conta.saldo) == ("c1", "Conta Corrente", Dinheiro(120950))
    assert conta.tipo == TipoDaConta.CORRENTE
    assert servidor.pedidos_a("/accounts")[0].url.params["itemId"] == "item-1"


def test_saldo_do_cartao_e_a_divida_com_sinal_negativo(servidor, provedor):
    servidor.contas = {
        "results": [
            {"id": "k1", "type": "CREDIT", "name": "Visa", "balance": 142.41, "currencyCode": "BRL"}
        ]
    }

    [cartao] = provedor.listar_contas("item-1")

    assert cartao.saldo == Dinheiro(-14241)
    assert cartao.tipo == TipoDaConta.CARTAO


def test_ignora_conta_em_outra_moeda_e_de_tipo_desconhecido(servidor, provedor):
    servidor.contas = {
        "results": [
            {"id": "a", "type": "BANK", "name": "Dólar", "balance": 1, "currencyCode": "USD"},
            {"id": "b", "type": "OUTRO", "name": "X", "balance": 1, "currencyCode": "BRL"},
            {"id": "c", "type": "BANK", "name": "Real", "balance": 5, "currencyCode": "BRL"},
        ]
    }

    assert [c.id_externo for c in provedor.listar_contas("item-1")] == ["c"]


# --- transações ---


def test_converte_a_transacao_de_saida_e_de_entrada(servidor, provedor):
    servidor.paginas = [
        pagina(
            transacao("t1", 25.9, "DEBIT", operationType="PIX"),
            transacao("t2", 5000, "CREDIT", description="Salário"),
        )
    ]

    saida, entrada = listar(provedor)

    assert (saida.id_externo, saida.valor, saida.sentido) == (
        "t1",
        Dinheiro(2590),
        SentidoDaTransacao.SAIDA,
    )
    assert saida.tipo_de_operacao == "PIX"
    assert (entrada.valor, entrada.sentido, entrada.descricao) == (
        Dinheiro(500000),
        SentidoDaTransacao.ENTRADA,
        "Salário",
    )


def test_o_valor_e_lido_como_decimal_sem_ruido_de_float(servidor, provedor):
    servidor.corpo_bruto = (
        b'{"next":null,"results":[{"id":"t1","description":"x","currencyCode":"BRL",'
        b'"amount":0.1,"date":"2026-10-10T00:00:00.000Z","type":"DEBIT","status":"POSTED"},'
        b'{"id":"t2","description":"y","currencyCode":"BRL","amount":1234.56,'
        b'"date":"2026-10-10T00:00:00.000Z","type":"DEBIT","status":"POSTED"}]}'
    )

    primeira, segunda = listar(provedor)

    assert (primeira.valor, segunda.valor) == (Dinheiro(10), Dinheiro(123456))


def test_no_cartao_a_compra_e_saida_e_o_pagamento_da_fatura_e_entrada(servidor, provedor):
    servidor.paginas = [
        pagina(
            transacao("compra", 75.0, "DEBIT"),
            transacao("fatura", -150.0, "CREDIT", operationType="PAGAMENTO_FATURA"),
        )
    ]

    compra, fatura = listar(provedor)

    assert (compra.sentido, compra.valor) == (SentidoDaTransacao.SAIDA, Dinheiro(7500))
    assert (fatura.sentido, fatura.valor) == (SentidoDaTransacao.ENTRADA, Dinheiro(15000))
    assert fatura.tipo_de_operacao == "PAGAMENTO_FATURA"


def test_transacao_sem_o_tipo_e_ignorada_porque_o_sentido_seria_um_palpite(servidor, provedor):
    sem_tipo = transacao("t1", 75.0)
    del sem_tipo["type"]
    servidor.paginas = [pagina(sem_tipo, transacao("t2", 10))]

    assert [t.id_externo for t in listar(provedor)] == ["t2"]


def test_so_as_postadas_em_reais_com_valor_entram(servidor, provedor):
    servidor.paginas = [
        pagina(
            transacao("pendente", status="PENDING"),
            transacao("dolar", currencyCode="USD"),
            transacao("zero", 0),
            transacao("fracao", 0.001),
            transacao("boa", 10),
        )
    ]

    assert [t.id_externo for t in listar(provedor)] == ["boa"]


def test_usa_o_provider_id_como_identidade_quando_existe(servidor, provedor):
    servidor.paginas = [pagina(transacao("uuid-que-muda", providerId="nsu-123"))]

    [t] = listar(provedor)

    assert t.id_externo == "nsu-123"


def test_segue_o_cursor_ate_o_fim_com_a_data_inicial(servidor, provedor):
    servidor.paginas = [
        pagina(transacao("a"), proxima=1),
        pagina(transacao("b"), proxima=2),
        pagina(transacao("c")),
    ]

    transacoes = listar(provedor, date(2026, 9, 1))

    assert [t.id_externo for t in transacoes] == ["a", "b", "c"]
    pedidos = servidor.pedidos_a("/v2/transactions")
    assert [p.url.params.get("after") for p in pedidos] == [None, "1", "2"]
    assert {p.url.params["dateFrom"] for p in pedidos} == {"2026-09-01"}
    assert {p.url.params["accountId"] for p in pedidos} == {"conta-1"}


def test_meia_noite_utc_e_o_proprio_dia_e_outro_horario_vai_para_brasilia(servidor, provedor):
    servidor.paginas = [
        pagina(
            transacao("dia", data="2026-10-12T00:00:00.000Z"),
            transacao("noite", data="2026-10-13T01:30:00.000Z"),
        )
    ]

    dia, noite = listar(provedor)

    assert dia.data == date(2026, 10, 12)
    assert noite.data == date(2026, 10, 12)


# --- falhas ---


@pytest.mark.parametrize("status", [400, 404, 500, 503])
def test_status_de_erro_vira_provedor_indisponivel(servidor, provedor, status):
    servidor.status_forcado = status

    with pytest.raises(ProvedorIndisponivel):
        listar(provedor)
    with pytest.raises(ProvedorIndisponivel):
        provedor.listar_contas("item-1")


@pytest.mark.parametrize("corpo", [b"nao e json", b"[1, 2]", b'{"results": "x"}'])
def test_resposta_malformada_vira_provedor_indisponivel(servidor, provedor, corpo):
    servidor.corpo_bruto = corpo

    with pytest.raises(ProvedorIndisponivel):
        listar(provedor)


def test_erro_de_rede_vira_provedor_indisponivel_sem_vazar_url_nem_segredo():
    def cair(_pedido):
        raise httpx.ConnectError("falhou em https://api.pluggy.ai/accounts?itemId=item-secreto")

    provedor = ProvedorPluggy(
        "id", SEGREDO, cliente=httpx.Client(transport=httpx.MockTransport(cair))
    )

    with pytest.raises(ProvedorIndisponivel) as erro:
        provedor.listar_contas("item-secreto")

    assert "item-secreto" not in str(erro.value)
    assert SEGREDO not in str(erro.value)
    assert erro.value.__cause__ is None


# --- motivo da falha (diagnóstico seguro) ---


def test_motivo_da_credencial_recusada_traz_a_etapa_e_o_status(servidor, provedor):
    servidor.status_da_auth = 403

    with pytest.raises(ProvedorIndisponivel) as erro:
        provedor.listar_contas("item-1")

    assert erro.value.motivo == "autenticacao http 403"


def test_motivo_da_falha_nas_contas_traz_a_etapa_e_o_status(servidor, provedor):
    servidor.status_forcado = 404

    with pytest.raises(ProvedorIndisponivel) as erro:
        provedor.listar_contas("item-1")

    assert erro.value.motivo == "contas http 404"


def test_motivo_da_falha_nas_transacoes_traz_a_etapa_e_o_status(servidor, provedor):
    servidor.status_forcado = 500

    with pytest.raises(ProvedorIndisponivel) as erro:
        listar(provedor)

    assert erro.value.motivo == "transacoes http 500"


def test_motivo_da_resposta_malformada(servidor, provedor):
    servidor.corpo_bruto = b"nao e json"

    with pytest.raises(ProvedorIndisponivel) as erro:
        provedor.listar_contas("item-1")

    assert erro.value.motivo == "contas resposta invalida"


def test_motivo_do_erro_de_rede_traz_so_o_nome_da_classe():
    def cair(_pedido):
        raise httpx.ConnectError("falhou em https://api.pluggy.ai/accounts?itemId=item-secreto")

    provedor = ProvedorPluggy(
        "id", SEGREDO, cliente=httpx.Client(transport=httpx.MockTransport(cair))
    )

    with pytest.raises(ProvedorIndisponivel) as erro:
        provedor.listar_contas("item-secreto")

    assert erro.value.motivo == "autenticacao rede ConnectError"
    assert "item-secreto" not in erro.value.motivo
    assert SEGREDO not in erro.value.motivo


# --- contas descartadas: nunca em silêncio ---


def test_conta_descartada_e_contada_por_motivo_no_log_sem_dados_pessoais(
    servidor, provedor, caplog
):
    servidor.contas = {
        "results": [
            {
                "id": "c-dolar",
                "name": "Conta Dolar",
                "type": "BANK",
                "balance": 1,
                "currencyCode": "USD",
            },
            {
                "id": "c-sem-saldo",
                "name": "Sem Saldo",
                "type": "BANK",
                "balance": None,
                "currencyCode": "BRL",
            },
            {
                "id": "c-estranha",
                "name": "Estranha",
                "type": "OUTRO",
                "balance": 1,
                "currencyCode": "BRL",
            },
        ]
    }

    with caplog.at_level(logging.WARNING):
        contas = provedor.listar_contas("item-1")

    assert contas == []
    texto = caplog.text
    assert "moeda=1" in texto and "sem_saldo=1" in texto and "tipo=1" in texto
    for proibido in ("c-dolar", "Conta Dolar", "item-1"):
        assert proibido not in texto


def test_sem_descarte_nada_e_registrado_no_log(servidor, provedor, caplog):
    servidor.contas = {
        "results": [
            {"id": "c1", "name": "Corrente", "type": "BANK", "balance": 10.5, "currencyCode": "BRL"}
        ]
    }

    with caplog.at_level(logging.WARNING):
        provedor.listar_contas("item-1")

    assert caplog.text == ""


# --- 068: final do número da conta ---


def _conta_com_numero(**extra):
    return {
        "id": "c1",
        "type": "BANK",
        "name": "Conta Corrente",
        "balance": 10,
        "currencyCode": "BRL",
        **extra,
    }


@pytest.mark.parametrize(
    ("numero", "final"),
    [
        ("0001/12345-0", "3450"),
        ("1234", "1234"),
        ("**** 9876", "9876"),
        ("12", None),
        ("", None),
        (None, None),
        (123456789, None),
        ({"x": 1}, None),
    ],
)
def test_le_o_final_do_numero_da_conta_e_o_ruim_nao_descarta_a_conta(
    servidor, provedor, caplog, numero, final
):
    servidor.contas = {"results": [_conta_com_numero(number=numero)]}

    with caplog.at_level(logging.DEBUG):
        [conta] = provedor.listar_contas("item-1")

    assert conta.final_do_numero == final
    assert [r for r in caplog.records if r.name.startswith("gastoba")] == []


def test_conta_sem_o_campo_number_fica_sem_final(servidor, provedor):
    servidor.contas = {"results": [_conta_com_numero()]}

    [conta] = provedor.listar_contas("item-1")

    assert conta.final_do_numero is None


def test_o_numero_inteiro_nao_vai_para_a_conta_nem_para_o_log(servidor, provedor, caplog):
    servidor.contas = {"results": [_conta_com_numero(number="0001/12345-0")]}

    with caplog.at_level(logging.DEBUG):
        [conta] = provedor.listar_contas("item-1")

    assert "12345" not in repr(conta)
    assert "12345" not in caplog.text


# --- investimentos ---


def investimento(id="i1", **extra):
    base = {
        "id": id,
        "name": "CDB Banco X",
        "type": "FIXED_INCOME",
        "subtype": "CDB",
        "currencyCode": "BRL",
        "balance": 2000.10,
        "amount": 2500,
        "amountOriginal": 1000,
        "amountProfit": None,
        "dueDate": "2030-07-19T18:27:41.802Z",
        "status": "ACTIVE",
        "owner": "Fulano",
    }
    base.update(extra)
    return base


def test_lista_o_investimento_com_o_saldo_em_centavos_e_guarda_o_registro_inteiro(
    servidor, provedor
):
    servidor.investimentos = {"results": [investimento()]}

    [item] = provedor.listar_investimentos("item-1")

    assert item.id_externo == "i1"
    assert item.nome == "CDB Banco X"
    assert (item.tipo, item.subtipo) == ("FIXED_INCOME", "CDB")
    assert item.saldo == Dinheiro(200010)
    dados = json.loads(item.dados)
    # Nada é descartado: campos que o Gastoba ainda não usa ficam guardados.
    assert dados["amountOriginal"] == 1000
    assert dados["balance"] == "2000.1"
    assert dados["dueDate"] == "2030-07-19T18:27:41.802Z"
    assert dados["owner"] == "Fulano"
    assert servidor.pedidos_a("/investments")[0].url.params["itemId"] == "item-1"


def test_le_o_valor_aplicado_e_o_lucro_arredondando_ao_centavo(servidor, provedor):
    servidor.investimentos = {
        "results": [
            investimento("i1", amountOriginal=1000, amountProfit=43.214),
            investimento("i2", amountOriginal=None, amountProfit=-10),
            investimento("i3", amountOriginal="texto", amountProfit=True),
        ]
    }

    primeiro, segundo, terceiro = provedor.listar_investimentos("item-1")

    assert (primeiro.valor_aplicado, primeiro.rendimento) == (Dinheiro(100000), Dinheiro(4321))
    assert (segundo.valor_aplicado, segundo.rendimento) == (None, Dinheiro(-1000))
    # Um campo informativo ruim não derruba a posição: só fica sem o valor.
    assert (terceiro.valor_aplicado, terceiro.rendimento) == (None, None)
    assert terceiro.saldo == Dinheiro(200010)


def test_investimento_em_outra_moeda_ou_sem_saldo_e_contado_e_nao_levanta(
    servidor, provedor, caplog
):
    servidor.investimentos = {
        "results": [
            investimento("i1"),
            investimento("i2", currencyCode="USD"),
            investimento("i3", balance=None),
            investimento("i4", type=None),
        ]
    }

    with caplog.at_level(logging.WARNING):
        itens = provedor.listar_investimentos("item-1")

    assert [i.id_externo for i in itens] == ["i1"]
    assert "moeda=1" in caplog.text and "sem_saldo=1" in caplog.text and "tipo=1" in caplog.text


def test_falha_nos_investimentos_traz_a_etapa_e_o_status(servidor, provedor):
    servidor.status_forcado = 404

    with pytest.raises(ProvedorIndisponivel) as erro:
        provedor.listar_investimentos("item-1")

    assert erro.value.motivo == "investimentos http 404"


def test_lista_as_operacoes_de_um_investimento_com_custos_e_sentido():
    import httpx

    from gastoba.infrastructure.pluggy.provedor_pluggy import ProvedorPluggy

    pedidos = []

    def responder(pedido: httpx.Request) -> httpx.Response:
        pedidos.append(pedido)
        if pedido.url.path == "/auth":
            return httpx.Response(200, json={"apiKey": "chave"})
        return httpx.Response(
            200,
            json={
                "total": 2,
                "totalPages": 1,
                "page": 1,
                "results": [
                    {
                        "id": "op1",
                        "type": "SELL",
                        "movementType": "DEBIT",
                        "date": "2026-10-26T00:00:00.000Z",
                        "tradeDate": "2026-10-26T00:00:00.000Z",
                        "quantity": 120,
                        "amount": 148.03,
                        "netAmount": 143.13,
                        "expenses": {"incomeTax": 4.9, "iof": 0},
                    },
                    {"id": "ruim", "type": "BUY", "date": "sem-data", "amount": 1},
                ],
            },
        )

    provedor = ProvedorPluggy(
        "id", "segredo", cliente=httpx.Client(transport=httpx.MockTransport(responder))
    )
    (operacao,) = provedor.listar_operacoes_do_investimento("inv-1")
    assert operacao.id_externo == "op1"
    assert operacao.tipo == "SELL" and operacao.sentido == "DEBIT"
    assert operacao.valor_bruto.centavos == 14803
    assert operacao.custos.centavos == 490
    assert operacao.data_do_pregao.isoformat() == "2026-10-26"
    caminhos = [p.url.path for p in pedidos if p.url.path != "/auth"]
    assert caminhos == ["/investments/inv-1/transactions"]
    assert {p.method for p in pedidos if p.url.path != "/auth"} == {"GET"}


def test_custodia_da_pluggy_e_a_liquidacao_do_dia_e_nao_entra_no_custo():
    """Medido em produção (2026-11-11): `custodyFee` repete o líquido da liquidação do dia (-142,08
    em duas compras de R$ 17,40 e R$ 124,65), não é custo da operação."""
    import httpx

    from gastoba.infrastructure.pluggy.provedor_pluggy import ProvedorPluggy

    def responder(pedido: httpx.Request) -> httpx.Response:
        if pedido.url.path == "/auth":
            return httpx.Response(200, json={"apiKey": "chave"})
        return httpx.Response(
            200,
            json={
                "total": 1,
                "totalPages": 1,
                "page": 1,
                "results": [
                    {
                        "id": "op1",
                        "type": "BUY",
                        "movementType": "CREDIT",
                        "date": "2026-11-03T00:00:00.000Z",
                        "quantity": 3,
                        "amount": 124.65,
                        "expenses": {
                            "settlementFee": -0.03,
                            "stockExchangeFee": -0.02,
                            "custodyFee": -142.08,
                        },
                    }
                ],
            },
        )

    provedor = ProvedorPluggy(
        "id", "segredo", cliente=httpx.Client(transport=httpx.MockTransport(responder))
    )
    (operacao,) = provedor.listar_operacoes_do_investimento("inv-1")
    assert operacao.custos.centavos == 5


def test_operacao_sem_quantity_da_pluggy_chega_sem_quantidade_e_nao_como_zero():
    import httpx

    from gastoba.infrastructure.pluggy.provedor_pluggy import ProvedorPluggy

    def responder(pedido: httpx.Request) -> httpx.Response:
        if pedido.url.path == "/auth":
            return httpx.Response(200, json={"apiKey": "chave"})
        return httpx.Response(
            200,
            json={
                "total": 1,
                "totalPages": 1,
                "page": 1,
                "results": [
                    {
                        "id": "op1",
                        "type": "BUY",
                        "date": "2026-10-21T00:00:00.000Z",
                        "quantity": None,
                        "amount": 455.28,
                        "value": None,
                        "expenses": None,
                    }
                ],
            },
        )

    provedor = ProvedorPluggy(
        "id", "segredo", cliente=httpx.Client(transport=httpx.MockTransport(responder))
    )
    (operacao,) = provedor.listar_operacoes_do_investimento("inv-1")
    assert operacao.quantidade is None


def _caminho_pedido_para_o_investimento(id_do_investimento: str) -> str:
    pedidos: list[httpx.Request] = []

    def responder(pedido: httpx.Request) -> httpx.Response:
        pedidos.append(pedido)
        if pedido.url.path == "/auth":
            return httpx.Response(200, json={"apiKey": "chave"})
        return httpx.Response(200, json={"results": [], "totalPages": 1})

    provedor = ProvedorPluggy(
        "id", "segredo", cliente=httpx.Client(transport=httpx.MockTransport(responder))
    )
    provedor.listar_operacoes_do_investimento(id_do_investimento)
    (pedido,) = [p for p in pedidos if p.url.raw_path != b"/auth"]
    return pedido.url.raw_path.decode()


def test_id_da_posicao_com_barra_e_interrogacao_vira_um_unico_trecho_do_caminho():
    caminho = _caminho_pedido_para_o_investimento("../accounts?x=1")

    assert caminho.startswith("/investments/..%2Faccounts%3Fx%3D1/transactions")


def test_id_da_posicao_em_formato_uuid_mantem_o_caminho_de_sempre():
    uuid = "3f2b8c1e-5a4d-4e7b-9c0a-1d2e3f4a5b6c"

    caminho = _caminho_pedido_para_o_investimento(uuid)

    assert caminho.startswith(f"/investments/{uuid}/transactions")
