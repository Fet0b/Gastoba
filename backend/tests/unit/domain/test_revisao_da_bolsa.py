from datetime import date
from decimal import Decimal
from uuid import uuid4

from gastoba.domain.casamento_de_liquidacao import Tolerancia
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.operacao import Operacao, OrigemDaOperacao, TipoDeOperacao
from gastoba.domain.revisao_da_bolsa import (
    OperacaoNaRevisao,
    SituacaoDaTransacao,
    TransacaoNaRevisao,
    propor_casamentos,
)
from gastoba.domain.transacao_importada import SentidoDaTransacao, TransacaoImportada

CONTA = uuid4()
TOL = Tolerancia()


def bruto(dia_pregao, dia_conta=5):
    return f"LIQ BOLSA - VISTA BRUTO - PREGÃO: {dia_pregao:02d}/11/2026 - EXEC.: 1"


def taxa(dia_pregao):
    return f"LIQ BOLSA - VISTA TX CCP/EMOL/TTA B3 - PREGÃO: {dia_pregao:02d}/11/2026"


def tr(
    descricao,
    centavos,
    dia=5,
    sentido=SentidoDaTransacao.SAIDA,
    situacao=SituacaoDaTransacao.PENDENTE,
    conta=CONTA,
):
    t = TransacaoImportada(
        conta, f"x{uuid4()}", date(2026, 11, dia), descricao, Dinheiro(centavos), sentido
    )
    return TransacaoNaRevisao(t, situacao)


def op(
    centavos,
    dia=3,
    tipo=TipoDeOperacao.COMPRA,
    rotulo="AUPO11",
    code=None,
    renda_fixa=False,
    custos=0,
):
    o = Operacao(
        posicao_id=uuid4(),
        tipo=tipo,
        data=date(2026, 11, dia),
        quantidade=Decimal("1"),
        valor_bruto=Dinheiro(centavos),
        origem=OrigemDaOperacao.PLUGGY,
        id_externo=f"op{uuid4()}",
        custos=Dinheiro(custos),
    )
    return OperacaoNaRevisao(o, rotulo, code, renda_fixa)


def ids_das_operacoes(proposta):
    return {o.operacao.id for o in proposta.operacoes}


# --- parte 1: bolsa -------------------------------------------------------------------------


def test_um_debito_para_uma_compra_com_tres_taxas_do_mesmo_pregao():
    o = op(278930)
    b = tr(bruto(3), 278930)
    taxas = [tr(taxa(3), 10), tr(taxa(3), 20), tr(taxa(3), 5)]
    resultado = propor_casamentos([o], [b, *taxas], TOL)
    (p,) = resultado.propostas
    assert p.confianca == "exata"
    assert p.tipo == "compra_na_bolsa"
    assert p.data_do_pregao == date(2026, 11, 3)
    assert ids_das_operacoes(p) == {o.operacao.id}
    assert len(p.taxas) == 3
    assert p.diferenca == 0
    assert p.diferenca_de_custo == 35


def test_um_debito_para_duas_compras_do_mesmo_dia_e_subconjunto():
    a, b2, c = op(1000, rotulo="A"), op(2500, rotulo="B"), op(9999, rotulo="C")
    debito = tr(bruto(3), 3500)
    (p,) = propor_casamentos([a, b2, c], [debito], TOL).propostas
    assert p.confianca == "exata"
    assert ids_das_operacoes(p) == {a.operacao.id, b2.operacao.id}


def test_dois_debitos_iguais_no_mesmo_pregao_precisam_de_escolha():
    o1, o2 = op(1000), op(1000)
    d1, d2 = tr(bruto(3), 1000), tr(bruto(3), 1000)
    propostas = propor_casamentos([o1, o2], [d1, d2], TOL).propostas
    assert propostas
    assert all(p.confianca == "precisa_escolher" for p in propostas)
    assert all(p.motivo for p in propostas)


def test_operacao_que_serve_a_dois_debitos_nao_e_exata():
    o = op(1000)
    d1, d2 = tr(bruto(3), 1000), tr(bruto(3), 1000)
    propostas = propor_casamentos([o], [d1, d2], TOL).propostas
    assert propostas and all(p.confianca != "exata" for p in propostas)


def test_taxas_de_dois_pregoes_liquidados_no_mesmo_dia_sao_separadas_pela_descricao():
    o1, o2 = op(1000, dia=3), op(2000, dia=4)
    d1, d2 = tr(bruto(3), 1000, dia=6), tr(bruto(4), 2000, dia=6)
    t1, t2 = tr(taxa(3), 7, dia=6), tr(taxa(4), 9, dia=6)
    propostas = propor_casamentos([o1, o2], [d1, d2, t1, t2], TOL).propostas
    por_pregao = {p.data_do_pregao: p for p in propostas}
    assert [t.transacao.id for t in por_pregao[date(2026, 11, 3)].taxas] == [t1.transacao.id]
    assert [t.transacao.id for t in por_pregao[date(2026, 11, 4)].taxas] == [t2.transacao.id]


def test_taxa_sem_bruto_vai_para_sem_par():
    t = tr(taxa(3), 10)
    resultado = propor_casamentos([], [t], TOL)
    assert resultado.propostas == ()
    assert [i.transacao_id for i in resultado.sem_par] == [t.transacao.id]


def test_mais_de_seis_operacoes_no_pregao_precisa_escolher_com_todas_candidatas():
    operacoes = [op(100 * (n + 1)) for n in range(7)]
    (p,) = propor_casamentos(operacoes, [tr(bruto(3), 300)], TOL).propostas
    assert p.confianca == "precisa_escolher"
    assert len(p.operacoes) == 7


def test_venda_com_credito_bruto():
    o = op(5000, tipo=TipoDeOperacao.VENDA)
    b = tr(bruto(3), 5000, sentido=SentidoDaTransacao.ENTRADA)
    (p,) = propor_casamentos([o], [b], TOL).propostas
    assert p.tipo == "venda_na_bolsa"
    assert p.confianca == "exata"


def test_debito_sem_operacao_vai_para_sem_par():
    b = tr(bruto(3), 5000)
    resultado = propor_casamentos([], [b], TOL)
    assert resultado.propostas == ()
    assert [i.transacao_id for i in resultado.sem_par] == [b.transacao.id]


# --- parte 2: situações ---------------------------------------------------------------------


def test_efeitos_por_situacao_na_mesma_proposta():
    o = op(1000)
    b = tr(bruto(3), 1000, situacao=SituacaoDaTransacao.APORTE_SEM_INVESTIMENTO)
    t1 = tr(taxa(3), 5, situacao=SituacaoDaTransacao.APORTE_SEM_INVESTIMENTO)
    t2 = tr(taxa(3), 6, situacao=SituacaoDaTransacao.PENDENTE)
    (p,) = propor_casamentos([o], [b, t1, t2], TOL).propostas
    efeitos = {(e.transacao_id, e.codigo) for e in p.efeitos}
    assert (b.transacao.id, "aporte_passa_a_ser_da_posicao") in efeitos
    assert (t1.transacao.id, "taxa_deixa_de_ser_aporte") in efeitos
    assert (t2.transacao.id, "aceita_a_pendente") in efeitos


def test_ignorada_casada_e_dividida_nunca_entram():
    o = op(1000)
    for situacao in (SituacaoDaTransacao.IGNORADA, SituacaoDaTransacao.CASADA):
        b = tr(bruto(3), 1000, situacao=situacao)
        assert propor_casamentos([o], [b], TOL).propostas == ()
    b = tr(bruto(3), 1000, situacao=SituacaoDaTransacao.DIVIDIDA)
    resultado = propor_casamentos([o], [b], TOL)
    assert resultado.propostas == ()
    assert any(i.transacao_id == b.transacao.id for i in resultado.sem_par)


def test_aporte_de_outra_posicao_so_aparece_como_precisa_escolher():
    o = op(1000)
    b = tr(bruto(3), 1000, situacao=SituacaoDaTransacao.APORTE_DE_OUTRA_POSICAO)
    (p,) = propor_casamentos([o], [b], TOL).propostas
    assert p.confianca == "precisa_escolher"


# --- parte 3: renda fixa e evidência --------------------------------------------------------


def test_venda_de_renda_fixa_com_bruto_em_dois_creditos_e_debito_do_imposto():
    o = op(12000, tipo=TipoDeOperacao.VENDA, renda_fixa=True, custos=300, rotulo="CDB")
    c1 = tr(
        "RESGATE CDB",
        10000,
        sentido=SentidoDaTransacao.ENTRADA,
        situacao=SituacaoDaTransacao.RESGATE_SEM_INVESTIMENTO,
    )
    c2 = tr(
        "RENDIMENTO CDB",
        2000,
        sentido=SentidoDaTransacao.ENTRADA,
        situacao=SituacaoDaTransacao.GANHO,
    )
    imposto = tr("IRRF CDB", 300)
    (p,) = propor_casamentos([o], [c1, c2, imposto], TOL).propostas
    assert p.tipo == "resgate_de_renda_fixa"
    assert p.confianca == "exata"
    assert {t.transacao.id for t in p.bruto} == {c1.transacao.id, c2.transacao.id}
    assert [t.transacao.id for t in p.taxas] == [imposto.transacao.id]
    efeitos = {(e.transacao_id, e.codigo) for e in p.efeitos}
    assert (c2.transacao.id, "ganho_deixa_de_ser_renda") in efeitos


def test_codigo_no_fim_da_descricao_desempata_duas_posicoes_de_mesmo_valor():
    a = op(10000, tipo=TipoDeOperacao.VENCIMENTO, renda_fixa=True, code="CDB123", rotulo="A")
    b2 = op(10000, tipo=TipoDeOperacao.VENCIMENTO, renda_fixa=True, code="CDB456", rotulo="B")
    ca = tr("RESGATE CDB123", 10000, sentido=SentidoDaTransacao.ENTRADA)
    cb = tr("RESGATE CDB456", 10000, sentido=SentidoDaTransacao.ENTRADA)
    propostas = propor_casamentos([a, b2], [ca, cb], TOL).propostas
    assert len(propostas) == 2
    assert all(p.confianca == "exata" for p in propostas)
    por_op = {next(iter(ids_das_operacoes(p))): p for p in propostas}
    assert por_op[a.operacao.id].bruto[0].transacao.id == ca.transacao.id
    assert por_op[b2.operacao.id].bruto[0].transacao.id == cb.transacao.id


def test_sem_codigo_duas_posicoes_iguais_precisam_de_escolha():
    a = op(10000, tipo=TipoDeOperacao.VENCIMENTO, renda_fixa=True)
    b2 = op(10000, tipo=TipoDeOperacao.VENCIMENTO, renda_fixa=True)
    c = tr("RESGATE", 10000, sentido=SentidoDaTransacao.ENTRADA)
    propostas = propor_casamentos([a, b2], [c], TOL).propostas
    assert propostas and all(p.confianca == "precisa_escolher" for p in propostas)


def test_chave_estavel_independe_da_ordem_e_diferencas_tem_sinal():
    o1, o2 = op(1000, rotulo="A"), op(2500, rotulo="B")
    b = tr(bruto(3), 3500)
    (p1,) = propor_casamentos([o1, o2], [b], TOL).propostas
    (p2,) = propor_casamentos([o2, o1], [b], TOL).propostas
    assert p1.chave == p2.chave
    # bruto da conta menor que o das operações: diferença negativa
    (p3,) = propor_casamentos(
        [op(1000)], [tr(bruto(3), 999)], Tolerancia(dias=2, centavos=5)
    ).propostas
    assert p3.diferenca == -1


# --- sem par: o item diz o que é (descrição, data e valor) ----------------------------------


def test_operacao_sem_lancamento_diz_qual_e_com_data_e_valor():
    o = op(45528, dia=21, rotulo="AUVP11")
    (item,) = propor_casamentos([o], [], TOL).sem_par
    assert item.operacao_id == o.operacao.id and item.transacao_id is None
    assert item.descricao == "Compra de AUVP11 (1)"
    assert item.data == date(2026, 11, 21)
    assert item.valor == Dinheiro(45528)


def test_venda_sem_lancamento_diz_venda():
    o = op(1000, tipo=TipoDeOperacao.VENDA, rotulo="ITUB4")
    (item,) = propor_casamentos([o], [], TOL).sem_par
    assert item.descricao == "Venda de ITUB4 (1)"


def test_lancamento_sem_operacao_traz_a_descricao_a_data_e_o_valor():
    b = tr(bruto(3), 5000, dia=5)
    (item,) = propor_casamentos([], [b], TOL).sem_par
    assert item.transacao_id == b.transacao.id and item.operacao_id is None
    assert item.descricao == bruto(3)
    assert item.data == date(2026, 11, 5)
    assert item.valor == Dinheiro(5000)
