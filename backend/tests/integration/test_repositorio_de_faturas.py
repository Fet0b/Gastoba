from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy.exc import IntegrityError

from gastoba.domain.conta import Conta, OrigemDaConta, TipoDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.fatura import Fatura, FonteDaFatura, PagamentoDeFatura
from gastoba.domain.transacao_importada import SentidoDaTransacao, TransacaoImportada
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy


@pytest.fixture
def uow(fabrica_de_sessoes):
    return UnidadeDeTrabalhoSqlAlchemy(fabrica_de_sessoes)


def _cartao(uow, nome="Cartão", id_externo="c1"):
    usuario = Usuario("Ana")
    conta = Conta(
        usuario_id=usuario.id,
        nome=nome,
        saldo=Dinheiro(0),
        origem=OrigemDaConta.OPEN_FINANCE,
        id_externo=id_externo,
        tipo=TipoDaConta.CARTAO,
    )
    with uow:
        uow.usuarios.garantir(usuario)
        uow.contas.adicionar(conta)
        uow.commit()
    return usuario, conta


def _fatura(conta, fechamento=date(2026, 11, 15), total="100.00", pagamentos=()):
    return Fatura(
        id=uuid4(),
        conta_id=conta.id,
        id_externo=None,
        inicio=date(2026, 10, 16),
        fechamento=fechamento,
        vencimento=date(2026, 11, 22),
        total=Dinheiro.de_reais(total),
        minimo=None,
        pagamentos=tuple(pagamentos),
        fonte=FonteDaFatura.ESTIMADA,
    )


def _compra(conta, id_externo="t1", dia=10, id_da_fatura=None):
    return TransacaoImportada(
        conta_id=conta.id,
        id_externo=id_externo,
        data=date(2026, 10, dia),
        descricao="Mercado",
        valor=Dinheiro(2590),
        sentido=SentidoDaTransacao.SAIDA,
        id_externo_da_fatura=id_da_fatura,
        parcela_numero=2,
        parcela_total=10,
    )


def test_salvar_duas_vezes_nao_duplica_e_atualiza(uow):
    usuario, conta = _cartao(uow)
    with uow:
        uow.faturas.salvar(conta.id, _fatura(conta, total="100.00"))
        uow.commit()
    pagamento = PagamentoDeFatura(date(2026, 11, 20), Dinheiro.de_reais("40.00"), None)
    with uow:
        uow.faturas.salvar(conta.id, _fatura(conta, total="150.00", pagamentos=[pagamento]))
        uow.commit()
    with uow:
        faturas = uow.faturas.listar(usuario.id)
    assert len(faturas) == 1
    assert faturas[0].total == Dinheiro.de_reais("150.00")
    assert faturas[0].pagamentos == (pagamento,)


def test_pagamentos_repetidos_nao_duplicam(uow):
    usuario, conta = _cartao(uow)
    pagamento = PagamentoDeFatura(date(2026, 11, 20), Dinheiro.de_reais("40.00"), "PIX")
    for _ in range(2):
        with uow:
            uow.faturas.salvar(conta.id, _fatura(conta, pagamentos=[pagamento, pagamento]))
            uow.commit()
    with uow:
        assert len(uow.faturas.listar(usuario.id)[0].pagamentos) == 1


def test_listar_ordena_da_mais_recente_e_filtra_por_conta(uow):
    usuario, conta = _cartao(uow)
    with uow:
        uow.faturas.salvar(conta.id, _fatura(conta, fechamento=date(2026, 10, 15)))
        uow.faturas.salvar(conta.id, _fatura(conta, fechamento=date(2026, 11, 15)))
        uow.commit()
    with uow:
        todas = uow.faturas.listar(usuario.id)
        assert [f.fechamento for f in todas] == [date(2026, 11, 15), date(2026, 10, 15)]
        assert uow.faturas.listar(usuario.id, uuid4()) == []
        assert uow.faturas.obter(usuario.id, todas[0].id) == todas[0]


def test_isolamento_entre_usuarios(uow):
    usuario, conta = _cartao(uow)
    with uow:
        fatura = _fatura(conta)
        uow.faturas.salvar(conta.id, fatura)
        uow.commit()
    with uow:
        assert uow.faturas.listar(uuid4()) == []
        assert uow.faturas.obter(uuid4(), fatura.id) is None
        assert uow.faturas.compras_da_fatura(uuid4(), fatura.id) == []


def test_vincular_compra_grava_e_limpa_sem_calcular(uow):
    usuario, conta = _cartao(uow)
    compra = _compra(conta, id_da_fatura="bill-1")
    fatura = _fatura(conta)
    with uow:
        uow.transacoes_importadas.adicionar_se_nova(compra)
        uow.faturas.salvar(conta.id, fatura)
        uow.commit()
    with uow:
        # Mesmo com a data fora do ciclo, o repositório só grava o que mandaram.
        uow.faturas.vincular_compra(compra.id, fatura.id)
        uow.commit()
    with uow:
        compras = uow.faturas.compras_da_fatura(usuario.id, fatura.id)
        assert [c.id for c in compras] == [compra.id]
        assert compras[0].parcela_numero == 2 and compras[0].parcela_total == 10
        assert compras[0].id_da_fatura == "bill-1"
        assert compras[0].descricao == "Mercado"
        assert [c.id for c in uow.faturas.compras_da_conta(conta.id)] == [compra.id]
    with uow:
        uow.faturas.vincular_compra(compra.id, None)
        uow.commit()
    with uow:
        assert uow.faturas.compras_da_fatura(usuario.id, fatura.id) == []
        assert len(uow.faturas.compras_da_conta(conta.id)) == 1


def test_apagar_fatura_deixa_a_compra_sem_fatura(uow, fabrica_de_sessoes):
    from sqlalchemy import delete

    from gastoba.infrastructure.persistencia.modelos import FaturaModelo

    usuario, conta = _cartao(uow)
    compra = _compra(conta)
    fatura = _fatura(conta)
    with uow:
        uow.transacoes_importadas.adicionar_se_nova(compra)
        uow.faturas.salvar(conta.id, fatura)
        uow.faturas.vincular_compra(compra.id, fatura.id)
        uow.commit()
    with fabrica_de_sessoes() as sessao:
        sessao.execute(delete(FaturaModelo))
        sessao.commit()
    with uow:
        assert len(uow.faturas.compras_da_conta(conta.id)) == 1


def test_check_rejeita_total_negativo_direto_no_banco(fabrica_de_sessoes):
    from gastoba.infrastructure.persistencia.modelos import FaturaModelo

    with fabrica_de_sessoes() as sessao:
        sessao.add(
            FaturaModelo(
                id=uuid4(),
                conta_id=uuid4(),
                fechamento=date(2026, 11, 15),
                total_centavos=-1,
                fonte="banco",
            )
        )
        with pytest.raises(IntegrityError):
            sessao.flush()


def test_excluir_a_conta_apaga_suas_faturas_e_pagamentos(uow):
    usuario, conta = _cartao(uow)
    pagamento = PagamentoDeFatura(date(2026, 11, 20), Dinheiro.de_reais("40.00"), None)
    with uow:
        uow.transacoes_importadas.adicionar_se_nova(_compra(conta))
        uow.faturas.salvar(conta.id, _fatura(conta, pagamentos=[pagamento]))
        uow.commit()
    with uow:
        uow.contas.excluir(usuario.id, conta.id)
        uow.commit()
    with uow:
        assert uow.faturas.listar(usuario.id) == []
