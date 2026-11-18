from datetime import date
from uuid import uuid4

from gastoba.application.aceitar_transacao_importada import AceitarTransacaoImportada
from gastoba.application.consultar_progresso_das_metas import ConsultarProgressoDasMetas
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.conta import Conta, OrigemDaConta
from gastoba.domain.destinacao import Destinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.mes import Mes
from gastoba.domain.meta import AlvoDaMeta, Meta
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.tag import Tag
from gastoba.domain.transacao_importada import SentidoDaTransacao, TransacaoImportada

DONO = uuid4()
OUTRA = uuid4()
OUTUBRO = Mes(2026, 10)
NOVEMBRO = Mes(2026, 11)
CONFORTO = CategoriaDoGasto.CONFORTO


def montar(uow):
    conta = Conta(DONO, "Banco", Dinheiro(0), origem=OrigemDaConta.OPEN_FINANCE)
    externo = InvestimentoExterno("lci", "LCI", "FIXED_INCOME", None, Dinheiro(800000), "{}")
    with uow as u:
        u.contas.adicionar(conta)
        u.investimentos.salvar_posicao(DONO, externo)
        u.metas.salvar(Meta(DONO, AlvoDaMeta.LIBERDADE_FINANCEIRA, 25))
        u.metas.salvar(Meta(DONO, AlvoDaMeta.CONFORTO, 18))
        u.renda_base.definir(DONO, Dinheiro(1000000))
        u.commit()
    with uow as u:
        return conta, u.investimentos.listar_posicoes(DONO)[0]


def aportar(uow, conta, investimento, valor, dia, **percentuais):
    t = TransacaoImportada(
        conta.id, str(uuid4()), dia, "Aplicação", Dinheiro(valor), SentidoDaTransacao.SAIDA
    )
    with uow as u:
        u.transacoes_importadas.adicionar_se_nova(t)
        u.commit()
    AceitarTransacaoImportada(uow).executar(
        DONO,
        t.id,
        None,
        [],
        como_investimento=True,
        investimento_id=investimento.id,
        destinacoes=[Destinacao(Tag.de_texto(t), p) for t, p in percentuais.items()],
    )


def progresso(uow, mes, alvo):
    resumo = ConsultarProgressoDasMetas(uow).executar(DONO, mes)
    return next(p for p in resumo.progressos if p.alvo is alvo)


def test_aporte_dividido_nao_e_despesa(unidade_de_trabalho):
    conta, investimento = montar(unidade_de_trabalho)
    aportar(
        unidade_de_trabalho,
        conta,
        investimento,
        500000,
        date(2026, 10, 10),
        computador=70,
        patrimonio=30,
    )
    assert progresso(unidade_de_trabalho, OUTUBRO, AlvoDaMeta.CONFORTO).gasto == Dinheiro(0)
    lf = progresso(unidade_de_trabalho, OUTUBRO, AlvoDaMeta.LIBERDADE_FINANCEIRA)
    assert lf.gasto == Dinheiro(500000)


def test_sem_vinculo_o_aporte_fica_em_liberdade_financeira(unidade_de_trabalho):
    conta, investimento = montar(unidade_de_trabalho)
    aportar(unidade_de_trabalho, conta, investimento, 100000, date(2026, 10, 10), computador=100)
    assert progresso(unidade_de_trabalho, OUTUBRO, AlvoDaMeta.CONFORTO).gasto == Dinheiro(0)
    assert progresso(
        unidade_de_trabalho, OUTUBRO, AlvoDaMeta.LIBERDADE_FINANCEIRA
    ).gasto == Dinheiro(100000)


def test_o_saldo_inicial_nao_entra_na_categoria(unidade_de_trabalho, relogio):
    from gastoba.application.definir_destinacoes_do_investimento import (
        DefinirDestinacoesDoInvestimento,
    )

    conta, investimento = montar(unidade_de_trabalho)
    DefinirDestinacoesDoInvestimento(unidade_de_trabalho, relogio).executar(
        DONO, investimento.id, [Destinacao(Tag("computador"), 100)]
    )
    assert progresso(unidade_de_trabalho, OUTUBRO, AlvoDaMeta.CONFORTO).gasto == Dinheiro(0)
