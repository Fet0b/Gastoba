"""``python -m dados_de_teste popular|revisar``: ver ``Docs/AMBIENTE_DE_TESTE.md``."""

import argparse
import sys
from collections.abc import Sequence
from datetime import date

from dados_de_teste.consistencia import imprimir_relatorio, revisar
from dados_de_teste.popular import (
    EMAIL_DA_DONA,
    SENHA_DE_TESTE,
    PopulacaoRecusada,
    popular,
)
from gastoba.infrastructure.configuracoes import obter_configuracoes


def _criar_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m dados_de_teste",
        description="Ambiente de teste do Gastoba: dados fictícios e revisão de consistência.",
    )
    subcomandos = parser.add_subparsers(dest="comando", required=True)
    popula = subcomandos.add_parser("popular", help="popula um banco de teste VAZIO")
    popula.add_argument("--url-banco", help="padrão: GASTOBA_URL_BANCO")
    popula.add_argument("--hoje", type=date.fromisoformat, help="AAAA-MM-DD (padrão: hoje)")
    popula.add_argument(
        "--se-vazio", action="store_true", help="se já houver dados, termina com sucesso"
    )
    revisa = subcomandos.add_parser("revisar", help="confere o banco, só por leitura")
    revisa.add_argument("--url-banco", help="padrão: GASTOBA_URL_BANCO")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    argumentos = _criar_parser().parse_args(argv)
    url = argumentos.url_banco or obter_configuracoes().url_banco
    if argumentos.comando == "popular":
        try:
            resultado = popular(url, argumentos.hoje, se_vazio=argumentos.se_vazio)
        except PopulacaoRecusada as erro:
            print(f"Recusado: {erro}", file=sys.stderr)
            return 2
        if not resultado.populou:
            print("O banco de teste já está populado; nada foi escrito.")
        else:
            print("Banco de teste populado. Linhas por tabela:")
        for tabela, total in resultado.contagens.items():
            print(f"  {tabela}: {total}")
        print(f"Entre com {EMAIL_DA_DONA} e a senha de teste {SENHA_DE_TESTE} (fictícia).")
        return 0
    resultados = revisar(url)
    imprimir_relatorio(resultados)
    return 1 if any(r.reprova for r in resultados) else 0


if __name__ == "__main__":
    sys.exit(main())
