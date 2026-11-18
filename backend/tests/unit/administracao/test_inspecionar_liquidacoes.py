import io
from datetime import date

from gastoba.administracao.inspecionar_liquidacoes import inspecionar_liquidacoes


class LeitorFalso:
    def __init__(self, transacoes_de_investimento=None):
        self.pedidos = []
        self.transacoes_de_investimento = transacoes_de_investimento

    def obter_bruto(self, caminho, parametros):
        self.pedidos.append((caminho, dict(parametros)))
        if caminho == "/accounts":
            return {"results": [{"id": "conta-secreta", "name": "BTG"}]}
        if caminho == "/investments":
            return {"results": [{"id": "inv-secreto", "name": "AUVP11", "type": "EQUITY"}]}
        if caminho.startswith("/investments/"):
            if self.transacoes_de_investimento is None:
                raise RuntimeError("sem permissão")
            return {"results": self.transacoes_de_investimento}
        return {
            "results": [
                {
                    "id": "id-secreto",
                    "description": "LIQ BOLSA - VISTA BRUTO - PREGÃO: 27/10/2026 - EXEC.: 1 - S 9",
                    "date": "2026-10-29T00:00:00.000Z",
                    "type": "DEBIT",
                    "operationType": "COMPRA",
                    "amount": -142.05,
                    "status": "POSTED",
                    "currencyCode": "BRL",
                },
                {"id": "x", "description": "PIX ENVIADO", "type": "DEBIT", "amount": -10},
            ],
            "next": None,
        }


def test_mostra_so_as_liquidacoes_com_os_campos_que_decidem_o_sentido():
    saida = io.StringIO()
    leitor = LeitorFalso()

    inspecionar_liquidacoes(leitor, ("item-1",), saida, hoje=date(2026, 11, 8), dias=60)

    texto = saida.getvalue()
    assert "LIQ BOLSA" in texto
    assert "PIX" not in texto
    for campo in ("DEBIT", "COMPRA", "-142.05", "POSTED"):
        assert campo in texto
    # Identificadores nunca vão para o terminal (Art. IV.3).
    assert "conta-secreta" not in texto and "id-secreto" not in texto and "inv-secreto" not in texto
    caminho, parametros = next(p for p in leitor.pedidos if p[0] == "/v2/transactions")
    assert parametros["dateFrom"] == "2026-09-09"


def test_mostra_as_transacoes_de_investimento_com_compra_venda_e_despesas():
    saida = io.StringIO()
    leitor = LeitorFalso(
        [
            {
                "id": "t",
                "type": "SELL",
                "movementType": "DEBIT",
                "date": "2026-10-27T00:00:00.000Z",
                "tradeDate": "2026-10-29T00:00:00.000Z",
                "quantity": 3,
                "amount": 142.05,
                "netAmount": 141.3,
                "expenses": {"stockExchangeFee": 0.13},
            }
        ]
    )

    inspecionar_liquidacoes(leitor, ("item-1",), saida, hoje=date(2026, 11, 8))

    texto = saida.getvalue()
    for campo in ("AUVP11", "SELL", "quantity=3", "netAmount=141.3", "stockExchangeFee"):
        assert campo in texto


def test_sem_permissao_nas_transacoes_de_investimento_avisa_e_segue():
    saida = io.StringIO()

    inspecionar_liquidacoes(LeitorFalso(None), ("item-1",), saida, hoje=date(2026, 11, 8))

    assert "indisponível" in saida.getvalue()
