from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.consultar_progresso_das_metas import ConsultarProgressoDasMetas
from gastoba.domain.conta import Conta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.mes import Mes
from gastoba.domain.meta import AlvoDaMeta, Meta
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento


@pytest.mark.parametrize(
    "base,esperado,situacao",
    [(100000, 30000, "estourou"), (200000, 30000, "dentro"), (0, 30000, "sem_renda")],
)
def test_aportes_sem_transferencia_contam_na_meta_financeira(
    unidade_de_trabalho, base, esperado, situacao
):
    pessoa = uuid4()
    conta = Conta(pessoa, "Banco fictício", Dinheiro(0))
    with unidade_de_trabalho as u:
        u.contas.adicionar(conta)
        u.metas.salvar(Meta(pessoa, AlvoDaMeta.LIBERDADE_FINANCEIRA, 25))
        if base:
            u.renda_base.definir(pessoa, Dinheiro(base))
        for tipo, valor, dia in [
            (TipoDeMovimento.APORTE, 10000, date(2026, 11, 1)),
            (TipoDeMovimento.APORTE, 20000, date(2026, 11, 30)),
            (TipoDeMovimento.RESGATE, 5000, date(2026, 11, 12)),
            (TipoDeMovimento.APORTE, 90000, date(2026, 10, 31)),
            (TipoDeMovimento.RENDIMENTO, 700, date(2026, 11, 12)),
            (TipoDeMovimento.CUSTO, 100, date(2026, 11, 12)),
        ]:
            u.movimentos_de_investimento.adicionar(
                MovimentoDeInvestimento(
                    conta.id,
                    tipo,
                    Dinheiro(valor),
                    "Exemplo",
                    dia,
                    investimento_id=uuid4()
                    if tipo in (TipoDeMovimento.RENDIMENTO, TipoDeMovimento.CUSTO)
                    else None,
                    movimento_relacionado_id=uuid4() if tipo == TipoDeMovimento.CUSTO else None,
                )
            )
        u.commit()
    [p] = ConsultarProgressoDasMetas(unidade_de_trabalho).executar(pessoa, Mes(2026, 11)).progressos
    assert p.gasto == Dinheiro(esperado)
    assert p.situacao == situacao
    if base == 100000:
        assert p.percentual_usado == 120
        assert p.restante == Dinheiro(-5000)


def test_operacao_relacionada_permanece_exclusiva_de_custos():
    from gastoba.domain.excecoes import TransacaoImportadaInvalida

    with pytest.raises(TransacaoImportadaInvalida):
        MovimentoDeInvestimento(
            uuid4(),
            TipoDeMovimento.APORTE,
            Dinheiro(100),
            "Exemplo",
            date(2026, 11, 9),
            movimento_relacionado_id=uuid4(),
        )


def test_compra_ligada_conta_uma_vez_taxa_nao_conta_e_desfazer_tira_da_meta(unidade_de_trabalho):
    from test_confirmar_propostas_da_bolsa import (
        BRUTO,
        PESSOA,
        TAXA,
        _conta,
        _operacao,
        _posicao,
        _transacao,
    )

    from gastoba.application.confirmar_propostas_da_bolsa import (
        ConfirmarPropostasDaBolsa,
        ItemDeConfirmacao,
    )
    from gastoba.application.desfazer_casamento import DesfazerCasamento
    from gastoba.application.listar_revisao_da_bolsa import ListarRevisaoDaBolsa

    uow = unidade_de_trabalho
    conta = _conta(uow)
    posicao = _posicao(uow)
    _operacao(uow, posicao, 278930)
    _transacao(uow, conta, BRUTO, 278930, "b")
    _transacao(uow, conta, TAXA, 62, "t")
    with uow as u:
        u.metas.salvar(Meta(PESSOA, AlvoDaMeta.LIBERDADE_FINANCEIRA, 25))
        u.renda_base.definir(PESSOA, Dinheiro(2000000))
        u.commit()

    def gasto():
        [p] = ConsultarProgressoDasMetas(uow).executar(PESSOA, Mes(2026, 11)).progressos
        return p.gasto

    (proposta,) = ListarRevisaoDaBolsa(uow).executar(PESSOA).propostas
    (ligacao,) = ConfirmarPropostasDaBolsa(uow).executar(
        PESSOA, [ItemDeConfirmacao(proposta.proposta.chave, proposta.versao)]
    )
    assert gasto() == Dinheiro(278930)  # a compra uma vez; a taxa de R$ 0,62 não entra
    DesfazerCasamento(uow).executar(PESSOA, ligacao.casamento_id)
    assert gasto() == Dinheiro(0)
