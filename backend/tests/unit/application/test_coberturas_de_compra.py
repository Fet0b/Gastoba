from datetime import date
from uuid import uuid4

import pytest

from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.destinacao import ParteDeDestinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.gasto import Gasto
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.tag import Tag


def test_associar_desfazer_reservas_e_metricas(unidade_de_trabalho, semear_conta):
    from gastoba.application.associar_compra_a_destinacao import AssociarCompraADestinacao
    from gastoba.application.desassociar_compra_da_destinacao import DesassociarCompraDaDestinacao
    from gastoba.application.listar_reservas_das_destinacoes import ListarReservasDasDestinacoes
    from gastoba.domain.excecoes import (
        CoberturaInvalida,
        CoberturaJaExiste,
        CoberturaNaoEncontrada,
        GastoNaoEncontrado,
    )

    dono = uuid4()
    conta = semear_conta(usuario_id=dono)
    g = Gasto(
        conta.id,
        Dinheiro(8000),
        "Compra fictícia",
        date(2026, 10, 10),
        CategoriaDoGasto.CONFORTO,
        (),
    )
    m = MovimentoDeInvestimento(
        conta.id,
        TipoDeMovimento.APORTE,
        Dinheiro(10000),
        "Aporte fictício",
        g.data,
        categoria=g.categoria,
    )
    with unidade_de_trabalho as u:
        u.gastos.adicionar(g)
        u.movimentos_de_investimento.adicionar(m)
        u.destinacoes.adicionar(
            m.id,
            [
                ParteDeDestinacao(Tag("celular"), Dinheiro(6000)),
                ParteDeDestinacao(Tag("viagem"), Dinheiro(4000)),
            ],
        )
        u.commit()
    associar = AssociarCompraADestinacao(unidade_de_trabalho)
    c = associar.executar(dono, g.id, "celular", Dinheiro(3000))
    with pytest.raises(CoberturaJaExiste):
        associar.executar(dono, g.id, "celular", Dinheiro(1))
    with pytest.raises(CoberturaInvalida):
        associar.executar(dono, g.id, "viagem", Dinheiro(5001))
    with pytest.raises(GastoNaoEncontrado):
        associar.executar(uuid4(), g.id, "viagem", Dinheiro(1))
    reservas = ListarReservasDasDestinacoes(unidade_de_trabalho).executar(dono, g.categoria)
    assert [(str(r.tag), r.disponivel.centavos) for r in reservas] == [
        ("viagem", 4000),
        ("celular", 3000),
    ]
    with unidade_de_trabalho as u:
        assert u.gastos.somar_por_categoria(dono, g.data, g.data)[g.categoria] == Dinheiro(5000)
        assert u.gastos.obter(dono, g.id).valor == Dinheiro(8000)
    desfazer = DesassociarCompraDaDestinacao(unidade_de_trabalho)
    with pytest.raises(CoberturaNaoEncontrada):
        desfazer.executar(uuid4(), g.id, c.id)
    desfazer.executar(dono, g.id, c.id)
    assert not unidade_de_trabalho.confirmado.coberturas
    assert unidade_de_trabalho.confirmado.movimentos_de_investimento[m.id].valor == m.valor
