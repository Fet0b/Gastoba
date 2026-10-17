from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy.exc import IntegrityError

from gastoba.domain.conta import Conta, OrigemDaConta, TipoDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ContaJaExiste, ContaNaoEncontrada
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    SentidoDaTransacao,
    TransacaoImportada,
)
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy


@pytest.fixture
def uow(fabrica_de_sessoes):
    return UnidadeDeTrabalhoSqlAlchemy(fabrica_de_sessoes)


def _conta_importada(uow, nome="Banco", id_externo="ext-1"):
    usuario = Usuario("Ana")
    conta = Conta(
        usuario_id=usuario.id,
        nome=nome,
        saldo=Dinheiro(1000),
        origem=OrigemDaConta.OPEN_FINANCE,
        id_externo=id_externo,
    )
    with uow:
        uow.usuarios.garantir(usuario)
        uow.contas.adicionar(conta)
        uow.commit()
    return usuario, conta


def _transacao(conta, id_externo="t1", dia=10, centavos=2590):
    return TransacaoImportada(
        conta_id=conta.id,
        id_externo=id_externo,
        data=date(2026, 10, dia),
        descricao="Mercado",
        valor=Dinheiro(centavos),
        sentido=SentidoDaTransacao.SAIDA,
        tipo_de_operacao="PIX",
    )


def test_conta_importada_volta_com_origem_e_id_externo_e_e_achada_por_ele(uow):
    usuario, conta = _conta_importada(uow)

    with uow:
        achada = uow.contas.obter_por_id_externo(usuario.id, "ext-1")
        inexistente = uow.contas.obter_por_id_externo(usuario.id, "outro")
        de_outra_pessoa = uow.contas.obter_por_id_externo(uuid4(), "ext-1")

    assert achada is not None
    assert (achada.id, achada.origem, achada.id_externo) == (
        conta.id,
        OrigemDaConta.OPEN_FINANCE,
        "ext-1",
    )
    assert inexistente is None
    assert de_outra_pessoa is None


def test_o_mesmo_id_externo_nao_se_repete_para_a_mesma_pessoa(uow):
    usuario, _ = _conta_importada(uow)
    repetida = Conta(
        usuario_id=usuario.id,
        nome="Outro nome",
        saldo=Dinheiro(0),
        origem=OrigemDaConta.OPEN_FINANCE,
        id_externo="ext-1",
    )

    with pytest.raises((IntegrityError, ContaJaExiste)), uow:
        uow.contas.adicionar(repetida)
        uow.commit()


def test_contas_manuais_sem_id_externo_nao_colidem(uow):
    usuario = Usuario("Ana")
    with uow:
        uow.usuarios.garantir(usuario)
        uow.contas.adicionar(Conta(usuario_id=usuario.id, nome="A", saldo=Dinheiro(0)))
        uow.contas.adicionar(Conta(usuario_id=usuario.id, nome="B", saldo=Dinheiro(0)))
        uow.commit()

    with uow:
        assert len(uow.contas.listar(usuario.id)) == 2


def test_atualizar_do_banco_substitui_saldo_e_tipo_e_recusa_conta_inexistente(uow):
    usuario, conta = _conta_importada(uow)
    with uow:
        assert uow.contas.obter(usuario.id, conta.id).tipo == TipoDaConta.CORRENTE

    with uow:
        uow.contas.atualizar_do_banco(conta.id, Dinheiro(-5000), TipoDaConta.CARTAO)
        uow.commit()
    with uow:
        atualizada = uow.contas.obter(usuario.id, conta.id)
        assert (atualizada.saldo, atualizada.tipo) == (Dinheiro(-5000), TipoDaConta.CARTAO)
        with pytest.raises(ContaNaoEncontrada):
            uow.contas.atualizar_do_banco(uuid4(), Dinheiro(1), TipoDaConta.CORRENTE)


def test_adicionar_grava_o_tipo_da_conta(uow):
    with uow:
        usuario = Usuario(nome="Ana")
        uow.usuarios.garantir(usuario)
        cartao = Conta(
            usuario_id=usuario.id, nome="Visa", saldo=Dinheiro(0), tipo=TipoDaConta.CARTAO
        )
        uow.contas.adicionar(cartao)
        uow.commit()

    with uow:
        assert uow.contas.obter(usuario.id, cartao.id).tipo == TipoDaConta.CARTAO


def test_adicionar_se_nova_grava_uma_vez_e_ignora_o_id_externo_repetido(uow):
    usuario, conta = _conta_importada(uow)

    with uow:
        primeira = uow.transacoes_importadas.adicionar_se_nova(_transacao(conta))
        repetida = uow.transacoes_importadas.adicionar_se_nova(_transacao(conta))
        outra = uow.transacoes_importadas.adicionar_se_nova(_transacao(conta, "t2"))
        uow.commit()

    assert (primeira, repetida, outra) == (True, False, True)
    with uow:
        listadas = uow.transacoes_importadas.listar(usuario.id, EstadoDaTransacaoImportada.PENDENTE)
    assert sorted(t.id_externo for t in listadas) == ["t1", "t2"]


def test_a_mesma_transacao_em_contas_diferentes_nao_e_repetida(uow):
    usuario, conta = _conta_importada(uow)
    outra_conta = Conta(
        usuario_id=usuario.id,
        nome="Cartão",
        saldo=Dinheiro(0),
        origem=OrigemDaConta.OPEN_FINANCE,
        id_externo="ext-2",
    )
    with uow:
        uow.contas.adicionar(outra_conta)
        assert uow.transacoes_importadas.adicionar_se_nova(_transacao(conta, "igual")) is True
        assert uow.transacoes_importadas.adicionar_se_nova(_transacao(outra_conta, "igual")) is True
        uow.commit()


def test_valor_tipo_e_descricao_voltam_iguais(uow):
    usuario, conta = _conta_importada(uow)
    original = _transacao(conta, centavos=123456)
    with uow:
        uow.transacoes_importadas.adicionar_se_nova(original)
        uow.commit()

    with uow:
        lida = uow.transacoes_importadas.obter(usuario.id, original.id)

    assert lida is not None
    assert (lida.valor, lida.data, lida.sentido, lida.tipo_de_operacao, lida.descricao) == (
        Dinheiro(123456),
        date(2026, 10, 10),
        SentidoDaTransacao.SAIDA,
        "PIX",
        "Mercado",
    )


def test_listar_ordena_por_data_decrescente_e_filtra_por_estado(uow):
    usuario, conta = _conta_importada(uow)
    antiga, recente = _transacao(conta, "a", dia=1), _transacao(conta, "b", dia=12)
    tratada = _transacao(conta, "c", dia=5)
    with uow:
        for t in (antiga, recente, tratada):
            uow.transacoes_importadas.adicionar_se_nova(t)
        tratada.ignorar()
        uow.transacoes_importadas.atualizar_estado(tratada)
        uow.commit()

    with uow:
        pendentes = uow.transacoes_importadas.listar(
            usuario.id, EstadoDaTransacaoImportada.PENDENTE
        )
        ignoradas = uow.transacoes_importadas.listar(
            usuario.id, EstadoDaTransacaoImportada.IGNORADA
        )

    assert [t.id_externo for t in pendentes] == ["b", "a"]
    assert [t.id_externo for t in ignoradas] == ["c"]


def test_so_enxerga_as_transacoes_de_contas_do_usuario(uow):
    usuario, conta = _conta_importada(uow)
    transacao = _transacao(conta)
    with uow:
        uow.transacoes_importadas.adicionar_se_nova(transacao)
        uow.commit()

    with uow:
        assert uow.transacoes_importadas.obter(uuid4(), transacao.id) is None
        assert uow.transacoes_importadas.listar(uuid4(), EstadoDaTransacaoImportada.PENDENTE) == []


def test_data_mais_recente_considera_qualquer_estado(uow):
    _, conta = _conta_importada(uow)
    with uow:
        assert uow.transacoes_importadas.data_mais_recente(conta.id) is None
        uow.transacoes_importadas.adicionar_se_nova(_transacao(conta, "a", dia=3))
        recente = _transacao(conta, "b", dia=9)
        uow.transacoes_importadas.adicionar_se_nova(recente)
        recente.ignorar()
        uow.transacoes_importadas.atualizar_estado(recente)
        uow.commit()

    with uow:
        assert uow.transacoes_importadas.data_mais_recente(conta.id) == date(2026, 10, 9)
