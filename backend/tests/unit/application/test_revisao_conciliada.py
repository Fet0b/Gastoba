"""D3 (069): o que a pessoa já tratou na caixa, na mesma posição, não volta como proposta."""

from test_confirmar_propostas_da_bolsa import (
    BRUTO,
    PESSOA,
    _confirmar,
    _conta,
    _operacao,
    _posicao,
    _revisao,
    _transacao,
)

from gastoba.application.aceitar_transacao_importada import AceitarTransacaoImportada
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.destinacao import Destinacao
from gastoba.domain.operacao import TipoDeOperacao
from gastoba.domain.tag import Tag
from gastoba.domain.transacao_importada import SentidoDaTransacao


def _aceitar_como_aporte(uow, transacao, posicao, sem_caixinhas=False):
    AceitarTransacaoImportada(uow).executar(
        PESSOA,
        transacao.id,
        None,
        [],
        como_investimento=True,
        investimento_id=posicao.id,
        destinacoes=[] if sem_caixinhas else [Destinacao(Tag("casa"), 100)],
    )


def test_compra_aceita_na_caixa_na_mesma_posicao_vira_conciliada(unidade_de_trabalho):
    uow = unidade_de_trabalho
    conta, posicao = _conta(uow), _posicao(uow)
    operacao = _operacao(uow, posicao, 50000)
    t = _transacao(uow, conta, "Aplicação fictícia", 50000, "a")
    _aceitar_como_aporte(uow, t, posicao)

    revisao = _revisao(uow)

    assert revisao.propostas == () and revisao.sem_par == ()
    (c,) = revisao.conciliadas
    assert c.operacao_id == operacao.id and c.transacao_id == t.id


def test_aceita_em_outra_posicao_continua_proposta_com_o_motivo_certo(unidade_de_trabalho):
    uow = unidade_de_trabalho
    conta, posicao = _conta(uow), _posicao(uow)
    outra = _posicao(uow, nome="OUTRO11", externo="outro11")
    _operacao(uow, posicao, 278930)
    t = _transacao(uow, conta, BRUTO, 278930, "b")
    _aceitar_como_aporte(uow, t, outra)

    revisao = _revisao(uow)

    (p,) = revisao.propostas
    assert "outra posição" in p.proposta.motivo
    assert revisao.conciliadas == ()


def test_liquidacao_aceita_como_gasto_tem_o_motivo_proprio(unidade_de_trabalho):
    uow = unidade_de_trabalho
    conta, posicao = _conta(uow), _posicao(uow)
    _operacao(uow, posicao, 278930)
    t = _transacao(uow, conta, BRUTO, 278930, "b")
    with uow as u:  # estado de antes da 069: a liquidação foi aceita como despesa
        from gastoba.domain.gasto import Gasto

        u.gastos.adicionar(
            Gasto(
                conta_id=conta.id,
                valor=t.valor,
                descricao=t.descricao,
                data=t.data,
                categoria=CategoriaDoGasto.LAZER,
                transacao_importada_id=t.id,
            )
        )
        t.aceitar()
        u.transacoes_importadas.atualizar_estado(t)
        u.commit()

    revisao = _revisao(uow)

    assert [i.motivo for i in revisao.sem_par if i.transacao_id == t.id] == [
        "Aceito como gasto: troque pelo lançamento ligado às operações."
    ]


def test_a_ligacao_vence_a_conciliacao(unidade_de_trabalho):
    uow = unidade_de_trabalho
    conta, posicao = _conta(uow), _posicao(uow)
    _operacao(uow, posicao, 278930)
    _transacao(uow, conta, BRUTO, 278930, "b")
    (proposta,) = _revisao(uow).propostas
    _confirmar(uow, proposta)

    revisao = _revisao(uow)

    assert revisao.propostas == () and revisao.conciliadas == ()
    assert len(revisao.confirmados) == 1


def test_venda_aceita_como_resgate_tambem_concilia(unidade_de_trabalho):
    uow = unidade_de_trabalho
    conta, posicao = _conta(uow), _posicao(uow)
    _operacao(uow, posicao, 50000, tipo=TipoDeOperacao.VENDA)
    t = _transacao(uow, conta, "Venda fictícia", 50000, "v", sentido=SentidoDaTransacao.ENTRADA)
    _aceitar_como_aporte(uow, t, posicao, sem_caixinhas=True)
    assert len(_revisao(uow).conciliadas) == 1
