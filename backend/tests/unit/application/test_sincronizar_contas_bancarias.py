from datetime import UTC, date, datetime
from uuid import uuid4

from gastoba.application.sincronizar_contas_bancarias import SincronizarContasBancarias
from gastoba.domain.conta import Conta, OrigemDaConta, TipoDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.email import Email
from gastoba.domain.excecoes import ProvedorIndisponivel
from gastoba.domain.portas import ContaExterna, TransacaoExterna
from gastoba.domain.transacao_importada import EstadoDaTransacaoImportada, SentidoDaTransacao
from gastoba.domain.usuario import Usuario

EMAIL = "dono@exemplo.com"
HOJE = datetime(2026, 10, 13, 15, 0, tzinfo=UTC)


class RelogioFixo:
    def agora(self):
        return HOJE


class ProvedorFalso:
    """Satisfaz a porta ProvedorOpenFinance com dados fixos e registra as chamadas."""

    def __init__(self, contas_por_item=None, transacoes_por_conta=None, falhar_item=()):
        self.contas_por_item = contas_por_item or {}
        self.transacoes_por_conta = transacoes_por_conta or {}
        self.falhar_item = set(falhar_item)
        self.desde_pedido: dict[str, date] = {}

    def listar_contas(self, id_do_item):
        if id_do_item in self.falhar_item:
            raise ProvedorIndisponivel("fora do ar")
        return self.contas_por_item.get(id_do_item, [])

    def listar_transacoes(self, id_da_conta, desde):
        self.desde_pedido[id_da_conta] = desde
        return self.transacoes_por_conta.get(id_da_conta, [])


def saida(id_externo, centavos=1000, dia=10, operacao=None, descricao="Mercado"):
    return TransacaoExterna(
        id_externo=id_externo,
        valor=Dinheiro(centavos),
        descricao=descricao,
        data=date(2026, 10, dia),
        sentido=SentidoDaTransacao.SAIDA,
        tipo_de_operacao=operacao,
    )


def criar_dono(unidade_de_trabalho):
    dono = Usuario(nome="Dono", email=Email.de_texto(EMAIL))
    unidade_de_trabalho.confirmado.usuarios[dono.id] = dono
    return dono


def sincronizador(unidade_de_trabalho, provedor, itens=("item-1",), dias=30):
    return SincronizarContasBancarias(
        unidade_de_trabalho, provedor, RelogioFixo(), itens, EMAIL, dias
    )


def caixa(unidade_de_trabalho, usuario_id, estado=EstadoDaTransacaoImportada.PENDENTE):
    with unidade_de_trabalho as uow:
        return uow.transacoes_importadas.listar(usuario_id, estado)


def test_cria_a_conta_importada_com_o_saldo_do_banco_e_traz_as_transacoes(unidade_de_trabalho):
    dono = criar_dono(unidade_de_trabalho)
    provedor = ProvedorFalso(
        {"item-1": [ContaExterna("c1", "Conta Corrente", Dinheiro(150000))]},
        {"c1": [saida("t1", 2590), saida("t2", 500, operacao="PIX")]},
    )

    resultado = sincronizador(unidade_de_trabalho, provedor).executar()

    assert (resultado.contas, resultado.novas, resultado.falhas) == (1, 2, 0)
    with unidade_de_trabalho as uow:
        [conta] = uow.contas.listar(dono.id)
    assert conta.origem == OrigemDaConta.OPEN_FINANCE
    assert conta.id_externo == "c1"
    assert conta.nome == "Conta Corrente"
    assert conta.saldo == Dinheiro(150000)
    assert {t.id_externo for t in caixa(unidade_de_trabalho, dono.id)} == {"t1", "t2"}


def test_rodar_de_novo_nao_duplica_e_atualiza_o_saldo(unidade_de_trabalho):
    dono = criar_dono(unidade_de_trabalho)
    provedor = ProvedorFalso(
        {"item-1": [ContaExterna("c1", "Conta Corrente", Dinheiro(100))]},
        {"c1": [saida("t1")]},
    )
    sincronizador(unidade_de_trabalho, provedor).executar()
    provedor.contas_por_item["item-1"] = [ContaExterna("c1", "Conta Corrente", Dinheiro(250))]

    resultado = sincronizador(unidade_de_trabalho, provedor).executar()

    assert resultado.novas == 0
    assert len(caixa(unidade_de_trabalho, dono.id)) == 1
    with unidade_de_trabalho as uow:
        assert uow.contas.listar(dono.id)[0].saldo == Dinheiro(250)
        assert len(uow.contas.listar(dono.id)) == 1


def test_primeira_rodada_pede_so_os_ultimos_dias_e_as_seguintes_partem_da_ultima_data(
    unidade_de_trabalho,
):
    criar_dono(unidade_de_trabalho)
    provedor = ProvedorFalso(
        {"item-1": [ContaExterna("c1", "Corrente", Dinheiro(0))]}, {"c1": [saida("t1", dia=12)]}
    )

    sincronizador(unidade_de_trabalho, provedor, dias=30).executar()
    assert provedor.desde_pedido["c1"] == date(2026, 9, 13)

    sincronizador(unidade_de_trabalho, provedor, dias=30).executar()
    assert provedor.desde_pedido["c1"] == date(2026, 10, 5)


def test_conta_manual_com_o_mesmo_nome_nao_impede_a_importada(unidade_de_trabalho):
    dono = criar_dono(unidade_de_trabalho)
    manual = Conta(dono.id, "Nubank", Dinheiro(0))
    unidade_de_trabalho.confirmado.contas[manual.id] = manual
    provedor = ProvedorFalso({"item-1": [ContaExterna("abcdef123", "Nubank", Dinheiro(0))]})

    resultado = sincronizador(unidade_de_trabalho, provedor).executar()

    assert resultado.falhas == 0
    with unidade_de_trabalho as uow:
        nomes = sorted(c.nome for c in uow.contas.listar(dono.id))
    assert nomes == ["Nubank", "Nubank (abcdef)"]


def test_falha_do_provedor_em_um_item_nao_impede_os_outros(unidade_de_trabalho):
    criar_dono(unidade_de_trabalho)
    provedor = ProvedorFalso(
        {"item-2": [ContaExterna("c2", "Poupança", Dinheiro(10))]},
        {"c2": [saida("t1")]},
        falhar_item={"item-1"},
    )

    resultado = sincronizador(unidade_de_trabalho, provedor, itens=("item-1", "item-2")).executar()

    assert (resultado.contas, resultado.novas, resultado.falhas) == (1, 1, 1)


def test_transacao_invalida_conta_como_falha_e_as_demais_entram(unidade_de_trabalho):
    dono = criar_dono(unidade_de_trabalho)
    provedor = ProvedorFalso(
        {"item-1": [ContaExterna("c1", "Corrente", Dinheiro(0))]},
        {"c1": [saida("t1", centavos=0), saida("t2", centavos=100)]},
    )

    resultado = sincronizador(unidade_de_trabalho, provedor).executar()

    assert (resultado.novas, resultado.falhas) == (1, 1)
    assert [t.id_externo for t in caixa(unidade_de_trabalho, dono.id)] == ["t2"]


def test_sem_o_dono_cadastrado_nada_e_criado_e_conta_uma_falha(unidade_de_trabalho):
    provedor = ProvedorFalso({"item-1": [ContaExterna("c1", "Corrente", Dinheiro(0))]})

    resultado = sincronizador(unidade_de_trabalho, provedor).executar()

    assert (resultado.contas, resultado.novas, resultado.falhas) == (0, 0, 1)
    assert unidade_de_trabalho.confirmado.contas == {}


def test_a_sincronizacao_nunca_cria_gasto_nem_ganho(unidade_de_trabalho):
    criar_dono(unidade_de_trabalho)
    provedor = ProvedorFalso(
        {"item-1": [ContaExterna("c1", "Corrente", Dinheiro(0))]}, {"c1": [saida("t1")]}
    )

    sincronizador(unidade_de_trabalho, provedor).executar()

    assert unidade_de_trabalho.confirmado.gastos == {}
    assert unidade_de_trabalho.confirmado.ganhos == {}
    assert uuid4() not in unidade_de_trabalho.confirmado.gastos


def test_transferencia_e_pagamento_de_fatura_entram_ja_ignorados_e_fora_das_novas(
    unidade_de_trabalho,
):
    dono = criar_dono(unidade_de_trabalho)
    provedor = ProvedorFalso(
        {"item-1": [ContaExterna("c1", "Corrente", Dinheiro(0))]},
        {
            "c1": [
                saida("t1", operacao="TRANSFERENCIA_MESMA_INSTITUICAO"),
                saida("t2", operacao="PAGAMENTO_FATURA"),
                saida("t3", operacao="ESTORNO"),
                saida("t4", operacao="PIX"),
            ]
        },
    )

    resultado = sincronizador(unidade_de_trabalho, provedor).executar()

    assert (resultado.novas, resultado.falhas) == (2, 0)
    pendentes = {t.id_externo: t for t in caixa(unidade_de_trabalho, dono.id)}
    assert set(pendentes) == {"t3", "t4"}
    assert pendentes["t3"].sugerir_descarte is True
    ignoradas = caixa(unidade_de_trabalho, dono.id, EstadoDaTransacaoImportada.IGNORADA)
    assert {t.id_externo for t in ignoradas} == {"t1", "t2"}

    de_novo = sincronizador(unidade_de_trabalho, provedor).executar()

    assert de_novo.novas == 0
    assert len(caixa(unidade_de_trabalho, dono.id, EstadoDaTransacaoImportada.IGNORADA)) == 2
    assert len(caixa(unidade_de_trabalho, dono.id)) == 2


def test_cria_a_conta_de_cartao_com_o_tipo_do_provedor(unidade_de_trabalho):
    dono = criar_dono(unidade_de_trabalho)
    provedor = ProvedorFalso(
        {"item-1": [ContaExterna("k1", "Visa", Dinheiro(-14241), tipo=TipoDaConta.CARTAO)]}
    )

    sincronizador(unidade_de_trabalho, provedor).executar()

    with unidade_de_trabalho as uow:
        [conta] = uow.contas.listar(dono.id)
    assert conta.tipo == TipoDaConta.CARTAO


def test_conta_existente_corrente_vira_cartao_na_rodada_seguinte(unidade_de_trabalho):
    dono = criar_dono(unidade_de_trabalho)
    provedor = ProvedorFalso({"item-1": [ContaExterna("k1", "Visa", Dinheiro(0))]})
    sincronizador(unidade_de_trabalho, provedor).executar()
    with unidade_de_trabalho as uow:
        assert uow.contas.listar(dono.id)[0].tipo == TipoDaConta.CORRENTE
    provedor.contas_por_item["item-1"] = [
        ContaExterna("k1", "Visa", Dinheiro(-500), tipo=TipoDaConta.CARTAO)
    ]

    sincronizador(unidade_de_trabalho, provedor).executar()

    with unidade_de_trabalho as uow:
        [conta] = uow.contas.listar(dono.id)
    assert (conta.tipo, conta.saldo) == (TipoDaConta.CARTAO, Dinheiro(-500))
