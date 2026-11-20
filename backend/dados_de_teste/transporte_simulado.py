"""A Pluggy de mentira: serve os arquivos de ``pluggy/`` no formato da API, sem rede.

Entra no ``ProvedorPluggy`` por ``httpx.Client(transport=...)``; o adaptador e a sincronização
rodam como em produção. Nenhuma chamada sai da máquina.
"""

import json
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import httpx

from dados_de_teste.datas import deslocar

PASTA_DO_CENARIO = Path(__file__).resolve().parent / "pluggy"
CHAVE_FICTICIA = "chave-ficticia-de-teste"
ITEM_DO_CENARIO = "item-exemplo-1"
# Páginas pequenas de propósito: o cursor (transações) e o ``page`` (operações) são exercitados.
TAMANHO_DA_PAGINA_DE_TRANSACOES = 25
TAMANHO_DA_PAGINA_DE_OPERACOES = 20


class PluggyDeMentira:
    """Callable para ``httpx.MockTransport``: guarda os pedidos feitos."""

    def __init__(self, hoje: date, pasta: Path = PASTA_DO_CENARIO) -> None:
        self._hoje = hoje
        self._pasta = pasta
        self.pedidos: list[httpx.Request] = []

    def __call__(self, pedido: httpx.Request) -> httpx.Response:
        self.pedidos.append(pedido)
        caminho = pedido.url.path
        if pedido.method == "POST" and caminho == "/auth":
            return httpx.Response(200, json={"apiKey": CHAVE_FICTICIA})
        if pedido.headers.get("X-API-KEY") != CHAVE_FICTICIA:
            return httpx.Response(401, json={"message": "sem chave"})
        if pedido.method != "GET":
            return httpx.Response(404, json={})
        parametros = pedido.url.params
        if caminho == "/accounts":
            return self._por_item(parametros.get("itemId"), "accounts.json")
        if caminho == "/investments":
            return self._por_item(parametros.get("itemId"), "investments.json")
        if caminho == "/v2/transactions":
            return self._transacoes(parametros.get("accountId", ""), parametros)
        if caminho == "/bills":
            return self._lista(f"bills/{parametros.get('accountId', '')}.json")
        partes = caminho.strip("/").split("/")
        if len(partes) == 3 and partes[0] == "investments" and partes[2] == "transactions":
            return self._operacoes(partes[1], parametros)
        return httpx.Response(404, json={"message": "rota nao simulada"})

    # --- respostas ---

    def _por_item(self, id_do_item: str | None, arquivo: str) -> httpx.Response:
        if id_do_item != ITEM_DO_CENARIO:
            return self._envelope([])
        return self._lista(arquivo)

    def _lista(self, arquivo: str) -> httpx.Response:
        return self._envelope(self._ler(arquivo))

    def _transacoes(self, id_da_conta: str, parametros: httpx.QueryParams) -> httpx.Response:
        itens = self._ler(f"transactions/{id_da_conta}.json")
        desde = parametros.get("dateFrom")
        if desde:
            itens = [i for i in itens if str(i.get("date", ""))[:10] >= desde]
        inicio = int(parametros.get("after", 0))
        pagina = itens[inicio : inicio + TAMANHO_DA_PAGINA_DE_TRANSACOES]
        proximo = inicio + TAMANHO_DA_PAGINA_DE_TRANSACOES
        seguinte = (
            "?" + urlencode({"accountId": id_da_conta, "after": proximo})
            if proximo < len(itens)
            else None
        )
        return self._resposta({"total": len(itens), "results": pagina, "next": seguinte})

    def _operacoes(self, id_do_investimento: str, parametros: httpx.QueryParams) -> httpx.Response:
        itens = self._ler(f"investment_transactions/{id_do_investimento}.json")
        tamanho = min(
            int(parametros.get("pageSize", TAMANHO_DA_PAGINA_DE_OPERACOES)),
            TAMANHO_DA_PAGINA_DE_OPERACOES,
        )
        pagina = int(parametros.get("page", 1))
        total_de_paginas = max(1, -(-len(itens) // tamanho))
        inicio = (pagina - 1) * tamanho
        return self._resposta(
            {
                "total": len(itens),
                "totalPages": total_de_paginas,
                "page": pagina,
                "results": itens[inicio : inicio + tamanho],
            }
        )

    def _envelope(self, itens: list[Any]) -> httpx.Response:
        return self._resposta({"total": len(itens), "totalPages": 1, "page": 1, "results": itens})

    def _resposta(self, corpo: dict[str, Any]) -> httpx.Response:
        return httpx.Response(200, content=json.dumps(corpo).encode())

    def _ler(self, arquivo: str) -> list[Any]:
        # O nome do arquivo vem do pedido: nunca sai da pasta do cenário nem sobe de nível.
        if ".." in Path(arquivo).parts:
            return []
        caminho = (self._pasta / arquivo).resolve()
        if not caminho.is_relative_to(self._pasta.resolve()) or not caminho.is_file():
            return []
        corpo = json.loads(caminho.read_text(encoding="utf-8"))
        return deslocar(corpo["results"], self._hoje)


def criar_cliente_simulado(hoje: date, pasta: Path = PASTA_DO_CENARIO) -> httpx.Client:
    """Cliente HTTP cujo transporte é a Pluggy de mentira (para ``ProvedorPluggy(cliente=...)``)."""
    return httpx.Client(transport=httpx.MockTransport(PluggyDeMentira(hoje, pasta)))
