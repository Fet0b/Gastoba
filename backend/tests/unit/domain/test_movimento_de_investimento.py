from datetime import date
from uuid import uuid4

import pytest

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import DescricaoInvalida, ValorInvalido
from gastoba.domain.movimento_de_investimento import (
    MovimentoDeInvestimento,
    OrigemDoMovimento,
    TipoDeMovimento,
)


def movimento(**mudancas):
    dados = dict(
        conta_id=uuid4(),
        tipo=TipoDeMovimento.APORTE,
        valor=Dinheiro(100000),
        descricao="Aporte na LCI",
        data=date(2026, 10, 10),
    )
    return MovimentoDeInvestimento(**{**dados, **mudancas})


def test_movimento_valido_nasce_manual_e_sem_investimento():
    m = movimento()
    assert m.origem == OrigemDoMovimento.OPEN_FINANCE
    assert m.investimento_id is None
    assert m.descricao == "Aporte na LCI"


def test_descricao_e_aparada_e_nao_pode_ser_vazia_nem_longa():
    assert movimento(descricao="  LCI  ").descricao == "LCI"
    with pytest.raises(DescricaoInvalida):
        movimento(descricao="   ")
    with pytest.raises(DescricaoInvalida):
        movimento(descricao="x" * 201)


@pytest.mark.parametrize("centavos", [0, -1])
def test_valor_precisa_ser_positivo(centavos):
    with pytest.raises(ValorInvalido):
        movimento(valor=Dinheiro(centavos))


def test_igualdade_e_pelo_id():
    m = movimento()
    assert m == movimento(id=m.id, valor=Dinheiro(1))
    assert m != movimento()


def test_lancamento_sem_origem_importada_tem_vinculo_nulo():
    lancamento = movimento()
    assert getattr(lancamento, "transacao_importada_id", "ausente") is None


def test_categoria_e_revisao_preservam_dados_financeiros():
    from gastoba.domain.categoria import CategoriaDoGasto
    from gastoba.domain.excecoes import RevisaoNaoPendente

    m = movimento(revisao_pendente=True, categoria=CategoriaDoGasto.CONFORTO)
    antes = (m.id, m.valor, m.data, m.conta_id, m.descricao)
    m.revisar(None)
    assert m.categoria is None
    assert not m.revisao_pendente
    assert (m.id, m.valor, m.data, m.conta_id, m.descricao) == antes
    with pytest.raises(RevisaoNaoPendente):
        m.revisar(None)


@pytest.mark.parametrize(
    "tipo,origem,categoria",
    [
        (TipoDeMovimento.RESGATE, OrigemDoMovimento.OPEN_FINANCE, "conforto"),
        (TipoDeMovimento.APORTE, OrigemDoMovimento.SALDO_INICIAL, "conforto"),
        (TipoDeMovimento.APORTE, OrigemDoMovimento.OPEN_FINANCE, "investimentos"),
    ],
)
def test_categoria_so_em_aporte_novo_e_ativa(tipo, origem, categoria):
    from gastoba.domain.categoria import CategoriaDoGasto
    from gastoba.domain.excecoes import CategoriaInvalida

    with pytest.raises(CategoriaInvalida):
        movimento(
            tipo=tipo,
            origem=origem,
            conta_id=None if origem == OrigemDoMovimento.SALDO_INICIAL else uuid4(),
            investimento_id=uuid4(),
            categoria=CategoriaDoGasto(categoria),
        )
