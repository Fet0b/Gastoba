import io
from datetime import date

import httpx

from gastoba.administracao.medir_operacoes import medir_operacoes
from gastoba.infrastructure.pluggy.provedor_pluggy import ProvedorPluggy

ID_SECRETO = "id-secreto-do-investimento-123"
DESCRICAO_SECRETA = "COMPRA SECRETA DE AUPO11"
HOJE = date(2026, 11, 10)


def _operacao(**extra):
    base = {
        "id": "op-secreta-1",
        "description": DESCRICAO_SECRETA,
        "type": "BUY",
        "movementType": "CREDIT",
        "date": "2026-11-03",
        "tradeDate": "2026-11-03",
        "quantity": 25,
        "value": 111.572,
        "amount": 2789.3,
        "expenses": {"brokerageFee": 0.82},
    }
    base.update(extra)
    return base


def _servidor(investimentos, operacoes_por_investimento, paginas=1):
    pedidos = []

    def responder(pedido: httpx.Request) -> httpx.Response:
        pedidos.append(pedido)
        caminho = pedido.url.path
        if caminho == "/auth":
            return httpx.Response(200, json={"apiKey": "chave"})
        if caminho == "/investments":
            return httpx.Response(200, json={"results": investimentos})
        if caminho.startswith("/investments/") and caminho.endswith("/transactions"):
            id_do_investimento = caminho.split("/")[2]
            pagina = int(pedido.url.params.get("page", 1))
            todas = operacoes_por_investimento.get(id_do_investimento, [])
            return httpx.Response(
                200,
                json={
                    "total": len(todas),
                    "totalPages": paginas,
                    "page": pagina,
                    "results": todas if pagina <= paginas else [],
                },
            )
        return httpx.Response(404, json={})

    provedor = ProvedorPluggy(
        "id", "segredo", cliente=httpx.Client(transport=httpx.MockTransport(responder))
    )
    return provedor, pedidos


def _medir(provedor):
    saida = io.StringIO()
    codigo = medir_operacoes(provedor, ["item-1"], saida, hoje=HOJE)
    return codigo, saida.getvalue()


def test_conta_tipos_e_campos_sem_vazar_ids_descricoes_nem_valores():
    provedor, _ = _servidor(
        [{"id": ID_SECRETO, "type": "EQUITY", "name": "AUPO11"}],
        {ID_SECRETO: [_operacao(), _operacao(id="op2", type="SELL", expenses=None)]},
    )
    codigo, saida = _medir(provedor)
    assert codigo == 0
    assert "BUY: 1" in saida and "SELL: 1" in saida
    assert "com quantity: 2" in saida
    assert "com expenses: 1" in saida
    assert "com tradeDate: 2" in saida
    for segredo in (ID_SECRETO, DESCRICAO_SECRETA, "2789", "111.572", "AUPO11", "op-secreta"):
        assert segredo not in saida


def test_mostra_o_intervalo_de_datas_e_os_tipos_de_investimento():
    provedor, _ = _servidor(
        [{"id": "a", "type": "EQUITY"}, {"id": "b", "type": "FIXED_INCOME"}],
        {"a": [_operacao(date="2026-10-01"), _operacao(id="2", date="2026-11-03")]},
    )
    _, saida = _medir(provedor)
    assert "2026-10-01" in saida and "2026-11-03" in saida
    assert "EQUITY" in saida and "FIXED_INCOME" in saida
    assert "investimentos sem operações: 1" in saida


def test_tipos_nao_documentados_aparecem_na_contagem():
    provedor, _ = _servidor(
        [{"id": "a", "type": "EQUITY"}],
        {"a": [_operacao(type="AMORTIZATION"), _operacao(id="2", type="TRANSFER")]},
    )
    _, saida = _medir(provedor)
    assert "AMORTIZATION: 1" in saida and "TRANSFER: 1" in saida


def test_percorre_todas_as_paginas():
    provedor, pedidos = _servidor([{"id": "a", "type": "EQUITY"}], {"a": [_operacao()]}, paginas=3)
    _medir(provedor)
    paginas = [p.url.params.get("page") for p in pedidos if p.url.path.endswith("/transactions")]
    assert paginas == ["1", "2", "3"]


def test_sem_investimentos_avisa_e_sai_com_zero():
    provedor, _ = _servidor([], {})
    codigo, saida = _medir(provedor)
    assert codigo == 0
    assert "Nenhum investimento" in saida


def test_falha_da_pluggy_vira_erro_sem_corpo_da_resposta():
    def responder(pedido: httpx.Request) -> httpx.Response:
        if pedido.url.path == "/auth":
            return httpx.Response(200, json={"apiKey": "chave"})
        return httpx.Response(500, text="corpo-secreto-do-erro")

    provedor = ProvedorPluggy(
        "id", "segredo", cliente=httpx.Client(transport=httpx.MockTransport(responder))
    )
    codigo, saida = _medir(provedor)
    assert codigo == 1
    assert "corpo-secreto-do-erro" not in saida
    assert "Erro" in saida


def test_so_faz_gets_na_pluggy():
    provedor, pedidos = _servidor([{"id": "a", "type": "EQUITY"}], {"a": [_operacao()]})
    _medir(provedor)
    assert {p.method for p in pedidos if p.url.path != "/auth"} == {"GET"}
