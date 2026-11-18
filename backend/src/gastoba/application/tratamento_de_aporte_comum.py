from gastoba.domain.excecoes import MesclaInvalida
from gastoba.domain.movimento_de_investimento import (
    MovimentoDeInvestimento,
    OrigemDoMovimento,
    TipoDeMovimento,
)


def exigir_aporte_sem_investimento(movimento: MovimentoDeInvestimento) -> None:
    if (
        movimento.tipo != TipoDeMovimento.APORTE
        or movimento.investimento_id is not None
        or movimento.origem == OrigemDoMovimento.SALDO_INICIAL
    ):
        raise MesclaInvalida("Só aportes sem investimento podem ser mesclados ou excluídos.")


def valores_originais(movimento: MovimentoDeInvestimento) -> dict:
    """O que restaura o aporte idêntico: nada é apagado, mas o original fica registrado."""
    return {
        "valor_centavos": movimento.valor.centavos,
        "data": movimento.data.isoformat(),
        "conta_id": str(movimento.conta_id) if movimento.conta_id else None,
        "transacao_importada_id": (
            str(movimento.transacao_importada_id) if movimento.transacao_importada_id else None
        ),
    }
