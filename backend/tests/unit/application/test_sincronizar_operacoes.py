from datetime import date
from decimal import Decimal

from test_sincronizar_contas_bancarias import (
    ProvedorFalso as ProvedorBase,
)
from test_sincronizar_contas_bancarias import (
    criar_dono,
    sincronizador,
)

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ProvedorIndisponivel
from gastoba.domain.operacao import Operacao, OrigemDaOperacao, TipoDeOperacao
from gastoba.domain.portas import ContaExterna, InvestimentoExterno, OperacaoExterna


class Provedor(ProvedorBase):
    def __init__(self, operacoes_por_investimento=None, falhar_operacoes=False, **resto):
        super().__init__(**resto)
        self.operacoes_por_investimento = operacoes_por_investimento or {}
        self.falhar_operacoes = falhar_operacoes

    def listar_operacoes_do_investimento(self, id_do_investimento):
        if self.falhar_operacoes:
            raise ProvedorIndisponivel("fora do ar", motivo="operacoes http 500")
        return self.operacoes_por_investimento.get(id_do_investimento, [])


def _externa(id_externo, tipo, centavos=278930, dia=3, **extra):
    base = dict(
        id_externo=id_externo,
        tipo=tipo,
        data=date(2026, 10, dia),
        quantidade="25",
        valor_bruto=Dinheiro(centavos),
        custos=None,
        sentido="CREDIT",
    )
    base.update(extra)
    return OperacaoExterna(**base)


def _acao(saldo=369237):
    return InvestimentoExterno("aupo11", "AUPO11", "EQUITY", "ETF", Dinheiro(saldo), "{}")


def _cdb(saldo=40369):
    return InvestimentoExterno("cdb1", "CDB", "FIXED_INCOME", "CDB", Dinheiro(saldo), "{}")


def _rodar(uow, provedor):
    criar_dono(uow)
    return sincronizador(uow, provedor).executar()


def _operacoes(uow, nome):
    with uow as u:
        dono = next(iter(uow.confirmado.usuarios))
        investimento = next(i for i in u.investimentos.listar_posicoes(dono) if i.nome == nome)
        return dono, investimento, u.operacoes.listar_da_posicao(dono, investimento.id)


def test_grava_as_operacoes_com_o_id_externo_da_pluggy(unidade_de_trabalho):
    provedor = Provedor(
        investimentos_por_item={"item-1": [_acao()]},
        operacoes_por_investimento={
            "aupo11": [
                _externa("b1", "BUY", custos=Dinheiro(82)),
                _externa("s1", "SELL", 100000, dia=9, sentido="DEBIT", quantidade="10"),
                _externa("i1", "INTEREST", 500, dia=9, sentido="DEBIT", quantidade="0"),
            ]
        },
    )
    _rodar(unidade_de_trabalho, provedor)
    _, _, operacoes = _operacoes(unidade_de_trabalho, "AUPO11")
    assert sorted((o.tipo, o.id_externo, o.origem) for o in operacoes) == [
        (TipoDeOperacao.COMPRA, "b1", OrigemDaOperacao.PLUGGY),
        (TipoDeOperacao.PROVENTO, "i1", OrigemDaOperacao.PLUGGY),
        (TipoDeOperacao.VENDA, "s1", OrigemDaOperacao.PLUGGY),
    ]
    compra = operacoes[0]
    assert compra.quantidade == Decimal("25")
    assert compra.valor_bruto == Dinheiro(278930)
    assert compra.custos == Dinheiro(82)


def test_reprocessar_varias_vezes_nao_duplica(unidade_de_trabalho):
    provedor = Provedor(
        investimentos_por_item={"item-1": [_acao()]},
        operacoes_por_investimento={"aupo11": [_externa("b1", "BUY")]},
    )
    criar_dono(unidade_de_trabalho)
    for _ in range(3):
        sincronizador(unidade_de_trabalho, provedor).executar()
    _, _, operacoes = _operacoes(unidade_de_trabalho, "AUPO11")
    assert len(operacoes) == 1


def test_transfer_de_credito_na_renda_fixa_e_a_entrada_do_titulo(unidade_de_trabalho):
    provedor = Provedor(
        investimentos_por_item={"item-1": [_cdb()]},
        operacoes_por_investimento={
            "cdb1": [_externa("t1", "TRANSFER", 40000, quantidade="40000")]
        },
    )
    _rodar(unidade_de_trabalho, provedor)
    _, _, (operacao,) = _operacoes(unidade_de_trabalho, "CDB")
    assert operacao.tipo == TipoDeOperacao.COMPRA
    assert operacao.quantidade == Decimal("1")  # nunca a quantity da Pluggy
    assert operacao.valor_bruto == Dinheiro(40000)


def test_tipos_sem_traducao_nao_viram_operacao(unidade_de_trabalho):
    provedor = Provedor(
        investimentos_por_item={"item-1": [_acao(), _cdb()]},
        operacoes_por_investimento={
            "aupo11": [_externa("a1", "AMORTIZATION"), _externa("x1", "TAX")],
            "cdb1": [_externa("t2", "TRANSFER", sentido="DEBIT")],
        },
    )
    _rodar(unidade_de_trabalho, provedor)
    assert _operacoes(unidade_de_trabalho, "AUPO11")[2] == []
    assert _operacoes(unidade_de_trabalho, "CDB")[2] == []


def test_resgate_parcial_de_renda_fixa_nao_inventa_quantidade(unidade_de_trabalho):
    provedor = Provedor(
        investimentos_por_item={"item-1": [_cdb(saldo=10000)]},
        operacoes_por_investimento={"cdb1": [_externa("s1", "SELL", 5000, sentido="DEBIT")]},
    )
    _rodar(unidade_de_trabalho, provedor)
    assert _operacoes(unidade_de_trabalho, "CDB")[2] == []


def test_resgate_total_de_renda_fixa_vira_venda_de_quantidade_um(unidade_de_trabalho):
    provedor = Provedor(
        investimentos_por_item={"item-1": [_cdb(saldo=0)]},
        operacoes_por_investimento={
            "cdb1": [
                _externa(
                    "s1", "SELL", 14803, sentido="DEBIT", custos=Dinheiro(490), quantidade="120"
                )
            ]
        },
    )
    _rodar(unidade_de_trabalho, provedor)
    _, _, (venda,) = _operacoes(unidade_de_trabalho, "CDB")
    assert venda.tipo == TipoDeOperacao.VENDA
    assert venda.quantidade == Decimal("1")
    assert venda.custos == Dinheiro(490)  # o IRRF da própria operação (D12)


def test_compra_da_pluggy_substitui_a_abertura_estimada_de_mesmo_valor(unidade_de_trabalho):
    provedor = Provedor(
        investimentos_por_item={"item-1": [_cdb()]},
        operacoes_por_investimento={"cdb1": [_externa("t1", "TRANSFER", 40000)]},
    )
    criar_dono(unidade_de_trabalho)
    sincronizador(
        unidade_de_trabalho, Provedor(investimentos_por_item={"item-1": [_cdb()]})
    ).executar()
    dono, cdb, _ = _operacoes(unidade_de_trabalho, "CDB")
    estimada = Operacao(
        posicao_id=cdb.id,
        tipo=TipoDeOperacao.ABERTURA,
        data=date(2026, 10, 22),
        quantidade=Decimal("1"),
        valor_bruto=Dinheiro(40000),
        origem=OrigemDaOperacao.ABERTURA,
        quantidade_estimada=True,
    )
    with unidade_de_trabalho as u:
        u.operacoes.adicionar(dono, estimada)
        u.commit()
    sincronizador(unidade_de_trabalho, provedor).executar()
    _, _, operacoes = _operacoes(unidade_de_trabalho, "CDB")
    assert [o.tipo for o in operacoes] == [TipoDeOperacao.COMPRA]


def test_abertura_de_valor_diferente_ou_confirmada_fica(unidade_de_trabalho):
    provedor = Provedor(
        investimentos_por_item={"item-1": [_cdb()]},
        operacoes_por_investimento={"cdb1": [_externa("t1", "TRANSFER", 40000)]},
    )
    criar_dono(unidade_de_trabalho)
    sincronizador(
        unidade_de_trabalho, Provedor(investimentos_por_item={"item-1": [_cdb()]})
    ).executar()
    dono, cdb, _ = _operacoes(unidade_de_trabalho, "CDB")
    for valor, estimada in ((39999, True), (40000, False)):
        with unidade_de_trabalho as u:
            u.operacoes.adicionar(
                dono,
                Operacao(
                    posicao_id=cdb.id,
                    tipo=TipoDeOperacao.ABERTURA,
                    data=date(2026, 10, 22),
                    quantidade=Decimal("1"),
                    valor_bruto=Dinheiro(valor),
                    origem=OrigemDaOperacao.ABERTURA,
                    quantidade_estimada=estimada,
                ),
            )
            u.commit()
    sincronizador(unidade_de_trabalho, provedor).executar()
    _, _, operacoes = _operacoes(unidade_de_trabalho, "CDB")
    assert sorted(o.tipo.value for o in operacoes) == ["ABERTURA", "ABERTURA", "COMPRA"]


def test_falha_nas_operacoes_nao_impede_posicoes_nem_contas(unidade_de_trabalho):
    provedor = Provedor(
        investimentos_por_item={"item-1": [_acao()]},
        contas_por_item={"item-1": [ContaExterna("c1", "Banco", Dinheiro(100))]},
        falhar_operacoes=True,
    )
    resultado = _rodar(unidade_de_trabalho, provedor)
    assert resultado.falhas >= 1
    assert resultado.contas == 1
    assert _operacoes(unidade_de_trabalho, "AUPO11")[2] == []


def test_resgate_parcial_usa_ultimo_saldo_estritamente_anterior(unidade_de_trabalho):
    criar_dono(unidade_de_trabalho)
    provedor = Provedor(investimentos_por_item={"item-1": [_cdb(saldo=10000)]})
    sincronizador(unidade_de_trabalho, provedor).executar()
    dono, cdb, _ = _operacoes(unidade_de_trabalho, "CDB")
    unidade_de_trabalho.confirmado.historico_de_investimentos[(cdb.id, date(2026, 10, 1))] = (
        Dinheiro(20000)
    )
    provedor.operacoes_por_investimento = {
        "cdb1": [_externa("s1", "SELL", 5000, dia=3, sentido="DEBIT")]
    }
    sincronizador(unidade_de_trabalho, provedor).executar()
    assert _operacoes(unidade_de_trabalho, "CDB")[2][0].quantidade == Decimal("0.25")


def test_pendencias_sem_traducao_sao_idempotentes_e_visiveis(unidade_de_trabalho):
    import json

    provedor = Provedor(
        investimentos_por_item={"item-1": [_acao()]},
        operacoes_por_investimento={"aupo11": [_externa("a1", "AMORTIZATION")]},
    )
    criar_dono(unidade_de_trabalho)
    for _ in range(2):
        sincronizador(unidade_de_trabalho, provedor).executar()
    with unidade_de_trabalho as u:
        dono = next(iter(unidade_de_trabalho.confirmado.usuarios))
        externa = u.investimentos.listar(dono)[0]
        pendencias = json.loads(externa.dados)["gastoba_pendencias_de_operacoes"]
        assert pendencias == [
            {"tipo": "AMORTIZATION", "data": "2026-10-03", "motivo": "tipo_sem_traducao"}
        ]


def test_nova_sincronizacao_corrige_o_custo_de_operacao_da_pluggy_ja_gravada(unidade_de_trabalho):
    """Produção (2026-11-11): o custo foi gravado com a liquidação do dia somada. A corretora é a
    fonte desse campo, então a rodada seguinte o corrige sem duplicar a operação."""
    criar_dono(unidade_de_trabalho)
    errado = Provedor(
        investimentos_por_item={"item-1": [_acao()]},
        operacoes_por_investimento={"aupo11": [_externa("b1", "BUY", custos=Dinheiro(279000))]},
    )
    sincronizador(unidade_de_trabalho, errado).executar()
    certo = Provedor(
        investimentos_por_item={"item-1": [_acao()]},
        operacoes_por_investimento={"aupo11": [_externa("b1", "BUY", custos=Dinheiro(125))]},
    )
    sincronizador(unidade_de_trabalho, certo).executar()
    _, _, (compra,) = _operacoes(unidade_de_trabalho, "AUPO11")
    assert compra.custos == Dinheiro(125)
    assert compra.valor_bruto == Dinheiro(278930)


def test_compra_sem_quantidade_da_corretora_e_inferida_pela_posicao_e_fica_para_confirmar(
    unidade_de_trabalho,
):
    """Produção (2026-11-11), AUVP11: a Pluggy mandou a compra sem `quantity`; a posição tem 3."""
    provedor = Provedor(
        investimentos_por_item={
            "item-1": [
                InvestimentoExterno(
                    "auvp11", "AUVP11", "EQUITY", "STOCK", Dinheiro(36993), '{"quantity": 3}'
                )
            ]
        },
        operacoes_por_investimento={"auvp11": [_externa("b1", "BUY", 45528, quantidade=None)]},
    )
    criar_dono(unidade_de_trabalho)
    for _ in range(2):
        sincronizador(unidade_de_trabalho, provedor).executar()
    _, _, (compra,) = _operacoes(unidade_de_trabalho, "AUVP11")
    assert compra.quantidade == Decimal("3")
    assert compra.quantidade_estimada  # nunca fecha o histórico até a pessoa confirmar


def test_compra_da_corretora_gravada_antes_com_quantidade_zero_e_reavaliada(unidade_de_trabalho):
    """Produção (2026-11-11): o AUVP11 já tinha a compra gravada com 0 cotas e sem a marca de
    estimada; a rodada seguinte deve marcá-la e inferir a quantidade."""
    from gastoba.domain.operacao import Operacao

    criar_dono(unidade_de_trabalho)
    provedor = Provedor(
        investimentos_por_item={
            "item-1": [
                InvestimentoExterno(
                    "auvp11", "AUVP11", "EQUITY", "STOCK", Dinheiro(36993), '{"quantity": 3}'
                )
            ]
        },
        operacoes_por_investimento={"auvp11": []},
    )
    sincronizador(unidade_de_trabalho, provedor).executar()
    _, investimento, _ = _operacoes(unidade_de_trabalho, "AUVP11")
    dono = next(iter(unidade_de_trabalho.confirmado.usuarios))
    with unidade_de_trabalho as u:
        u.operacoes.adicionar(
            dono,
            Operacao(
                posicao_id=investimento.id,
                tipo=TipoDeOperacao.COMPRA,
                data=date(2026, 10, 21),
                quantidade=Decimal(0),
                valor_bruto=Dinheiro(45528),
                origem=OrigemDaOperacao.PLUGGY,
                id_externo="b1",
            ),
        )
        u.commit()
    provedor.operacoes_por_investimento["auvp11"] = [
        _externa("b1", "BUY", 45528, quantidade=None, dia=21)
    ]
    sincronizador(unidade_de_trabalho, provedor).executar()
    _, _, (compra,) = _operacoes(unidade_de_trabalho, "AUVP11")
    assert compra.quantidade == Decimal("3") and compra.quantidade_estimada
