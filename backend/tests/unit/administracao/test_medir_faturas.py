import io
import json
from datetime import date

import httpx

from gastoba.administracao.medir_faturas import medir_faturas
from gastoba.infrastructure.pluggy.provedor_pluggy import ProvedorPluggy

DESCRICAO_SECRETA = "ANTHROPIC* CLAUDE SUB"
ID_SECRETO = "id-secreto-do-cartao-123"
HOJE = date(2026, 11, 5)


def _servidor(contas, faturas, transacoes, paginas_de_faturas=None):
    pedidos = []

    def responder(pedido: httpx.Request) -> httpx.Response:
        pedidos.append(pedido)
        caminho = pedido.url.path
        if caminho == "/auth":
            return httpx.Response(200, json={"apiKey": "chave"})
        if caminho == "/accounts":
            return httpx.Response(200, json={"results": contas})
        if caminho == "/bills":
            pagina = int(pedido.url.params.get("page", 1))
            return httpx.Response(
                200,
                json={
                    "total": len(faturas),
                    "totalPages": 1,
                    "page": pagina,
                    "results": faturas if pagina == 1 else [],
                },
            )
        if caminho == "/v2/transactions":
            return httpx.Response(200, json={"results": transacoes, "next": None})
        return httpx.Response(404, json={})

    provedor = ProvedorPluggy(
        "id", "segredo", cliente=httpx.Client(transport=httpx.MockTransport(responder))
    )
    return provedor, pedidos


def _cartao(**extra):
    base = {
        "id": ID_SECRETO,
        "type": "CREDIT",
        "name": "FREE VISA",
        "balance": 122.18,
        "currencyCode": "BRL",
        "creditData": {"balanceCloseDate": "2026-11-15", "balanceDueDate": "2026-11-22"},
    }
    base.update(extra)
    return base


def _transacao(id, valor, bill_id=None, **extra):
    base = {
        "id": id,
        "description": DESCRICAO_SECRETA,
        "amount": valor,
        "type": "DEBIT",
        "status": "POSTED",
        "currencyCode": "BRL",
        "date": "2026-10-20T00:00:00.000Z",
    }
    if bill_id:
        base["creditCardMetadata"] = {"billId": bill_id}
    base.update(extra)
    return base


def _medir(provedor):
    saida = io.StringIO()
    codigo = medir_faturas(provedor, ["item-1"], saida, hoje=HOJE)
    return codigo, saida.getvalue()


def test_imprime_so_contagens_e_ordens_de_grandeza():
    faturas = [{"id": "bill-1", "totalAmount": 12218, "dueDate": "2026-11-22T00:00:00.000Z"}]
    transacoes = [_transacao("t1", 118.05, "bill-1"), _transacao("t2", 4.13, "bill-1")]
    provedor, _ = _servidor([_cartao()], faturas, transacoes)

    codigo, texto = _medir(provedor)

    assert codigo == 0
    assert "faturas: 1" in texto
    assert "creditData: sim" in texto
    assert "transações: 2" in texto
    assert "com billId: 2" in texto
    # 12218 / 122.18 = 100: a Pluggy estaria mandando centavos.
    assert "10^2" in texto
    # Nada que identifique ou revele o conteúdo.
    for proibido in (DESCRICAO_SECRETA, ID_SECRETO, "bill-1", "122.18", "12218", "FREE VISA"):
        assert proibido not in texto


def test_funciona_sem_faturas_e_sem_credit_data():
    cartao = _cartao()
    del cartao["creditData"]
    provedor, _ = _servidor([cartao], [], [_transacao("t1", 10)])

    codigo, texto = _medir(provedor)

    assert codigo == 0
    assert "faturas: 0" in texto
    assert "creditData: não" in texto
    assert "com billId: 0" in texto
    assert "indisponível" in texto


def test_ignora_contas_que_nao_sao_cartao():
    provedor, pedidos = _servidor([{"id": "c", "type": "BANK", "balance": 1}], [], [])

    codigo, texto = _medir(provedor)

    assert codigo == 0
    assert "Nenhum cartão" in texto
    assert not [p for p in pedidos if p.url.path == "/bills"]


def test_so_le_nunca_escreve():
    provedor, pedidos = _servidor([_cartao()], [], [])
    _medir(provedor)
    assert {p.method for p in pedidos if p.url.path != "/auth"} == {"GET"}


def test_falha_da_pluggy_vira_codigo_1_sem_detalhes():
    def cair(pedido):
        return httpx.Response(500, json={"message": DESCRICAO_SECRETA})

    provedor = ProvedorPluggy(
        "id", "segredo", cliente=httpx.Client(transport=httpx.MockTransport(cair))
    )
    saida = io.StringIO()
    codigo = medir_faturas(provedor, ["item-1"], saida, hoje=HOJE)
    assert codigo == 1
    assert DESCRICAO_SECRETA not in saida.getvalue()
    json.dumps(saida.getvalue())
