from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.aceitar_transacao_importada import AceitarTransacaoImportada
from gastoba.application.excluir_ganho import ExcluirGanho
from gastoba.application.ignorar_transacao_importada import IgnorarTransacaoImportada
from gastoba.application.listar_transacoes_importadas import ListarTransacoesImportadas
from gastoba.application.registrar_ganho import RegistrarGanho
from gastoba.application.registrar_gasto import RegistrarGasto
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.conta import Conta, OrigemDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import (
    TransacaoImportadaInvalida,
    TransacaoImportadaNaoEncontrada,
    TransacaoJaTratada,
)
from gastoba.domain.ganho import Ganho, OrigemDoGanho
from gastoba.domain.gasto import Gasto, OrigemDoGasto
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    SentidoDaTransacao,
    TransacaoImportada,
)

USUARIO_ID = uuid4()
DIA = date(2026, 10, 10)


def conta_do_banco(unidade_de_trabalho, usuario_id=USUARIO_ID, saldo=100000):
    conta = Conta(
        usuario_id,
        "Banco",
        Dinheiro(saldo),
        origem=OrigemDaConta.OPEN_FINANCE,
        id_externo="ext-" + uuid4().hex[:6],
    )
    unidade_de_trabalho.confirmado.contas[conta.id] = conta
    return conta


def pendente(unidade_de_trabalho, conta, sentido=SentidoDaTransacao.SAIDA, **campos):
    base = {
        "conta_id": conta.id,
        "id_externo": uuid4().hex,
        "data": DIA,
        "descricao": "Mercado",
        "valor": Dinheiro(2590),
        "sentido": sentido,
    }
    base.update(campos)
    transacao = TransacaoImportada(**base)
    unidade_de_trabalho.confirmado.transacoes_importadas[transacao.id] = transacao
    return transacao


def saldo(unidade_de_trabalho, conta, usuario_id=USUARIO_ID):
    with unidade_de_trabalho as uow:
        return uow.contas.obter(usuario_id, conta.id).saldo


def estado(unidade_de_trabalho, transacao):
    return unidade_de_trabalho.confirmado.transacoes_importadas[transacao.id].estado


# --- aceitar ---


def test_aceitar_saida_cria_o_gasto_com_origem_open_finance_e_nao_mexe_no_saldo(
    unidade_de_trabalho,
):
    conta = conta_do_banco(unidade_de_trabalho)
    t = pendente(unidade_de_trabalho, conta)

    gasto = AceitarTransacaoImportada(unidade_de_trabalho).executar(
        USUARIO_ID, t.id, CategoriaDoGasto.CONFORTO, ["Pix", "mercado"]
    )

    assert isinstance(gasto, Gasto)
    assert (gasto.valor, gasto.data, gasto.descricao) == (Dinheiro(2590), DIA, "Mercado")
    assert gasto.origem == OrigemDoGasto.OPEN_FINANCE
    assert [str(tag) for tag in gasto.tags] == ["pix", "mercado"]
    assert gasto.id in unidade_de_trabalho.confirmado.gastos
    assert estado(unidade_de_trabalho, t) == EstadoDaTransacaoImportada.ACEITA
    assert saldo(unidade_de_trabalho, conta) == Dinheiro(100000)


def test_aceitar_entrada_cria_o_ganho_sem_categoria(unidade_de_trabalho):
    conta = conta_do_banco(unidade_de_trabalho)
    t = pendente(unidade_de_trabalho, conta, SentidoDaTransacao.ENTRADA, valor=Dinheiro(500000))

    ganho = AceitarTransacaoImportada(unidade_de_trabalho).executar(USUARIO_ID, t.id, None, [])

    assert isinstance(ganho, Ganho)
    assert ganho.origem == OrigemDoGanho.OPEN_FINANCE
    assert saldo(unidade_de_trabalho, conta) == Dinheiro(100000)


def test_saida_sem_categoria_e_ganho_com_categoria_sao_recusados_sem_gravar(unidade_de_trabalho):
    conta = conta_do_banco(unidade_de_trabalho)
    saida = pendente(unidade_de_trabalho, conta)
    entrada = pendente(unidade_de_trabalho, conta, SentidoDaTransacao.ENTRADA)

    with pytest.raises(TransacaoImportadaInvalida):
        AceitarTransacaoImportada(unidade_de_trabalho).executar(USUARIO_ID, saida.id, None, [])
    with pytest.raises(TransacaoImportadaInvalida):
        AceitarTransacaoImportada(unidade_de_trabalho).executar(
            USUARIO_ID, entrada.id, CategoriaDoGasto.LAZER, []
        )

    assert estado(unidade_de_trabalho, saida) == EstadoDaTransacaoImportada.PENDENTE
    assert unidade_de_trabalho.confirmado.gastos == {}
    assert unidade_de_trabalho.confirmado.ganhos == {}


def test_aceitar_duas_vezes_e_recusado(unidade_de_trabalho):
    conta = conta_do_banco(unidade_de_trabalho)
    t = pendente(unidade_de_trabalho, conta)
    caso = AceitarTransacaoImportada(unidade_de_trabalho)
    caso.executar(USUARIO_ID, t.id, CategoriaDoGasto.LAZER, [])

    with pytest.raises(TransacaoJaTratada):
        caso.executar(USUARIO_ID, t.id, CategoriaDoGasto.LAZER, [])

    assert len(unidade_de_trabalho.confirmado.gastos) == 1


def test_transacao_de_outro_usuario_nao_e_encontrada(unidade_de_trabalho):
    alheia = conta_do_banco(unidade_de_trabalho, usuario_id=uuid4())
    t = pendente(unidade_de_trabalho, alheia)

    with pytest.raises(TransacaoImportadaNaoEncontrada):
        AceitarTransacaoImportada(unidade_de_trabalho).executar(
            USUARIO_ID, t.id, CategoriaDoGasto.LAZER, []
        )
    with pytest.raises(TransacaoImportadaNaoEncontrada):
        IgnorarTransacaoImportada(unidade_de_trabalho).executar(USUARIO_ID, t.id)

    assert estado(unidade_de_trabalho, t) == EstadoDaTransacaoImportada.PENDENTE


# --- ignorar ---


def test_ignorar_marca_a_transacao_e_nao_cria_lancamento(unidade_de_trabalho):
    conta = conta_do_banco(unidade_de_trabalho)
    t = pendente(unidade_de_trabalho, conta)

    IgnorarTransacaoImportada(unidade_de_trabalho).executar(USUARIO_ID, t.id)

    assert estado(unidade_de_trabalho, t) == EstadoDaTransacaoImportada.IGNORADA
    assert unidade_de_trabalho.confirmado.gastos == {}
    with pytest.raises(TransacaoJaTratada):
        IgnorarTransacaoImportada(unidade_de_trabalho).executar(USUARIO_ID, t.id)


def test_ignorar_inexistente_e_recusado(unidade_de_trabalho):
    with pytest.raises(TransacaoImportadaNaoEncontrada):
        IgnorarTransacaoImportada(unidade_de_trabalho).executar(USUARIO_ID, uuid4())


# --- listar ---


def test_lista_so_as_pendentes_por_data_decrescente_com_a_sugestao_de_descarte(
    unidade_de_trabalho,
):
    conta = conta_do_banco(unidade_de_trabalho)
    antiga = pendente(unidade_de_trabalho, conta, data=date(2026, 10, 1))
    recente = pendente(
        unidade_de_trabalho, conta, data=date(2026, 10, 12), tipo_de_operacao="PAGAMENTO_FATURA"
    )
    tratada = pendente(unidade_de_trabalho, conta)
    IgnorarTransacaoImportada(unidade_de_trabalho).executar(USUARIO_ID, tratada.id)

    itens = ListarTransacoesImportadas(unidade_de_trabalho).executar(USUARIO_ID)

    assert [i.transacao.id for i in itens] == [recente.id, antiga.id]
    assert [i.sugerir_descarte for i in itens] == [True, False]
    ignoradas = ListarTransacoesImportadas(unidade_de_trabalho).executar(
        USUARIO_ID, EstadoDaTransacaoImportada.IGNORADA
    )
    assert [i.transacao.id for i in ignoradas] == [tratada.id]


def test_lista_nao_mostra_a_caixa_de_outro_usuario(unidade_de_trabalho):
    alheia = conta_do_banco(unidade_de_trabalho, usuario_id=uuid4())
    pendente(unidade_de_trabalho, alheia)

    assert ListarTransacoesImportadas(unidade_de_trabalho).executar(USUARIO_ID) == []


def test_sinaliza_possivel_duplicado_quando_ha_lancamento_manual_igual(unidade_de_trabalho):
    conta = conta_do_banco(unidade_de_trabalho)
    igual = pendente(unidade_de_trabalho, conta, descricao="Pix mercado", valor=Dinheiro(3000))
    outro_valor = pendente(unidade_de_trabalho, conta, valor=Dinheiro(777))
    RegistrarGasto(unidade_de_trabalho).executar(
        USUARIO_ID, conta.id, Dinheiro(3000), "Mercado", DIA, CategoriaDoGasto.CONFORTO, []
    )

    itens = {
        i.transacao.id: i
        for i in ListarTransacoesImportadas(unidade_de_trabalho).executar(USUARIO_ID)
    }

    assert itens[igual.id].possivel_duplicado is True
    assert itens[outro_valor.id].possivel_duplicado is False


def test_lancamento_importado_nao_conta_como_duplicado(unidade_de_trabalho):
    conta = conta_do_banco(unidade_de_trabalho)
    primeira = pendente(unidade_de_trabalho, conta, valor=Dinheiro(3000))
    AceitarTransacaoImportada(unidade_de_trabalho).executar(
        USUARIO_ID, primeira.id, CategoriaDoGasto.LAZER, []
    )
    segunda = pendente(unidade_de_trabalho, conta, valor=Dinheiro(3000))

    [item] = ListarTransacoesImportadas(unidade_de_trabalho).executar(USUARIO_ID)

    assert item.transacao.id == segunda.id
    assert item.possivel_duplicado is False


# --- lançamento manual em conta importada: o saldo é do banco ---


def test_gasto_e_ganho_manuais_em_conta_importada_nao_mexem_no_saldo(unidade_de_trabalho):
    conta = conta_do_banco(unidade_de_trabalho, saldo=100000)

    RegistrarGasto(unidade_de_trabalho).executar(
        USUARIO_ID, conta.id, Dinheiro(5000), "Pix", DIA, CategoriaDoGasto.CONFORTO, []
    )
    ganho = RegistrarGanho(unidade_de_trabalho).executar(
        USUARIO_ID, conta.id, Dinheiro(7000), "Dinheiro vivo", DIA, []
    )

    assert saldo(unidade_de_trabalho, conta) == Dinheiro(100000)
    assert len(unidade_de_trabalho.confirmado.gastos) == 1
    ExcluirGanho(unidade_de_trabalho).executar(USUARIO_ID, ganho.id)
    assert saldo(unidade_de_trabalho, conta) == Dinheiro(100000)
    assert unidade_de_trabalho.confirmado.ganhos == {}


def test_conta_manual_continua_mexendo_no_saldo(unidade_de_trabalho):
    manual = Conta(USUARIO_ID, "Carteira", Dinheiro(10000))
    unidade_de_trabalho.confirmado.contas[manual.id] = manual

    RegistrarGasto(unidade_de_trabalho).executar(
        USUARIO_ID, manual.id, Dinheiro(2500), "Lanche", DIA, CategoriaDoGasto.CONFORTO, []
    )

    assert saldo(unidade_de_trabalho, manual) == Dinheiro(7500)
