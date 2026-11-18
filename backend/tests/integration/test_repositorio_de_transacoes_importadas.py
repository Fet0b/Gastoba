from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy.exc import IntegrityError

from gastoba.domain.conta import Conta, OrigemDaConta, TipoDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ContaJaExiste, ContaNaoEncontrada
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    SentidoDaTransacao,
    TransacaoImportada,
)
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy


@pytest.fixture
def uow(fabrica_de_sessoes):
    return UnidadeDeTrabalhoSqlAlchemy(fabrica_de_sessoes)


def _conta_importada(uow, nome="Banco", id_externo="ext-1"):
    usuario = Usuario("Ana")
    conta = Conta(
        usuario_id=usuario.id,
        nome=nome,
        saldo=Dinheiro(1000),
        origem=OrigemDaConta.OPEN_FINANCE,
        id_externo=id_externo,
    )
    with uow:
        uow.usuarios.garantir(usuario)
        uow.contas.adicionar(conta)
        uow.commit()
    return usuario, conta


def _transacao(conta, id_externo="t1", dia=10, centavos=2590):
    return TransacaoImportada(
        conta_id=conta.id,
        id_externo=id_externo,
        data=date(2026, 10, dia),
        descricao="Mercado",
        valor=Dinheiro(centavos),
        sentido=SentidoDaTransacao.SAIDA,
        tipo_de_operacao="PIX",
    )


def test_conta_importada_volta_com_origem_e_id_externo_e_e_achada_por_ele(uow):
    usuario, conta = _conta_importada(uow)

    with uow:
        achada = uow.contas.obter_por_id_externo(usuario.id, "ext-1")
        inexistente = uow.contas.obter_por_id_externo(usuario.id, "outro")
        de_outra_pessoa = uow.contas.obter_por_id_externo(uuid4(), "ext-1")

    assert achada is not None
    assert (achada.id, achada.origem, achada.id_externo) == (
        conta.id,
        OrigemDaConta.OPEN_FINANCE,
        "ext-1",
    )
    assert inexistente is None
    assert de_outra_pessoa is None


def test_o_mesmo_id_externo_nao_se_repete_para_a_mesma_pessoa(uow):
    usuario, _ = _conta_importada(uow)
    repetida = Conta(
        usuario_id=usuario.id,
        nome="Outro nome",
        saldo=Dinheiro(0),
        origem=OrigemDaConta.OPEN_FINANCE,
        id_externo="ext-1",
    )

    with pytest.raises((IntegrityError, ContaJaExiste)), uow:
        uow.contas.adicionar(repetida)
        uow.commit()


def test_contas_manuais_sem_id_externo_nao_colidem(uow):
    usuario = Usuario("Ana")
    with uow:
        uow.usuarios.garantir(usuario)
        uow.contas.adicionar(Conta(usuario_id=usuario.id, nome="A", saldo=Dinheiro(0)))
        uow.contas.adicionar(Conta(usuario_id=usuario.id, nome="B", saldo=Dinheiro(0)))
        uow.commit()

    with uow:
        assert len(uow.contas.listar(usuario.id)) == 2


def test_atualizar_do_banco_substitui_saldo_e_tipo_e_recusa_conta_inexistente(uow):
    usuario, conta = _conta_importada(uow)
    with uow:
        assert uow.contas.obter(usuario.id, conta.id).tipo == TipoDaConta.CORRENTE

    with uow:
        uow.contas.atualizar_do_banco(conta.id, Dinheiro(-5000), TipoDaConta.CARTAO)
        uow.commit()
    with uow:
        atualizada = uow.contas.obter(usuario.id, conta.id)
        assert (atualizada.saldo, atualizada.tipo) == (Dinheiro(-5000), TipoDaConta.CARTAO)
        with pytest.raises(ContaNaoEncontrada):
            uow.contas.atualizar_do_banco(uuid4(), Dinheiro(1), TipoDaConta.CORRENTE)


def test_adicionar_grava_o_tipo_da_conta(uow):
    with uow:
        usuario = Usuario(nome="Ana")
        uow.usuarios.garantir(usuario)
        cartao = Conta(
            usuario_id=usuario.id, nome="Visa", saldo=Dinheiro(0), tipo=TipoDaConta.CARTAO
        )
        uow.contas.adicionar(cartao)
        uow.commit()

    with uow:
        assert uow.contas.obter(usuario.id, cartao.id).tipo == TipoDaConta.CARTAO


def test_adicionar_se_nova_grava_uma_vez_e_ignora_o_id_externo_repetido(uow):
    usuario, conta = _conta_importada(uow)

    with uow:
        primeira = uow.transacoes_importadas.adicionar_se_nova(_transacao(conta))
        repetida = uow.transacoes_importadas.adicionar_se_nova(_transacao(conta))
        outra = uow.transacoes_importadas.adicionar_se_nova(_transacao(conta, "t2"))
        uow.commit()

    assert (primeira, repetida, outra) == (True, False, True)
    with uow:
        listadas = uow.transacoes_importadas.listar(usuario.id, EstadoDaTransacaoImportada.PENDENTE)
    assert sorted(t.id_externo for t in listadas) == ["t1", "t2"]


def test_a_mesma_transacao_em_contas_diferentes_nao_e_repetida(uow):
    usuario, conta = _conta_importada(uow)
    outra_conta = Conta(
        usuario_id=usuario.id,
        nome="Cartão",
        saldo=Dinheiro(0),
        origem=OrigemDaConta.OPEN_FINANCE,
        id_externo="ext-2",
    )
    with uow:
        uow.contas.adicionar(outra_conta)
        assert uow.transacoes_importadas.adicionar_se_nova(_transacao(conta, "igual")) is True
        assert uow.transacoes_importadas.adicionar_se_nova(_transacao(outra_conta, "igual")) is True
        uow.commit()


def test_valor_tipo_e_descricao_voltam_iguais(uow):
    usuario, conta = _conta_importada(uow)
    original = _transacao(conta, centavos=123456)
    with uow:
        uow.transacoes_importadas.adicionar_se_nova(original)
        uow.commit()

    with uow:
        lida = uow.transacoes_importadas.obter(usuario.id, original.id)

    assert lida is not None
    assert (lida.valor, lida.data, lida.sentido, lida.tipo_de_operacao, lida.descricao) == (
        Dinheiro(123456),
        date(2026, 10, 10),
        SentidoDaTransacao.SAIDA,
        "PIX",
        "Mercado",
    )


def test_listar_ordena_por_data_decrescente_e_filtra_por_estado(uow):
    usuario, conta = _conta_importada(uow)
    antiga, recente = _transacao(conta, "a", dia=1), _transacao(conta, "b", dia=12)
    tratada = _transacao(conta, "c", dia=5)
    with uow:
        for t in (antiga, recente, tratada):
            uow.transacoes_importadas.adicionar_se_nova(t)
        tratada.ignorar()
        uow.transacoes_importadas.atualizar_estado(tratada)
        uow.commit()

    with uow:
        pendentes = uow.transacoes_importadas.listar(
            usuario.id, EstadoDaTransacaoImportada.PENDENTE
        )
        ignoradas = uow.transacoes_importadas.listar(
            usuario.id, EstadoDaTransacaoImportada.IGNORADA
        )

    assert [t.id_externo for t in pendentes] == ["b", "a"]
    assert [t.id_externo for t in ignoradas] == ["c"]


def test_so_enxerga_as_transacoes_de_contas_do_usuario(uow):
    usuario, conta = _conta_importada(uow)
    transacao = _transacao(conta)
    with uow:
        uow.transacoes_importadas.adicionar_se_nova(transacao)
        uow.commit()

    with uow:
        assert uow.transacoes_importadas.obter(uuid4(), transacao.id) is None
        assert uow.transacoes_importadas.listar(uuid4(), EstadoDaTransacaoImportada.PENDENTE) == []


def test_data_mais_recente_considera_qualquer_estado(uow):
    _, conta = _conta_importada(uow)
    with uow:
        assert uow.transacoes_importadas.data_mais_recente(conta.id) is None
        uow.transacoes_importadas.adicionar_se_nova(_transacao(conta, "a", dia=3))
        recente = _transacao(conta, "b", dia=9)
        uow.transacoes_importadas.adicionar_se_nova(recente)
        recente.ignorar()
        uow.transacoes_importadas.atualizar_estado(recente)
        uow.commit()

    with uow:
        assert uow.transacoes_importadas.data_mais_recente(conta.id) == date(2026, 10, 9)


def _lancamento_para_conferencia(conta, tipo, transacao_id=None, **mudancas):
    from gastoba.domain.categoria import CategoriaDoGasto
    from gastoba.domain.ganho import Ganho, OrigemDoGanho
    from gastoba.domain.gasto import Gasto, OrigemDoGasto
    from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento

    dados = dict(
        conta_id=conta.id,
        valor=Dinheiro(2590),
        descricao="Mercado",
        data=date(2026, 10, 10),
        transacao_importada_id=transacao_id,
    )
    dados.update(mudancas)
    if tipo == "gastos":
        return Gasto(**dados, categoria=CategoriaDoGasto.LAZER, origem=OrigemDoGasto.OPEN_FINANCE)
    if tipo == "ganhos":
        return Ganho(**dados, origem=OrigemDoGanho.OPEN_FINANCE)
    return MovimentoDeInvestimento(**dados, tipo=TipoDeMovimento.APORTE)


@pytest.mark.parametrize("tipo", ["gastos", "ganhos", "movimentos_de_investimento"])
def test_da_transacao_isola_a_pessoa_e_separa_os_vinculos(uow, tipo):
    usuario, conta = _conta_importada(uow)
    transacao = _transacao(conta)
    with uow:
        uow.transacoes_importadas.adicionar_se_nova(transacao)
        uow.commit()
    ligado = _lancamento_para_conferencia(conta, tipo, transacao.id)
    solto = _lancamento_para_conferencia(conta, tipo)
    with uow:
        repo = getattr(uow, tipo)
        repo.adicionar(ligado)
        repo.adicionar(solto)
        uow.commit()
    with uow:
        repo = getattr(uow, tipo)
        assert [lancamento.id for lancamento in repo.da_transacao(usuario.id, transacao.id)] == [
            ligado.id
        ]
        assert repo.da_transacao(uuid4(), transacao.id) == []
        assert repo.da_transacao(usuario.id, uuid4()) == []
    with uow:
        repo = getattr(uow, tipo)
        if tipo == "movimentos_de_investimento":
            repo.excluir(ligado.id)
        else:
            repo.remover(ligado.id)
        uow.commit()
    with uow:
        assert [
            lancamento.id
            for lancamento in getattr(uow, tipo).listar(
                usuario.id, date(2026, 10, 1), date(2026, 10, 31)
            )
        ] == [solto.id]


@pytest.mark.parametrize("tipo", ["gastos", "ganhos", "movimentos_de_investimento"])
@pytest.mark.parametrize(
    "diferenca", [None, "conta", "data", "valor", "descricao", "vinculo", "manual", "tipo"]
)
def test_correspondencia_de_lancamento_exige_todos_os_campos_e_sem_vinculo(uow, tipo, diferenca):
    from gastoba.domain.ganho import OrigemDoGanho
    from gastoba.domain.gasto import OrigemDoGasto
    from gastoba.domain.movimento_de_investimento import TipoDeMovimento

    usuario, conta = _conta_importada(uow)
    t = _transacao(conta)
    with uow:
        uow.transacoes_importadas.adicionar_se_nova(t)
        uow.commit()
    mudancas = {}
    if diferenca == "conta":
        outra = Conta(usuario.id, "Outra", Dinheiro(0))
        with uow:
            uow.contas.adicionar(outra)
            uow.commit()
        mudancas["conta_id"] = outra.id
    if diferenca == "data":
        mudancas["data"] = date(2026, 10, 11)
    if diferenca == "valor":
        mudancas["valor"] = Dinheiro(2591)
    if diferenca == "descricao":
        mudancas["descricao"] = "Outro exemplo"
    lancamento = _lancamento_para_conferencia(
        conta, tipo, t.id if diferenca == "vinculo" else None, **mudancas
    )
    if diferenca == "manual" and tipo != "movimentos_de_investimento":
        lancamento.origem = OrigemDoGasto.MANUAL if tipo == "gastos" else OrigemDoGanho.MANUAL
    if diferenca == "tipo" and tipo == "movimentos_de_investimento":
        lancamento.tipo = TipoDeMovimento.RESGATE
    with uow:
        getattr(uow, tipo).adicionar(lancamento)
        uow.commit()
    esperado = (
        diferenca is None
        or (diferenca == "manual" and tipo == "movimentos_de_investimento")
        or (diferenca == "tipo" and tipo != "movimentos_de_investimento")
    )
    with uow:
        repo = getattr(uow, tipo)
        argumentos = (conta.id, t.data, t.valor, t.descricao)
        if tipo == "movimentos_de_investimento":
            assert repo.contar_correspondentes_sem_vinculo(
                usuario.id, *argumentos, TipoDeMovimento.APORTE
            ) == int(esperado)
            assert (
                repo.contar_correspondentes_sem_vinculo(
                    uuid4(), *argumentos, TipoDeMovimento.APORTE
                )
                == 0
            )
        else:
            assert repo.existe_correspondente_sem_vinculo(usuario.id, *argumentos) is esperado
            assert repo.existe_correspondente_sem_vinculo(uuid4(), *argumentos) is False


@pytest.mark.parametrize(
    "diferenca",
    [
        None,
        "conta",
        "data",
        "valor",
        "descricao",
        "sentido",
        "estado",
        "gastos",
        "ganhos",
        "movimentos_de_investimento",
    ],
)
def test_candidata_exige_aceita_exata_e_sem_nenhum_lancamento_vinculado(uow, diferenca):
    usuario, conta = _conta_importada(uow)
    t = _transacao(conta)
    t.aceitar()
    if diferenca == "conta":
        outra = Conta(usuario.id, "Outra", Dinheiro(0))
        with uow:
            uow.contas.adicionar(outra)
            uow.commit()
        t.conta_id = outra.id
    if diferenca == "data":
        t.data = date(2026, 10, 11)
    if diferenca == "valor":
        t.valor = Dinheiro(2591)
    if diferenca == "descricao":
        t.descricao = "Outro exemplo"
    if diferenca == "sentido":
        t.sentido = SentidoDaTransacao.ENTRADA
    if diferenca == "estado":
        t.estado = EstadoDaTransacaoImportada.IGNORADA
    with uow:
        uow.transacoes_importadas.adicionar_se_nova(t)
        uow.commit()
    if diferenca in ["gastos", "ganhos", "movimentos_de_investimento"]:
        with uow:
            getattr(uow, diferenca).adicionar(_lancamento_para_conferencia(conta, diferenca, t.id))
            uow.commit()
    argumentos = (conta.id, date(2026, 10, 10), Dinheiro(2590), "Mercado", SentidoDaTransacao.SAIDA)
    with uow:
        repo = uow.transacoes_importadas
        assert [
            c.id for c in repo.aceitas_correspondentes_sem_vinculo(usuario.id, *argumentos)
        ] == ([t.id] if diferenca is None else [])
        assert repo.aceitas_correspondentes_sem_vinculo(uuid4(), *argumentos) == []


def test_remover_gasto_apaga_so_o_registro_pedido(uow):
    usuario, conta = _conta_importada(uow)
    gastos = [_lancamento_para_conferencia(conta, "gastos") for _ in range(2)]
    with uow:
        for gasto in gastos:
            uow.gastos.adicionar(gasto)
        uow.commit()
    with uow:
        uow.gastos.remover(gastos[0].id)
        uow.commit()
    with uow:
        assert [g.id for g in uow.gastos.listar(usuario.id, date.min, date.max)] == [gastos[1].id]


def test_correspondencia_preserva_ambiguidades_em_vez_de_escolher_um_registro(uow):
    from gastoba.domain.movimento_de_investimento import TipoDeMovimento

    usuario, conta = _conta_importada(uow)
    transacoes = [_transacao(conta, id_externo=f"t-{n}") for n in range(2)]
    with uow:
        for transacao in transacoes:
            transacao.aceitar()
            uow.transacoes_importadas.adicionar_se_nova(transacao)
        uow.commit()
    with uow:
        for _ in range(2):
            uow.movimentos_de_investimento.adicionar(
                _lancamento_para_conferencia(conta, "movimentos_de_investimento")
            )
        uow.commit()
    argumentos = (conta.id, date(2026, 10, 10), Dinheiro(2590), "Mercado")
    with uow:
        assert (
            uow.movimentos_de_investimento.contar_correspondentes_sem_vinculo(
                usuario.id, *argumentos, TipoDeMovimento.APORTE
            )
            == 2
        )
        assert {
            t.id
            for t in uow.transacoes_importadas.aceitas_correspondentes_sem_vinculo(
                usuario.id, *argumentos, SentidoDaTransacao.SAIDA
            )
        } == {t.id for t in transacoes}
