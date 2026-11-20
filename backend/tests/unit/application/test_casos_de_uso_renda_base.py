import copy
from uuid import uuid4

import pytest

from gastoba.application.consultar_renda_base import ConsultarRendaBase
from gastoba.application.definir_renda_base import DefinirRendaBase
from gastoba.application.remover_renda_base import RemoverRendaBase
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ValorInvalido


def test_consulta_sem_base_nao_grava(unidade_de_trabalho):
    assert ConsultarRendaBase(unidade_de_trabalho).executar(uuid4()) is None
    assert unidade_de_trabalho.commits == 0


def test_define_altera_e_consulta_sem_mexer_nos_registros(unidade_de_trabalho, semear_conta):
    conta = semear_conta(saldo=Dinheiro(12345))
    antes = copy.deepcopy(unidade_de_trabalho.confirmado)
    definir = DefinirRendaBase(unidade_de_trabalho)
    consultar = ConsultarRendaBase(unidade_de_trabalho)

    assert definir.executar(conta.usuario_id, Dinheiro(500000)) == Dinheiro(500000)
    assert consultar.executar(conta.usuario_id) == Dinheiro(500000)
    assert definir.executar(conta.usuario_id, Dinheiro(600000)) == Dinheiro(600000)
    assert consultar.executar(conta.usuario_id) == Dinheiro(600000)
    assert consultar.executar(uuid4()) is None
    assert unidade_de_trabalho.confirmado.rendas_base == {conta.usuario_id: Dinheiro(600000)}
    assert unidade_de_trabalho.confirmado.contas[conta.id].saldo == Dinheiro(12345)
    antes.rendas_base[conta.usuario_id] = Dinheiro(600000)
    assert unidade_de_trabalho.confirmado == antes
    assert unidade_de_trabalho.commits == 2


@pytest.mark.parametrize("centavos", [0, -1])
def test_valor_invalido_nao_substitui_base_nem_confirma(unidade_de_trabalho, centavos):
    usuario_id = uuid4()
    unidade_de_trabalho.confirmado.rendas_base[usuario_id] = Dinheiro(500000)

    with pytest.raises(ValorInvalido):
        DefinirRendaBase(unidade_de_trabalho).executar(usuario_id, Dinheiro(centavos))

    assert unidade_de_trabalho.confirmado.rendas_base == {usuario_id: Dinheiro(500000)}
    assert unidade_de_trabalho.commits == 0


def test_remover_e_idempotente_e_preserva_base_alheia(unidade_de_trabalho):
    usuario_id, alheio = uuid4(), uuid4()
    unidade_de_trabalho.confirmado.rendas_base.update(
        {usuario_id: Dinheiro(500000), alheio: Dinheiro(700000)}
    )
    remover = RemoverRendaBase(unidade_de_trabalho)

    remover.executar(usuario_id)
    remover.executar(usuario_id)

    assert unidade_de_trabalho.confirmado.rendas_base == {alheio: Dinheiro(700000)}
    assert unidade_de_trabalho.commits == 2
