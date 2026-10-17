"""O adaptador da Pluggy contra um transporte HTTP simulado: nenhuma chamada real (Art. VI.4)."""

import json
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
        pagina = int(pedido.url.params["page"])
        return httpx.Response(200, content=json.dumps(self.paginas[pagina - 1]).encode())

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


def pagina(*resultados, total_de_paginas=1, numero=1):
    return {
        "total": len(resultados),
        "totalPages": total_de_paginas,
        "page": numero,
        "results": list(resultados),
    }


def listar(provedor, desde=date(2026, 10, 1)):
    return provedor.listar_transacoes("conta-1", desde)


# --- autenticação ---


def test_troca_as_credenciais_por_uma_chave_e_a_envia_no_cabecalho(servidor, provedor):
    servidor.paginas = [pagina()]

    listar(provedor)

    [auth] = servidor.pedidos_a("/auth")
    assert json.loads(auth.content) == {"clientId": "meu-id", "clientSecret": SEGREDO}
    [pedido] = servidor.pedidos_a("/transactions")
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
    assert servidor.pedidos_a("/transactions")[-1].headers["X-API-KEY"] == "chave-2"


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
        b'{"totalPages":1,"results":[{"id":"t1","description":"x","currencyCode":"BRL",'
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


def test_pagina_ate_o_total_de_paginas_com_500_por_pagina(servidor, provedor):
    servidor.paginas = [
        pagina(transacao("a"), total_de_paginas=3, numero=1),
        pagina(transacao("b"), total_de_paginas=3, numero=2),
        pagina(transacao("c"), total_de_paginas=3, numero=3),
    ]

    transacoes = listar(provedor, date(2026, 9, 1))

    assert [t.id_externo for t in transacoes] == ["a", "b", "c"]
    pedidos = servidor.pedidos_a("/transactions")
    assert [p.url.params["page"] for p in pedidos] == ["1", "2", "3"]
    assert {p.url.params["pageSize"] for p in pedidos} == {"500"}
    assert {p.url.params["from"] for p in pedidos} == {"2026-09-01"}
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
