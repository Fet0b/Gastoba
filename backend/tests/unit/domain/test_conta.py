from uuid import UUID, uuid4

import pytest

from gastoba.domain.conta import Conta, OrigemDaConta, TipoDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import NomeInvalido, ValorInvalido

USUARIO_ID = uuid4()


def test_criacao_valida_gera_id_origem_manual_e_limpa_nome():
    conta = Conta(usuario_id=USUARIO_ID, nome="  Nubank  ", saldo=Dinheiro(0))

    assert isinstance(conta.id, UUID)
    assert conta.origem == OrigemDaConta.MANUAL
    assert conta.nome == "Nubank"
    assert conta.usuario_id == USUARIO_ID


def test_conta_sem_tipo_explicito_e_corrente():
    assert Conta(usuario_id=USUARIO_ID, nome="Nubank", saldo=Dinheiro(0)).tipo == (
        TipoDaConta.CORRENTE
    )


def test_conta_aceita_o_tipo_cartao():
    conta = Conta(usuario_id=USUARIO_ID, nome="Visa", saldo=Dinheiro(0), tipo=TipoDaConta.CARTAO)

    assert conta.tipo == TipoDaConta.CARTAO


@pytest.mark.parametrize("nome", ["", "   ", "a" * 101])
def test_nome_vazio_so_espacos_ou_longo_demais_e_invalido(nome):
    with pytest.raises(NomeInvalido):
        Conta(usuario_id=USUARIO_ID, nome=nome, saldo=Dinheiro(0))


def test_nome_com_100_caracteres_e_valido():
    conta = Conta(usuario_id=USUARIO_ID, nome="a" * 100, saldo=Dinheiro(0))

    assert conta.nome == "a" * 100


@pytest.mark.parametrize("centavos", [0, -5000])
def test_saldo_zero_ou_negativo_e_aceito(centavos):
    conta = Conta(usuario_id=USUARIO_ID, nome="Carteira", saldo=Dinheiro(centavos))

    assert conta.saldo == Dinheiro(centavos)


def test_contas_com_mesmo_id_sao_iguais_e_tem_mesmo_hash():
    id_compartilhado = uuid4()
    c1 = Conta(usuario_id=USUARIO_ID, nome="Nubank", saldo=Dinheiro(0), id=id_compartilhado)
    c2 = Conta(usuario_id=uuid4(), nome="Itaú", saldo=Dinheiro(999), id=id_compartilhado)

    assert c1 == c2
    assert hash(c1) == hash(c2)
    assert len({c1, c2}) == 1


def test_contas_com_mesmos_dados_e_ids_diferentes_sao_diferentes():
    c1 = Conta(usuario_id=USUARIO_ID, nome="Nubank", saldo=Dinheiro(0))
    c2 = Conta(usuario_id=USUARIO_ID, nome="Nubank", saldo=Dinheiro(0))

    assert c1 != c2


def test_conta_comparada_com_outro_tipo_nao_e_igual():
    conta = Conta(usuario_id=USUARIO_ID, nome="Nubank", saldo=Dinheiro(0))

    assert (conta == "x") is False


def test_debitar_subtrai_do_saldo():
    conta = Conta(usuario_id=USUARIO_ID, nome="Nubank", saldo=Dinheiro(10000))

    conta.debitar(Dinheiro(2590))

    assert conta.saldo == Dinheiro(7410)


def test_debitar_alem_do_limite_levanta_valor_invalido_e_mantem_saldo():
    conta = Conta(usuario_id=USUARIO_ID, nome="Nubank", saldo=Dinheiro(-(10**14)))

    with pytest.raises(ValorInvalido):
        conta.debitar(Dinheiro(1))

    assert conta.saldo == Dinheiro(-(10**14))


def test_conta_manual_tem_saldo_proprio_e_a_importada_espelha_o_banco():
    from gastoba.domain.conta import OrigemDaConta

    manual = Conta(usuario_id=uuid4(), nome="Carteira", saldo=Dinheiro(0))
    importada = Conta(
        usuario_id=uuid4(),
        nome="Nubank",
        saldo=Dinheiro(0),
        origem=OrigemDaConta.OPEN_FINANCE,
        id_externo="abc",
    )

    assert manual.saldo_e_do_banco is False
    assert importada.saldo_e_do_banco is True
    assert manual.id_externo is None
