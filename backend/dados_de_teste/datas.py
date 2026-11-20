"""Datas relativas a "hoje": os arquivos guardam "dias atrás" e este módulo as converte."""

import re
from datetime import date, timedelta
from typing import Any

CHAVE_DAS_DATAS = "_datas"
_MARCADOR_DE_PREGAO = re.compile(r"\{hoje-(\d+)\}")


def deslocar(valor: Any, hoje: date) -> Any:
    """Devolve uma cópia de ``valor`` com as datas do cenário resolvidas para ``hoje``.

    Um objeto com a chave ``_datas`` ({"campo": dias_atras}) ganha cada campo como
    ``AAAA-MM-DDT00:00:00.000Z`` (dias negativos são no futuro). Em texto, ``{hoje-N}`` vira
    ``dd/mm/aaaa`` (a data do pregão escrita nas liquidações da bolsa).
    """
    if isinstance(valor, dict):
        resolvido = {k: deslocar(v, hoje) for k, v in valor.items() if k != CHAVE_DAS_DATAS}
        for campo, dias in valor.get(CHAVE_DAS_DATAS, {}).items():
            resolvido[campo] = f"{(hoje - timedelta(days=dias)).isoformat()}T00:00:00.000Z"
        return resolvido
    if isinstance(valor, list):
        return [deslocar(item, hoje) for item in valor]
    if isinstance(valor, str):
        return _MARCADOR_DE_PREGAO.sub(
            lambda m: (hoje - timedelta(days=int(m.group(1)))).strftime("%d/%m/%Y"), valor
        )
    return valor
