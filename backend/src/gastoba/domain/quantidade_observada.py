import json
from decimal import Decimal, InvalidOperation

from gastoba.domain.dinheiro import Dinheiro


def quantidade_da_corretora(dados: str) -> Decimal | None:
    """Lê ``quantity`` do registro guardado da Pluggy; ``None`` se não há ou não é número."""
    try:
        bruto = json.loads(dados).get("quantity")
    except ValueError, AttributeError:
        return None
    if bruto is None or isinstance(bruto, bool):
        return None
    try:
        quantidade = Decimal(str(bruto))
    except InvalidOperation:
        return None
    return quantidade if quantidade.is_finite() and quantidade >= 0 else None


def quantidade_observada_da_posicao(tipo: str, saldo: Dinheiro, dados: str) -> Decimal | None:
    """Renda fixa usa quantidade 1 (RF-007): a ``quantity`` da Pluggy nela não é número de cotas
    (aparece como 40000 para R$ 400,00). Posição sem saldo tem quantidade 0."""
    if tipo == "FIXED_INCOME":
        return Decimal(1) if saldo.centavos > 0 else Decimal(0)
    return quantidade_da_corretora(dados)
