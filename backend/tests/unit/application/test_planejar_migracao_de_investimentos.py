from decimal import Decimal
from uuid import uuid4

from gastoba.application.definir_destinacoes_do_investimento import (
    DefinirDestinacoesDoInvestimento,
)
from gastoba.application.planejar_migracao_de_investimentos import (
    PlanejarMigracaoDeInvestimentos,
)
from gastoba.domain.destinacao import Destinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.tag import Tag

USUARIO = uuid4()
OUTRO = uuid4()


def _investimento(uow, codigo, saldo, quantidade, aplicado=None):
    dados = "{}" if quantidade is None else f'{{"quantity": "{quantidade}"}}'
    with uow as u:
        u.usuarios  # noqa: B018  (a unidade em memória não exige o usuário)
        u.investimentos.salvar_posicao(
            USUARIO,
            InvestimentoExterno(
                codigo.lower(),
                codigo,
                "EQUITY",
                "ETF",
                Dinheiro(saldo),
                dados,
                valor_aplicado=None if aplicado is None else Dinheiro(aplicado),
            ),
        )
        u.commit()
    with uow as u:
        return next(i for i in u.investimentos.listar_posicoes(USUARIO) if i.nome == codigo)


def _saldo_inicial(uow, relogio, investimento, **percentuais):
    destinos = [Destinacao(Tag.de_texto(t), p) for t, p in percentuais.items()]
    DefinirDestinacoesDoInvestimento(uow, relogio).executar(USUARIO, investimento.id, destinos)


def _item(relatorio, nome):
    return next(i for i in relatorio.itens if i.nome == nome)


def test_relatorio_traz_antes_e_depois_sem_gravar_nada(unidade_de_trabalho, relogio):
    aupo = _investimento(unidade_de_trabalho, "AUPO11", 369237, "25", aplicado=278925)
    _saldo_inicial(unidade_de_trabalho, relogio, aupo, reserva=60, viagem=40)
    commits = unidade_de_trabalho.commits

    relatorio = PlanejarMigracaoDeInvestimentos(unidade_de_trabalho).executar(USUARIO)

    assert unidade_de_trabalho.commits == commits
    item = _item(relatorio, "AUPO11")
    assert item.saldo == Dinheiro(369237)
    assert item.quantidade_observada == Decimal("25")
    assert item.abertura.valor == Dinheiro(278925)
    # Quantidade derivada e marcada como estimada: a rentabilidade fica nula (RF-008).
    assert item.abertura.estimada
    assert item.rentabilidade_depois is None
    assert any("confirme" in p for p in item.pendencias)


def test_caixinhas_nao_mudam_nem_um_centavo(unidade_de_trabalho, relogio):
    aupo = _investimento(unidade_de_trabalho, "AUPO11", 369237, "25", aplicado=278925)
    _saldo_inicial(unidade_de_trabalho, relogio, aupo, reserva=60, viagem=40)
    relatorio = PlanejarMigracaoDeInvestimentos(unidade_de_trabalho).executar(USUARIO)
    item = _item(relatorio, "AUPO11")
    assert item.caixinhas
    assert all(c.antes == c.depois for c in item.caixinhas)
    assert item.diferenca_maxima_de_caixinha == Dinheiro(0)
    assert sum(c.depois.centavos for c in item.caixinhas) == 369237


def test_posicao_sem_saldo_inicial_e_com_cotas_pede_a_quantidade_que_falta(
    unidade_de_trabalho,
):
    _investimento(unidade_de_trabalho, "BBAS3", 5000, "10")
    relatorio = PlanejarMigracaoDeInvestimentos(unidade_de_trabalho).executar(USUARIO)
    item = _item(relatorio, "BBAS3")
    assert item.abertura is None
    assert any("faltam" in p for p in item.pendencias)
    assert item.rentabilidade_depois is None


def test_quantidade_desconhecida_vira_pendencia(unidade_de_trabalho):
    _investimento(unidade_de_trabalho, "ITUB4", 5000, None)
    relatorio = PlanejarMigracaoDeInvestimentos(unidade_de_trabalho).executar(USUARIO)
    assert any("desconhecida" in p for p in _item(relatorio, "ITUB4").pendencias)


def test_os_quatro_casos_aparecem_sempre_mesmo_sem_dados(unidade_de_trabalho):
    _investimento(unidade_de_trabalho, "AUPO11", 100, "1")
    relatorio = PlanejarMigracaoDeInvestimentos(unidade_de_trabalho).executar(USUARIO)
    assert {d.nome: d.encontrado for d in relatorio.destaques} == {
        "AUPO11": True,
        "AUVP11": False,
        "BBAS3": False,
        "ITUB4": False,
    }


def test_nao_mostra_investimento_de_outra_pessoa(unidade_de_trabalho):
    _investimento(unidade_de_trabalho, "AUPO11", 100, "1")
    relatorio = PlanejarMigracaoDeInvestimentos(unidade_de_trabalho).executar(OUTRO)
    assert relatorio.itens == ()


def test_metas_passadas_nao_mudam_na_migracao(unidade_de_trabalho):
    relatorio = PlanejarMigracaoDeInvestimentos(unidade_de_trabalho).executar(USUARIO)
    assert relatorio.metas_passadas_alteradas == 0


def test_investimento_encerrado_tambem_entra_no_relatorio(unidade_de_trabalho):
    # Vencido ou resgatado (saldo zero): sai das listas, mas a migração precisa cobri-lo.
    _investimento(unidade_de_trabalho, "CDB Guanabara", 0, None, aplicado=0)
    relatorio = PlanejarMigracaoDeInvestimentos(unidade_de_trabalho).executar(USUARIO)
    item = _item(relatorio, "CDB Guanabara")
    assert item.saldo == Dinheiro(0)
    assert item.aplicado_antes == Dinheiro(0)


def test_conta_remunerada_aparece_como_fora_do_modelo(unidade_de_trabalho):
    with unidade_de_trabalho as u:
        u.investimentos.salvar_posicao(
            USUARIO,
            InvestimentoExterno("c", "Conta investimentos", "CAIXINHA", None, Dinheiro(0), "{}"),
        )
        u.commit()
    relatorio = PlanejarMigracaoDeInvestimentos(unidade_de_trabalho).executar(USUARIO)
    item = _item(relatorio, "Conta investimentos")
    assert item.abertura is None
    assert any("fora do modelo" in p for p in item.pendencias)


def test_renda_fixa_usa_quantidade_um_e_ignora_a_da_pluggy(unidade_de_trabalho, relogio):
    with unidade_de_trabalho as u:
        u.investimentos.salvar_posicao(
            USUARIO,
            InvestimentoExterno(
                "cdb",
                "CDB Exemplo",
                "FIXED_INCOME",
                "CDB",
                Dinheiro(40369),
                '{"quantity": "40000"}',
                valor_aplicado=Dinheiro(40000),
            ),
        )
        u.commit()
    with unidade_de_trabalho as u:
        cdb = u.investimentos.listar_posicoes(USUARIO)[0]
    _saldo_inicial(unidade_de_trabalho, relogio, cdb, reserva=100)
    relatorio = PlanejarMigracaoDeInvestimentos(unidade_de_trabalho).executar(USUARIO)
    item = _item(relatorio, "CDB Exemplo")
    assert item.quantidade_observada == Decimal(1)
    assert item.abertura.quantidade == Decimal(1)
    assert not any("faltam" in p for p in item.pendencias)


def test_posicao_encerrada_nao_ganha_abertura(unidade_de_trabalho, relogio):
    with unidade_de_trabalho as u:
        u.investimentos.salvar_posicao(
            USUARIO,
            InvestimentoExterno(
                "cdb2",
                "CDB Vencido",
                "FIXED_INCOME",
                "CDB",
                Dinheiro(0),
                "{}",
                valor_aplicado=Dinheiro(12000),
            ),
        )
        u.commit()
    relatorio = PlanejarMigracaoDeInvestimentos(unidade_de_trabalho).executar(USUARIO)
    assert _item(relatorio, "CDB Vencido").abertura is None
