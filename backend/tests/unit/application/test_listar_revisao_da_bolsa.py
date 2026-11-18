from datetime import date
from decimal import Decimal
from uuid import uuid4

from gastoba.application.aceitar_transacao_importada import AceitarTransacaoImportada
from gastoba.application.listar_revisao_da_bolsa import ListarRevisaoDaBolsa
from gastoba.domain.casamento_de_operacao import (
    CasamentoDeOperacao,
    PapelDoVinculo,
    VinculoDeCasamento,
)
from gastoba.domain.conta import Conta, OrigemDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.operacao import Operacao, OrigemDaOperacao, TipoDeOperacao
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.transacao_importada import SentidoDaTransacao, TransacaoImportada

PESSOA = uuid4()
BRUTO = "LIQ BOLSA - VISTA BRUTO - PREGÃO: 03/11/2026 - EXEC.: 1"
TAXA = "LIQ BOLSA - VISTA TX CCP/EMOL/TTA B3 - PREGÃO: 03/11/2026"


def _base(uow, pessoa=PESSOA):
    conta = Conta(pessoa, "Banco", Dinheiro(0), origem=OrigemDaConta.OPEN_FINANCE)
    bruto = TransacaoImportada(
        conta.id, "b", date(2026, 11, 5), BRUTO, Dinheiro(278930), SentidoDaTransacao.SAIDA
    )
    taxa = TransacaoImportada(
        conta.id, "t", date(2026, 11, 5), TAXA, Dinheiro(62), SentidoDaTransacao.SAIDA
    )
    with uow as u:
        u.contas.adicionar(conta)
        u.transacoes_importadas.adicionar_se_nova(bruto)
        u.transacoes_importadas.adicionar_se_nova(taxa)
        u.investimentos.salvar_posicao(
            pessoa, InvestimentoExterno("aupo11", "AUPO11", "EQUITY", None, Dinheiro(1), "{}")
        )
        u.commit()
    with uow as u:
        (posicao,) = u.investimentos.listar_posicoes(pessoa)
    return conta, bruto, taxa, posicao


def _operacao(uow, posicao, pessoa=PESSOA, **mudancas):
    base = dict(
        posicao_id=posicao.id,
        tipo=TipoDeOperacao.COMPRA,
        data=date(2026, 11, 3),
        quantidade=Decimal("25"),
        valor_bruto=Dinheiro(278930),
        origem=OrigemDaOperacao.PLUGGY,
        id_externo=f"op{uuid4()}",
    )
    base.update(mudancas)
    operacao = Operacao(**base)
    with uow as u:
        u.operacoes.adicionar(pessoa, operacao)
        u.commit()
    return operacao


def test_monta_a_proposta_com_efeitos_e_versao(unidade_de_trabalho):
    _, bruto, taxa, posicao = _base(unidade_de_trabalho)
    operacao = _operacao(unidade_de_trabalho, posicao)
    revisao = ListarRevisaoDaBolsa(unidade_de_trabalho).executar(PESSOA)
    (item,) = revisao.propostas
    assert item.proposta.confianca == "exata"
    assert item.proposta.operacoes[0].operacao.id == operacao.id
    assert {e.codigo for e in item.proposta.efeitos} == {"aceita_a_pendente"}
    assert item.versao and len(item.versao) == 64
    assert revisao.confirmados == () and revisao.sem_par == ()
    assert {t.transacao.id for t in item.proposta.bruto + item.proposta.taxas} == {
        bruto.id,
        taxa.id,
    }


def test_a_versao_muda_quando_muda_o_estado_de_uma_transacao(unidade_de_trabalho):
    _, bruto, _, posicao = _base(unidade_de_trabalho)
    _operacao(unidade_de_trabalho, posicao)
    (antes,) = ListarRevisaoDaBolsa(unidade_de_trabalho).executar(PESSOA).propostas
    AceitarTransacaoImportada(unidade_de_trabalho).executar(
        PESSOA, bruto.id, None, [], como_investimento=True
    )
    (depois,) = ListarRevisaoDaBolsa(unidade_de_trabalho).executar(PESSOA).propostas
    assert antes.proposta.chave == depois.proposta.chave
    assert antes.versao != depois.versao
    efeitos = {e.codigo for e in depois.proposta.efeitos}
    assert "aporte_passa_a_ser_da_posicao" in efeitos


def test_so_operacoes_da_corretora_sem_casamento_e_sem_abertura(unidade_de_trabalho):
    _, bruto, _, posicao = _base(unidade_de_trabalho)
    _operacao(unidade_de_trabalho, posicao, origem=OrigemDaOperacao.MANUAL, id_externo=None)
    _operacao(
        unidade_de_trabalho,
        posicao,
        tipo=TipoDeOperacao.ABERTURA,
        origem=OrigemDaOperacao.ABERTURA,
        id_externo=None,
    )
    revisao = ListarRevisaoDaBolsa(unidade_de_trabalho).executar(PESSOA)
    assert revisao.propostas == ()
    assert bruto.id in {i.transacao_id for i in revisao.sem_par}


def test_casamento_confirmado_aparece_com_selo_sem_aporte(unidade_de_trabalho):
    _, bruto, _, posicao = _base(unidade_de_trabalho)
    operacao = _operacao(unidade_de_trabalho, posicao)
    with unidade_de_trabalho as u:
        u.casamentos.adicionar(
            PESSOA,
            CasamentoDeOperacao(
                (operacao.id,), (VinculoDeCasamento(bruto.id, PapelDoVinculo.BRUTO),)
            ),
        )
        bruto.aceitar()
        u.transacoes_importadas.atualizar_estado(bruto)
        u.commit()
    revisao = ListarRevisaoDaBolsa(unidade_de_trabalho).executar(PESSOA)
    assert revisao.propostas == ()
    (confirmado,) = revisao.confirmados
    assert confirmado.sem_aporte is True
    assert confirmado.casamento.operacao_ids == (operacao.id,)


def test_outra_pessoa_nao_ve_nada(unidade_de_trabalho):
    _, _, _, posicao = _base(unidade_de_trabalho)
    _operacao(unidade_de_trabalho, posicao)
    revisao = ListarRevisaoDaBolsa(unidade_de_trabalho).executar(uuid4())
    assert revisao.propostas == () and revisao.sem_par == () and revisao.confirmados == ()
