"""``medir-operacoes-de-investimento``: mede, só por leitura, o que a Pluggy devolve de operações.

Existe porque a documentação da Pluggy não define todos os tipos de operação (``AMORTIZATION`` e
``TRANSFER``) nem garante que o Meu Pluggy devolva operações, quantidade e despesas para as posições
da pessoa. A saída tem só contagens, tipos (enumerações) e o intervalo de datas: nunca ids,
descrições, nomes nem valores (Art. IV.3). Só faz GET.
"""

from collections import Counter
from collections.abc import Sequence
from datetime import date
from typing import Any, TextIO

from gastoba.administracao.medir_faturas import LeitorBruto
from gastoba.domain.excecoes import ProvedorIndisponivel

POR_PAGINA = 500
LIMITE_DE_PAGINAS = 50


def _operacoes(leitor: LeitorBruto, id_do_investimento: str) -> list[dict[str, Any]]:
    operacoes: list[dict[str, Any]] = []
    for pagina in range(1, LIMITE_DE_PAGINAS + 1):
        corpo = leitor.obter_bruto(
            f"/investments/{id_do_investimento}/transactions",
            {"page": pagina, "pageSize": POR_PAGINA},
        )
        resultados = corpo.get("results")
        if not isinstance(resultados, list) or not resultados:
            break
        operacoes.extend(r for r in resultados if isinstance(r, dict))
        total_de_paginas = corpo.get("totalPages")
        if isinstance(total_de_paginas, int) and pagina >= total_de_paginas:
            break
    return operacoes


def _rotulo(valor: object) -> str:
    # Só enumerações curtas entram na saída; qualquer outra coisa vira "outro".
    texto = str(valor) if isinstance(valor, str) else ""
    return (
        texto
        if texto.isupper() and texto.replace("_", "").isalpha() and len(texto) <= 30
        else "outro"
    )


def _data(valor: object) -> str | None:
    if isinstance(valor, str) and len(valor) >= 10:
        try:
            return date.fromisoformat(valor[:10]).isoformat()
        except ValueError:
            return None
    return None


def medir_operacoes(
    leitor: LeitorBruto, ids_dos_itens: Sequence[str], saida: TextIO, *, hoje: date
) -> int:
    """Imprime a medição das operações de todas as posições; devolve 0, ou 1 se a Pluggy falhar."""
    tipos_de_investimento: Counter[str] = Counter()
    tipos_de_operacao: Counter[str] = Counter()
    sentidos: Counter[str] = Counter()
    operacoes_por_tipo_de_investimento: Counter[str] = Counter()
    investimentos = sem_operacoes = total = 0
    com_quantidade = com_despesas = com_data_do_pregao = 0
    datas: list[str] = []
    try:
        for id_do_item in ids_dos_itens:
            corpo = leitor.obter_bruto("/investments", {"itemId": id_do_item})
            lista = corpo.get("results")
            for investimento in lista if isinstance(lista, list) else []:
                if not isinstance(investimento, dict) or not investimento.get("id"):
                    continue
                investimentos += 1
                tipo = _rotulo(investimento.get("type"))
                tipos_de_investimento[tipo] += 1
                operacoes = _operacoes(leitor, str(investimento["id"]))
                if not operacoes:
                    sem_operacoes += 1
                total += len(operacoes)
                operacoes_por_tipo_de_investimento[tipo] += len(operacoes)
                for operacao in operacoes:
                    tipos_de_operacao[_rotulo(operacao.get("type"))] += 1
                    sentidos[_rotulo(operacao.get("movementType"))] += 1
                    com_quantidade += operacao.get("quantity") is not None
                    com_despesas += bool(operacao.get("expenses"))
                    com_data_do_pregao += operacao.get("tradeDate") is not None
                    if (dia := _data(operacao.get("date"))) is not None:
                        datas.append(dia)
    except ProvedorIndisponivel as erro:
        # Só o motivo fixo (etapa e status): nunca o corpo da resposta.
        print(f"Erro: a Pluggy não respondeu como esperado ({erro.motivo}).", file=saida)
        return 1
    if investimentos == 0:
        print("Nenhum investimento encontrado nos itens configurados.", file=saida)
        return 0
    print(
        f"Medição de {hoje.isoformat()} (só contagens; nada de ids, descrições ou valores)",
        file=saida,
    )
    print(f"investimentos: {investimentos}", file=saida)
    print(f"investimentos sem operações: {sem_operacoes}", file=saida)
    for tipo, quantidade in sorted(tipos_de_investimento.items()):
        print(
            f"  {tipo}: {quantidade} investimento(s), "
            f"{operacoes_por_tipo_de_investimento[tipo]} operação(ões)",
            file=saida,
        )
    print(f"operações: {total}", file=saida)
    print("tipos de operação:", file=saida)
    for tipo, quantidade in sorted(tipos_de_operacao.items()):
        print(f"  {tipo}: {quantidade}", file=saida)
    print("sentidos (movementType):", file=saida)
    for sentido, quantidade in sorted(sentidos.items()):
        print(f"  {sentido}: {quantidade}", file=saida)
    print(f"  com quantity: {com_quantidade}", file=saida)
    print(f"  com expenses: {com_despesas}", file=saida)
    print(f"  com tradeDate: {com_data_do_pregao}", file=saida)
    if datas:
        print(f"intervalo de datas: {min(datas)} a {max(datas)}", file=saida)
    return 0
