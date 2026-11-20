import copy
from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.listar_faturas import ListarFaturas
from gastoba.application.obter_fatura import ObterFatura
from gastoba.domain.conta import Conta, OrigemDaConta, TipoDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ContaNaoEncontrada, FaturaNaoEncontrada
from gastoba.domain.fatura import Fatura, FonteDaFatura, PagamentoDeFatura, SituacaoDaFatura
from gastoba.domain.transacao_importada import SentidoDaTransacao, TransacaoImportada

USUARIO_ID = uuid4()
HOJE = date(2026, 11, 5)


@pytest.fixture
def semear(unidade_de_trabalho):
    estado = unidade_de_trabalho.confirmado

    def conta(usuario_id=USUARIO_ID, nome="FREE VISA", saldo=-12218, tipo=TipoDaConta.CARTAO):
        c = Conta(
            usuario_id=usuario_id,
            nome=nome,
            saldo=Dinheiro(saldo),
            origem=OrigemDaConta.OPEN_FINANCE,
            id_externo=f"ext-{nome}",
            tipo=tipo,
        )
        estado.contas[c.id] = copy.deepcopy(c)
        return c

    def fatura(c, fechamento, total="100.00", pagamentos=()):
        f = Fatura(
            id=uuid4(),
            conta_id=c.id,
            id_externo=None,
            inicio=None,
            fechamento=fechamento,
            vencimento=date(fechamento.year, fechamento.month, 22),
            total=Dinheiro.de_reais(total),
            minimo=None,
            pagamentos=tuple(pagamentos),
            fonte=FonteDaFatura.ESTIMADA,
        )
        estado.faturas[f.id] = f
        return f

    def compra(c, f, descricao="Mercado", centavos=500, sentido=SentidoDaTransacao.SAIDA):
        t = TransacaoImportada(
            conta_id=c.id,
            id_externo=str(uuid4()),
            data=date(2026, 10, 20),
            descricao=descricao,
            valor=Dinheiro(centavos),
            sentido=sentido,
            parcela_numero=2,
            parcela_total=10,
        )
        estado.transacoes_importadas[t.id] = t
        estado.fatura_da_compra[t.id] = f.id
        return t

    return conta, fatura, compra


def test_lista_cartoes_com_valor_devido_e_faturas_da_mais_recente(unidade_de_trabalho, semear):
    conta, fatura, compra = semear
    cartao = conta()
    antiga = fatura(cartao, date(2026, 10, 15), "50.00")
    aberta = fatura(cartao, date(2026, 11, 15), "122.18")
    compra(cartao, aberta)
    compra(cartao, aberta)
    conta(nome="Banco", tipo=TipoDaConta.CORRENTE)
    conta(usuario_id=uuid4(), nome="Alheio")

    cartoes = ListarFaturas(unidade_de_trabalho).executar(USUARIO_ID, HOJE)

    assert len(cartoes) == 1
    assert cartoes[0].conta_nome == "FREE VISA"
    assert cartoes[0].valor_devido == Dinheiro(12218)
    assert [f.fatura.id for f in cartoes[0].faturas] == [aberta.id, antiga.id]
    assert cartoes[0].faturas[0].situacao is SituacaoDaFatura.ABERTA
    assert cartoes[0].faturas[0].quantidade_de_compras == 2
    assert cartoes[0].faturas[1].situacao is SituacaoDaFatura.VENCIDA
    assert unidade_de_trabalho.commits == 0


def test_valor_devido_nunca_e_negativo(unidade_de_trabalho, semear):
    conta, _, _ = semear
    conta(saldo=5000)  # cartão com crédito a favor
    cartoes = ListarFaturas(unidade_de_trabalho).executar(USUARIO_ID, HOJE)
    assert cartoes[0].valor_devido == Dinheiro(0)
    assert cartoes[0].faturas == []


def test_filtra_por_conta_e_recusa_conta_alheia(unidade_de_trabalho, semear):
    conta, _, _ = semear
    a = conta(nome="A")
    conta(nome="B")
    alheia = conta(usuario_id=uuid4(), nome="C")

    so_a = ListarFaturas(unidade_de_trabalho).executar(USUARIO_ID, HOJE, conta_id=a.id)
    assert [c.conta_nome for c in so_a] == ["A"]
    with pytest.raises(ContaNaoEncontrada):
        ListarFaturas(unidade_de_trabalho).executar(USUARIO_ID, HOJE, conta_id=alheia.id)
    with pytest.raises(ContaNaoEncontrada):
        ListarFaturas(unidade_de_trabalho).executar(USUARIO_ID, HOJE, conta_id=uuid4())


def test_obter_traz_compras_e_pagamentos(unidade_de_trabalho, semear):
    conta, fatura, compra = semear
    cartao = conta()
    pagamento = PagamentoDeFatura(date(2026, 10, 25), Dinheiro.de_reais("30.00"), None)
    f = fatura(cartao, date(2026, 10, 15), "100.00", [pagamento])
    t = compra(cartao, f, "Anthropic", 11805)

    detalhe = ObterFatura(unidade_de_trabalho).executar(USUARIO_ID, f.id, HOJE)

    assert detalhe.situacao is SituacaoDaFatura.VENCIDA
    assert detalhe.fatura.pagamentos == (pagamento,)
    assert [c.id for c in detalhe.compras] == [t.id]
    assert detalhe.compras[0].parcela_numero == 2


def test_obter_fatura_de_outra_pessoa_ou_inexistente(unidade_de_trabalho, semear):
    conta, fatura, _ = semear
    f = fatura(conta(usuario_id=uuid4(), nome="Alheio"), date(2026, 10, 15))
    for id in (f.id, uuid4()):
        with pytest.raises(FaturaNaoEncontrada):
            ObterFatura(unidade_de_trabalho).executar(USUARIO_ID, id, HOJE)


def test_conta_nome_leva_o_rotulo_da_conta(unidade_de_trabalho, semear):
    conta, _fatura, _compra = semear
    cartao = conta(nome="FREE VISA (2)")
    estado = unidade_de_trabalho.confirmado
    estado.contas[cartao.id].nome_no_banco = "FREE VISA"

    [item] = ListarFaturas(unidade_de_trabalho).executar(USUARIO_ID, HOJE)
    assert item.conta_nome == "FREE VISA"

    estado.contas[cartao.id].apelido = "Cartão da casa"
    [item] = ListarFaturas(unidade_de_trabalho).executar(USUARIO_ID, HOJE)
    assert item.conta_nome == "Cartão da casa"
