from datetime import date
from uuid import uuid4

from gastoba.application.aceitar_transacao_importada import AceitarTransacaoImportada
from gastoba.application.listar_investimentos import ListarInvestimentos
from gastoba.application.resumir_investimentos import ResumirInvestimentos, VisaoDosInvestimentos
from gastoba.domain.conta import Conta, OrigemDaConta
from gastoba.domain.destinacao import Destinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.tag import Tag
from gastoba.domain.transacao_importada import SentidoDaTransacao, TransacaoImportada

USUARIO = uuid4()
DIA = date(2026, 10, 1)


def semear(unidade_de_trabalho, *posicoes):
    conta = Conta(USUARIO, "Banco", Dinheiro(0), origem=OrigemDaConta.OPEN_FINANCE)
    with unidade_de_trabalho as u:
        u.contas.adicionar(conta)
        for posicao in posicoes:
            u.investimentos.salvar_posicao(USUARIO, posicao)
        u.commit()
    return conta


def cdb(id_externo, nome, saldo, aplicado):
    return InvestimentoExterno(
        id_externo,
        nome,
        "FIXED_INCOME",
        "CDB",
        Dinheiro(saldo),
        "{}",
        valor_aplicado=Dinheiro(aplicado),
    )


def aportar(unidade_de_trabalho, conta, nome_externo, valor, tag="patrimonio"):
    with unidade_de_trabalho as u:
        investimento = next(
            p for p in u.investimentos.listar_posicoes(USUARIO) if p.id_externo == nome_externo
        )
    t = TransacaoImportada(
        conta.id, f"t-{nome_externo}", DIA, "Aplicação", Dinheiro(valor), SentidoDaTransacao.SAIDA
    )
    with unidade_de_trabalho as u:
        u.transacoes_importadas.adicionar_se_nova(t)
        u.commit()
    AceitarTransacaoImportada(unidade_de_trabalho).executar(
        USUARIO,
        t.id,
        None,
        [],
        como_investimento=True,
        investimento_id=investimento.id,
        destinacoes=[Destinacao(Tag.de_texto(tag), 100)],
    )


def test_investimento_vencido_sai_da_lista_e_nao_deixa_destinacao_com_principal(
    unidade_de_trabalho,
):
    conta = semear(
        unidade_de_trabalho,
        cdb("velho", "CDB Guanabara", 0, 12000),
        cdb("vivo", "CDB Inter", 5000, 5000),
    )
    aportar(unidade_de_trabalho, conta, "velho", 12000)
    aportar(unidade_de_trabalho, conta, "vivo", 5000, tag="reserva")

    posicoes = ListarInvestimentos(unidade_de_trabalho).executar(USUARIO)

    assert [p.investimento.id_externo for p in posicoes] == ["vivo"]
    assert all(d.principal.centavos > 0 for p in posicoes for d in p.destinacoes if d.tag)


def test_total_investido_bate_com_a_soma_dos_saldos_e_das_duas_distribuicoes(
    unidade_de_trabalho,
):
    conta = semear(
        unidade_de_trabalho,
        cdb("velho", "CDB Guanabara", 0, 12000),
        cdb("vivo", "CDB Inter", 5001, 5000),
    )
    aportar(unidade_de_trabalho, conta, "velho", 12000)
    aportar(unidade_de_trabalho, conta, "vivo", 5000, tag="reserva")

    soma_dos_saldos = sum(
        p.investimento.saldo.centavos
        for p in ListarInvestimentos(unidade_de_trabalho).executar(USUARIO)
    )
    por_destinacao = ResumirInvestimentos(unidade_de_trabalho).executar(
        USUARIO, VisaoDosInvestimentos.DESTINACAO
    )
    por_tipo = ResumirInvestimentos(unidade_de_trabalho).executar(
        USUARIO, VisaoDosInvestimentos.TIPO
    )

    assert soma_dos_saldos == 5001
    assert por_destinacao.total.centavos == 5001
    assert sum(f.valor.centavos for f in por_destinacao.fatias) == 5001
    assert por_tipo.total.centavos == 5001


def test_invariantes_de_aplicado_e_destinacoes_de_uma_posicao_viva(unidade_de_trabalho):
    conta = semear(unidade_de_trabalho, cdb("vivo", "CDB Inter", 5321, 5000))
    aportar(unidade_de_trabalho, conta, "vivo", 5000)

    (posicao,) = ListarInvestimentos(unidade_de_trabalho).executar(USUARIO)

    assert (
        sum(d.valor_atual.centavos for d in posicao.destinacoes)
        == posicao.investimento.saldo.centavos
    )
    assert sum(d.principal.centavos for d in posicao.destinacoes) == posicao.valor_aplicado.centavos
