from dataclasses import replace
from decimal import Decimal, InvalidOperation, localcontext
from fractions import Fraction
from uuid import UUID

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.operacao import Operacao, OrigemDaOperacao, TipoDeOperacao
from gastoba.domain.portas import OperacaoExterna

RENDA_FIXA = "FIXED_INCOME"


def converter_operacao_externa(
    externa: OperacaoExterna,
    posicao_id: UUID,
    tipo_do_investimento: str,
    posicao_encerrada: bool,
    *,
    saldo_anterior: Dinheiro | None = None,
) -> Operacao | None:
    """Traduz a operação da corretora para o modelo do Gastoba; ``None`` quando não dá para
    saber o que é (nada é inventado: vira pendência para a pessoa).

    Mapeamento, conferido contra os dados reais da Pluggy (060, T045): ``BUY`` é compra, ``SELL``
    é venda, ``INTEREST`` é provento e, na renda fixa, ``TRANSFER`` de crédito é a **entrada
    (aplicação) do título**: compra de quantidade 1. A renda fixa usa quantidade 1 (RF-007);
    a ``quantity`` da Pluggy nela não é número de cotas. Venda de renda fixa só tem quantidade
    1 quando a posição foi resgatada por inteiro; resgate parcial usa a fração do saldo anterior.
    """
    renda_fixa = tipo_do_investimento == RENDA_FIXA
    tipo: TipoDeOperacao
    quantidade: Decimal
    sem_quantidade = (
        externa.quantidade is None and not renda_fixa and externa.tipo in ("BUY", "SELL")
    )
    if externa.tipo == "BUY":
        tipo, quantidade = TipoDeOperacao.COMPRA, _quantidade(externa, renda_fixa)
    elif externa.tipo == "SELL":
        tipo = TipoDeOperacao.VENDA
        if renda_fixa and not posicao_encerrada:
            if saldo_anterior is None or saldo_anterior.centavos <= 0:
                return None
            fracao = Fraction(externa.valor_bruto.centavos, saldo_anterior.centavos)
            if not 0 < fracao < 1:
                return None
            with localcontext() as contexto:
                contexto.prec = 50
                quantidade = Decimal(fracao.numerator) / Decimal(fracao.denominator)
        else:
            quantidade = _quantidade(externa, renda_fixa)
    elif externa.tipo == "INTEREST":
        tipo, quantidade = TipoDeOperacao.PROVENTO, Decimal(0)
    elif externa.tipo == "TRANSFER" and renda_fixa and externa.sentido == "CREDIT":
        tipo, quantidade = TipoDeOperacao.COMPRA, Decimal(1)
    else:
        return None
    if sem_quantidade:
        # A corretora omitiu a quantidade: nada é inventado aqui; a posição a infere depois e a
        # pessoa confirma.
        quantidade = Decimal(0)
    if quantidade is None:
        return None
    return Operacao(
        posicao_id=posicao_id,
        tipo=tipo,
        data=externa.data,
        quantidade=quantidade,
        valor_bruto=externa.valor_bruto,
        custos=externa.custos or Dinheiro(0),
        origem=OrigemDaOperacao.PLUGGY,
        id_externo=externa.id_externo,
        quantidade_estimada=sem_quantidade,
    )


def inferir_quantidade_faltante(
    operacoes: list[Operacao], observada: Decimal | None
) -> Operacao | None:
    """A quantidade da única operação da corretora que veio sem ela: o que a posição tem agora
    menos o que as demais explicam (compras e abertura somam, vendas subtraem). ``None`` com mais
    de uma incerta, sem quantidade observada ou se o resultado não for positivo. A operação
    continua estimada: só a pessoa a confirma."""
    incertas = [
        o
        for o in operacoes
        if o.origem == OrigemDaOperacao.PLUGGY
        and o.quantidade_estimada
        and o.quantidade == 0
        and o.tipo in (TipoDeOperacao.COMPRA, TipoDeOperacao.VENDA)
    ]
    if len(incertas) != 1 or observada is None:
        return None
    alvo = incertas[0]
    explicada = Decimal(0)
    for o in operacoes:
        if o.id == alvo.id:
            continue
        if o.tipo in (TipoDeOperacao.COMPRA, TipoDeOperacao.ABERTURA):
            explicada += o.quantidade
        elif o.tipo == TipoDeOperacao.VENDA:
            explicada -= o.quantidade
    inferida = observada - explicada
    if alvo.tipo == TipoDeOperacao.VENDA:
        inferida = -inferida
    if inferida <= 0:
        return None
    return replace(alvo, quantidade=inferida)


def _quantidade(externa: OperacaoExterna, renda_fixa: bool) -> Decimal | None:
    if renda_fixa:
        return Decimal(1)
    if externa.quantidade is None:
        return None
    try:
        quantidade = Decimal(externa.quantidade)
    except InvalidOperation:
        return None
    return quantidade if quantidade.is_finite() and quantidade >= 0 else None
