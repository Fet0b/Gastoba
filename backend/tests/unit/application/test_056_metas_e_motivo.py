from datetime import UTC, date, datetime
from uuid import uuid4

import pytest

from gastoba.application.definir_meta import DefinirMeta
from gastoba.application.remover_meta import RemoverMeta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import PercentuaisExcedem100, TransacaoImportadaInvalida
from gastoba.domain.meta import AlvoDaMeta
from gastoba.domain.transacao_importada import SentidoDaTransacao, TransacaoImportada


class RelogioFixo:
    def agora(self):
        return datetime(2026, 11, 9, tzinfo=UTC)


def test_historico_so_registra_alteracoes_efetivas(unidade_de_trabalho):
    pessoa = uuid4()
    definir = DefinirMeta(unidade_de_trabalho, RelogioFixo())
    definir.executar(pessoa, AlvoDaMeta.LAZER, 19)
    definir.executar(pessoa, AlvoDaMeta.LAZER, 19)
    definir.executar(pessoa, AlvoDaMeta.LAZER, 20)
    with pytest.raises(PercentuaisExcedem100):
        definir.executar(pessoa, AlvoDaMeta.CONFORTO, 100)
    RemoverMeta(unidade_de_trabalho, RelogioFixo()).executar(pessoa, AlvoDaMeta.LAZER)
    with unidade_de_trabalho as u:
        registros = u.historico_de_metas.listar(pessoa)
        assert len(registros) == 3
        assert {(r.percentual_anterior, r.percentual_novo) for r in registros} == {
            (None, 19),
            (19, 20),
            (20, None),
        }
        assert u.historico_de_metas.listar(uuid4()) == []
        assert u.metas.listar(pessoa) == []


def test_ignorar_com_motivo_e_restaurar():
    t = TransacaoImportada(
        uuid4(), "ficticio", date(2026, 11, 9), "Exemplo", Dinheiro(123), SentidoDaTransacao.SAIDA
    )
    t.ignorar("transferencia_entre_contas")
    assert t.motivo_ignorada == "transferencia_entre_contas"
    t.restaurar()
    assert t.motivo_ignorada is None
    with pytest.raises(TransacaoImportadaInvalida):
        t.ignorar("invalido")
    assert t.estado == "pendente"


def test_resumo_mostra_aportes_sem_partes_inclusive_sem_posicao(unidade_de_trabalho):
    from gastoba.application.resumir_investimentos import (
        ResumirInvestimentos,
        VisaoDosInvestimentos,
    )
    from gastoba.domain.conta import Conta
    from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento

    pessoa = uuid4()
    conta = Conta(pessoa, "Exemplo", Dinheiro(0))
    with unidade_de_trabalho as u:
        u.contas.adicionar(conta)
        u.movimentos_de_investimento.adicionar(
            MovimentoDeInvestimento(
                conta.id, TipoDeMovimento.APORTE, Dinheiro(12345), "Exemplo", date(2026, 11, 9)
            )
        )
        u.commit()
    resumo = ResumirInvestimentos(unidade_de_trabalho).executar(
        pessoa, VisaoDosInvestimentos.DESTINACAO
    )
    assert resumo.aportes_sem_destino_total == Dinheiro(12345)
    assert resumo.aportes_sem_destino_quantidade == 1
    outro = ResumirInvestimentos(unidade_de_trabalho).executar(
        uuid4(), VisaoDosInvestimentos.DESTINACAO
    )
    assert outro.aportes_sem_destino_quantidade == 0
