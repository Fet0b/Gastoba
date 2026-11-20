from datetime import date
from decimal import Decimal
from uuid import uuid4

from gastoba.application.listar_investimentos import ListarInvestimentos
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.operacao import Operacao, OrigemDaOperacao, TipoDeOperacao
from gastoba.domain.portas import InvestimentoExterno

USUARIO = uuid4()
HOJE = date(2026, 11, 10)


def _investimento(uow, nome="AUPO11", tipo="EQUITY", saldo=369237, dados='{"quantity": "25"}'):
    with uow as u:
        u.investimentos.salvar_posicao(
            USUARIO, InvestimentoExterno(nome.lower(), nome, tipo, None, Dinheiro(saldo), dados)
        )
        u.commit()
    with uow as u:
        return next(i for i in u.investimentos.listar_posicoes(USUARIO) if i.nome == nome)


def _operacao(uow, investimento, tipo=TipoDeOperacao.COMPRA, **mudancas):
    base = dict(
        posicao_id=investimento.id,
        tipo=tipo,
        data=date(2026, 11, 3),
        quantidade=Decimal("25"),
        valor_bruto=Dinheiro(278930),
        origem=OrigemDaOperacao.MANUAL,
    )
    base.update(mudancas)
    with uow as u:
        u.operacoes.adicionar(USUARIO, Operacao(**base))
        u.commit()


def _listar(uow):
    (posicao,) = ListarInvestimentos(uow).executar(USUARIO, hoje=HOJE)
    return posicao


def test_sem_operacoes_a_rentabilidade_e_ausente_com_a_pendencia(unidade_de_trabalho):
    _investimento(unidade_de_trabalho)
    posicao = _listar(unidade_de_trabalho)
    assert posicao.quantidade == Decimal("25")
    assert not posicao.historico_completo
    assert posicao.rentabilidade_do_periodo is None
    assert posicao.rentabilidade_anualizada is None
    assert posicao.motivo_sem_rentabilidade == "historico_incompleto"
    (pendencia,) = posicao.pendencias
    assert pendencia.tipo.value == "faltam_cotas"
    assert pendencia.quantidade_estimada == Decimal("25")


def test_com_o_historico_completo_a_rentabilidade_e_calculada(unidade_de_trabalho):
    investimento = _investimento(unidade_de_trabalho)
    _operacao(unidade_de_trabalho, investimento)
    posicao = _listar(unidade_de_trabalho)
    assert posicao.historico_completo
    assert posicao.custo_medio == Decimal("111.572")
    assert posicao.rentabilidade_do_periodo == Decimal("32.38")
    assert posicao.rentabilidade_anualizada is None  # menos de 12 meses
    assert posicao.motivo_sem_rentabilidade is None
    assert posicao.pendencias == ()


def test_abertura_estimada_nunca_fecha_o_historico(unidade_de_trabalho):
    investimento = _investimento(unidade_de_trabalho)
    _operacao(
        unidade_de_trabalho,
        investimento,
        tipo=TipoDeOperacao.ABERTURA,
        origem=OrigemDaOperacao.ABERTURA,
        quantidade_estimada=True,
    )
    posicao = _listar(unidade_de_trabalho)
    assert not posicao.historico_completo
    assert posicao.rentabilidade_do_periodo is None
    assert posicao.motivo_sem_rentabilidade == "historico_incompleto"


def test_renda_fixa_segue_a_mesma_regra_com_quantidade_um(unidade_de_trabalho):
    cdb = _investimento(unidade_de_trabalho, "CDB", "FIXED_INCOME", 40369, '{"quantity": "40000"}')
    _operacao(unidade_de_trabalho, cdb, quantidade=Decimal("1"), valor_bruto=Dinheiro(40000))
    posicao = _listar(unidade_de_trabalho)
    assert posicao.quantidade == Decimal("1")
    assert posicao.historico_completo
    assert posicao.rentabilidade_do_periodo is not None


def test_posicao_sem_dados_nunca_mostra_zero_inventado(unidade_de_trabalho):
    _investimento(unidade_de_trabalho, dados="{}")
    posicao = _listar(unidade_de_trabalho)
    assert posicao.quantidade is None
    assert not posicao.historico_completo
    assert posicao.rentabilidade_do_periodo is None
    assert posicao.pendencias == ()


def test_venda_maior_que_a_quantidade_nao_derruba_a_lista(unidade_de_trabalho):
    investimento = _investimento(unidade_de_trabalho)
    _operacao(unidade_de_trabalho, investimento, tipo=TipoDeOperacao.VENDA, quantidade=Decimal("9"))
    posicao = _listar(unidade_de_trabalho)
    assert not posicao.historico_completo
    assert posicao.motivo_sem_rentabilidade == "historico_incompleto"


def test_campos_antigos_continuam_presentes(unidade_de_trabalho):
    _investimento(unidade_de_trabalho)
    posicao = _listar(unidade_de_trabalho)
    assert posicao.investimento.nome == "AUPO11"
    (sem_destinacao,) = posicao.destinacoes
    assert sem_destinacao.tag is None


def _compra_casada(uow, investimento, custos_da_operacao, taxas):
    from gastoba.domain.casamento_de_operacao import (
        CasamentoDeOperacao,
        PapelDoVinculo,
        VinculoDeCasamento,
    )
    from gastoba.domain.conta import Conta, OrigemDaConta
    from gastoba.domain.transacao_importada import SentidoDaTransacao, TransacaoImportada

    conta = Conta(USUARIO, "Banco", Dinheiro(0), origem=OrigemDaConta.OPEN_FINANCE, id_externo="c")
    operacao = Operacao(
        posicao_id=investimento.id,
        tipo=TipoDeOperacao.COMPRA,
        data=date(2026, 11, 3),
        quantidade=Decimal("25"),
        valor_bruto=Dinheiro(278930),
        custos=Dinheiro(custos_da_operacao),
        origem=OrigemDaOperacao.PLUGGY,
        id_externo="op1",
    )
    vinculos = []
    with uow as u:
        u.contas.adicionar(conta)
        u.operacoes.adicionar(USUARIO, operacao)
        for i, valor in enumerate(taxas):
            t = TransacaoImportada(
                conta.id,
                f"t{i}",
                date(2026, 11, 5),
                "LIQ BOLSA - VISTA TX EMOL",
                Dinheiro(valor),
                SentidoDaTransacao.SAIDA,
            )
            u.transacoes_importadas.adicionar_se_nova(t)
            vinculos.append(VinculoDeCasamento(t.id, PapelDoVinculo.TAXA))
        bruto = TransacaoImportada(
            conta.id,
            "b",
            date(2026, 11, 5),
            "LIQ BOLSA - VISTA BRUTO",
            Dinheiro(278930),
            SentidoDaTransacao.SAIDA,
        )
        u.transacoes_importadas.adicionar_se_nova(bruto)
        u.casamentos.adicionar(
            USUARIO,
            CasamentoDeOperacao(
                (operacao.id,), (VinculoDeCasamento(bruto.id, PapelDoVinculo.BRUTO), *vinculos)
            ),
        )
        u.commit()


def test_custo_vem_dos_debitos_casados_quando_a_operacao_nao_informa(unidade_de_trabalho):
    investimento = _investimento(unidade_de_trabalho)
    _compra_casada(unidade_de_trabalho, investimento, 0, [62, 13, 7])
    posicao = _listar(unidade_de_trabalho)
    # 2789,30 + 0,82 de taxas = 2790,12 por 25 cotas.
    assert posicao.custo_medio == Decimal("111.6048")


def test_custo_nunca_soma_as_despesas_da_operacao_com_os_debitos(unidade_de_trabalho):
    investimento = _investimento(unidade_de_trabalho)
    _compra_casada(unidade_de_trabalho, investimento, 82, [62, 13, 7])
    posicao = _listar(unidade_de_trabalho)
    assert posicao.custo_medio == Decimal("111.6048")  # 2790,12, não 2790,94


def test_com_o_historico_completo_aplicado_e_rendimento_vem_das_operacoes(unidade_de_trabalho):
    """Produção (2026-11-11): AUPO11 mostrava o aplicado antigo da instituição (R$ 2.789,25) com
    +R$ 902,79, enquanto as compras reais somam mais e a rentabilidade já usava as operações."""
    investimento = _investimento(unidade_de_trabalho)
    _operacao(unidade_de_trabalho, investimento, custos=Dinheiro(100))
    posicao = _listar(unidade_de_trabalho)
    assert posicao.valor_aplicado_das_operacoes == Dinheiro(279030)
    assert posicao.rendimento_das_operacoes == Dinheiro(369237 - 279030)


def test_sem_historico_completo_nao_ha_aplicado_nem_rendimento_das_operacoes(unidade_de_trabalho):
    _investimento(unidade_de_trabalho)
    posicao = _listar(unidade_de_trabalho)
    assert posicao.valor_aplicado_das_operacoes is None
    assert posicao.rendimento_das_operacoes is None
