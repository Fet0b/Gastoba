from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.aceitar_transacao_importada import AceitarTransacaoImportada
from gastoba.application.aceitar_transacoes_importadas_em_lote import (
    AceitarTransacoesImportadasEmLote,
)
from gastoba.application.associar_movimento_ao_investimento import (
    AssociarMovimentoAoInvestimento,
)
from gastoba.application.consultar_historico_de_investimentos import (
    ConsultarHistoricoDeInvestimentos,
)
from gastoba.application.desfazer_classificacao_de_investimento import (
    DesfazerClassificacaoDeInvestimento,
)
from gastoba.application.listar_investimentos import ListarInvestimentos
from gastoba.application.listar_movimentos_de_investimento import ListarMovimentosDeInvestimento
from gastoba.application.realocar_destinacao import RealocarDestinacao
from gastoba.application.registrar_gasto import RegistrarGasto
from gastoba.application.resumir_investimentos import ResumirInvestimentos, VisaoDosInvestimentos
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.conta import Conta, OrigemDaConta
from gastoba.domain.destinacao import Destinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import (
    CategoriaInvalida,
    DestinacaoInvalida,
    InvestimentoNaoEncontrado,
    MovimentoJaAssociado,
    PrincipalInsuficiente,
    ResgateMaiorQueOValorDaDestinacao,
    TransacaoImportadaInvalida,
)
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.tag import Tag
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    SentidoDaTransacao,
    TransacaoImportada,
)

USUARIO = uuid4()
OUTRO = uuid4()
DIA = date(2026, 10, 10)


def lci(centavos):
    return InvestimentoExterno("lci", "LCI BTG", "FIXED_INCOME", "LCI", Dinheiro(centavos), "{}")


def tag(texto):
    return Tag.de_texto(texto)


def destinos(**percentuais):
    return [Destinacao(tag(t), p) for t, p in percentuais.items()]


def montar(uow, saldo=0):
    conta = Conta(USUARIO, "Banco", Dinheiro(500000), origem=OrigemDaConta.OPEN_FINANCE)
    with uow as u:
        u.contas.adicionar(conta)
        u.investimentos.salvar_posicao(
            USUARIO,
            lci(saldo),
            DIA,
        )
        u.commit()
    with uow as u:
        investimento = u.investimentos.listar_posicoes(USUARIO)[0]
    return conta, investimento


def transacao(uow, conta, valor=100001, sentido=SentidoDaTransacao.SAIDA, externo="t1"):
    t = TransacaoImportada(conta.id, externo, DIA, "Aplicação", Dinheiro(valor), sentido)
    with uow as u:
        u.transacoes_importadas.adicionar_se_nova(t)
        u.commit()
    return t


def aportar(uow, conta, investimento, valor=100001, externo="t1", **percentuais):
    t = transacao(uow, conta, valor, externo=externo)
    return AceitarTransacaoImportada(uow).executar(
        USUARIO,
        t.id,
        None,
        [],
        como_investimento=True,
        investimento_id=investimento.id,
        destinacoes=destinos(**percentuais),
    )


def principais(uow, investimento):
    with uow as u:
        return {
            str(t): v.centavos
            for t, v in u.destinacoes.principais(USUARIO)[investimento.id].items()
        }


def test_aporte_com_destinacoes_soma_exatamente_o_valor(unidade_de_trabalho):
    conta, inv = montar(unidade_de_trabalho)

    movimento = aportar(unidade_de_trabalho, conta, inv, casa=33, viagem=33, reserva=34)

    assert movimento.investimento_id == inv.id
    assert principais(unidade_de_trabalho, inv) == {
        "casa": 33001,
        "viagem": 33000,
        "reserva": 34000,
    }
    assert sum(principais(unidade_de_trabalho, inv).values()) == 100001


def test_destinacoes_que_nao_somam_100_sao_recusadas_sem_gravar(unidade_de_trabalho):
    conta, inv = montar(unidade_de_trabalho)
    t = transacao(unidade_de_trabalho, conta)

    with pytest.raises(DestinacaoInvalida):
        AceitarTransacaoImportada(unidade_de_trabalho).executar(
            USUARIO,
            t.id,
            None,
            [],
            como_investimento=True,
            investimento_id=inv.id,
            destinacoes=destinos(casa=50, viagem=40),
        )

    estado = unidade_de_trabalho.confirmado
    assert estado.movimentos_de_investimento == {}
    assert estado.transacoes_importadas[t.id].estado == EstadoDaTransacaoImportada.PENDENTE


def test_investimento_de_outro_usuario_ou_inexistente_da_nao_encontrado(unidade_de_trabalho):
    conta, _ = montar(unidade_de_trabalho)
    t = transacao(unidade_de_trabalho, conta)

    with pytest.raises(InvestimentoNaoEncontrado):
        AceitarTransacaoImportada(unidade_de_trabalho).executar(
            USUARIO,
            t.id,
            None,
            [],
            como_investimento=True,
            investimento_id=uuid4(),
            destinacoes=destinos(casa=100),
        )


def test_destinacoes_sem_investimento_sao_recusadas(unidade_de_trabalho):
    conta, _ = montar(unidade_de_trabalho)
    t = transacao(unidade_de_trabalho, conta)

    with pytest.raises(TransacaoImportadaInvalida):
        AceitarTransacaoImportada(unidade_de_trabalho).executar(
            USUARIO, t.id, None, [], como_investimento=True, destinacoes=destinos(casa=100)
        )


def test_realocar_move_principal_sem_mudar_o_total(unidade_de_trabalho):
    conta, inv = montar(unidade_de_trabalho)
    aportar(unidade_de_trabalho, conta, inv, valor=100000, casa=100)

    RealocarDestinacao(unidade_de_trabalho).executar(
        USUARIO, inv.id, "Casa", "Viagem", DIA, percentual=25
    )
    RealocarDestinacao(unidade_de_trabalho).executar(
        USUARIO, inv.id, "casa", "reserva", DIA, valor=Dinheiro(5000)
    )

    assert principais(unidade_de_trabalho, inv) == {"casa": 70000, "viagem": 25000, "reserva": 5000}


def test_realocar_acima_do_principal_ou_com_valor_e_percentual_e_recusado(unidade_de_trabalho):
    conta, inv = montar(unidade_de_trabalho)
    aportar(unidade_de_trabalho, conta, inv, valor=10000, casa=100)
    caso = RealocarDestinacao(unidade_de_trabalho)

    with pytest.raises(PrincipalInsuficiente):
        caso.executar(USUARIO, inv.id, "casa", "viagem", DIA, valor=Dinheiro(10001))
    with pytest.raises(PrincipalInsuficiente):
        caso.executar(USUARIO, inv.id, "viagem", "casa", DIA, valor=Dinheiro(1))
    with pytest.raises(DestinacaoInvalida):
        caso.executar(USUARIO, inv.id, "casa", "viagem", DIA, valor=Dinheiro(1), percentual=10)
    with pytest.raises(DestinacaoInvalida):
        caso.executar(USUARIO, inv.id, "casa", "casa", DIA, valor=Dinheiro(1))
    with pytest.raises(InvestimentoNaoEncontrado):
        caso.executar(OUTRO, inv.id, "casa", "viagem", DIA, valor=Dinheiro(1))


def test_resgate_reduz_o_principal_e_nao_passa_dele(unidade_de_trabalho):
    conta, inv = montar(unidade_de_trabalho)
    aportar(unidade_de_trabalho, conta, inv, valor=100000, casa=50, viagem=50)
    entrada = transacao(unidade_de_trabalho, conta, 20000, SentidoDaTransacao.ENTRADA, "t2")

    AceitarTransacaoImportada(unidade_de_trabalho).executar(
        USUARIO,
        entrada.id,
        None,
        [],
        como_investimento=True,
        investimento_id=inv.id,
        destinacoes=destinos(casa=100),
    )

    assert principais(unidade_de_trabalho, inv) == {"casa": 30000, "viagem": 50000}
    grande = transacao(unidade_de_trabalho, conta, 40000, SentidoDaTransacao.ENTRADA, "t3")
    with pytest.raises(PrincipalInsuficiente):
        AceitarTransacaoImportada(unidade_de_trabalho).executar(
            USUARIO,
            grande.id,
            None,
            [],
            como_investimento=True,
            investimento_id=inv.id,
            destinacoes=destinos(casa=100),
        )


def test_listar_ratea_o_rendimento_proporcionalmente_ao_principal(unidade_de_trabalho):
    conta, inv = montar(unidade_de_trabalho)
    aportar(unidade_de_trabalho, conta, inv, valor=30000, casa=100)
    aportar(unidade_de_trabalho, conta, inv, valor=10000, externo="t2", viagem=100)
    with unidade_de_trabalho as u:
        u.investimentos.salvar_posicao(
            USUARIO,
            lci(41001),
        )
        u.commit()

    [posicao] = ListarInvestimentos(unidade_de_trabalho).executar(USUARIO)

    assert [
        (str(d.tag), d.principal.centavos, d.valor_atual.centavos) for d in posicao.destinacoes
    ] == [
        ("casa", 30000, 30751),
        ("viagem", 10000, 10250),
    ]


def test_resumo_por_destinacao_e_por_tipo_somam_o_saldo(unidade_de_trabalho):
    conta, inv = montar(unidade_de_trabalho, saldo=100000)
    with unidade_de_trabalho as u:
        u.investimentos.salvar_posicao(
            USUARIO, InvestimentoExterno("acao", "PETR4", "EQUITY", None, Dinheiro(50000), "{}")
        )
        u.commit()
    aportar(unidade_de_trabalho, conta, inv, valor=100000, casa=60, viagem=40)

    por_destino = ResumirInvestimentos(unidade_de_trabalho).executar(
        USUARIO, VisaoDosInvestimentos.DESTINACAO
    )
    por_tipo = ResumirInvestimentos(unidade_de_trabalho).executar(
        USUARIO, VisaoDosInvestimentos.TIPO
    )

    assert por_destino.total == Dinheiro(150000)
    assert [(f.rotulo, f.valor.centavos) for f in por_destino.fatias] == [
        ("casa", 60000),
        (None, 50000),
        ("viagem", 40000),
    ]
    assert [(f.rotulo, f.valor.centavos) for f in por_tipo.fatias] == [
        ("FIXED_INCOME", 100000),
        ("EQUITY", 50000),
    ]


def test_associar_movimento_antigo_e_so_uma_vez(unidade_de_trabalho):
    conta, inv = montar(unidade_de_trabalho)
    t = transacao(unidade_de_trabalho, conta, 50000)
    movimento = AceitarTransacaoImportada(unidade_de_trabalho).executar(
        USUARIO, t.id, None, [], como_investimento=True
    )

    AssociarMovimentoAoInvestimento(unidade_de_trabalho).executar(
        USUARIO, movimento.id, inv.id, destinos(casa=100)
    )

    assert principais(unidade_de_trabalho, inv) == {"casa": 50000}
    with pytest.raises(MovimentoJaAssociado):
        AssociarMovimentoAoInvestimento(unidade_de_trabalho).executar(
            USUARIO, movimento.id, inv.id, destinos(casa=100)
        )
    [m] = ListarMovimentosDeInvestimento(unidade_de_trabalho).executar(USUARIO, DIA, DIA)
    assert [(str(t), v.centavos) for t, v in m.destinacoes] == [("casa", 50000)]


def test_historico_guarda_um_saldo_por_dia_e_so_do_usuario(unidade_de_trabalho):
    _, inv = montar(unidade_de_trabalho, saldo=1000)
    with unidade_de_trabalho as u:
        u.investimentos.salvar_posicao(
            USUARIO,
            lci(1500),
            DIA,
        )
        u.investimentos.salvar_posicao(
            USUARIO,
            lci(1600),
            date(2026, 10, 11),
        )
        u.commit()

    consulta = ConsultarHistoricoDeInvestimentos(unidade_de_trabalho)
    pontos = consulta.executar(USUARIO, DIA, date(2026, 10, 12))

    assert [(p.data.day, p.saldo.centavos) for p in pontos] == [(10, 1500), (11, 1600)]
    assert consulta.executar(OUTRO, DIA, date(2026, 10, 12)) == []


def test_aceitar_em_lote_categoriza_todas_numa_transacao(unidade_de_trabalho):
    conta, _ = montar(unidade_de_trabalho)
    ids = [transacao(unidade_de_trabalho, conta, 1000 + i, externo=f"t{i}").id for i in range(3)]

    lancamentos = AceitarTransacoesImportadasEmLote(unidade_de_trabalho).executar(
        USUARIO, ids, CategoriaDoGasto.LAZER, ["Pix"]
    )

    estado = unidade_de_trabalho.confirmado
    assert len(lancamentos) == 3
    assert {g.categoria for g in estado.gastos.values()} == {CategoriaDoGasto.LAZER}
    assert all(
        t.estado == EstadoDaTransacaoImportada.ACEITA for t in estado.transacoes_importadas.values()
    )


def test_lote_e_tudo_ou_nada(unidade_de_trabalho):
    conta, _ = montar(unidade_de_trabalho)
    boas = [transacao(unidade_de_trabalho, conta, 1000, externo=f"t{i}").id for i in range(2)]
    caso = AceitarTransacoesImportadasEmLote(unidade_de_trabalho)

    for ruins in ([uuid4()], [boas[0], boas[0]]):
        with pytest.raises((Exception,)) as erro:
            caso.executar(USUARIO, [boas[1], *ruins], CategoriaDoGasto.LAZER, [])
        assert erro.type.__name__ in {"TransacaoImportadaNaoEncontrada", "TransacaoJaTratada"}

    entrada = transacao(unidade_de_trabalho, conta, 500, SentidoDaTransacao.ENTRADA, "e1")
    with pytest.raises(TransacaoImportadaInvalida):
        caso.executar(USUARIO, [boas[1], entrada.id], CategoriaDoGasto.LAZER, [])
    with pytest.raises(TransacaoImportadaInvalida):
        caso.executar(USUARIO, [], CategoriaDoGasto.LAZER, [])

    estado = unidade_de_trabalho.confirmado
    assert estado.gastos == {}
    assert all(
        t.estado == EstadoDaTransacaoImportada.PENDENTE
        for t in estado.transacoes_importadas.values()
    )


def test_lote_de_aportes_e_lote_de_outro_usuario(unidade_de_trabalho):
    conta, inv = montar(unidade_de_trabalho)
    ids = [transacao(unidade_de_trabalho, conta, 10000, externo=f"t{i}").id for i in range(2)]

    caso = AceitarTransacoesImportadasEmLote(unidade_de_trabalho)
    with pytest.raises(Exception, match="não encontrada"):
        caso.executar(OUTRO, ids, CategoriaDoGasto.LAZER, [])
    caso.executar(
        USUARIO,
        ids,
        None,
        [],
        como_investimento=True,
        investimento_id=inv.id,
        destinacoes=destinos(casa=100),
    )

    assert principais(unidade_de_trabalho, inv) == {"casa": 20000}


def test_categoria_investimentos_nao_vale_como_gasto(unidade_de_trabalho):
    conta, _ = montar(unidade_de_trabalho)
    t = transacao(unidade_de_trabalho, conta)

    with pytest.raises(CategoriaInvalida):
        RegistrarGasto(unidade_de_trabalho).executar(
            USUARIO, conta.id, Dinheiro(100), "LCI", DIA, CategoriaDoGasto.INVESTIMENTOS, []
        )
    with pytest.raises(CategoriaInvalida):
        AceitarTransacaoImportada(unidade_de_trabalho).executar(
            USUARIO, t.id, CategoriaDoGasto.INVESTIMENTOS, []
        )
    assert unidade_de_trabalho.confirmado.gastos == {}


def test_marcador_explicito_na_caixa_vira_aporte_com_destinacoes(unidade_de_trabalho):
    conta, inv = montar(unidade_de_trabalho)
    t = transacao(unidade_de_trabalho, conta)

    movimento = AceitarTransacaoImportada(unidade_de_trabalho).executar(
        USUARIO,
        t.id,
        None,
        [],
        como_investimento=True,
        investimento_id=inv.id,
        destinacoes=destinos(casa=100),
    )

    assert movimento.tipo.value == "aporte"
    assert unidade_de_trabalho.confirmado.gastos == {}
    assert principais(unidade_de_trabalho, inv) == {"casa": 100001}


def test_marcador_na_caixa_sem_investimento_fica_para_associar_depois(
    unidade_de_trabalho,
):
    conta, _ = montar(unidade_de_trabalho)
    t = transacao(unidade_de_trabalho, conta)

    movimento = AceitarTransacaoImportada(unidade_de_trabalho).executar(
        USUARIO, t.id, None, [], como_investimento=True
    )

    assert movimento.investimento_id is None


def test_categoria_investimentos_com_tags_e_recusada_e_na_entrada_tambem(unidade_de_trabalho):
    conta, _ = montar(unidade_de_trabalho)
    saida = transacao(unidade_de_trabalho, conta)
    entrada = transacao(unidade_de_trabalho, conta, 500, SentidoDaTransacao.ENTRADA, "e1")
    caso = AceitarTransacaoImportada(unidade_de_trabalho)

    with pytest.raises(CategoriaInvalida):
        caso.executar(USUARIO, saida.id, CategoriaDoGasto.INVESTIMENTOS, ["casa"])
    with pytest.raises(CategoriaInvalida):
        caso.executar(USUARIO, entrada.id, CategoriaDoGasto.INVESTIMENTOS, [])


def test_lote_com_marcador_sem_categoria_vira_aportes(unidade_de_trabalho):
    conta, inv = montar(unidade_de_trabalho)
    ids = [transacao(unidade_de_trabalho, conta, 10000, externo=f"t{i}").id for i in range(2)]

    lancamentos = AceitarTransacoesImportadasEmLote(unidade_de_trabalho).executar(
        USUARIO,
        ids,
        None,
        [],
        como_investimento=True,
        investimento_id=inv.id,
        destinacoes=destinos(reserva=100),
    )

    assert [m.tipo.value for m in lancamentos] == ["aporte", "aporte"]
    assert unidade_de_trabalho.confirmado.gastos == {}
    assert principais(unidade_de_trabalho, inv) == {"reserva": 20000}


DIA_ANTERIOR = date(2026, 10, 9)


def posicao_antes_do_resgate(uow, saldo_anterior, saldo_atual):
    """Guarda o saldo do dia anterior ao resgate e depois o saldo atual (sem histórico)."""
    with uow as u:
        u.investimentos.salvar_posicao(USUARIO, lci(saldo_anterior), DIA_ANTERIOR)
        u.investimentos.salvar_posicao(USUARIO, lci(saldo_atual))
        u.commit()


def resgatar(uow, conta, investimento, valor, externo="r1", **percentuais):
    t = transacao(uow, conta, valor, SentidoDaTransacao.ENTRADA, externo)
    return AceitarTransacaoImportada(uow).executar(
        USUARIO,
        t.id,
        None,
        [],
        como_investimento=True,
        investimento_id=investimento.id,
        destinacoes=destinos(**percentuais),
    )


def valores_atuais(uow):
    [posicao] = ListarInvestimentos(uow).executar(USUARIO)
    return {
        str(d.tag): (d.principal.centavos, d.valor_atual.centavos) for d in posicao.destinacoes
    }, posicao


def test_saldo_antes_de_usa_o_ultimo_ponto_estritamente_anterior(unidade_de_trabalho):
    _, inv = montar(unidade_de_trabalho)
    with unidade_de_trabalho as u:
        u.investimentos.salvar_posicao(USUARIO, lci(1000), date(2026, 10, 1))
        u.investimentos.salvar_posicao(USUARIO, lci(2000), date(2026, 10, 5))
        u.commit()
    with unidade_de_trabalho as u:
        repo = u.investimentos
        assert repo.saldo_antes_de(USUARIO, inv.id, date(2026, 10, 5)) == Dinheiro(1000)
        assert repo.saldo_antes_de(USUARIO, inv.id, date(2026, 10, 6)) == Dinheiro(2000)
        assert repo.saldo_antes_de(USUARIO, inv.id, date(2026, 10, 1)) is None
        assert repo.saldo_antes_de(OUTRO, inv.id, date(2026, 10, 6)) is None


def test_resgate_parcial_abate_o_principal_por_custo_medio(unidade_de_trabalho):
    conta, inv = montar(unidade_de_trabalho)
    aportar(unidade_de_trabalho, conta, inv, valor=200000, viagem=50, casa=50)
    posicao_antes_do_resgate(unidade_de_trabalho, 220000, 165000)

    resgatar(unidade_de_trabalho, conta, inv, 55000, viagem=100)

    por_tag, posicao = valores_atuais(unidade_de_trabalho)
    assert por_tag == {"casa": (100000, 110000), "viagem": (50000, 55000)}
    assert (
        posicao.rendimento is None
    )  # T075: sem estimativa pelos aportes (o custo médio acima vale)
    assert posicao.rentabilidade is None


def test_resgate_total_da_tag_com_lucro_zera_o_principal(unidade_de_trabalho):
    conta, inv = montar(unidade_de_trabalho)
    aportar(unidade_de_trabalho, conta, inv, valor=200000, viagem=50, casa=50)
    posicao_antes_do_resgate(unidade_de_trabalho, 220000, 110000)

    resgatar(unidade_de_trabalho, conta, inv, 110000, viagem=100)

    assert principais(unidade_de_trabalho, inv) == {"casa": 100000}


def test_resgate_maior_que_o_valor_da_tag_e_recusado(unidade_de_trabalho):
    conta, inv = montar(unidade_de_trabalho)
    aportar(unidade_de_trabalho, conta, inv, valor=200000, viagem=50, casa=50)
    posicao_antes_do_resgate(unidade_de_trabalho, 220000, 110000)

    with pytest.raises(ResgateMaiorQueOValorDaDestinacao, match="viagem"):
        resgatar(unidade_de_trabalho, conta, inv, 110001, viagem=100)

    assert principais(unidade_de_trabalho, inv) == {"casa": 100000, "viagem": 100000}


def test_resgate_sem_historico_usa_a_regra_antiga(unidade_de_trabalho):
    conta, inv = montar(unidade_de_trabalho)
    aportar(unidade_de_trabalho, conta, inv, valor=200000, viagem=50, casa=50)

    resgatar(unidade_de_trabalho, conta, inv, 55000, viagem=100)

    assert principais(unidade_de_trabalho, inv) == {"casa": 100000, "viagem": 45000}
    with pytest.raises(PrincipalInsuficiente):
        resgatar(unidade_de_trabalho, conta, inv, 45001, "r2", viagem=100)


def test_resgate_com_saldo_anterior_zero_usa_a_regra_antiga(unidade_de_trabalho):
    conta, inv = montar(unidade_de_trabalho)
    aportar(unidade_de_trabalho, conta, inv, valor=200000, viagem=50, casa=50)
    posicao_antes_do_resgate(unidade_de_trabalho, 0, 0)

    resgatar(unidade_de_trabalho, conta, inv, 55000, viagem=100)

    assert principais(unidade_de_trabalho, inv) == {"casa": 100000, "viagem": 45000}


def test_resgate_dividido_com_resto_de_centavos_aplica_o_custo_medio_a_cada_parte(
    unidade_de_trabalho,
):
    conta, inv = montar(unidade_de_trabalho)
    aportar(unidade_de_trabalho, conta, inv, valor=200000, viagem=50, casa=50)
    posicao_antes_do_resgate(unidade_de_trabalho, 220000, 220000)

    resgatar(unidade_de_trabalho, conta, inv, 10001, viagem=60, casa=40)

    # Partes em dinheiro: 6001 e 4000 (o resto vai para a primeira); valor de cada tag: 110000.
    assert principais(unidade_de_trabalho, inv) == {
        "viagem": 100000 - 100000 * 6001 // 110000,
        "casa": 100000 - 100000 * 4000 // 110000,
    }


def test_desfazer_o_resgate_devolve_o_principal_abatido(unidade_de_trabalho):
    conta, inv = montar(unidade_de_trabalho)
    aportar(unidade_de_trabalho, conta, inv, valor=200000, viagem=50, casa=50)
    posicao_antes_do_resgate(unidade_de_trabalho, 220000, 165000)
    movimento = resgatar(unidade_de_trabalho, conta, inv, 55000, viagem=100)

    DesfazerClassificacaoDeInvestimento(unidade_de_trabalho).executar(
        USUARIO, movimento.id, caixa_de_entrada_disponivel=True
    )

    assert principais(unidade_de_trabalho, inv) == {"casa": 100000, "viagem": 100000}


def test_realocar_depois_do_resgate_usa_o_principal_reduzido(unidade_de_trabalho):
    conta, inv = montar(unidade_de_trabalho)
    aportar(unidade_de_trabalho, conta, inv, valor=200000, viagem=50, casa=50)
    posicao_antes_do_resgate(unidade_de_trabalho, 220000, 165000)
    resgatar(unidade_de_trabalho, conta, inv, 55000, viagem=100)

    caso = RealocarDestinacao(unidade_de_trabalho)
    with pytest.raises(PrincipalInsuficiente):
        caso.executar(USUARIO, inv.id, "viagem", "casa", DIA, valor=Dinheiro(50001))
    caso.executar(USUARIO, inv.id, "viagem", "casa", DIA, valor=Dinheiro(50000))

    assert principais(unidade_de_trabalho, inv) == {"casa": 150000}


def test_resgate_minusculo_abate_ao_menos_um_centavo_de_principal(unidade_de_trabalho):
    conta, inv = montar(unidade_de_trabalho)
    aportar(unidade_de_trabalho, conta, inv, valor=200000, viagem=50, casa=50)
    posicao_antes_do_resgate(unidade_de_trabalho, 220000, 220000)

    resgatar(unidade_de_trabalho, conta, inv, 1, viagem=100)

    assert principais(unidade_de_trabalho, inv) == {"casa": 100000, "viagem": 99999}


def lci_com_aplicado(saldo, aplicado):
    return InvestimentoExterno(
        "lci",
        "LCI BTG",
        "FIXED_INCOME",
        "LCI",
        Dinheiro(saldo),
        "{}",
        valor_aplicado=Dinheiro(aplicado),
    )


def posicao_com_parte_sem_caixinha(uow, resgate=False):
    """LCI de R$ 12.500 (R$ 12.000 aplicados): R$ 1.800 na Reserva, R$ 1.000 na Viagem."""
    conta, inv = montar(uow)
    aportar(uow, conta, inv, valor=180000, externo="a1", reserva=100)
    aportar(uow, conta, inv, valor=100000, externo="a2", viagem=100)
    with uow as u:
        if resgate:
            u.investimentos.salvar_posicao(
                USUARIO, lci_com_aplicado(1250000, 1200000), DIA_ANTERIOR
            )
        u.investimentos.salvar_posicao(USUARIO, lci_com_aplicado(1250000, 1200000))
        u.commit()
    return conta, inv


def test_listar_rateia_a_parte_sem_caixinha_como_peso_proprio(unidade_de_trabalho):
    posicao_com_parte_sem_caixinha(unidade_de_trabalho)

    [posicao] = ListarInvestimentos(unidade_de_trabalho).executar(USUARIO)

    por_tag = {
        None if d.tag is None else str(d.tag): (d.valor_atual.centavos, d.rendimento.centavos)
        for d in posicao.destinacoes
    }
    assert por_tag["reserva"] == (187500, 7500)
    assert por_tag["viagem"] == (104166, 4166)
    assert por_tag[None][0] == 958334
    assert sum(v for v, _ in por_tag.values()) == 1250000


def test_listar_fecha_a_tabela_com_a_parte_sem_caixinha(unidade_de_trabalho):
    posicao_com_parte_sem_caixinha(unidade_de_trabalho)

    [posicao] = ListarInvestimentos(unidade_de_trabalho).executar(USUARIO)

    sem = next(d for d in posicao.destinacoes if d.tag is None)
    assert (sem.principal.centavos, sem.rendimento.centavos) == (920000, 38334)
    assert sem.rentabilidade == "4.16"
    # Os rendimentos das partes somam o da posição: 12.500 - 12.000.
    assert sum(d.rendimento.centavos for d in posicao.destinacoes) == 50000
    assert sum(d.principal.centavos for d in posicao.destinacoes) == 1200000


def test_resgate_por_custo_medio_usa_o_valor_proporcional_da_caixinha(unidade_de_trabalho):
    conta, inv = posicao_com_parte_sem_caixinha(unidade_de_trabalho, resgate=True)

    resgatar(unidade_de_trabalho, conta, inv, 50000, reserva=100)

    assert principais(unidade_de_trabalho, inv) == {"reserva": 180000 - 48000, "viagem": 100000}


def test_resgate_acima_do_valor_proporcional_da_caixinha_e_recusado(unidade_de_trabalho):
    conta, inv = posicao_com_parte_sem_caixinha(unidade_de_trabalho, resgate=True)

    with pytest.raises(ResgateMaiorQueOValorDaDestinacao, match="reserva"):
        resgatar(unidade_de_trabalho, conta, inv, 187501, reserva=100)


def test_listar_sem_valor_aplicado_ratea_o_saldo_so_entre_as_caixinhas(unidade_de_trabalho):
    conta, inv = montar(unidade_de_trabalho)
    aportar(unidade_de_trabalho, conta, inv, valor=30000, casa=100)
    aportar(unidade_de_trabalho, conta, inv, valor=10000, externo="t2", viagem=100)
    with unidade_de_trabalho as u:
        u.investimentos.salvar_posicao(USUARIO, lci(1250000))
        u.commit()

    [posicao] = ListarInvestimentos(unidade_de_trabalho).executar(USUARIO)

    assert [(str(d.tag), d.valor_atual.centavos) for d in posicao.destinacoes] == [
        ("casa", 937500),
        ("viagem", 312500),
    ]
    assert all(d.tag is not None for d in posicao.destinacoes)
