"""``medir-faturas``: mede, só por leitura, o que a Pluggy devolve sobre faturas de cartão.

Existe porque a documentação da Pluggy não diz a unidade dos valores de ``/bills`` (reais ou
centavos) nem se o Meu Pluggy as devolve. Um erro de 100x em dinheiro é inaceitável (Art. III),
então o dono roda este comando antes de a integração existir. A saída tem só contagens e ordens de
grandeza: nunca descrições, ids, nomes nem valores exatos (Art. IV.3).
"""

from collections.abc import Sequence
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any, Protocol, TextIO

from gastoba.domain.excecoes import ProvedorIndisponivel

DIAS_PARA_TRAS = 365
POR_PAGINA = 100
LIMITE_DE_PAGINAS = 50


class LeitorBruto(Protocol):
    def obter_bruto(self, caminho: str, parametros: dict[str, Any]) -> dict[str, Any]: ...


def _numero(valor: object) -> Decimal | None:
    if isinstance(valor, bool) or valor is None:
        return None
    try:
        numero = Decimal(str(valor))
    except InvalidOperation:
        return None
    return numero if numero.is_finite() else None


def _ordem(razao: Decimal | None) -> str:
    if razao is None or razao == 0:
        return "indisponível"
    return f"10^{razao.copy_abs().adjusted()}"


def _razao(numerador: Decimal | None, denominador: Decimal | None) -> Decimal | None:
    if numerador is None or denominador is None or denominador == 0:
        return None
    return numerador / denominador


def _faturas(leitor: LeitorBruto, id_da_conta: str) -> list[dict[str, Any]]:
    faturas: list[dict[str, Any]] = []
    for pagina in range(1, LIMITE_DE_PAGINAS + 1):
        corpo = leitor.obter_bruto(
            "/bills", {"accountId": id_da_conta, "page": pagina, "pageSize": POR_PAGINA}
        )
        resultados = corpo.get("results")
        if not isinstance(resultados, list) or not resultados:
            break
        faturas.extend(r for r in resultados if isinstance(r, dict))
        total_de_paginas = corpo.get("totalPages")
        if isinstance(total_de_paginas, int) and pagina >= total_de_paginas:
            break
    return faturas


def _transacoes(leitor: LeitorBruto, id_da_conta: str, desde: date) -> list[dict[str, Any]]:
    transacoes: list[dict[str, Any]] = []
    cursor: str | None = None
    for _ in range(LIMITE_DE_PAGINAS):
        parametros: dict[str, Any] = {"accountId": id_da_conta, "dateFrom": desde.isoformat()}
        if cursor is not None:
            parametros["after"] = cursor
        corpo = leitor.obter_bruto("/v2/transactions", parametros)
        resultados = corpo.get("results")
        if isinstance(resultados, list):
            transacoes.extend(r for r in resultados if isinstance(r, dict))
        proxima = corpo.get("next")
        cursor = _cursor(proxima)
        if cursor is None:
            break
    return transacoes


def _cursor(proxima: object) -> str | None:
    if isinstance(proxima, str) and proxima:
        return proxima
    return None


def _sinal(transacao: dict[str, Any]) -> int:
    return -1 if transacao.get("type") == "CREDIT" else 1


def _medir_cartao(
    leitor: LeitorBruto, indice: int, conta: dict[str, Any], hoje: date, saida: TextIO
) -> None:
    id_da_conta = str(conta["id"])
    faturas = _faturas(leitor, id_da_conta)
    transacoes = _transacoes(leitor, id_da_conta, hoje - timedelta(days=DIAS_PARA_TRAS))

    com_metadados = 0
    com_bill_id = 0
    soma_por_fatura: dict[str, Decimal] = {}
    for transacao in transacoes:
        metadados = transacao.get("creditCardMetadata")
        if not isinstance(metadados, dict):
            continue
        com_metadados += 1
        bill_id = metadados.get("billId")
        valor = _numero(transacao.get("amount"))
        if isinstance(bill_id, str) and bill_id:
            com_bill_id += 1
            if valor is not None:
                soma_por_fatura[bill_id] = soma_por_fatura.get(bill_id, Decimal(0)) + (
                    abs(valor) * _sinal(transacao)
                )

    devido = _numero(conta.get("balance"))
    por_valor_devido = None
    mais_recente = max(faturas, key=lambda f: str(f.get("dueDate") or ""), default=None)
    if mais_recente is not None:
        por_valor_devido = _razao(_numero(mais_recente.get("totalAmount")), devido)
    ordens_das_compras = sorted(
        {
            _ordem(_razao(_numero(f.get("totalAmount")), soma_por_fatura.get(str(f.get("id")))))
            for f in faturas
            if str(f.get("id")) in soma_por_fatura
        }
    )

    tem_credit_data = isinstance(conta.get("creditData"), dict) and bool(conta["creditData"])
    print(f"Cartão {indice}:", file=saida)
    print(f"  creditData: {'sim' if tem_credit_data else 'não'}", file=saida)
    print(f"  faturas: {len(faturas)}", file=saida)
    print(
        f"  transações: {len(transacoes)} (com creditCardMetadata: {com_metadados}; "
        f"com billId: {com_bill_id})",
        file=saida,
    )
    print(
        f"  razão total da fatura mais recente ÷ valor devido: {_ordem(por_valor_devido)}",
        file=saida,
    )
    print(
        "  razão total da fatura ÷ soma das compras: "
        f"{', '.join(ordens_das_compras) if ordens_das_compras else 'indisponível'}",
        file=saida,
    )


def medir_faturas(
    leitor: LeitorBruto, ids_dos_itens: Sequence[str], saida: TextIO, *, hoje: date
) -> int:
    """Imprime a medição de cada cartão; devolve 0, ou 1 se a Pluggy falhar."""
    indice = 0
    try:
        for id_do_item in ids_dos_itens:
            corpo = leitor.obter_bruto("/accounts", {"itemId": id_do_item})
            contas = corpo.get("results")
            for conta in contas if isinstance(contas, list) else []:
                if isinstance(conta, dict) and conta.get("type") == "CREDIT" and conta.get("id"):
                    indice += 1
                    _medir_cartao(leitor, indice, conta, hoje, saida)
    except ProvedorIndisponivel as erro:
        # Só o motivo fixo (etapa e status): nunca o corpo da resposta.
        print(f"Erro: a Pluggy não respondeu como esperado ({erro.motivo}).", file=saida)
        return 1
    if indice == 0:
        print("Nenhum cartão de crédito encontrado nos itens configurados.", file=saida)
    return 0
