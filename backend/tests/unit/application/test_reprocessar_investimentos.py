from datetime import date
from uuid import uuid4

from gastoba.application.reprocessar_investimentos import ReprocessarInvestimentos
from gastoba.domain.conta import Conta, OrigemDaConta
from gastoba.domain.destinacao import ParteDeDestinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.movimento_de_investimento import (
    MovimentoDeInvestimento,
    TipoDeMovimento,
)
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.tag import Tag

USUARIO = uuid4()
DIA = date(2026, 10, 12)


def semear(unidade_de_trabalho, *posicoes):
    conta = Conta(USUARIO, "BTG", Dinheiro(0), origem=OrigemDaConta.OPEN_FINANCE)
    with unidade_de_trabalho as u:
        u.contas.adicionar(conta)
        for posicao in posicoes:
            u.investimentos.salvar_posicao(USUARIO, posicao)
        u.commit()
    with unidade_de_trabalho as u:
        return conta, {p.id_externo: p for p in u.investimentos.listar_posicoes(USUARIO)}


def gravar(unidade_de_trabalho, movimento, **partes):
    with unidade_de_trabalho as u:
        u.movimentos_de_investimento.adicionar(movimento)
        u.destinacoes.adicionar(
            movimento.id,
            [ParteDeDestinacao(Tag.de_texto(t), Dinheiro(v)) for t, v in partes.items()],
        )
        u.commit()


def principais(unidade_de_trabalho, investimento):
    with unidade_de_trabalho as u:
        dele = u.destinacoes.principais(USUARIO).get(investimento.id, {})
        return {str(t): v.centavos for t, v in dele.items()}


def acao(aplicado=278925):
    return InvestimentoExterno(
        "aupo11",
        "AUPO11",
        "EQUITY",
        "ETF",
        Dinheiro(aplicado),
        "{}",
        valor_aplicado=Dinheiro(aplicado),
    )


def com_duplicidade(unidade_de_trabalho):
    """Dados como o bug antigo os deixou: saldo inicial e a compra real, os dois no principal."""
    conta, achadas = semear(unidade_de_trabalho, acao())
    investimento = achadas["aupo11"]
    gravar(
        unidade_de_trabalho,
        MovimentoDeInvestimento.de_saldo_inicial(investimento.id, Dinheiro(278925), DIA),
        patrimonio=278925,
    )
    compra = MovimentoDeInvestimento(
        conta.id,
        TipoDeMovimento.APORTE,
        Dinheiro(278930),
        "LIQ BOLSA - VISTA BRUTO",
        date(2026, 10, 11),
        investimento_id=investimento.id,
    )
    gravar(unidade_de_trabalho, compra, patrimonio=278930)
    return conta, investimento


def test_dry_run_mostra_o_saldo_inicial_duplicado_sem_gravar(unidade_de_trabalho):
    _, investimento = com_duplicidade(unidade_de_trabalho)

    relatorio = ReprocessarInvestimentos(unidade_de_trabalho).executar(USUARIO, aplicar=False)

    assert [a.tipo for a in relatorio.corrigidos] == ["saldo_inicial_duplicado"]
    assert principais(unidade_de_trabalho, investimento) == {"patrimonio": 278925 + 278930}


def test_aplicar_remove_a_duplicidade_e_e_idempotente(unidade_de_trabalho):
    _, investimento = com_duplicidade(unidade_de_trabalho)
    caso = ReprocessarInvestimentos(unidade_de_trabalho)

    primeiro = caso.executar(USUARIO, aplicar=True)
    segundo = caso.executar(USUARIO, aplicar=True)

    assert [a.tipo for a in primeiro.corrigidos] == ["saldo_inicial_duplicado"]
    assert segundo.corrigidos == []
    assert principais(unidade_de_trabalho, investimento) == {"patrimonio": 278930}


def test_resgate_no_vencimento_herda_as_destinacoes_da_posicao(unidade_de_trabalho):
    cdb = InvestimentoExterno(
        "cdb",
        "CDB - BANCO GUANABARA S/A",
        "FIXED_INCOME",
        "CDB",
        Dinheiro(0),
        '{"issuer": "BANCO GUANABARA S/A", "dueDate": "2026-10-26T00:00:00.000Z"}',
    )
    conta, achadas = semear(unidade_de_trabalho, cdb)
    investimento = achadas["cdb"]
    gravar(
        unidade_de_trabalho,
        MovimentoDeInvestimento(
            conta.id,
            TipoDeMovimento.APORTE,
            Dinheiro(12000),
            "EMISSAO",
            date(2026, 1, 5),
            investimento_id=investimento.id,
        ),
        patrimonio=7200,
        reserva=4800,
    )
    resgate = MovimentoDeInvestimento(
        conta.id,
        TipoDeMovimento.RESGATE,
        Dinheiro(12000),
        "VENCIMENTO - CDB BANCO GUANABARA S/A - Venc.: 2026-10-26 CDB5250LP3Q",
        date(2026, 10, 26),
    )
    with unidade_de_trabalho as u:
        u.movimentos_de_investimento.adicionar(resgate)
        u.commit()

    relatorio = ReprocessarInvestimentos(unidade_de_trabalho).executar(USUARIO, aplicar=True)

    assert [a.tipo for a in relatorio.corrigidos] == ["vencimento_vinculado"]
    assert principais(unidade_de_trabalho, investimento) == {}
    with unidade_de_trabalho as u:
        assert u.movimentos_de_investimento.listar_resgates_sem_destinacao(USUARIO) == []


def test_o_que_nao_tem_certeza_vai_para_revisao_e_nada_e_alterado(unidade_de_trabalho):
    conta, achadas = semear(unidade_de_trabalho, acao())
    investimento = achadas["aupo11"]
    mal_ligado = MovimentoDeInvestimento(
        conta.id,
        TipoDeMovimento.APORTE,
        Dinheiro(95645),
        "CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA",
        DIA,
        investimento_id=investimento.id,
    )
    gravar(unidade_de_trabalho, mal_ligado, patrimonio=95645)
    imposto = MovimentoDeInvestimento(
        conta.id, TipoDeMovimento.APORTE, Dinheiro(490), "IRRF - CDB BANCO GUANABARA S/A", DIA
    )
    with unidade_de_trabalho as u:
        u.movimentos_de_investimento.adicionar(imposto)
        u.commit()

    relatorio = ReprocessarInvestimentos(unidade_de_trabalho).executar(USUARIO, aplicar=True)

    assert relatorio.corrigidos == []
    assert sorted(a.tipo for a in relatorio.para_revisar) == [
        "conta_remunerada_em_investimento",
        "imposto_ou_taxa_como_aporte",
    ]
    assert principais(unidade_de_trabalho, investimento) == {"patrimonio": 95645}


def test_resgate_automatico_ignorado_volta_para_a_caixa(unidade_de_trabalho):
    from gastoba.domain.transacao_importada import (
        EstadoDaTransacaoImportada,
        SentidoDaTransacao,
        TransacaoImportada,
    )

    conta, _ = semear(unidade_de_trabalho)
    escondida = TransacaoImportada(
        conta.id,
        "r1",
        DIA,
        "CONTA REMUNERADA - RESGATE AUTOMÁTICO",
        Dinheiro(14100),
        SentidoDaTransacao.ENTRADA,
        estado=EstadoDaTransacaoImportada.IGNORADA,
    )
    outra = TransacaoImportada(
        conta.id,
        "r2",
        DIA,
        "Transferência entre contas",
        Dinheiro(500),
        SentidoDaTransacao.ENTRADA,
        estado=EstadoDaTransacaoImportada.IGNORADA,
    )
    with unidade_de_trabalho as u:
        u.transacoes_importadas.adicionar_se_nova(escondida)
        u.transacoes_importadas.adicionar_se_nova(outra)
        u.commit()
    caso = ReprocessarInvestimentos(unidade_de_trabalho)

    seco = caso.executar(USUARIO, aplicar=False)
    real = caso.executar(USUARIO, aplicar=True)
    de_novo = caso.executar(USUARIO, aplicar=True)

    assert [a.tipo for a in seco.corrigidos] == ["conta_remunerada_restaurada"]
    assert [a.tipo for a in real.corrigidos] == ["conta_remunerada_restaurada"]
    assert de_novo.corrigidos == []
    with unidade_de_trabalho as u:
        pendentes = u.transacoes_importadas.listar(USUARIO, EstadoDaTransacaoImportada.PENDENTE)
        assert [t.id_externo for t in pendentes] == ["r1"]


def test_caixinha_com_principal_acima_do_saldo_vai_para_revisao(unidade_de_trabalho):
    caixinha = InvestimentoExterno(
        "caixinha:x", "Conta remunerada (BTG)", "CAIXINHA", None, Dinheiro(96217), "{}"
    )
    conta, achadas = semear(unidade_de_trabalho, caixinha)
    alvo = achadas["caixinha:x"]
    gravar(
        unidade_de_trabalho,
        MovimentoDeInvestimento(
            conta.id,
            TipoDeMovimento.APORTE,
            Dinheiro(252058),
            "CONTA REMUNERADA - APLICAÇÃO",
            DIA,
            investimento_id=alvo.id,
        ),
        reserva=252058,
    )

    relatorio = ReprocessarInvestimentos(unidade_de_trabalho).executar(USUARIO, aplicar=True)

    assert [a.tipo for a in relatorio.para_revisar] == ["caixinha_divergente"]
    assert principais(unidade_de_trabalho, alvo) == {"reserva": 252058}
