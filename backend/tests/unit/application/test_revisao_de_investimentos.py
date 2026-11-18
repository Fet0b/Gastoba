from datetime import date
from uuid import uuid4

import pytest

from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.gasto import Gasto
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.recorrencia import Recorrencia, TipoDeRecorrencia


def test_revisao_preserva_financas_e_nao_converte_gasto(unidade_de_trabalho, semear_conta):
    from gastoba.application.listar_pendencias_de_revisao import ListarPendenciasDeRevisao
    from gastoba.application.revisar_aporte import RevisarAporte
    from gastoba.application.revisar_gasto_legado import RevisarGastoLegado
    from gastoba.application.revisar_recorrencia_legada import RevisarRecorrenciaLegada
    from gastoba.domain.excecoes import GastoNaoEncontrado, RevisaoNaoPendente

    dono = uuid4()
    conta = semear_conta(usuario_id=dono)
    g = Gasto(
        conta.id,
        Dinheiro(2000),
        "Compra legada fictícia",
        date(2026, 10, 10),
        CategoriaDoGasto.INVESTIMENTOS,
        (),
    )
    m = MovimentoDeInvestimento(
        conta.id,
        TipoDeMovimento.APORTE,
        Dinheiro(7000),
        "Aporte fictício",
        g.data,
        revisao_pendente=True,
    )
    r = Recorrencia(
        dono,
        TipoDeRecorrencia.GASTO,
        conta.id,
        Dinheiro(1000),
        "Recorrência fictícia",
        10,
        g.data,
        CategoriaDoGasto.INVESTIMENTOS,
        (),
    )
    with unidade_de_trabalho as u:
        u.gastos.adicionar(g)
        u.movimentos_de_investimento.adicionar(m)
        u.recorrencias.adicionar(r)
        u.commit()
    pendencias = ListarPendenciasDeRevisao(unidade_de_trabalho).executar(dono)
    assert [len(pendencias.aportes), len(pendencias.gastos), len(pendencias.recorrencias)] == [
        1,
        1,
        1,
    ]
    with pytest.raises(GastoNaoEncontrado):
        RevisarGastoLegado(unidade_de_trabalho).executar(uuid4(), g.id, CategoriaDoGasto.LAZER)
    RevisarAporte(unidade_de_trabalho).executar(dono, m.id, None)
    RevisarGastoLegado(unidade_de_trabalho).executar(dono, g.id, CategoriaDoGasto.LAZER)
    RevisarRecorrenciaLegada(unidade_de_trabalho).executar(dono, r.id, CategoriaDoGasto.GASTO_FIXO)
    estado = unidade_de_trabalho.confirmado
    assert (estado.gastos[g.id].valor, estado.gastos[g.id].data, estado.gastos[g.id].conta_id) == (
        g.valor,
        g.data,
        g.conta_id,
    )
    assert estado.gastos[g.id].categoria == CategoriaDoGasto.LAZER
    assert len(estado.movimentos_de_investimento) == 1
    assert estado.recorrencias[r.id].ativa
    assert estado.contas[conta.id].saldo == conta.saldo
    with pytest.raises(RevisaoNaoPendente):
        RevisarAporte(unidade_de_trabalho).executar(dono, m.id, None)
    assert not ListarPendenciasDeRevisao(unidade_de_trabalho).executar(dono).gastos


def test_edicao_comum_nao_remove_recorrencia_da_revisao(unidade_de_trabalho, semear_conta):
    from gastoba.application.alterar_recorrencia import AlterarRecorrencia
    from gastoba.domain.excecoes import RecorrenciaEmRevisao

    dono = uuid4()
    conta = semear_conta(usuario_id=dono)
    r = Recorrencia(
        dono,
        TipoDeRecorrencia.GASTO,
        conta.id,
        Dinheiro(1000),
        "Recorrência fictícia",
        10,
        date(2026, 10, 10),
        CategoriaDoGasto.INVESTIMENTOS,
        (),
    )
    with unidade_de_trabalho as u:
        u.recorrencias.adicionar(r)
        u.commit()
    for categoria in [CategoriaDoGasto.CONFORTO, CategoriaDoGasto.INVESTIMENTOS]:
        with pytest.raises(RecorrenciaEmRevisao):
            AlterarRecorrencia(unidade_de_trabalho).executar(
                dono, r.id, Dinheiro(1200), "Alteração fictícia", 12, categoria, [], None
            )
    assert (
        unidade_de_trabalho.confirmado.recorrencias[r.id].categoria
        == CategoriaDoGasto.INVESTIMENTOS
    )


def test_liberdade_preserva_legado_e_categoria_soma_so_compra_liquida(
    unidade_de_trabalho, semear_conta
):
    from gastoba.application.consultar_progresso_das_metas import ConsultarProgressoDasMetas
    from gastoba.application.revisar_gasto_legado import RevisarGastoLegado
    from gastoba.domain.cobertura_de_compra import CoberturaDeCompra
    from gastoba.domain.mes import Mes
    from gastoba.domain.meta import AlvoDaMeta, Meta
    from gastoba.domain.tag import Tag

    dono = uuid4()
    conta = semear_conta(usuario_id=dono)
    dia = date(2026, 10, 10)
    legado = Gasto(
        conta.id, Dinheiro(2000), "Legado fictício", dia, CategoriaDoGasto.INVESTIMENTOS, ()
    )
    compra = Gasto(conta.id, Dinheiro(8000), "Compra fictícia", dia, CategoriaDoGasto.CONFORTO, ())
    with unidade_de_trabalho as u:
        u.gastos.adicionar(legado)
        u.gastos.adicionar(compra)
        u.gastos.adicionar(
            Gasto(
                conta.id,
                Dinheiro(10000),
                "Outra compra fictícia",
                dia,
                CategoriaDoGasto.CONFORTO,
                (),
            )
        )
        for valor, categoria in [(5000, CategoriaDoGasto.CONFORTO), (7000, None)]:
            u.movimentos_de_investimento.adicionar(
                MovimentoDeInvestimento(
                    conta.id,
                    TipoDeMovimento.APORTE,
                    Dinheiro(valor),
                    "Aporte fictício",
                    dia,
                    categoria=categoria,
                )
            )
        u.coberturas.adicionar(CoberturaDeCompra(compra.id, Tag("celular"), Dinheiro(3000)))
        for alvo in [AlvoDaMeta.LIBERDADE_FINANCEIRA, AlvoDaMeta.CONFORTO, AlvoDaMeta.LAZER]:
            u.metas.salvar(Meta(dono, alvo, 20))
        u.commit()
    caso = ConsultarProgressoDasMetas(unidade_de_trabalho)
    valores = {p.alvo: p.gasto for p in caso.executar(dono, Mes(2026, 10)).progressos}
    assert valores[AlvoDaMeta.LIBERDADE_FINANCEIRA] == Dinheiro(14000)
    assert valores[AlvoDaMeta.CONFORTO] == Dinheiro(15000)
    RevisarGastoLegado(unidade_de_trabalho).executar(dono, legado.id, CategoriaDoGasto.LAZER)
    valores = {p.alvo: p.gasto for p in caso.executar(dono, Mes(2026, 10)).progressos}
    assert valores[AlvoDaMeta.LIBERDADE_FINANCEIRA] == Dinheiro(12000)
    assert valores[AlvoDaMeta.LAZER] == Dinheiro(2000)
    assert len(unidade_de_trabalho.confirmado.movimentos_de_investimento) == 2
    assert unidade_de_trabalho.confirmado.gastos[compra.id].valor == Dinheiro(8000)


def test_revisao_de_aporte_faz_rollback_se_associacao_falhar(unidade_de_trabalho, semear_conta):
    from gastoba.application.revisar_aporte import RevisarAporte
    from gastoba.domain.excecoes import InvestimentoNaoEncontrado

    dono = uuid4()
    conta = semear_conta(usuario_id=dono)
    m = MovimentoDeInvestimento(
        conta.id,
        TipoDeMovimento.APORTE,
        Dinheiro(7000),
        "Aporte fictício",
        date(2026, 10, 10),
        revisao_pendente=True,
    )
    with unidade_de_trabalho as u:
        u.movimentos_de_investimento.adicionar(m)
        u.commit()
    commits = unidade_de_trabalho.commits
    with pytest.raises(InvestimentoNaoEncontrado):
        RevisarAporte(unidade_de_trabalho).executar(dono, m.id, None, investimento_id=uuid4())
    lido = unidade_de_trabalho.confirmado.movimentos_de_investimento[m.id]
    assert lido.revisao_pendente and lido.categoria is None and lido.investimento_id is None
    assert (lido.valor, lido.data, lido.conta_id) == (m.valor, m.data, m.conta_id)
    assert unidade_de_trabalho.commits == commits
