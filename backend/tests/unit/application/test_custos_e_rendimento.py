from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.aceitar_transacao_importada import AceitarTransacaoImportada
from gastoba.domain.conta import Conta, OrigemDaConta
from gastoba.domain.destinacao import Destinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import TransacaoImportadaInvalida
from gastoba.domain.movimento_de_investimento import TipoDeMovimento
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.tag import Tag
from gastoba.domain.transacao_importada import SentidoDaTransacao, TransacaoImportada


def test_liq_bolsa_e_taxas_compoem_custo_sem_virar_aporte_novo(unidade_de_trabalho):
    uow = unidade_de_trabalho
    pessoa = uuid4()
    conta = Conta(pessoa, "Corretora", Dinheiro(0), origem=OrigemDaConta.OPEN_FINANCE)
    with uow as u:
        u.contas.adicionar(conta)
        u.investimentos.salvar_posicao(
            pessoa, InvestimentoExterno("acao", "Ação", "EQUITY", None, Dinheiro(278930), "{}")
        )
        inv = u.investimentos.listar_posicoes(pessoa)[0]
        u.commit()

    def aceitar(valor, descricao, tipo=None, relacionado=None, dest=()):
        t = TransacaoImportada(
            conta.id,
            str(uuid4()),
            date(2026, 11, 4),
            descricao,
            Dinheiro(valor),
            SentidoDaTransacao.SAIDA,
        )
        with uow as u:
            u.transacoes_importadas.adicionar_se_nova(t)
            u.commit()
        return AceitarTransacaoImportada(uow).executar(
            pessoa,
            t.id,
            None,
            [],
            como_investimento=True,
            investimento_id=inv.id,
            destinacoes=dest,
            tipo_de_movimento=tipo,
            movimento_relacionado_id=relacionado,
        )

    compra = aceitar(
        278930,
        "LIQ BOLSA - VISTA BRUTO - PREGÃO: 03/11/2026 - EXEC.: 85 - S 46780",
        dest=[Destinacao(Tag("patrimonio"), 100)],
    )
    for valor in (62, 13, 7):
        taxa = aceitar(
            valor, "LIQ BOLSA - VISTA TX CCP/EMOL/TTA B3", TipoDeMovimento.CUSTO, compra.id
        )
        assert taxa.tipo == TipoDeMovimento.CUSTO
    with uow as u:
        assert u.destinacoes.principais(pessoa)[inv.id][Tag("patrimonio")] == Dinheiro(279012)
    with pytest.raises(TransacaoImportadaInvalida):
        aceitar(62, "LIQ BOLSA - VISTA TX CCP/EMOL/TTA B3")
    assert not uow.confirmado.gastos and not uow.confirmado.ganhos


def test_caixinha_fecha_extrato_mensal_e_reversao_acusa_incompletude(unidade_de_trabalho):
    from gastoba.application.consultar_impacto_da_reversao import ConsultarImpactoDaReversao
    from gastoba.application.consultar_reconciliacao_da_caixinha import (
        ConsultarReconciliacaoDaCaixinha,
    )
    from gastoba.application.definir_caixinha import DefinirCaixinha
    from gastoba.application.definir_referencia_da_caixinha import DefinirReferenciaDaCaixinha
    from gastoba.application.desfazer_classificacao_importada import DesfazerClassificacaoImportada
    from gastoba.domain.mes import Mes

    uow = unidade_de_trabalho
    pessoa = uuid4()
    conta = Conta(pessoa, "Corretora", Dinheiro(100000), origem=OrigemDaConta.OPEN_FINANCE)
    with uow as u:
        u.contas.adicionar(conta)
        u.commit()
    inv = DefinirCaixinha(uow).executar(pessoa, conta.id, Dinheiro(0), date(2026, 11, 1))
    rendimento_id = None
    for tipo, valor in [
        (TipoDeMovimento.APORTE, 252058),
        (TipoDeMovimento.RESGATE, 160000),
        (TipoDeMovimento.RENDIMENTO, 4159),
    ]:
        entrada = tipo != TipoDeMovimento.APORTE
        descricao = (
            "CONTA REMUNERADA - RENDIMENTO"
            if tipo == TipoDeMovimento.RENDIMENTO
            else "CONTA REMUNERADA"
        )
        t = TransacaoImportada(
            conta.id,
            str(uuid4()),
            date(2026, 11, 4),
            descricao,
            Dinheiro(valor),
            SentidoDaTransacao.ENTRADA if entrada else SentidoDaTransacao.SAIDA,
        )
        with uow as u:
            u.transacoes_importadas.adicionar_se_nova(t)
            u.commit()
        AceitarTransacaoImportada(uow).executar(
            pessoa,
            t.id,
            None,
            [],
            como_investimento=True,
            investimento_id=inv.id,
            tipo_de_movimento=tipo,
            destinacoes=[]
            if tipo == TipoDeMovimento.RENDIMENTO
            else [Destinacao(Tag("reserva"), 100)],
        )
        if tipo == TipoDeMovimento.RENDIMENTO:
            rendimento_id = t.id
    mes = Mes(2026, 11)
    DefinirReferenciaDaCaixinha(uow).executar(
        pessoa, inv.id, mes, Dinheiro(0), Dinheiro(96217), True
    )
    consulta = ConsultarReconciliacaoDaCaixinha(uow)
    assert consulta.executar(pessoa, inv.id, mes).conciliado
    assert not uow.confirmado.ganhos and not uow.confirmado.gastos
    previa = ConsultarImpactoDaReversao(uow).executar(pessoa, rendimento_id)
    DesfazerClassificacaoImportada(uow).executar(
        pessoa, rendimento_id, versao_esperada=previa.versao
    )
    depois = consulta.executar(pessoa, inv.id, mes)
    assert not depois.completo and not depois.conciliado
    assert depois.diferenca == Dinheiro(4159)
