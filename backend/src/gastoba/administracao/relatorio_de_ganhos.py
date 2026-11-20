"""Relatório só de leitura dos ganhos que parecem ser rendimento de título.

Imprime contagens e somas por mês: nunca descrições, ids nem tokens. O banco é aberto com
``PRAGMA query_only=ON``.
"""

from typing import TextIO

from gastoba.application.relatorio_de_ganhos_que_sao_rendimento import (
    RelatorioDeGanhosQueSaoRendimentoResultado,
)


def imprimir(relatorio: RelatorioDeGanhosQueSaoRendimentoResultado, saida: TextIO) -> None:
    print("GANHOS QUE PARECEM RENDIMENTO (somente leitura; nada foi alterado)\n", file=saida)
    if not relatorio.meses:
        print("Nenhum ganho encontrado.", file=saida)
        return
    for m in relatorio.meses:
        print(
            f"{m.mes}: {m.candidatos} candidato(s), {m.valor_dos_candidatos} | "
            f"renda {m.renda} -> sem os candidatos {m.renda_sem_candidatos}",
            file=saida,
        )
    print(f"\nTotal de candidatos: {relatorio.total_de_candidatos}", file=saida)
    print(
        "Reclassificar é decisão sua, caso a caso; meses passados só mudam com a sua aprovação.",
        file=saida,
    )
