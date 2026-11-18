from uuid import uuid4

import pytest

from gastoba.domain.dinheiro import LIMITE_CENTAVOS, Dinheiro
from gastoba.domain.excecoes import ValorInvalido
from gastoba.domain.renda_base import RendaBase


@pytest.mark.parametrize("centavos", [1, 500000, LIMITE_CENTAVOS])
def test_renda_base_positiva_preserva_usuario_e_valor(centavos):
    usuario_id = uuid4()

    base = RendaBase(usuario_id=usuario_id, valor=Dinheiro(centavos))

    assert base.usuario_id == usuario_id
    assert base.valor == Dinheiro(centavos)


@pytest.mark.parametrize("centavos", [0, -1, -500000])
def test_renda_base_zero_ou_negativa_e_recusada(centavos):
    with pytest.raises(ValorInvalido):
        RendaBase(usuario_id=uuid4(), valor=Dinheiro(centavos))
