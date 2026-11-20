from datetime import date
from uuid import uuid4

from gastoba.application.listar_resgates_sem_destinacao import ListarResgatesSemDestinacao
from gastoba.domain.destinacao import ParteDeDestinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.tag import Tag

DONO, OUTRA = uuid4(), uuid4()


def _movimento(conta, tipo, valor, dia):
    return MovimentoDeInvestimento(conta.id, tipo, Dinheiro(valor), "Movimento", dia)


def test_lista_so_resgates_sem_tag_da_pessoa(unidade_de_trabalho, semear_conta):
    conta, conta_alheia = semear_conta(usuario_id=DONO), semear_conta(usuario_id=OUTRA)
    sem_tag_antigo = _movimento(conta, TipoDeMovimento.RESGATE, 100, date(2026, 11, 1))
    sem_tag_novo = _movimento(conta, TipoDeMovimento.RESGATE, 200, date(2026, 11, 3))
    com_tag = _movimento(conta, TipoDeMovimento.RESGATE, 300, date(2026, 11, 2))
    aporte = _movimento(conta, TipoDeMovimento.APORTE, 400, date(2026, 11, 2))
    alheio = _movimento(conta_alheia, TipoDeMovimento.RESGATE, 500, date(2026, 11, 2))
    with unidade_de_trabalho as u:
        for m in (sem_tag_antigo, sem_tag_novo, com_tag, aporte, alheio):
            u.movimentos_de_investimento.adicionar(m)
        u.destinacoes.adicionar(com_tag.id, [ParteDeDestinacao(Tag("viagem"), Dinheiro(-300))])
        u.commit()
    lista = ListarResgatesSemDestinacao(unidade_de_trabalho).executar(DONO)
    assert [a.movimento.id for a in lista] == [sem_tag_novo.id, sem_tag_antigo.id]
    assert ListarResgatesSemDestinacao(unidade_de_trabalho).executar(uuid4()) == []


def test_some_quando_o_resgate_recebe_tag(unidade_de_trabalho, semear_conta):
    conta = semear_conta(usuario_id=DONO)
    m = _movimento(conta, TipoDeMovimento.RESGATE, 100, date(2026, 11, 1))
    with unidade_de_trabalho as u:
        u.movimentos_de_investimento.adicionar(m)
        u.commit()
    assert len(ListarResgatesSemDestinacao(unidade_de_trabalho).executar(DONO)) == 1
    with unidade_de_trabalho as u:
        u.destinacoes.adicionar(m.id, [ParteDeDestinacao(Tag("viagem"), Dinheiro(-100))])
        u.commit()
    assert ListarResgatesSemDestinacao(unidade_de_trabalho).executar(DONO) == []


def _posicao(uow, usuario, nome="CDB fictício"):
    with uow as u:
        u.investimentos.salvar_posicao(
            usuario, InvestimentoExterno(nome, nome, "FIXED_INCOME", "CDB", Dinheiro(5000), "{}")
        )
        u.commit()
    with uow as u:
        return next(p for p in u.investimentos.listar_posicoes(usuario) if p.nome == nome)


def test_vencimento_confirmado_de_posicao_sem_caixinhas_nao_aparece(
    unidade_de_trabalho, semear_conta
):
    conta = semear_conta(usuario_id=DONO)
    posicao = _posicao(unidade_de_trabalho, DONO)
    vencimento = _movimento(conta, TipoDeMovimento.RESGATE, 100, date(2026, 11, 1))
    vencimento.investimento_id = posicao.id
    vencimento.vencimento_confirmado = True
    sem_marca = _movimento(conta, TipoDeMovimento.RESGATE, 200, date(2026, 11, 2))
    sem_marca.investimento_id = posicao.id
    with unidade_de_trabalho as u:
        u.movimentos_de_investimento.adicionar(vencimento)
        u.movimentos_de_investimento.adicionar(sem_marca)
        u.commit()
    lista = ListarResgatesSemDestinacao(unidade_de_trabalho).executar(DONO)
    assert [(a.movimento.id, a.investimento_nome) for a in lista] == [
        (sem_marca.id, "CDB fictício")
    ]


def test_vencimento_confirmado_de_posicao_com_caixinhas_continua_aparecendo(
    unidade_de_trabalho, semear_conta
):
    conta = semear_conta(usuario_id=DONO)
    posicao = _posicao(unidade_de_trabalho, DONO)
    aporte = _movimento(conta, TipoDeMovimento.APORTE, 1000, date(2026, 10, 1))
    aporte.investimento_id = posicao.id
    vencimento = _movimento(conta, TipoDeMovimento.RESGATE, 100, date(2026, 11, 1))
    vencimento.investimento_id = posicao.id
    vencimento.vencimento_confirmado = True
    with unidade_de_trabalho as u:
        u.movimentos_de_investimento.adicionar(aporte)
        u.destinacoes.adicionar(aporte.id, [ParteDeDestinacao(Tag("casa"), Dinheiro(1000))])
        u.movimentos_de_investimento.adicionar(vencimento)
        u.commit()
    lista = ListarResgatesSemDestinacao(unidade_de_trabalho).executar(DONO)
    assert [a.movimento.id for a in lista] == [vencimento.id]
