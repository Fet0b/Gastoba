from copy import deepcopy
from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.diagnosticar_contabilidade import DiagnosticarContabilidade
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.conta import Conta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import PeriodoInvalido
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento


def test_diagnostico_mensal_mostra_dupla_contagem_e_taxas_sem_mudar_dados(unidade_de_trabalho):
    uow = unidade_de_trabalho
    pessoa, outra = uuid4(), uuid4()
    conta = Conta(pessoa, "Conta fictícia", Dinheiro(0))
    alheia = Conta(outra, "Outra fictícia", Dinheiro(0))
    with uow as u:
        u.contas.adicionar(conta)
        u.contas.adicionar(alheia)
        for valor, descricao, categoria in [
            (278930, "LIQ BOLSA - VISTA BRUTO", CategoriaDoGasto.LAZER),
            (62, "LIQ BOLSA - VISTA TX CCP/EMOL/TTA B3", None),
            (13, "LIQ BOLSA - VISTA TX CCP/EMOL/TTA B3", None),
            (7, "LIQ BOLSA - VISTA TX CCP/EMOL/TTA B3", None),
        ]:
            u.movimentos_de_investimento.adicionar(
                MovimentoDeInvestimento(
                    conta.id,
                    TipoDeMovimento.APORTE,
                    Dinheiro(valor),
                    descricao,
                    date(2026, 11, 4),
                    categoria=categoria,
                    revisao_contabil_pendente=True,
                )
            )
        u.movimentos_de_investimento.adicionar(
            MovimentoDeInvestimento(
                alheia.id,
                TipoDeMovimento.APORTE,
                Dinheiro(99999),
                "Alheio",
                date(2026, 10, 1),
            )
        )
        u.commit()
    antes = deepcopy(uow.confirmado)
    commits = uow.commits
    caso = DiagnosticarContabilidade(uow)
    resultado = caso.executar(pessoa, date(2026, 10, 1), date(2026, 12, 31))
    assert len(resultado) == 1
    mes = resultado[0]
    assert str(mes.mes) == "2026-11"
    assert mes.classificacoes_pendentes == 4
    assert mes.aportes_categorizados == 1 and mes.custos_como_aporte == 3
    assert mes.regra_anterior_liberdade_financeira == Dinheiro(279012)
    assert mes.aporte_liquido_confirmado == Dinheiro(0)
    assert mes.diferenca_liberdade_financeira == Dinheiro(-279012)
    assert [(i.categoria, i.diferenca) for i in mes.categorias] == [
        (CategoriaDoGasto.LAZER, Dinheiro(-278930))
    ]
    assert mes.afetado and mes.periodo_completo
    assert caso.executar(pessoa, date(2026, 10, 1), date(2026, 12, 31)) == resultado
    assert uow.commits == commits and uow.confirmado == antes


def test_diagnostico_recusa_periodo_invertido(unidade_de_trabalho):
    with pytest.raises(PeriodoInvalido):
        DiagnosticarContabilidade(unidade_de_trabalho).executar(
            uuid4(), date(2026, 12, 1), date(2026, 11, 1)
        )
