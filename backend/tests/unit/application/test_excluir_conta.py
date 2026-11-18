from uuid import uuid4

import pytest

from gastoba.application.excluir_conta import ExcluirConta
from gastoba.domain.conta import OrigemDaConta
from gastoba.domain.excecoes import ContaImportada, ContaNaoEncontrada

USUARIO_ID = uuid4()


def test_exclui_a_conta_manual_e_confirma(unidade_de_trabalho, semear_conta):
    conta = semear_conta(usuario_id=USUARIO_ID)

    ExcluirConta(unidade_de_trabalho).executar(USUARIO_ID, conta.id)

    assert conta.id not in unidade_de_trabalho.confirmado.contas
    assert unidade_de_trabalho.commits == 1


def test_conta_importada_nao_e_excluida(unidade_de_trabalho, semear_conta):
    conta = semear_conta(usuario_id=USUARIO_ID, origem=OrigemDaConta.OPEN_FINANCE)

    with pytest.raises(ContaImportada):
        ExcluirConta(unidade_de_trabalho).executar(USUARIO_ID, conta.id)

    assert conta.id in unidade_de_trabalho.confirmado.contas
    assert unidade_de_trabalho.commits == 0


def test_conta_de_outro_usuario_nao_e_encontrada(unidade_de_trabalho, semear_conta):
    conta = semear_conta(usuario_id=uuid4())

    with pytest.raises(ContaNaoEncontrada):
        ExcluirConta(unidade_de_trabalho).executar(USUARIO_ID, conta.id)

    assert conta.id in unidade_de_trabalho.confirmado.contas
