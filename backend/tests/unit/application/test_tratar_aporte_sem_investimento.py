from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.aprovar_tratamentos_de_aporte import AprovarTratamentosDeAporte
from gastoba.application.desfazer_tratamento_de_aporte import DesfazerTratamentoDeAporte
from gastoba.application.excluir_aporte_sem_investimento import ExcluirAporteSemInvestimento
from gastoba.application.listar_aportes_sem_investimento import ListarAportesSemInvestimento
from gastoba.application.mesclar_aporte_sem_investimento import MesclarAporteSemInvestimento
from gastoba.domain.conta import Conta, OrigemDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import (
    AporteJaTratado,
    MesclaInvalida,
    MovimentoDeInvestimentoNaoEncontrado,
)
from gastoba.domain.movimento_de_investimento import (
    MovimentoDeInvestimento,
    OrigemDoMovimento,
    TipoDeMovimento,
)
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    SentidoDaTransacao,
    TransacaoImportada,
)

USUARIO, OUTRO = uuid4(), uuid4()
DIA = date(2026, 10, 27)


def _montar(uow, *, valores=(14313, 14313), com_origem=True):
    conta = Conta(USUARIO, "Banco", Dinheiro(0), origem=OrigemDaConta.OPEN_FINANCE, id_externo="c")
    movimentos = []
    with uow as u:
        u.contas.adicionar(conta)
        for i, valor in enumerate(valores):
            transacao_id = None
            if com_origem:
                t = TransacaoImportada(
                    conta.id, f"t{i}", DIA, "Aplicação", Dinheiro(valor), SentidoDaTransacao.SAIDA
                )
                t.aceitar()
                u.transacoes_importadas.adicionar_se_nova(t)
                u.transacoes_importadas.atualizar_estado(t)
                transacao_id = t.id
            m = MovimentoDeInvestimento(
                conta.id,
                TipoDeMovimento.APORTE,
                Dinheiro(valor),
                "Aplicação",
                DIA,
                transacao_importada_id=transacao_id,
            )
            u.movimentos_de_investimento.adicionar(m)
            movimentos.append(m)
        u.commit()
    return conta, movimentos


def _soma(uow):
    with uow as u:
        return u.movimentos_de_investimento.somar_aportes(USUARIO, DIA, DIA)


def _estado(uow, movimento):
    with uow as u:
        return u.transacoes_importadas.obter(USUARIO, movimento.transacao_importada_id).estado


def test_lista_os_aportes_sem_investimento_com_o_duplicado_sugerido(unidade_de_trabalho):
    _, (a, b) = _montar(unidade_de_trabalho)
    itens = ListarAportesSemInvestimento(unidade_de_trabalho).executar(USUARIO)
    assert {i.movimento.id for i in itens} == {a.id, b.id}
    assert all(i.duplicado_sugerido_id is not None for i in itens)
    assert ListarAportesSemInvestimento(unidade_de_trabalho).executar(OUTRO) == []


def test_saldo_inicial_e_aporte_com_posicao_nao_aparecem(unidade_de_trabalho):
    conta, (a,) = _montar(unidade_de_trabalho, valores=(100,))
    inicial = MovimentoDeInvestimento(
        None,
        TipoDeMovimento.APORTE,
        Dinheiro(5),
        "Saldo inicial",
        DIA,
        investimento_id=uuid4(),
        origem=OrigemDoMovimento.SALDO_INICIAL,
    )
    with unidade_de_trabalho as u:
        u.movimentos_de_investimento.adicionar(inicial)
        u.commit()
    itens = ListarAportesSemInvestimento(unidade_de_trabalho).executar(USUARIO)
    assert [i.movimento.id for i in itens] == [a.id]


def test_mesclar_nao_muda_total_ate_aprovar_e_depois_reabre_a_transacao(
    unidade_de_trabalho, relogio
):
    _, (a, b) = _montar(unidade_de_trabalho)
    assert _soma(unidade_de_trabalho) == Dinheiro(28626)
    MesclarAporteSemInvestimento(unidade_de_trabalho, relogio).executar(USUARIO, a.id, b.id)
    assert _soma(unidade_de_trabalho) == Dinheiro(28626)  # sem aprovação, nada muda (RF-023)
    assert _estado(unidade_de_trabalho, a) == EstadoDaTransacaoImportada.ACEITA
    AprovarTratamentosDeAporte(unidade_de_trabalho, relogio).executar(USUARIO)
    assert _soma(unidade_de_trabalho) == Dinheiro(14313)
    assert _estado(unidade_de_trabalho, a) == EstadoDaTransacaoImportada.PENDENTE
    assert _estado(unidade_de_trabalho, b) == EstadoDaTransacaoImportada.ACEITA
    with unidade_de_trabalho as u:  # o registro continua guardado, com o valor original
        tratamento = u.tratamentos.ativo_do_movimento(USUARIO, a.id)
        assert tratamento.valores_originais["valor_centavos"] == 14313


def test_excluir_e_desfazer_devolvem_o_aporte_identico(unidade_de_trabalho, relogio):
    _, (a, b) = _montar(unidade_de_trabalho)
    tratamento = ExcluirAporteSemInvestimento(unidade_de_trabalho, relogio).executar(USUARIO, a.id)
    AprovarTratamentosDeAporte(unidade_de_trabalho, relogio).executar(USUARIO)
    assert _soma(unidade_de_trabalho) == Dinheiro(14313)
    DesfazerTratamentoDeAporte(unidade_de_trabalho, relogio).executar(USUARIO, tratamento.id)
    assert _soma(unidade_de_trabalho) == Dinheiro(28626)
    assert _estado(unidade_de_trabalho, a) == EstadoDaTransacaoImportada.ACEITA
    with unidade_de_trabalho as u:
        assert u.movimentos_de_investimento.obter(USUARIO, a.id).valor == Dinheiro(14313)


def test_sem_transacao_de_origem_nada_e_reaberto(unidade_de_trabalho, relogio):
    _, (a, _) = _montar(unidade_de_trabalho, com_origem=False)
    ExcluirAporteSemInvestimento(unidade_de_trabalho, relogio).executar(USUARIO, a.id)
    AprovarTratamentosDeAporte(unidade_de_trabalho, relogio).executar(USUARIO)
    assert _soma(unidade_de_trabalho) == Dinheiro(14313)


def test_mescla_recusa_cadeia_valor_diferente_e_aporte_ja_tratado(unidade_de_trabalho, relogio):
    _, (a, b, c) = _montar(unidade_de_trabalho, valores=(100, 100, 999))
    mesclar = MesclarAporteSemInvestimento(unidade_de_trabalho, relogio)
    mesclar.executar(USUARIO, a.id, b.id)
    with pytest.raises(AporteJaTratado):
        mesclar.executar(USUARIO, a.id, b.id)
    with pytest.raises(MesclaInvalida):  # b é o mantido; não pode ser o descartado de outra mescla
        mesclar.executar(USUARIO, b.id, c.id)
    with pytest.raises(MesclaInvalida):  # o mantido já foi descartado: cadeia
        mesclar.executar(USUARIO, c.id, a.id)
    with pytest.raises(MesclaInvalida):
        mesclar.executar(USUARIO, c.id, c.id)


def test_outra_pessoa_nao_trata(unidade_de_trabalho, relogio):
    _, (a, b) = _montar(unidade_de_trabalho)
    with pytest.raises(MovimentoDeInvestimentoNaoEncontrado):
        ExcluirAporteSemInvestimento(unidade_de_trabalho, relogio).executar(OUTRO, a.id)
    with pytest.raises(MovimentoDeInvestimentoNaoEncontrado):
        MesclarAporteSemInvestimento(unidade_de_trabalho, relogio).executar(OUTRO, a.id, b.id)
