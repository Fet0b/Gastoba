from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.aceitar_transacao_importada import AceitarTransacaoImportada
from gastoba.application.excluir_ganho import ExcluirGanho
from gastoba.application.ignorar_transacao_importada import IgnorarTransacaoImportada
from gastoba.application.listar_transacoes_importadas import ListarTransacoesImportadas
from gastoba.application.registrar_ganho import RegistrarGanho
from gastoba.application.registrar_gasto import RegistrarGasto
from gastoba.application.restaurar_transacao_importada import RestaurarTransacaoImportada
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.conta import Conta, OrigemDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import (
    TransacaoImportadaInvalida,
    TransacaoImportadaNaoEncontrada,
    TransacaoJaTratada,
)
from gastoba.domain.ganho import Ganho, OrigemDoGanho
from gastoba.domain.gasto import Gasto, OrigemDoGasto
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    SentidoDaTransacao,
    TransacaoImportada,
)

USUARIO_ID = uuid4()
DIA = date(2026, 10, 10)


def conta_do_banco(unidade_de_trabalho, usuario_id=USUARIO_ID, saldo=100000):
    conta = Conta(
        usuario_id,
        "Banco",
        Dinheiro(saldo),
        origem=OrigemDaConta.OPEN_FINANCE,
        id_externo="ext-" + uuid4().hex[:6],
    )
    unidade_de_trabalho.confirmado.contas[conta.id] = conta
    return conta


def pendente(unidade_de_trabalho, conta, sentido=SentidoDaTransacao.SAIDA, **campos):
    base = {
        "conta_id": conta.id,
        "id_externo": uuid4().hex,
        "data": DIA,
        "descricao": "Mercado",
        "valor": Dinheiro(2590),
        "sentido": sentido,
    }
    base.update(campos)
    transacao = TransacaoImportada(**base)
    unidade_de_trabalho.confirmado.transacoes_importadas[transacao.id] = transacao
    return transacao


def saldo(unidade_de_trabalho, conta, usuario_id=USUARIO_ID):
    with unidade_de_trabalho as uow:
        return uow.contas.obter(usuario_id, conta.id).saldo


def estado(unidade_de_trabalho, transacao):
    return unidade_de_trabalho.confirmado.transacoes_importadas[transacao.id].estado


# --- aceitar ---


def test_aceitar_saida_cria_o_gasto_com_origem_open_finance_e_nao_mexe_no_saldo(
    unidade_de_trabalho,
):
    conta = conta_do_banco(unidade_de_trabalho)
    t = pendente(unidade_de_trabalho, conta)

    gasto = AceitarTransacaoImportada(unidade_de_trabalho).executar(
        USUARIO_ID, t.id, CategoriaDoGasto.CONFORTO, ["Pix", "mercado"]
    )

    assert isinstance(gasto, Gasto)
    assert (gasto.valor, gasto.data, gasto.descricao) == (Dinheiro(2590), DIA, "Mercado")
    assert gasto.origem == OrigemDoGasto.OPEN_FINANCE
    assert [str(tag) for tag in gasto.tags] == ["pix", "mercado"]
    assert gasto.id in unidade_de_trabalho.confirmado.gastos
    assert estado(unidade_de_trabalho, t) == EstadoDaTransacaoImportada.ACEITA
    assert saldo(unidade_de_trabalho, conta) == Dinheiro(100000)


def test_aceitar_entrada_cria_o_ganho_sem_categoria(unidade_de_trabalho):
    conta = conta_do_banco(unidade_de_trabalho)
    t = pendente(unidade_de_trabalho, conta, SentidoDaTransacao.ENTRADA, valor=Dinheiro(500000))

    ganho = AceitarTransacaoImportada(unidade_de_trabalho).executar(USUARIO_ID, t.id, None, [])

    assert isinstance(ganho, Ganho)
    assert ganho.origem == OrigemDoGanho.OPEN_FINANCE
    assert saldo(unidade_de_trabalho, conta) == Dinheiro(100000)


def test_saida_sem_categoria_e_ganho_com_categoria_sao_recusados_sem_gravar(unidade_de_trabalho):
    conta = conta_do_banco(unidade_de_trabalho)
    saida = pendente(unidade_de_trabalho, conta)
    entrada = pendente(unidade_de_trabalho, conta, SentidoDaTransacao.ENTRADA)

    with pytest.raises(TransacaoImportadaInvalida):
        AceitarTransacaoImportada(unidade_de_trabalho).executar(USUARIO_ID, saida.id, None, [])
    with pytest.raises(TransacaoImportadaInvalida):
        AceitarTransacaoImportada(unidade_de_trabalho).executar(
            USUARIO_ID, entrada.id, CategoriaDoGasto.LAZER, []
        )

    assert estado(unidade_de_trabalho, saida) == EstadoDaTransacaoImportada.PENDENTE
    assert unidade_de_trabalho.confirmado.gastos == {}
    assert unidade_de_trabalho.confirmado.ganhos == {}


def test_aceitar_duas_vezes_e_recusado(unidade_de_trabalho):
    conta = conta_do_banco(unidade_de_trabalho)
    t = pendente(unidade_de_trabalho, conta)
    caso = AceitarTransacaoImportada(unidade_de_trabalho)
    caso.executar(USUARIO_ID, t.id, CategoriaDoGasto.LAZER, [])

    with pytest.raises(TransacaoJaTratada):
        caso.executar(USUARIO_ID, t.id, CategoriaDoGasto.LAZER, [])

    assert len(unidade_de_trabalho.confirmado.gastos) == 1


def test_transacao_de_outro_usuario_nao_e_encontrada(unidade_de_trabalho):
    alheia = conta_do_banco(unidade_de_trabalho, usuario_id=uuid4())
    t = pendente(unidade_de_trabalho, alheia)

    with pytest.raises(TransacaoImportadaNaoEncontrada):
        AceitarTransacaoImportada(unidade_de_trabalho).executar(
            USUARIO_ID, t.id, CategoriaDoGasto.LAZER, []
        )
    with pytest.raises(TransacaoImportadaNaoEncontrada):
        IgnorarTransacaoImportada(unidade_de_trabalho).executar(USUARIO_ID, t.id)

    assert estado(unidade_de_trabalho, t) == EstadoDaTransacaoImportada.PENDENTE


# --- ignorar ---


def test_ignorar_marca_a_transacao_e_nao_cria_lancamento(unidade_de_trabalho):
    conta = conta_do_banco(unidade_de_trabalho)
    t = pendente(unidade_de_trabalho, conta)

    IgnorarTransacaoImportada(unidade_de_trabalho).executar(USUARIO_ID, t.id)

    assert estado(unidade_de_trabalho, t) == EstadoDaTransacaoImportada.IGNORADA
    assert unidade_de_trabalho.confirmado.gastos == {}
    with pytest.raises(TransacaoJaTratada):
        IgnorarTransacaoImportada(unidade_de_trabalho).executar(USUARIO_ID, t.id)


def test_ignorar_inexistente_e_recusado(unidade_de_trabalho):
    with pytest.raises(TransacaoImportadaNaoEncontrada):
        IgnorarTransacaoImportada(unidade_de_trabalho).executar(USUARIO_ID, uuid4())


# --- restaurar ---


def test_restaurar_devolve_a_ignorada_a_caixa_sem_lancamento_nem_saldo(unidade_de_trabalho):
    conta = conta_do_banco(unidade_de_trabalho)
    t = pendente(unidade_de_trabalho, conta, valor=Dinheiro(140000))
    IgnorarTransacaoImportada(unidade_de_trabalho).executar(USUARIO_ID, t.id)

    RestaurarTransacaoImportada(unidade_de_trabalho).executar(USUARIO_ID, t.id)

    assert estado(unidade_de_trabalho, t) == EstadoDaTransacaoImportada.PENDENTE
    guardada = unidade_de_trabalho.confirmado.transacoes_importadas[t.id]
    assert (guardada.descricao, guardada.valor, guardada.conta_id, guardada.data) == (
        "Mercado",
        Dinheiro(140000),
        conta.id,
        DIA,
    )
    assert unidade_de_trabalho.confirmado.gastos == {}
    assert unidade_de_trabalho.confirmado.ganhos == {}
    assert saldo(unidade_de_trabalho, conta) == Dinheiro(100000)
    itens = ListarTransacoesImportadas(unidade_de_trabalho).executar(USUARIO_ID)
    assert [i.transacao.id for i in itens] == [t.id]


@pytest.mark.parametrize("tratar", ["pendente", "aceita"])
def test_restaurar_fora_de_ignorada_e_recusado(unidade_de_trabalho, tratar):
    conta = conta_do_banco(unidade_de_trabalho)
    t = pendente(unidade_de_trabalho, conta)
    if tratar == "aceita":
        AceitarTransacaoImportada(unidade_de_trabalho).executar(
            USUARIO_ID, t.id, CategoriaDoGasto.LAZER, []
        )
    esperado = estado(unidade_de_trabalho, t)

    with pytest.raises(TransacaoJaTratada):
        RestaurarTransacaoImportada(unidade_de_trabalho).executar(USUARIO_ID, t.id)

    assert estado(unidade_de_trabalho, t) == esperado


def test_restaurar_inexistente_ou_de_outro_usuario_e_recusado(unidade_de_trabalho):
    alheia = conta_do_banco(unidade_de_trabalho, usuario_id=uuid4())
    t = pendente(unidade_de_trabalho, alheia)
    IgnorarTransacaoImportada(unidade_de_trabalho).executar(
        unidade_de_trabalho.confirmado.contas[alheia.id].usuario_id, t.id
    )

    with pytest.raises(TransacaoImportadaNaoEncontrada):
        RestaurarTransacaoImportada(unidade_de_trabalho).executar(USUARIO_ID, uuid4())
    with pytest.raises(TransacaoImportadaNaoEncontrada):
        RestaurarTransacaoImportada(unidade_de_trabalho).executar(USUARIO_ID, t.id)

    assert estado(unidade_de_trabalho, t) == EstadoDaTransacaoImportada.IGNORADA


# --- listar ---


def test_lista_so_as_pendentes_por_data_decrescente_com_a_sugestao_de_descarte(
    unidade_de_trabalho,
):
    conta = conta_do_banco(unidade_de_trabalho)
    antiga = pendente(unidade_de_trabalho, conta, data=date(2026, 10, 1))
    recente = pendente(
        unidade_de_trabalho, conta, data=date(2026, 10, 12), tipo_de_operacao="PAGAMENTO_FATURA"
    )
    tratada = pendente(unidade_de_trabalho, conta)
    IgnorarTransacaoImportada(unidade_de_trabalho).executar(USUARIO_ID, tratada.id)

    itens = ListarTransacoesImportadas(unidade_de_trabalho).executar(USUARIO_ID)

    assert [i.transacao.id for i in itens] == [recente.id, antiga.id]
    assert [i.sugerir_descarte for i in itens] == [True, False]
    ignoradas = ListarTransacoesImportadas(unidade_de_trabalho).executar(
        USUARIO_ID, EstadoDaTransacaoImportada.IGNORADA
    )
    assert [i.transacao.id for i in ignoradas] == [tratada.id]


def test_lista_nao_mostra_a_caixa_de_outro_usuario(unidade_de_trabalho):
    alheia = conta_do_banco(unidade_de_trabalho, usuario_id=uuid4())
    pendente(unidade_de_trabalho, alheia)

    assert ListarTransacoesImportadas(unidade_de_trabalho).executar(USUARIO_ID) == []


def test_sinaliza_possivel_duplicado_quando_ha_lancamento_manual_igual(unidade_de_trabalho):
    conta = conta_do_banco(unidade_de_trabalho)
    igual = pendente(unidade_de_trabalho, conta, descricao="Pix mercado", valor=Dinheiro(3000))
    outro_valor = pendente(unidade_de_trabalho, conta, valor=Dinheiro(777))
    RegistrarGasto(unidade_de_trabalho).executar(
        USUARIO_ID, conta.id, Dinheiro(3000), "Mercado", DIA, CategoriaDoGasto.CONFORTO, []
    )

    itens = {
        i.transacao.id: i
        for i in ListarTransacoesImportadas(unidade_de_trabalho).executar(USUARIO_ID)
    }

    assert itens[igual.id].possivel_duplicado is True
    assert itens[outro_valor.id].possivel_duplicado is False


def test_lancamento_importado_nao_conta_como_duplicado(unidade_de_trabalho):
    conta = conta_do_banco(unidade_de_trabalho)
    primeira = pendente(unidade_de_trabalho, conta, valor=Dinheiro(3000))
    AceitarTransacaoImportada(unidade_de_trabalho).executar(
        USUARIO_ID, primeira.id, CategoriaDoGasto.LAZER, []
    )
    segunda = pendente(unidade_de_trabalho, conta, valor=Dinheiro(3000))

    [item] = ListarTransacoesImportadas(unidade_de_trabalho).executar(USUARIO_ID)

    assert item.transacao.id == segunda.id
    assert item.possivel_duplicado is False


# --- lançamento manual em conta importada: o saldo é do banco ---


def test_gasto_e_ganho_manuais_em_conta_importada_nao_mexem_no_saldo(unidade_de_trabalho):
    conta = conta_do_banco(unidade_de_trabalho, saldo=100000)

    RegistrarGasto(unidade_de_trabalho).executar(
        USUARIO_ID, conta.id, Dinheiro(5000), "Pix", DIA, CategoriaDoGasto.CONFORTO, []
    )
    ganho = RegistrarGanho(unidade_de_trabalho).executar(
        USUARIO_ID, conta.id, Dinheiro(7000), "Dinheiro vivo", DIA, []
    )

    assert saldo(unidade_de_trabalho, conta) == Dinheiro(100000)
    assert len(unidade_de_trabalho.confirmado.gastos) == 1
    ExcluirGanho(unidade_de_trabalho).executar(USUARIO_ID, ganho.id)
    assert saldo(unidade_de_trabalho, conta) == Dinheiro(100000)
    assert unidade_de_trabalho.confirmado.ganhos == {}


def test_conta_manual_continua_mexendo_no_saldo(unidade_de_trabalho):
    manual = Conta(USUARIO_ID, "Carteira", Dinheiro(10000))
    unidade_de_trabalho.confirmado.contas[manual.id] = manual

    RegistrarGasto(unidade_de_trabalho).executar(
        USUARIO_ID, manual.id, Dinheiro(2500), "Lanche", DIA, CategoriaDoGasto.CONFORTO, []
    )

    assert saldo(unidade_de_trabalho, manual) == Dinheiro(7500)


# --- sugestão de investimento ---


APLICADO = Dinheiro(100000)


def posicao_do_banco(unidade_de_trabalho, nome="CDB BTG", valor_aplicado=APLICADO):
    with unidade_de_trabalho as uow:
        uow.investimentos.salvar_posicao(
            USUARIO_ID,
            InvestimentoExterno(
                uuid4().hex,
                nome,
                "FIXED_INCOME",
                "CDB",
                Dinheiro(100500),
                "{}",
                valor_aplicado=valor_aplicado,
            ),
        )
        uow.commit()
        return next(p for p in uow.investimentos.listar_posicoes(USUARIO_ID) if p.nome == nome)


def test_sugere_o_investimento_da_emissao_so_na_saida_que_casa(unidade_de_trabalho):
    conta = conta_do_banco(unidade_de_trabalho)
    cdb = posicao_do_banco(unidade_de_trabalho)
    emissao = pendente(
        unidade_de_trabalho, conta, descricao="EMISSAO - CDB BTG - Venc", valor=Dinheiro(100000)
    )
    mercado = pendente(unidade_de_trabalho, conta, valor=Dinheiro(100000))

    itens = {
        i.transacao.id: i
        for i in ListarTransacoesImportadas(unidade_de_trabalho).executar(USUARIO_ID)
    }

    assert itens[emissao.id].investimento_sugerido_id == cdb.id
    assert itens[mercado.id].investimento_sugerido_id is None


def test_nao_sugere_investimento_que_ja_tem_aporte_associado(unidade_de_trabalho):
    conta = conta_do_banco(unidade_de_trabalho)
    cdb = posicao_do_banco(unidade_de_trabalho)
    with unidade_de_trabalho as uow:
        uow.movimentos_de_investimento.adicionar(
            MovimentoDeInvestimento(
                conta.id, TipoDeMovimento.APORTE, Dinheiro(100000), "Aporte", DIA, cdb.id
            )
        )
        uow.commit()
    pendente(unidade_de_trabalho, conta, descricao="EMISSAO CDB BTG", valor=Dinheiro(100000))

    [item] = ListarTransacoesImportadas(unidade_de_trabalho).executar(USUARIO_ID)

    assert item.investimento_sugerido_id is None


def test_nao_sugere_entre_duas_posicoes_iguais(unidade_de_trabalho):
    conta = conta_do_banco(unidade_de_trabalho)
    for id_externo in ("a", "b"):
        with unidade_de_trabalho as uow:
            uow.investimentos.salvar_posicao(
                USUARIO_ID,
                InvestimentoExterno(
                    id_externo,
                    "CDB BTG",
                    "FIXED_INCOME",
                    "CDB",
                    Dinheiro(100500),
                    "{}",
                    valor_aplicado=Dinheiro(100000),
                ),
            )
            uow.commit()
    pendente(unidade_de_trabalho, conta, descricao="EMISSAO CDB BTG", valor=Dinheiro(100000))

    [item] = ListarTransacoesImportadas(unidade_de_trabalho).executar(USUARIO_ID)

    assert item.investimento_sugerido_id is None


def test_nao_sugere_investimento_de_outro_usuario(unidade_de_trabalho):
    conta = conta_do_banco(unidade_de_trabalho)
    with unidade_de_trabalho as uow:
        uow.investimentos.salvar_posicao(
            uuid4(),
            InvestimentoExterno(
                "x",
                "CDB BTG",
                "FIXED_INCOME",
                "CDB",
                Dinheiro(100500),
                "{}",
                valor_aplicado=Dinheiro(100000),
            ),
        )
        uow.commit()
    pendente(unidade_de_trabalho, conta, descricao="EMISSAO CDB BTG", valor=Dinheiro(100000))

    [item] = ListarTransacoesImportadas(unidade_de_trabalho).executar(USUARIO_ID)

    assert item.investimento_sugerido_id is None


@pytest.mark.parametrize(
    ("sentido", "como_investimento"),
    [(sentido, investimento) for sentido in SentidoDaTransacao for investimento in [False, True]],
)
def test_aceite_guarda_transacao_de_origem(unidade_de_trabalho, sentido, como_investimento):
    conta = conta_do_banco(unidade_de_trabalho)
    transacao = pendente(unidade_de_trabalho, conta, sentido)
    categoria = (
        CategoriaDoGasto.LAZER
        if sentido == SentidoDaTransacao.SAIDA and not como_investimento
        else None
    )
    criado = AceitarTransacaoImportada(unidade_de_trabalho).executar(
        USUARIO_ID, transacao.id, categoria, [], como_investimento=como_investimento
    )
    assert criado.transacao_importada_id == transacao.id
    repositorio = (
        unidade_de_trabalho.confirmado.movimentos_de_investimento
        if como_investimento
        else unidade_de_trabalho.confirmado.gastos
        if sentido == SentidoDaTransacao.SAIDA
        else unidade_de_trabalho.confirmado.ganhos
    )
    assert repositorio[criado.id].transacao_importada_id == transacao.id


@pytest.mark.parametrize("categoria", [CategoriaDoGasto.LAZER, None])
def test_lote_guarda_vinculo_de_cada_transacao(unidade_de_trabalho, categoria):
    from gastoba.application.aceitar_transacoes_importadas_em_lote import (
        AceitarTransacoesImportadasEmLote,
    )

    conta = conta_do_banco(unidade_de_trabalho)
    transacoes = [pendente(unidade_de_trabalho, conta) for _ in range(2)]
    criados = AceitarTransacoesImportadasEmLote(unidade_de_trabalho).executar(
        USUARIO_ID, [t.id for t in transacoes], categoria, [], como_investimento=categoria is None
    )
    assert [c.transacao_importada_id for c in criados] == [t.id for t in transacoes]
