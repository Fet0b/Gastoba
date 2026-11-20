"""Relatório só de leitura da migração dos investimentos (antes × depois).

Imprime no terminal, sem identificadores, tokens nem descrições de transações. O banco é aberto
com ``PRAGMA query_only=ON``: nada pode ser gravado por este comando.
"""

import json
from decimal import Decimal
from typing import TextIO

from sqlalchemy import event

from gastoba.application.planejar_migracao_de_investimentos import RelatorioDaMigracao
from gastoba.domain.dinheiro import Dinheiro


def somente_leitura(engine) -> None:
    @event.listens_for(engine, "connect")
    def _so_leitura(conexao, _registro) -> None:
        cursor = conexao.cursor()
        cursor.execute("PRAGMA query_only=ON")
        cursor.close()


def _valor(v):
    if isinstance(v, Dinheiro):
        return str(v.em_reais)
    if isinstance(v, Decimal):
        return str(v)
    return v


def para_json(relatorio: RelatorioDaMigracao) -> str:
    itens = []
    for i in relatorio.itens:
        itens.append(
            {
                "nome": i.nome,
                "tipo": i.tipo,
                "saldo": _valor(i.saldo),
                "quantidade_observada": _valor(i.quantidade_observada),
                "aplicado_antes": _valor(i.aplicado_antes),
                "aplicado_depois": _valor(i.aplicado_depois),
                "rentabilidade_antes": i.rentabilidade_antes,
                "rentabilidade_depois": i.rentabilidade_depois,
                "abertura": None
                if i.abertura is None
                else {
                    "valor": _valor(i.abertura.valor),
                    "data": i.abertura.data.isoformat(),
                    "quantidade": _valor(i.abertura.quantidade),
                    "estimada": i.abertura.estimada,
                },
                "caixinhas": [
                    {
                        "tag": c.tag.valor if c.tag else None,
                        "antes": _valor(c.antes),
                        "depois": _valor(c.depois),
                    }
                    for c in i.caixinhas
                ],
                "diferenca_maxima_de_caixinha": _valor(i.diferenca_maxima_de_caixinha),
                "pendencias": list(i.pendencias),
            }
        )
    return json.dumps(
        {
            "itens": itens,
            "destaques": [
                {"nome": d.nome, "encontrado": d.encontrado} for d in relatorio.destaques
            ],
            "decisoes_pendentes": relatorio.decisoes_pendentes,
            "metas_passadas_alteradas": relatorio.metas_passadas_alteradas,
        },
        ensure_ascii=False,
        indent=2,
    )


def imprimir(relatorio: RelatorioDaMigracao, saida: TextIO) -> None:
    print("SIMULAÇÃO DA MIGRAÇÃO (somente leitura; nada foi gravado)\n", file=saida)
    for d in relatorio.destaques:
        marca = "encontrado" if d.encontrado else "NÃO encontrado no banco"
        print(f"Caso {d.nome}: {marca}", file=saida)
    print(f"\nInvestimentos: {len(relatorio.itens)}", file=saida)
    for i in relatorio.itens:
        print(f"\n== {i.nome} ({i.tipo})", file=saida)
        print(f"  saldo: {i.saldo}", file=saida)
        print(
            f"  quantidade observada: {_valor(i.quantidade_observada) or 'desconhecida'}",
            file=saida,
        )
        print(
            f"  valor aplicado: antes {i.aplicado_antes or '-'} | depois {i.aplicado_depois}",
            file=saida,
        )
        print(
            f"  rentabilidade: antes {i.rentabilidade_antes or '-'} | depois "
            f"{i.rentabilidade_depois or 'ausente (histórico incompleto)'}",
            file=saida,
        )
        if i.abertura:
            print(
                f"  abertura: {i.abertura.valor} em {i.abertura.data.isoformat()}, "
                f"quantidade {_valor(i.abertura.quantidade) or '?'} (estimada, confirme)",
                file=saida,
            )
        for c in i.caixinhas:
            print(
                f"  caixinha {c.tag.valor if c.tag else '(sem destinação)'}: "
                f"{c.antes} -> {c.depois}",
                file=saida,
            )
        print(f"  maior diferença de caixinha: {i.diferenca_maxima_de_caixinha}", file=saida)
        for p in i.pendencias:
            print(f"  pendência: {p}", file=saida)
    print(
        f"\nDecisões pendentes (aberturas a confirmar): {relatorio.decisoes_pendentes}", file=saida
    )
    print(f"Metas de meses passados alteradas: {relatorio.metas_passadas_alteradas}", file=saida)
