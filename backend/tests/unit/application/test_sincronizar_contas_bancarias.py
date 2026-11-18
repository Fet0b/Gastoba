from datetime import UTC, date, datetime
from uuid import uuid4

from gastoba.application.sincronizar_contas_bancarias import SincronizarContasBancarias
from gastoba.domain.conta import Conta, OrigemDaConta, TipoDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.email import Email
from gastoba.domain.excecoes import ProvedorIndisponivel
from gastoba.domain.portas import ContaExterna, InvestimentoExterno, TransacaoExterna
from gastoba.domain.transacao_importada import EstadoDaTransacaoImportada, SentidoDaTransacao
from gastoba.domain.usuario import Usuario

EMAIL = "dono@exemplo.com"
HOJE = datetime(2026, 10, 13, 15, 0, tzinfo=UTC)


class RelogioFixo:
    def agora(self):
        return HOJE


class ProvedorFalso:
    """Satisfaz a porta ProvedorOpenFinance com dados fixos e registra as chamadas."""

    def __init__(
        self,
        contas_por_item=None,
        transacoes_por_conta=None,
        falhar_item=(),
        investimentos_por_item=None,
        falhar_investimentos=False,
    ):
        self.contas_por_item = contas_por_item or {}
        self.investimentos_por_item = investimentos_por_item or {}
        self.falhar_investimentos = falhar_investimentos
        self.transacoes_por_conta = transacoes_por_conta or {}
        self.falhar_item = set(falhar_item)
        self.desde_pedido: dict[str, date] = {}

    def listar_contas(self, id_do_item):
        if id_do_item in self.falhar_item:
            raise ProvedorIndisponivel("fora do ar", motivo="contas http 404")
        return self.contas_por_item.get(id_do_item, [])

    def listar_investimentos(self, id_do_item):
        if self.falhar_investimentos:
            raise ProvedorIndisponivel("fora do ar", motivo="investimentos http 500")
        return self.investimentos_por_item.get(id_do_item, [])

    def listar_faturas(self, id_da_conta):
        return []

    def listar_operacoes_do_investimento(self, id_do_investimento):
        return []

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
    assert nomes == ["Nubank", "Nubank (2)"]


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


def test_o_aviso_de_falha_traz_o_motivo_e_nenhum_identificador(unidade_de_trabalho, caplog):
    criar_dono(unidade_de_trabalho)
    provedor = ProvedorFalso(falhar_item={"item-secreto"})

    with caplog.at_level("WARNING"):
        sincronizador(unidade_de_trabalho, provedor, itens=("item-secreto",)).executar()

    assert "contas http 404" in caplog.text
    assert "item-secreto" not in caplog.text


def cdb(id_externo="i1", centavos=200010, dados="{}"):
    return InvestimentoExterno(
        id_externo, "CDB Banco X", "FIXED_INCOME", "CDB", Dinheiro(centavos), dados
    )


def investimentos(unidade_de_trabalho, usuario_id):
    with unidade_de_trabalho as uow:
        return uow.investimentos.listar(usuario_id)


def test_guarda_os_investimentos_sem_criar_conta_nem_alterar_o_resto(unidade_de_trabalho):
    dono = criar_dono(unidade_de_trabalho)
    provedor = ProvedorFalso(investimentos_por_item={"item-1": [cdb(dados='{"owner": "x"}')]})

    resultado = sincronizador(unidade_de_trabalho, provedor).executar()

    assert (resultado.contas, resultado.novas, resultado.falhas) == (0, 0, 0)
    [posicao] = investimentos(unidade_de_trabalho, dono.id)
    assert posicao.id_externo == "i1"
    assert posicao.saldo == Dinheiro(200010)
    assert posicao.dados == '{"owner": "x"}'
    with unidade_de_trabalho as uow:
        assert uow.contas.listar(dono.id) == []


def test_rodar_de_novo_atualiza_a_posicao_sem_duplicar(unidade_de_trabalho):
    dono = criar_dono(unidade_de_trabalho)
    provedor = ProvedorFalso(investimentos_por_item={"item-1": [cdb()]})
    sincronizador(unidade_de_trabalho, provedor).executar()
    provedor.investimentos_por_item["item-1"] = [cdb(centavos=250000)]

    sincronizador(unidade_de_trabalho, provedor).executar()

    [posicao] = investimentos(unidade_de_trabalho, dono.id)
    assert posicao.saldo == Dinheiro(250000)


def test_falha_nos_investimentos_conta_uma_falha_e_nao_impede_contas_e_transacoes(
    unidade_de_trabalho,
):
    dono = criar_dono(unidade_de_trabalho)
    provedor = ProvedorFalso(
        {"item-1": [ContaExterna("c1", "Conta Corrente", Dinheiro(100))]},
        {"c1": [saida("t1")]},
        falhar_investimentos=True,
    )

    resultado = sincronizador(unidade_de_trabalho, provedor).executar()

    assert (resultado.contas, resultado.novas, resultado.falhas) == (1, 1, 1)
    assert investimentos(unidade_de_trabalho, dono.id) == []


def test_contas_do_banco_com_o_mesmo_nome_ganham_numero_sequencial_sem_vazar_o_id(
    unidade_de_trabalho,
):
    dono = criar_dono(unidade_de_trabalho)
    provedor = ProvedorFalso(
        {
            "item-1": [
                ContaExterna("abc123-x", "BTG Banking", Dinheiro(0)),
                ContaExterna("def456-y", "BTG Banking", Dinheiro(0)),
                ContaExterna("fed789-z", "BTG Banking", Dinheiro(0)),
            ]
        }
    )

    resultado = sincronizador(unidade_de_trabalho, provedor).executar()

    assert (resultado.contas, resultado.falhas) == (3, 0)
    with unidade_de_trabalho as uow:
        nomes = sorted(c.nome for c in uow.contas.listar(dono.id))
    assert nomes == ["BTG Banking", "BTG Banking (2)", "BTG Banking (3)"]


def test_nome_longo_repetido_continua_dentro_do_limite_com_o_numero(unidade_de_trabalho):
    dono = criar_dono(unidade_de_trabalho)
    nome = "N" * 100
    provedor = ProvedorFalso(
        {"item-1": [ContaExterna("a-1", nome, Dinheiro(0)), ContaExterna("b-2", nome, Dinheiro(0))]}
    )

    sincronizador(unidade_de_trabalho, provedor).executar()

    with unidade_de_trabalho as uow:
        nomes = sorted(c.nome for c in uow.contas.listar(dono.id))
    assert len(nomes) == 2 and all(len(n) <= 100 for n in nomes)
    assert nome in nomes and any(n.endswith(" (2)") for n in nomes)


def test_conta_remunerada_nao_fabrica_posicao_a_partir_do_saldo_total(unidade_de_trabalho):
    dono = criar_dono(unidade_de_trabalho)
    provedor = ProvedorFalso(
        {"item-1": [ContaExterna("c1", "BTG Investimentos", Dinheiro(96217))]},
        {"c1": [saida("t1", 95645, descricao="CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA")]},
    )

    sincronizador(unidade_de_trabalho, provedor).executar()
    sincronizador(unidade_de_trabalho, provedor).executar()

    with unidade_de_trabalho as uow:
        [conta] = uow.contas.listar(dono.id)
        caixinhas = [p for p in uow.investimentos.listar_posicoes(dono.id) if p.tipo == "CAIXINHA"]
    assert caixinhas == []
    assert conta.saldo == Dinheiro(96217)


def test_conta_sem_conta_remunerada_nao_ganha_caixinha(unidade_de_trabalho):
    dono = criar_dono(unidade_de_trabalho)
    provedor = ProvedorFalso(
        {"item-1": [ContaExterna("c1", "Corrente", Dinheiro(100))]}, {"c1": [saida("t1")]}
    )
    sincronizador(unidade_de_trabalho, provedor).executar()
    with unidade_de_trabalho as uow:
        assert uow.investimentos.listar_posicoes(dono.id) == []


def test_movimento_da_conta_remunerada_nunca_e_descartado_na_importacao(unidade_de_trabalho):
    dono = criar_dono(unidade_de_trabalho)
    provedor = ProvedorFalso(
        {"item-1": [ContaExterna("c1", "BTG", Dinheiro(0))]},
        {
            "c1": [
                saida(
                    "t1",
                    14100,
                    operacao="TRANSFERENCIA_MESMA_INSTITUICAO",
                    descricao="CONTA REMUNERADA - RESGATE AUTOMÁTICO",
                )
            ]
        },
    )
    sincronizador(unidade_de_trabalho, provedor).executar()
    assert [t.id_externo for t in caixa(unidade_de_trabalho, dono.id)] == ["t1"]


def test_conta_com_caixinha_vira_remunerada_e_continua_nas_rodadas_seguintes(
    unidade_de_trabalho,
):
    dono = criar_dono(unidade_de_trabalho)
    provedor = ProvedorFalso(
        {"item-1": [ContaExterna("c1", "BTG", Dinheiro(96217))]},
        {"c1": [saida("t1", 95645, descricao="CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA")]},
    )
    sincronizador(unidade_de_trabalho, provedor).executar()
    from gastoba.application.definir_caixinha import DefinirCaixinha

    with unidade_de_trabalho as u:
        [conta] = u.contas.listar(dono.id)
    DefinirCaixinha(unidade_de_trabalho).executar(dono.id, conta.id, Dinheiro(96217), HOJE)
    provedor.transacoes_por_conta = {}
    sincronizador(unidade_de_trabalho, provedor).executar()

    with unidade_de_trabalho as uow:
        [conta] = uow.contas.listar(dono.id)
    assert conta.tipo == TipoDaConta.REMUNERADA
    assert conta.saldo == Dinheiro(96217)
