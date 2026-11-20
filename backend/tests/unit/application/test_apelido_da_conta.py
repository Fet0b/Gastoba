from uuid import uuid4

import pytest

from gastoba.application.criar_conta import CriarConta
from gastoba.application.definir_apelido_da_conta import DefinirApelidoDaConta
from gastoba.application.remover_apelido_da_conta import RemoverApelidoDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ApelidoInvalido, ApelidoJaExiste, ContaNaoEncontrada

PESSOA = uuid4()
OUTRA = uuid4()


def _criar(uow, usuario, nome):
    return CriarConta(uow).executar(usuario, nome, Dinheiro(0))


def test_define_o_apelido_aparado_e_devolve_a_conta(unidade_de_trabalho):
    conta = _criar(unidade_de_trabalho, PESSOA, "Nubank")

    resultado = DefinirApelidoDaConta(unidade_de_trabalho).executar(PESSOA, conta.id, "  Casa ")

    assert resultado.apelido == "Casa"
    assert resultado.rotulo == "Casa"
    with unidade_de_trabalho as uow:
        assert uow.contas.obter(PESSOA, conta.id).apelido == "Casa"


@pytest.mark.parametrize("texto", ["", "   ", "x" * 41])
def test_recusa_apelido_invalido_sem_gravar(unidade_de_trabalho, texto):
    conta = _criar(unidade_de_trabalho, PESSOA, "Nubank")

    with pytest.raises(ApelidoInvalido):
        DefinirApelidoDaConta(unidade_de_trabalho).executar(PESSOA, conta.id, texto)

    with unidade_de_trabalho as uow:
        assert uow.contas.obter(PESSOA, conta.id).apelido is None


def test_recusa_apelido_repetido_na_mesma_pessoa_mas_aceita_em_outra(unidade_de_trabalho):
    primeira = _criar(unidade_de_trabalho, PESSOA, "A")
    segunda = _criar(unidade_de_trabalho, PESSOA, "B")
    alheia = _criar(unidade_de_trabalho, OUTRA, "C")
    caso = DefinirApelidoDaConta(unidade_de_trabalho)
    caso.executar(PESSOA, primeira.id, "Casa")

    with pytest.raises(ApelidoJaExiste):
        caso.executar(PESSOA, segunda.id, "Casa")

    assert caso.executar(OUTRA, alheia.id, "Casa").apelido == "Casa"
    # a própria conta pode regravar o mesmo apelido
    assert caso.executar(PESSOA, primeira.id, "Casa").apelido == "Casa"


def test_apelido_pode_ser_igual_ao_nome_de_outra_conta(unidade_de_trabalho):
    _criar(unidade_de_trabalho, PESSOA, "Nubank")
    outra = _criar(unidade_de_trabalho, PESSOA, "Itaú")

    resultado = DefinirApelidoDaConta(unidade_de_trabalho).executar(PESSOA, outra.id, "Nubank")

    assert resultado.apelido == "Nubank"


def test_conta_de_outra_pessoa_ou_inexistente_e_nao_encontrada(unidade_de_trabalho):
    conta = _criar(unidade_de_trabalho, PESSOA, "Nubank")

    with pytest.raises(ContaNaoEncontrada):
        DefinirApelidoDaConta(unidade_de_trabalho).executar(OUTRA, conta.id, "Casa")
    with pytest.raises(ContaNaoEncontrada):
        DefinirApelidoDaConta(unidade_de_trabalho).executar(PESSOA, uuid4(), "Casa")
    with pytest.raises(ContaNaoEncontrada):
        RemoverApelidoDaConta(unidade_de_trabalho).executar(OUTRA, conta.id)
    with unidade_de_trabalho as uow:
        assert uow.contas.obter(PESSOA, conta.id).apelido is None


def test_remover_volta_ao_nome_e_e_idempotente(unidade_de_trabalho):
    conta = _criar(unidade_de_trabalho, PESSOA, "Nubank")
    DefinirApelidoDaConta(unidade_de_trabalho).executar(PESSOA, conta.id, "Casa")

    RemoverApelidoDaConta(unidade_de_trabalho).executar(PESSOA, conta.id)
    RemoverApelidoDaConta(unidade_de_trabalho).executar(PESSOA, conta.id)

    with unidade_de_trabalho as uow:
        assert uow.contas.obter(PESSOA, conta.id).rotulo == "Nubank"
