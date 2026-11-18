from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest

from gastoba.application.alocar_caixinha import AlocarCaixinha
from gastoba.application.listar_investimentos import ListarInvestimentos
from gastoba.domain.alocacao_de_caixinha import AlocacaoDeCaixinha
from gastoba.domain.destinacao import Destinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import DestinacaoInvalida, InvestimentoNaoEncontrado, SemValorADestinar
from gastoba.domain.operacao import Operacao, OrigemDaOperacao, TipoDeOperacao
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.tag import Tag

USUARIO, OUTRO = uuid4(), uuid4()
RESERVA, VIAGEM = Tag("reserva"), Tag("viagem")
HOJE = date(2026, 11, 10)


def _montar(uow, saldo=110000, pesos=((RESERVA, 60000), (VIAGEM, 40000)), custo=110000):
    ids = {tag: uuid4() for tag, _ in pesos}
    for tag, id_da_tag in ids.items():
        uow.confirmado.tags_cadastradas[(USUARIO, tag)] = id_da_tag
    with uow as u:
        u.investimentos.salvar_posicao(
            USUARIO, InvestimentoExterno("cdb", "CDB", "FIXED_INCOME", "CDB", Dinheiro(saldo), "{}")
        )
        u.commit()
    with uow as u:
        cdb = u.investimentos.listar_posicoes(USUARIO)[0]
        u.alocacoes.substituir(
            USUARIO, cdb.id, [AlocacaoDeCaixinha(cdb.id, ids[t], p) for t, p in pesos]
        )
        u.operacoes.adicionar(
            USUARIO,
            Operacao(
                posicao_id=cdb.id,
                tipo=TipoDeOperacao.COMPRA,
                data=date(2026, 10, 1),
                quantidade=Decimal("1"),
                valor_bruto=Dinheiro(custo),
                origem=OrigemDaOperacao.MANUAL,
            ),
        )
        u.commit()
    return cdb


def _valores(uow):
    (posicao,) = ListarInvestimentos(uow).executar(USUARIO, hoje=HOJE)
    return {d.tag: d.valor_atual for d in posicao.destinacoes}


def test_sem_compra_nova_cada_caixinha_vale_o_de_antes(unidade_de_trabalho):
    _montar(unidade_de_trabalho, saldo=100000, custo=100000)
    valores = _valores(unidade_de_trabalho)
    assert valores == {RESERVA: Dinheiro(60000), VIAGEM: Dinheiro(40000)}


def test_compra_nova_fica_sem_caixinha_e_nao_muda_as_fracoes(unidade_de_trabalho):
    _montar(unidade_de_trabalho, saldo=110000, custo=110000)
    valores = _valores(unidade_de_trabalho)
    assert valores[None] == Dinheiro(10000)
    assert valores[RESERVA] == Dinheiro(60000)
    assert valores[VIAGEM] == Dinheiro(40000)
    assert sum(v.centavos for v in valores.values()) == 110000


def test_rendimento_acompanha_proporcionalmente_o_da_posicao(unidade_de_trabalho):
    _montar(unidade_de_trabalho, saldo=110000, custo=100000)  # rendeu 10%, sem compra nova
    valores = _valores(unidade_de_trabalho)
    assert None not in valores
    assert valores[RESERVA] == Dinheiro(66000) and valores[VIAGEM] == Dinheiro(44000)


def test_alocar_a_compra_nova_a_mao_zera_a_parte_sem_caixinha(unidade_de_trabalho):
    cdb = _montar(unidade_de_trabalho, saldo=110000, custo=110000)
    AlocarCaixinha(unidade_de_trabalho).executar(USUARIO, cdb.id, [Destinacao(VIAGEM, 100)])
    valores = _valores(unidade_de_trabalho)
    assert None not in valores
    assert valores[VIAGEM] == Dinheiro(50000) and valores[RESERVA] == Dinheiro(60000)


def test_alocar_divide_em_centavos_inteiros_e_a_soma_fecha(unidade_de_trabalho):
    cdb = _montar(unidade_de_trabalho, saldo=100001, custo=100001)
    AlocarCaixinha(unidade_de_trabalho).executar(
        USUARIO, cdb.id, [Destinacao(VIAGEM, 50), Destinacao(RESERVA, 50)]
    )
    assert sum(v.centavos for v in _valores(unidade_de_trabalho).values()) == 100001


def test_sem_valor_a_alocar_tag_desconhecida_e_outra_pessoa(unidade_de_trabalho):
    cdb = _montar(unidade_de_trabalho, saldo=100000, custo=100000)
    with pytest.raises(SemValorADestinar):
        AlocarCaixinha(unidade_de_trabalho).executar(USUARIO, cdb.id, [Destinacao(VIAGEM, 100)])
    cdb2 = _montar_com_compra_nova(unidade_de_trabalho)
    with pytest.raises(DestinacaoInvalida):
        AlocarCaixinha(unidade_de_trabalho).executar(
            USUARIO, cdb2.id, [Destinacao(Tag("inexistente"), 100)]
        )
    with pytest.raises(InvestimentoNaoEncontrado):
        AlocarCaixinha(unidade_de_trabalho).executar(OUTRO, cdb2.id, [Destinacao(VIAGEM, 100)])


def _montar_com_compra_nova(uow):
    with uow as u:
        u.investimentos.salvar_posicao(
            USUARIO,
            InvestimentoExterno("cdb2", "CDB2", "FIXED_INCOME", "CDB", Dinheiro(5000), "{}"),
        )
        u.commit()
    with uow as u:
        cdb = next(i for i in u.investimentos.listar_posicoes(USUARIO) if i.nome == "CDB2")
        ids = {t: uow.confirmado.tags_cadastradas[(USUARIO, t)] for t in (RESERVA, VIAGEM)}
        u.alocacoes.substituir(USUARIO, cdb.id, [AlocacaoDeCaixinha(cdb.id, ids[VIAGEM], 3000)])
        u.operacoes.adicionar(
            USUARIO,
            Operacao(
                posicao_id=cdb.id,
                tipo=TipoDeOperacao.COMPRA,
                data=date(2026, 10, 1),
                quantidade=Decimal("1"),
                valor_bruto=Dinheiro(5000),
                origem=OrigemDaOperacao.MANUAL,
            ),
        )
        u.commit()
    return cdb
