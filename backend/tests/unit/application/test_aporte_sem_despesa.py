from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.aceitar_transacao_importada import AceitarTransacaoImportada
from gastoba.application.consultar_progresso_das_metas import ConsultarProgressoDasMetas
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.conta import Conta, OrigemDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import TransacaoImportadaInvalida
from gastoba.domain.gasto import Gasto
from gastoba.domain.mes import Mes
from gastoba.domain.meta import AlvoDaMeta, Meta
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.transacao_importada import SentidoDaTransacao, TransacaoImportada


def test_aporte_legado_categorizado_nao_e_despesa(unidade_de_trabalho):
    uow = unidade_de_trabalho
    pessoa = uuid4()
    conta = Conta(pessoa, "Banco", Dinheiro(0))
    dia = date(2026, 11, 4)
    with uow as u:
        u.contas.adicionar(conta)
        u.gastos.adicionar(
            Gasto(conta.id, Dinheiro(3200), "Lazer real", dia, CategoriaDoGasto.LAZER)
        )
        u.movimentos_de_investimento.adicionar(
            MovimentoDeInvestimento(
                conta.id,
                TipoDeMovimento.APORTE,
                Dinheiro(278930),
                "LIQ BOLSA",
                dia,
                categoria=CategoriaDoGasto.LAZER,
            )
        )
        u.metas.salvar(Meta(pessoa, AlvoDaMeta.LAZER, 19))
        u.metas.salvar(Meta(pessoa, AlvoDaMeta.LIBERDADE_FINANCEIRA, 25))
        u.commit()
    resumo = ConsultarProgressoDasMetas(uow).executar(pessoa, Mes(2026, 11))
    lazer = next(p for p in resumo.progressos if p.alvo == AlvoDaMeta.LAZER)
    assert lazer.gasto == Dinheiro(3200)


def test_novo_aporte_com_categoria_e_recusado_sem_aceitar_transacao(unidade_de_trabalho):
    uow = unidade_de_trabalho
    pessoa = uuid4()
    conta = Conta(pessoa, "Banco", Dinheiro(0), origem=OrigemDaConta.OPEN_FINANCE)
    t = TransacaoImportada(
        conta.id, "exemplo", date(2026, 11, 4), "Aporte", Dinheiro(10000), SentidoDaTransacao.SAIDA
    )
    with uow as u:
        u.contas.adicionar(conta)
        u.transacoes_importadas.adicionar_se_nova(t)
        u.commit()
    with pytest.raises(TransacaoImportadaInvalida, match="categoria"):
        AceitarTransacaoImportada(uow).executar(
            pessoa, t.id, CategoriaDoGasto.LAZER, [], como_investimento=True
        )
    assert not uow.confirmado.movimentos_de_investimento
    assert uow.confirmado.transacoes_importadas[t.id].estado == "pendente"
