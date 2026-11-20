from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from gastoba.domain.conta import Conta, OrigemDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ApelidoJaExiste, ContaNaoEncontrada
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy


@pytest.fixture
def uow(fabrica_de_sessoes):
    return UnidadeDeTrabalhoSqlAlchemy(fabrica_de_sessoes)


def _pessoa(uow, nome="Ana"):
    usuario = Usuario(nome)
    with uow:
        uow.usuarios.garantir(usuario)
        uow.commit()
    return usuario


def _conta(uow, usuario, nome, **campos):
    conta = Conta(usuario_id=usuario.id, nome=nome, saldo=Dinheiro(0), **campos)
    with uow:
        uow.contas.adicionar(conta)
        uow.commit()
    return conta


def test_grava_e_le_apelido_nome_no_banco_e_final(uow):
    ana = _pessoa(uow)
    conta = _conta(
        uow,
        ana,
        "Nubank",
        origem=OrigemDaConta.OPEN_FINANCE,
        id_externo="x1",
        apelido="Casa",
        nome_no_banco="Nubank",
        final_do_numero="0412",
    )

    with uow:
        lida = uow.contas.obter(ana.id, conta.id)
    assert (lida.apelido, lida.nome_no_banco, lida.final_do_numero) == ("Casa", "Nubank", "0412")
    assert lida.rotulo == "Casa"


def test_definir_e_remover_apelido(uow):
    ana = _pessoa(uow)
    conta = _conta(uow, ana, "Nubank")
    with uow:
        uow.contas.definir_apelido(ana.id, conta.id, "Casa")
        uow.commit()
    with uow:
        assert uow.contas.obter(ana.id, conta.id).apelido == "Casa"
        uow.contas.definir_apelido(ana.id, conta.id, None)
        uow.commit()
    with uow:
        assert uow.contas.obter(ana.id, conta.id).apelido is None


def test_definir_apelido_de_conta_de_outra_pessoa_ou_inexistente(uow):
    ana, bia = _pessoa(uow, "Ana"), _pessoa(uow, "Bia")
    conta = _conta(uow, ana, "Nubank")
    with uow:
        with pytest.raises(ContaNaoEncontrada):
            uow.contas.definir_apelido(bia.id, conta.id, "Casa")
        with pytest.raises(ContaNaoEncontrada):
            uow.contas.definir_apelido(ana.id, uuid4(), "Casa")
        with pytest.raises(ContaNaoEncontrada):
            uow.contas.definir_apelido(bia.id, conta.id, None)
    with uow:
        assert uow.contas.obter(ana.id, conta.id).apelido is None


def test_apelido_repetido_na_mesma_pessoa_e_recusado_e_em_outra_e_aceito(uow):
    ana, bia = _pessoa(uow, "Ana"), _pessoa(uow, "Bia")
    a1, a2 = _conta(uow, ana, "A"), _conta(uow, ana, "B")
    b1 = _conta(uow, bia, "C")
    with uow:
        uow.contas.definir_apelido(ana.id, a1.id, "Casa")
        uow.contas.definir_apelido(bia.id, b1.id, "Casa")
        uow.commit()
    with uow, pytest.raises(ApelidoJaExiste):
        uow.contas.definir_apelido(ana.id, a2.id, "Casa")
    with uow:
        uow.contas.definir_apelido(ana.id, a1.id, "Casa")  # a própria conta, de novo
        uow.commit()


def test_listar_ordena_pelo_rotulo_sem_distinguir_maiusculas(uow):
    ana = _pessoa(uow)
    _conta(uow, ana, "Zeta", apelido="alfa")
    _conta(uow, ana, "Beta")
    _conta(
        uow,
        ana,
        "Delta (2)",
        origem=OrigemDaConta.OPEN_FINANCE,
        id_externo="d",
        nome_no_banco="Delta",
    )
    _conta(uow, ana, "Charlie")

    with uow:
        rotulos = [c.rotulo for c in uow.contas.listar(ana.id)]

    assert rotulos == ["alfa", "Beta", "Charlie", "Delta"]


def test_checks_do_banco_recusam_apelido_e_final_invalidos(uow, fabrica_de_sessoes):
    ana = _pessoa(uow)
    conta = _conta(uow, ana, "Nubank")
    for coluna, valor in [("apelido", "   "), ("apelido", "x" * 41), ("final_do_numero", "12a4")]:
        with fabrica_de_sessoes() as sessao, pytest.raises(IntegrityError):
            sessao.execute(
                text(f"UPDATE contas SET {coluna} = :v WHERE id = :i"),
                {"v": valor, "i": conta.id.hex},
            )
            sessao.flush()
