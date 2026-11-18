from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.aceitar_transacao_importada_dividida import (
    AceitarTransacaoImportadaDividida,
)
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.conta import Conta, OrigemDaConta
from gastoba.domain.destinacao import Destinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.divisao_da_transacao import ParteDaTransacao
from gastoba.domain.excecoes import (
    CategoriaInvalida,
    DivisaoInvalida,
    InvestimentoNaoEncontrado,
    TransacaoImportadaInvalida,
    TransacaoImportadaNaoEncontrada,
    TransacaoJaTratada,
)
from gastoba.domain.ganho import Ganho
from gastoba.domain.gasto import Gasto
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.tag import Tag
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    SentidoDaTransacao,
    TransacaoImportada,
)

USUARIO = uuid4()
DIA = date(2026, 10, 10)


def montar(uow, valor=10001, sentido=SentidoDaTransacao.SAIDA, descricao="Mercado"):
    conta = Conta(USUARIO, "Banco", Dinheiro(500000), origem=OrigemDaConta.OPEN_FINANCE)
    t = TransacaoImportada(conta.id, "t1", DIA, descricao, Dinheiro(valor), sentido)
    with uow as u:
        u.contas.adicionar(conta)
        u.transacoes_importadas.adicionar_se_nova(t)
        u.commit()
    return conta, t


def parte(percentual, categoria=None, *tags):
    return ParteDaTransacao(categoria, tuple(Tag.de_texto(t) for t in tags), percentual)


def estado(uow, t):
    return uow.confirmado.transacoes_importadas[t.id].estado


def test_saida_vira_um_gasto_por_parte_com_a_propria_categoria_e_tags(unidade_de_trabalho):
    conta, t = montar(unidade_de_trabalho)

    criados = AceitarTransacaoImportadaDividida(unidade_de_trabalho).executar(
        USUARIO,
        t.id,
        [
            parte(33, CategoriaDoGasto.CONFORTO, "Mercado"),
            parte(33, CategoriaDoGasto.LAZER),
            parte(34, CategoriaDoGasto.CONHECIMENTO, "livro", "pix"),
        ],
    )

    assert all(isinstance(g, Gasto) for g in criados)
    assert [(g.valor.centavos, g.categoria, g.descricao) for g in criados] == [
        (3301, CategoriaDoGasto.CONFORTO, "Mercado (1/3)"),
        (3300, CategoriaDoGasto.LAZER, "Mercado (2/3)"),
        (3400, CategoriaDoGasto.CONHECIMENTO, "Mercado (3/3)"),
    ]
    assert [str(tag) for tag in criados[2].tags] == ["livro", "pix"]
    assert {g.data for g in criados} == {DIA}
    estado_final = unidade_de_trabalho.confirmado
    assert len(estado_final.gastos) == 3
    assert estado(unidade_de_trabalho, t) == EstadoDaTransacaoImportada.ACEITA
    assert estado_final.contas[conta.id].saldo == Dinheiro(500000)


def test_entrada_vira_um_ganho_por_parte_sem_categoria(unidade_de_trabalho):
    _, t = montar(unidade_de_trabalho, 20000, SentidoDaTransacao.ENTRADA, "Salário")

    criados = AceitarTransacaoImportadaDividida(unidade_de_trabalho).executar(
        USUARIO, t.id, [parte(70, None, "fixo"), parte(30)]
    )

    assert all(isinstance(g, Ganho) for g in criados)
    assert [g.valor.centavos for g in criados] == [14000, 6000]


def test_parte_que_ficaria_com_zero_centavo_e_descartada(unidade_de_trabalho):
    _, t = montar(unidade_de_trabalho, 1)

    criados = AceitarTransacaoImportadaDividida(unidade_de_trabalho).executar(
        USUARIO, t.id, [parte(50, CategoriaDoGasto.LAZER), parte(50, CategoriaDoGasto.CONFORTO)]
    )

    assert [g.valor.centavos for g in criados] == [1]


def test_descricao_longa_e_cortada_para_caber_com_o_sufixo(unidade_de_trabalho):
    _, t = montar(unidade_de_trabalho, 1000, descricao="x" * 200)

    criados = AceitarTransacaoImportadaDividida(unidade_de_trabalho).executar(
        USUARIO, t.id, [parte(50, CategoriaDoGasto.LAZER), parte(50, CategoriaDoGasto.LAZER)]
    )

    assert all(len(g.descricao) <= 200 for g in criados)
    assert [g.descricao[-6:] for g in criados] == [" (1/2)", " (2/2)"]


@pytest.mark.parametrize(
    ("partes", "erro"),
    [
        ([parte(100, CategoriaDoGasto.LAZER)], DivisaoInvalida),
        ([parte(60, CategoriaDoGasto.LAZER), parte(60, CategoriaDoGasto.LAZER)], DivisaoInvalida),
        ([parte(50, None), parte(50, CategoriaDoGasto.LAZER)], TransacaoImportadaInvalida),
        (
            [parte(50, CategoriaDoGasto.INVESTIMENTOS, "casa"), parte(50, CategoriaDoGasto.LAZER)],
            CategoriaInvalida,
        ),
    ],
)
def test_divisao_invalida_da_saida_nao_grava_nada(unidade_de_trabalho, partes, erro):
    _, t = montar(unidade_de_trabalho)

    with pytest.raises(erro):
        AceitarTransacaoImportadaDividida(unidade_de_trabalho).executar(USUARIO, t.id, partes)

    assert unidade_de_trabalho.confirmado.gastos == {}
    assert estado(unidade_de_trabalho, t) == EstadoDaTransacaoImportada.PENDENTE


def test_entrada_com_categoria_e_recusada(unidade_de_trabalho):
    _, t = montar(unidade_de_trabalho, 1000, SentidoDaTransacao.ENTRADA)

    with pytest.raises(TransacaoImportadaInvalida):
        AceitarTransacaoImportadaDividida(unidade_de_trabalho).executar(
            USUARIO, t.id, [parte(50, CategoriaDoGasto.LAZER), parte(50)]
        )


def test_inexistente_de_outro_usuario_ou_ja_tratada(unidade_de_trabalho):
    _, t = montar(unidade_de_trabalho)
    caso = AceitarTransacaoImportadaDividida(unidade_de_trabalho)
    partes = [parte(50, CategoriaDoGasto.LAZER), parte(50, CategoriaDoGasto.LAZER)]

    with pytest.raises(TransacaoImportadaNaoEncontrada):
        caso.executar(uuid4(), t.id, partes)
    caso.executar(USUARIO, t.id, partes)
    with pytest.raises(TransacaoJaTratada):
        caso.executar(USUARIO, t.id, partes)


def test_parte_com_marcador_vira_aporte_e_as_outras_seguem_gasto(
    unidade_de_trabalho,
):
    conta, t = montar(unidade_de_trabalho, valor=10001)
    with unidade_de_trabalho as u:
        u.investimentos.salvar_posicao(
            USUARIO, InvestimentoExterno("x", "CDB", "FIXED_INCOME", "CDB", Dinheiro(0), "{}"), DIA
        )
        u.commit()
        inv = u.investimentos.listar_posicoes(USUARIO)[0]
    aporte = ParteDaTransacao(
        None,
        (),
        60,
        como_investimento=True,
        investimento_id=inv.id,
        destinacoes=(Destinacao(Tag.de_texto("casa"), 100),),
    )

    criados = AceitarTransacaoImportadaDividida(unidade_de_trabalho).executar(
        USUARIO, t.id, [aporte, parte(40, CategoriaDoGasto.LAZER)]
    )

    assert isinstance(criados[0], MovimentoDeInvestimento)
    assert (criados[0].valor.centavos, criados[0].descricao) == (6001, "Mercado (1/2)")
    assert isinstance(criados[1], Gasto)
    assert criados[1].valor.centavos == 4000
    estado_final = unidade_de_trabalho.confirmado
    assert len(estado_final.movimentos_de_investimento) == 1
    assert len(estado_final.gastos) == 1
    assert estado(unidade_de_trabalho, t) == EstadoDaTransacaoImportada.ACEITA


def test_parte_de_aporte_com_investimento_de_outro_usuario_nao_grava_nada(unidade_de_trabalho):
    _, t = montar(unidade_de_trabalho)
    aporte = ParteDaTransacao(
        None,
        (),
        50,
        como_investimento=True,
        investimento_id=uuid4(),
        destinacoes=(Destinacao(Tag.de_texto("casa"), 100),),
    )

    with pytest.raises(InvestimentoNaoEncontrado):
        AceitarTransacaoImportadaDividida(unidade_de_trabalho).executar(
            USUARIO, t.id, [aporte, parte(50, CategoriaDoGasto.LAZER)]
        )

    assert unidade_de_trabalho.confirmado.movimentos_de_investimento == {}
    assert estado(unidade_de_trabalho, t) == EstadoDaTransacaoImportada.PENDENTE


@pytest.mark.parametrize("sentido", list(SentidoDaTransacao))
@pytest.mark.parametrize("valor", [10001, 1])
def test_divisao_guarda_o_mesmo_vinculo_em_todas_as_partes(unidade_de_trabalho, sentido, valor):
    _, t = montar(unidade_de_trabalho, valor, sentido)
    partes = (
        [
            parte(30, CategoriaDoGasto.LAZER),
            ParteDaTransacao(None, (), 30, como_investimento=True),
            ParteDaTransacao(None, (), 40, como_investimento=True),
        ]
        if sentido == SentidoDaTransacao.SAIDA
        else [parte(40), parte(60)]
    )
    criados = AceitarTransacaoImportadaDividida(unidade_de_trabalho).executar(USUARIO, t.id, partes)
    assert criados
    assert {c.transacao_importada_id for c in criados} == {t.id}
