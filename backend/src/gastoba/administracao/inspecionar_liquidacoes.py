"""``inspecionar-liquidacoes``: mostra, só por leitura, como a Pluggy descreve as liquidações.

Existe para responder uma dúvida de sentido: uma venda chega como ``CREDIT`` ou como ``DEBIT``? O
importador confia no ``type`` da Pluggy, então é preciso ver o que o banco manda. A saída vai ao
terminal de quem roda (nunca ao log) e traz só os campos que decidem o sentido; identificadores de
conta e de transação nunca são impressos (Art. IV.3).
"""

from collections.abc import Sequence
from datetime import date, timedelta
from typing import Any, Protocol, TextIO

from gastoba.domain.natureza_do_movimento import NaturezaDoMovimento, natureza_da_descricao

DIAS_PARA_TRAS = 60
LIMITE_DE_PAGINAS = 50
CAMPOS = ("date", "type", "operationType", "status", "amount", "currencyCode", "description")
CAMPOS_DO_INVESTIMENTO = (
    "type",
    "movementType",
    "date",
    "tradeDate",
    "quantity",
    "amount",
    "netAmount",
    "expenses",
)


class LeitorBruto(Protocol):
    def obter_bruto(self, caminho: str, parametros: dict[str, Any]) -> dict[str, Any]: ...


def _transacoes(leitor: LeitorBruto, id_da_conta: str, desde: date) -> list[dict[str, Any]]:
    achadas: list[dict[str, Any]] = []
    cursor: str | None = None
    for _ in range(LIMITE_DE_PAGINAS):
        parametros: dict[str, Any] = {"accountId": id_da_conta, "dateFrom": desde.isoformat()}
        if cursor is not None:
            parametros["after"] = cursor
        corpo = leitor.obter_bruto("/v2/transactions", parametros)
        resultados = corpo.get("results")
        if not isinstance(resultados, list):
            break
        achadas.extend(r for r in resultados if isinstance(r, dict))
        proximo = corpo.get("next")
        cursor = proximo if isinstance(proximo, str) and proximo else None
        if cursor is None:
            break
    return achadas


def inspecionar_liquidacoes(
    leitor: LeitorBruto,
    ids_dos_itens: Sequence[str],
    saida: TextIO,
    *,
    hoje: date,
    dias: int = DIAS_PARA_TRAS,
) -> None:
    desde = hoje - timedelta(days=dias)
    total = 0
    for id_do_item in ids_dos_itens:
        contas = leitor.obter_bruto("/accounts", {"itemId": id_do_item}).get("results")
        for conta in contas if isinstance(contas, list) else []:
            id_da_conta = conta.get("id") if isinstance(conta, dict) else None
            if not isinstance(id_da_conta, str):
                continue
            for dado in _transacoes(leitor, id_da_conta, desde):
                descricao = dado.get("description")
                if not isinstance(descricao, str):
                    continue
                if natureza_da_descricao(descricao) not in (
                    NaturezaDoMovimento.LIQUIDACAO_DE_BOLSA,
                    NaturezaDoMovimento.IMPOSTO_OU_TAXA,
                ):
                    continue
                total += 1
                linha = " | ".join(f"{campo}={dado.get(campo)!r}" for campo in CAMPOS)
                print(linha, file=saida)
    print(f"\n{total} transação(ões) de liquidação, imposto ou taxa desde {desde}.", file=saida)
    inspecionar_transacoes_de_investimento(leitor, ids_dos_itens, saida)


def inspecionar_transacoes_de_investimento(
    leitor: LeitorBruto, ids_dos_itens: Sequence[str], saida: TextIO
) -> None:
    """``GET /investments/{id}/transactions``: compra (BUY), venda (SELL), imposto (TAX) e o resto,
    por posição. Pode não estar habilitado para o item; a falha é avisada e não interrompe."""
    print("\nTransações de investimento (compra, venda, imposto):", file=saida)
    for id_do_item in ids_dos_itens:
        posicoes = leitor.obter_bruto("/investments", {"itemId": id_do_item}).get("results")
        for posicao in posicoes if isinstance(posicoes, list) else []:
            if not isinstance(posicao, dict) or not isinstance(posicao.get("id"), str):
                continue
            nome = posicao.get("name")
            try:
                corpo = leitor.obter_bruto(
                    f"/investments/{posicao['id']}/transactions", {"pageSize": 500}
                )
            except Exception as erro:  # noqa: BLE001 - diagnóstico: qualquer falha é só avisada
                print(f"  {nome}: indisponível ({type(erro).__name__})", file=saida)
                continue
            resultados = corpo.get("results")
            for dado in resultados if isinstance(resultados, list) else []:
                if isinstance(dado, dict):
                    campos = " | ".join(f"{c}={dado.get(c)!r}" for c in CAMPOS_DO_INVESTIMENTO)
                    print(f"  {nome}: {campos}", file=saida)
