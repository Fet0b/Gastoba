from uuid import UUID, uuid4

import pytest

from gastoba.domain.conta import (
    Conta,
    OrigemDaConta,
    TipoDaConta,
    final_do_numero_de,
    validar_apelido,
)
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ApelidoInvalido, NomeInvalido, ValorInvalido

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


# --- 068: apelido, nome no banco e final do número ---


@pytest.mark.parametrize(
    ("numero", "esperado"),
    [
        ("0001/12345-0", "3450"),
        ("1234", "1234"),
        ("  **** 9876 ", "9876"),
        ("123456789012", "9012"),
        ("123", None),
        ("ab-1/2", None),
        ("", None),
        (None, None),
        (12345678, None),
        (b"12345678", None),
    ],
)
def test_final_do_numero_de_usa_so_os_quatro_ultimos_digitos(numero, esperado):
    assert final_do_numero_de(numero) == esperado


def test_final_do_numero_de_com_quatro_digitos_exatos_vale():
    assert final_do_numero_de("0412") == "0412"


def test_rotulo_prefere_apelido_depois_nome_no_banco_depois_nome():
    conta = Conta(usuario_id=USUARIO_ID, nome="Nubank (2)", saldo=Dinheiro(0))
    assert conta.rotulo == "Nubank (2)"
    conta.nome_no_banco = "Nubank"
    assert conta.rotulo == "Nubank"
    conta.apelido = "Conta da casa"
    assert conta.rotulo == "Conta da casa"


def test_conta_aceita_apelido_e_final_validos_e_apara_o_apelido():
    conta = Conta(
        usuario_id=USUARIO_ID,
        nome="Nubank",
        saldo=Dinheiro(0),
        apelido="  Casa  ",
        final_do_numero="0412",
    )
    assert conta.apelido == "Casa"
    assert conta.final_do_numero == "0412"


@pytest.mark.parametrize("final", ["412", "04123", "04a2", ""])
def test_conta_recusa_final_que_nao_tem_quatro_digitos(final):
    with pytest.raises(ValueError):
        Conta(usuario_id=USUARIO_ID, nome="N", saldo=Dinheiro(0), final_do_numero=final)


def test_apelido_vazio_na_entidade_levanta_apelido_invalido():
    with pytest.raises(ApelidoInvalido):
        Conta(usuario_id=USUARIO_ID, nome="N", saldo=Dinheiro(0), apelido="   ")


def test_validar_apelido_apara_e_aceita_ate_40_caracteres():
    assert validar_apelido("  Conta da casa ") == "Conta da casa"
    assert validar_apelido("a" * 40) == "a" * 40


@pytest.mark.parametrize("texto", ["", "   ", "a" * 41, "ola\nmundo", "tab\taqui"])
def test_validar_apelido_recusa(texto):
    with pytest.raises(ApelidoInvalido):
        validar_apelido(texto)
