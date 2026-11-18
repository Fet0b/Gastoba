from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.aceitar_transacao_importada import AceitarTransacaoImportada
from gastoba.application.aceitar_transacao_importada_dividida import (
    AceitarTransacaoImportadaDividida,
)
from gastoba.application.excluir_ganho import ExcluirGanho
from gastoba.application.registrar_ganho import RegistrarGanho
from gastoba.domain.conta import OrigemDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.divisao_da_transacao import ParteDaTransacao
from gastoba.domain.excecoes import GanhoDeRecorrencia, GanhoNaoEncontrado
from gastoba.domain.ganho import Ganho
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    SentidoDaTransacao,
    TransacaoImportada,
)

USUARIO_ID = uuid4()
INICIO = date(2026, 10, 1)
FIM = date(2026, 10, 31)


def registrar(unidade_de_trabalho, conta_id, centavos=500000, usuario_id=USUARIO_ID):
    return RegistrarGanho(unidade_de_trabalho).executar(
        usuario_id=usuario_id,
        conta_id=conta_id,
        valor=Dinheiro(centavos),
        descricao="Salário",
        data=date(2026, 10, 5),
        tags=[],
    )


def saldo(unidade_de_trabalho, conta_id, usuario_id=USUARIO_ID):
    with unidade_de_trabalho as uow:
        return uow.contas.obter(usuario_id, conta_id).saldo


def test_exclui_o_ganho_e_devolve_o_saldo(unidade_de_trabalho, semear_conta):
    conta = semear_conta(usuario_id=USUARIO_ID, saldo=Dinheiro(100000))
    ganho = registrar(unidade_de_trabalho, conta.id, 500000)
    assert saldo(unidade_de_trabalho, conta.id) == Dinheiro(600000)

    ExcluirGanho(unidade_de_trabalho).executar(USUARIO_ID, ganho.id)

    assert saldo(unidade_de_trabalho, conta.id) == Dinheiro(100000)
    with unidade_de_trabalho as uow:
        assert uow.ganhos.listar(USUARIO_ID, INICIO, FIM) == []


def test_exclui_so_o_ganho_pedido(unidade_de_trabalho, semear_conta):
    conta = semear_conta(usuario_id=USUARIO_ID, saldo=Dinheiro(0))
    errado = registrar(unidade_de_trabalho, conta.id, 100)
    certo = registrar(unidade_de_trabalho, conta.id, 200)

    ExcluirGanho(unidade_de_trabalho).executar(USUARIO_ID, errado.id)

    with unidade_de_trabalho as uow:
        assert [g.id for g in uow.ganhos.listar(USUARIO_ID, INICIO, FIM)] == [certo.id]
    assert saldo(unidade_de_trabalho, conta.id) == Dinheiro(200)


def test_ganho_inexistente_e_recusado(unidade_de_trabalho):
    with pytest.raises(GanhoNaoEncontrado):
        ExcluirGanho(unidade_de_trabalho).executar(USUARIO_ID, uuid4())


def test_ganho_de_outro_usuario_nao_e_encontrado_e_nada_muda(unidade_de_trabalho, semear_conta):
    alheia = semear_conta(usuario_id=uuid4(), saldo=Dinheiro(0))
    ganho = registrar(unidade_de_trabalho, alheia.id, 300, usuario_id=alheia.usuario_id)

    with pytest.raises(GanhoNaoEncontrado):
        ExcluirGanho(unidade_de_trabalho).executar(USUARIO_ID, ganho.id)

    assert saldo(unidade_de_trabalho, alheia.id, alheia.usuario_id) == Dinheiro(300)


def test_ganho_gerado_por_recorrencia_nao_pode_ser_excluido(unidade_de_trabalho, semear_conta):
    conta = semear_conta(usuario_id=USUARIO_ID, saldo=Dinheiro(0))
    gerado = Ganho(
        conta_id=conta.id,
        valor=Dinheiro(1000),
        descricao="Salário",
        data=date(2026, 10, 5),
        recorrencia_id=uuid4(),
        competencia="2026-10",
    )
    with unidade_de_trabalho as uow:
        uow.ganhos.adicionar(gerado)
        uow.contas.creditar(conta.id, gerado.valor)
        uow.commit()

    with pytest.raises(GanhoDeRecorrencia):
        ExcluirGanho(unidade_de_trabalho).executar(USUARIO_ID, gerado.id)

    assert saldo(unidade_de_trabalho, conta.id) == Dinheiro(1000)


def semear_transacao_de_entrada(unidade_de_trabalho, semear_conta):
    conta = semear_conta(
        usuario_id=USUARIO_ID, saldo=Dinheiro(50000), origem=OrigemDaConta.OPEN_FINANCE
    )
    transacao = TransacaoImportada(
        conta.id,
        "t-exemplo",
        date(2026, 10, 5),
        "Entrada exemplo",
        Dinheiro(10000),
        SentidoDaTransacao.ENTRADA,
    )
    with unidade_de_trabalho as uow:
        uow.transacoes_importadas.adicionar_se_nova(transacao)
        uow.commit()
    return conta, transacao


def estado_da(unidade_de_trabalho, transacao):
    with unidade_de_trabalho as uow:
        return uow.transacoes_importadas.obter(USUARIO_ID, transacao.id).estado


def test_excluir_ganho_aceito_da_caixa_devolve_a_transacao_a_caixa(
    unidade_de_trabalho, semear_conta
):
    conta, transacao = semear_transacao_de_entrada(unidade_de_trabalho, semear_conta)
    ganho = AceitarTransacaoImportada(unidade_de_trabalho).executar(
        USUARIO_ID, transacao.id, None, []
    )
    assert estado_da(unidade_de_trabalho, transacao) == EstadoDaTransacaoImportada.ACEITA

    ExcluirGanho(unidade_de_trabalho).executar(USUARIO_ID, ganho.id)

    assert estado_da(unidade_de_trabalho, transacao) == EstadoDaTransacaoImportada.PENDENTE
    # O saldo de conta importada é do banco: nem aceitar nem excluir o altera.
    assert saldo(unidade_de_trabalho, conta.id) == Dinheiro(50000)
    # A pessoa pode decidir de novo: aceitar outra vez funciona.
    AceitarTransacaoImportada(unidade_de_trabalho).executar(USUARIO_ID, transacao.id, None, [])


def test_excluir_ganho_manual_nao_mexe_em_transacao_nenhuma(unidade_de_trabalho, semear_conta):
    _, transacao = semear_transacao_de_entrada(unidade_de_trabalho, semear_conta)
    AceitarTransacaoImportada(unidade_de_trabalho).executar(USUARIO_ID, transacao.id, None, [])
    conta = semear_conta(usuario_id=USUARIO_ID, saldo=Dinheiro(0))
    manual = registrar(unidade_de_trabalho, conta.id, 700)

    ExcluirGanho(unidade_de_trabalho).executar(USUARIO_ID, manual.id)

    assert estado_da(unidade_de_trabalho, transacao) == EstadoDaTransacaoImportada.ACEITA


def test_excluir_uma_parte_de_transacao_dividida_nao_reabre_enquanto_sobra_parte(
    unidade_de_trabalho, semear_conta
):
    _, transacao = semear_transacao_de_entrada(unidade_de_trabalho, semear_conta)
    criados = AceitarTransacaoImportadaDividida(unidade_de_trabalho).executar(
        USUARIO_ID,
        transacao.id,
        [ParteDaTransacao(None, (), 60), ParteDaTransacao(None, (), 40)],
    )

    ExcluirGanho(unidade_de_trabalho).executar(USUARIO_ID, criados[0].id)
    # Reabrir agora deixaria a outra parte contada duas vezes se a pessoa aceitasse de novo.
    assert estado_da(unidade_de_trabalho, transacao) == EstadoDaTransacaoImportada.ACEITA

    ExcluirGanho(unidade_de_trabalho).executar(USUARIO_ID, criados[1].id)
    assert estado_da(unidade_de_trabalho, transacao) == EstadoDaTransacaoImportada.PENDENTE


def test_excluir_ganho_cuja_transacao_ja_esta_pendente_ou_sumiu_nao_falha(
    unidade_de_trabalho, semear_conta
):
    conta, transacao = semear_transacao_de_entrada(unidade_de_trabalho, semear_conta)
    ganho = AceitarTransacaoImportada(unidade_de_trabalho).executar(
        USUARIO_ID, transacao.id, None, []
    )
    with unidade_de_trabalho as uow:
        uow.transacoes_importadas.obter(USUARIO_ID, transacao.id)
    estado = unidade_de_trabalho.confirmado
    del estado.transacoes_importadas[transacao.id]

    ExcluirGanho(unidade_de_trabalho).executar(USUARIO_ID, ganho.id)

    with unidade_de_trabalho as uow:
        assert uow.ganhos.obter(USUARIO_ID, ganho.id) is None


def test_falha_ao_reabrir_a_transacao_desfaz_a_exclusao_do_ganho(
    unidade_de_trabalho, semear_conta, monkeypatch
):
    conta, transacao = semear_transacao_de_entrada(unidade_de_trabalho, semear_conta)
    ganho = AceitarTransacaoImportada(unidade_de_trabalho).executar(
        USUARIO_ID, transacao.id, None, []
    )

    def falhar(self, transacao):
        raise RuntimeError("falha simulada")

    with unidade_de_trabalho as uow:
        monkeypatch.setattr(type(uow.transacoes_importadas), "atualizar_estado", falhar)

    with pytest.raises(RuntimeError):
        ExcluirGanho(unidade_de_trabalho).executar(USUARIO_ID, ganho.id)

    monkeypatch.undo()
    with unidade_de_trabalho as uow:
        assert uow.ganhos.obter(USUARIO_ID, ganho.id) is not None
    assert estado_da(unidade_de_trabalho, transacao) == EstadoDaTransacaoImportada.ACEITA
