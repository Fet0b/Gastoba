from uuid import uuid4

import pytest

from gastoba.application.criar_conta import CriarConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ContaJaExiste, NomeInvalido

USUARIO_ID = uuid4()


@pytest.mark.parametrize("centavos", [10000, 0, -5000])
def test_cria_conta_com_saldo_inicial_e_confirma(unidade_de_trabalho, centavos):
    conta = CriarConta(unidade_de_trabalho).executar(USUARIO_ID, "Nubank", Dinheiro(centavos))

    assert conta.usuario_id == USUARIO_ID
    assert conta.nome == "Nubank"
    assert conta.saldo == Dinheiro(centavos)
    assert unidade_de_trabalho.commits == 1
    confirmada = unidade_de_trabalho.confirmado.contas[conta.id]
    assert confirmada.nome == "Nubank"
    assert confirmada.saldo == Dinheiro(centavos)


def test_nome_repetido_levanta_conta_ja_existe_sem_segunda_conta(unidade_de_trabalho):
    caso_de_uso = CriarConta(unidade_de_trabalho)
    caso_de_uso.executar(USUARIO_ID, "Nubank", Dinheiro(0))

    with pytest.raises(ContaJaExiste):
        caso_de_uso.executar(USUARIO_ID, "  Nubank ", Dinheiro(500))

    assert len(unidade_de_trabalho.confirmado.contas) == 1
    assert unidade_de_trabalho.commits == 1


def test_mesmo_nome_para_outro_usuario_e_aceito(unidade_de_trabalho):
    caso_de_uso = CriarConta(unidade_de_trabalho)
    caso_de_uso.executar(USUARIO_ID, "Nubank", Dinheiro(0))
    caso_de_uso.executar(uuid4(), "Nubank", Dinheiro(0))

    assert len(unidade_de_trabalho.confirmado.contas) == 2


@pytest.mark.parametrize("nome", ["", "   "])
def test_nome_vazio_levanta_nome_invalido_sem_commit(unidade_de_trabalho, nome):
    with pytest.raises(NomeInvalido):
        CriarConta(unidade_de_trabalho).executar(USUARIO_ID, nome, Dinheiro(0))

    assert unidade_de_trabalho.confirmado.contas == {}
    assert unidade_de_trabalho.commits == 0
