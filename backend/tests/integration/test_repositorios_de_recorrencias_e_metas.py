from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy.exc import IntegrityError

from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.conta import Conta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import MetaNaoEncontrada
from gastoba.domain.ganho import Ganho
from gastoba.domain.gasto import Gasto
from gastoba.domain.meta import Meta
from gastoba.domain.recorrencia import Recorrencia, TipoDeRecorrencia
from gastoba.domain.tag import Tag
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy


@pytest.fixture
def uow(fabrica_de_sessoes):
    return UnidadeDeTrabalhoSqlAlchemy(fabrica_de_sessoes)


def _usuario_com_conta(uow, nome="Ana"):
    usuario = Usuario(nome)
    conta = Conta(usuario_id=usuario.id, nome="Carteira", saldo=Dinheiro(0))
    with uow:
        uow.usuarios.garantir(usuario)
        uow.contas.adicionar(conta)
        uow.commit()
    return usuario, conta


def _recorrencia(usuario, conta, **alteracoes):
    argumentos = {
        "usuario_id": usuario.id,
        "tipo": TipoDeRecorrencia.GASTO,
        "conta_id": conta.id,
        "valor": Dinheiro(150000),
        "descricao": "Aluguel",
        "dia_do_mes": 31,
        "inicio": date(2026, 8, 1),
        "categoria": CategoriaDoGasto.GASTO_FIXO,
        "tags": (Tag("moradia"),),
        "fim": date(2027, 1, 31),
    } | alteracoes
    return Recorrencia(**argumentos)


# Recorrências


def test_grava_e_le_a_recorrencia_com_todos_os_campos(uow):
    usuario, conta = _usuario_com_conta(uow)
    recorrencia = _recorrencia(usuario, conta)
    with uow:
        uow.recorrencias.adicionar(recorrencia)
        uow.commit()

    with uow:
        lida = uow.recorrencias.obter(usuario.id, recorrencia.id)

    assert lida == recorrencia
    assert lida.tipo == TipoDeRecorrencia.GASTO
    assert lida.valor == Dinheiro(150000)
    assert (lida.descricao, lida.dia_do_mes, lida.inicio, lida.fim) == (
        "Aluguel",
        31,
        date(2026, 8, 1),
        date(2027, 1, 31),
    )
    assert lida.categoria == CategoriaDoGasto.GASTO_FIXO
    assert lida.tags == (Tag("moradia"),)
    assert lida.ativa is True


def test_ganho_recorrente_volta_sem_categoria_e_sem_fim(uow):
    usuario, conta = _usuario_com_conta(uow)
    recorrencia = _recorrencia(
        usuario, conta, tipo=TipoDeRecorrencia.GANHO, categoria=None, fim=None, tags=()
    )
    with uow:
        uow.recorrencias.adicionar(recorrencia)
        uow.commit()

    with uow:
        lida = uow.recorrencias.obter(usuario.id, recorrencia.id)

    assert lida.categoria is None and lida.fim is None and lida.tags == ()


def test_obter_e_listar_so_enxergam_as_do_proprio_usuario(uow):
    ana, conta_da_ana = _usuario_com_conta(uow, "Ana")
    bia, _ = _usuario_com_conta(uow, "Bia")
    da_ana = _recorrencia(ana, conta_da_ana)
    with uow:
        uow.recorrencias.adicionar(da_ana)
        uow.commit()

    with uow:
        assert uow.recorrencias.obter(bia.id, da_ana.id) is None
        assert uow.recorrencias.listar(bia.id) == []
        assert uow.recorrencias.contar_ativas(bia.id) == 0
        assert uow.recorrencias.contar_ativas(ana.id) == 1


def test_listar_ordena_por_descricao_e_listar_ativas_traz_so_ativas_de_todos(uow):
    ana, conta_da_ana = _usuario_com_conta(uow, "Ana")
    bia, conta_da_bia = _usuario_com_conta(uow, "Bia")
    with uow:
        uow.recorrencias.adicionar(_recorrencia(ana, conta_da_ana, descricao="Zeta"))
        uow.recorrencias.adicionar(_recorrencia(ana, conta_da_ana, descricao="Alfa"))
        uow.recorrencias.adicionar(_recorrencia(ana, conta_da_ana, descricao="Velha", ativa=False))
        uow.recorrencias.adicionar(_recorrencia(bia, conta_da_bia, descricao="Da Bia"))
        uow.commit()

    with uow:
        da_ana = uow.recorrencias.listar(ana.id)
        ativas_da_ana = uow.recorrencias.listar_ativas(ana.id)
        todas_ativas = uow.recorrencias.listar_ativas()
        contagem = uow.recorrencias.contar_ativas(ana.id)

    assert [r.descricao for r in da_ana] == ["Alfa", "Velha", "Zeta"]
    assert sorted(r.descricao for r in ativas_da_ana) == ["Alfa", "Zeta"]
    assert sorted(r.descricao for r in todas_ativas) == ["Alfa", "Da Bia", "Zeta"]
    assert contagem == 2


def test_atualizar_troca_so_os_campos_editaveis(uow):
    usuario, conta = _usuario_com_conta(uow)
    recorrencia = _recorrencia(usuario, conta)
    with uow:
        uow.recorrencias.adicionar(recorrencia)
        uow.commit()
    alterada = _recorrencia(
        usuario,
        conta,
        id=recorrencia.id,
        valor=Dinheiro(200000),
        descricao="Aluguel novo",
        dia_do_mes=10,
        categoria=CategoriaDoGasto.CONFORTO,
        tags=(),
        fim=None,
        ativa=False,
        inicio=date(2020, 1, 1),  # o início não se altera
    )
    with uow:
        uow.recorrencias.atualizar(alterada)
        uow.commit()

    with uow:
        lida = uow.recorrencias.obter(usuario.id, recorrencia.id)

    assert (lida.valor, lida.descricao, lida.dia_do_mes) == (Dinheiro(200000), "Aluguel novo", 10)
    assert (lida.categoria, lida.tags, lida.fim, lida.ativa) == (
        CategoriaDoGasto.CONFORTO,
        (),
        None,
        False,
    )
    assert lida.inicio == date(2026, 8, 1)


def test_atualizar_nao_mexe_na_recorrencia_de_outro_usuario(uow):
    ana, conta_da_ana = _usuario_com_conta(uow, "Ana")
    bia, _ = _usuario_com_conta(uow, "Bia")
    da_ana = _recorrencia(ana, conta_da_ana)
    with uow:
        uow.recorrencias.adicionar(da_ana)
        uow.commit()
    invasora = _recorrencia(bia, conta_da_ana, id=da_ana.id, descricao="Invadida")
    with uow:
        uow.recorrencias.atualizar(invasora)
        uow.commit()

    with uow:
        assert uow.recorrencias.obter(ana.id, da_ana.id).descricao == "Aluguel"


# Gastos e ganhos recorrentes


def test_competencias_geradas_e_a_unicidade_por_recorrencia(uow):
    usuario, conta = _usuario_com_conta(uow)
    recorrencia = _recorrencia(usuario, conta)
    outra = _recorrencia(usuario, conta, descricao="Outra")
    gasto = Gasto(
        conta_id=conta.id,
        valor=Dinheiro(1000),
        descricao="Aluguel",
        data=date(2026, 8, 31),
        categoria=CategoriaDoGasto.GASTO_FIXO,
        recorrencia_id=recorrencia.id,
        competencia="2026-08",
    )
    with uow:
        uow.recorrencias.adicionar(recorrencia)
        uow.recorrencias.adicionar(outra)
        uow.commit()
    with uow:
        uow.gastos.adicionar(gasto)
        uow.commit()

    with uow:
        assert uow.gastos.competencias_geradas(recorrencia.id) == {"2026-08"}
        assert uow.gastos.competencias_geradas(outra.id) == set()
        lido = uow.gastos.listar(usuario.id, date(2026, 8, 1), date(2026, 8, 31))[0]
    assert (lido.recorrencia_id, lido.competencia) == (recorrencia.id, "2026-08")

    repetido = Gasto(
        conta_id=conta.id,
        valor=Dinheiro(1000),
        descricao="Aluguel",
        data=date(2026, 8, 31),
        categoria=CategoriaDoGasto.GASTO_FIXO,
        recorrencia_id=recorrencia.id,
        competencia="2026-08",
    )
    with pytest.raises(IntegrityError), uow:
        uow.gastos.adicionar(repetido)
        uow.commit()


def test_ganho_recorrente_tambem_tem_competencia_unica(uow):
    usuario, conta = _usuario_com_conta(uow)
    recorrencia = _recorrencia(usuario, conta, tipo=TipoDeRecorrencia.GANHO, categoria=None)

    def ganho():
        return Ganho(
            conta_id=conta.id,
            valor=Dinheiro(1000),
            descricao="Salário",
            data=date(2026, 8, 5),
            recorrencia_id=recorrencia.id,
            competencia="2026-08",
        )

    with uow:
        uow.recorrencias.adicionar(recorrencia)
        uow.commit()
    with uow:
        uow.ganhos.adicionar(ganho())
        uow.commit()
    with uow:
        assert uow.ganhos.competencias_geradas(recorrencia.id) == {"2026-08"}
    with pytest.raises(IntegrityError), uow:
        uow.ganhos.adicionar(ganho())
        uow.commit()


def test_gastos_e_ganhos_avulsos_podem_repetir_sem_recorrencia(uow):
    usuario, conta = _usuario_com_conta(uow)
    with uow:
        for _ in range(2):  # recorrencia_id e competencia nulos não colidem
            uow.gastos.adicionar(
                Gasto(
                    conta_id=conta.id,
                    valor=Dinheiro(1),
                    descricao="x",
                    data=date(2026, 8, 1),
                    categoria=CategoriaDoGasto.LAZER,
                )
            )
        uow.commit()

    with uow:
        assert len(uow.gastos.listar(usuario.id, date(2026, 8, 1), date(2026, 8, 31))) == 2


# Somas


def test_somar_por_categoria_e_somar_ganhos_respeitam_periodo_usuario_e_contas(uow):
    ana, conta = _usuario_com_conta(uow, "Ana")
    bia, conta_da_bia = _usuario_com_conta(uow, "Bia")
    outra_conta = Conta(usuario_id=ana.id, nome="Banco", saldo=Dinheiro(0))
    with uow:
        uow.contas.adicionar(outra_conta)
        for conta_do_gasto, valor, categoria, dia in [
            (conta, 100, CategoriaDoGasto.LAZER, date(2026, 10, 1)),
            (outra_conta, 250, CategoriaDoGasto.LAZER, date(2026, 10, 31)),
            (conta, 700, CategoriaDoGasto.GASTO_FIXO, date(2026, 10, 15)),
            (conta, 999, CategoriaDoGasto.LAZER, date(2026, 9, 30)),
            (conta_da_bia, 5555, CategoriaDoGasto.LAZER, date(2026, 10, 10)),
        ]:
            uow.gastos.adicionar(
                Gasto(
                    conta_id=conta_do_gasto.id,
                    valor=Dinheiro(valor),
                    descricao="x",
                    data=dia,
                    categoria=categoria,
                )
            )
        for conta_do_ganho, valor, dia in [
            (conta, 300000, date(2026, 10, 5)),
            (outra_conta, 200000, date(2026, 10, 31)),
            (conta, 777, date(2026, 11, 1)),
            (conta_da_bia, 424242, date(2026, 10, 5)),
        ]:
            uow.ganhos.adicionar(
                Ganho(conta_id=conta_do_ganho.id, valor=Dinheiro(valor), descricao="x", data=dia)
            )
        uow.commit()

    with uow:
        gastos = uow.gastos.somar_por_categoria(ana.id, date(2026, 10, 1), date(2026, 10, 31))
        renda = uow.ganhos.somar(ana.id, date(2026, 10, 1), date(2026, 10, 31))
        sem_nada = uow.gastos.somar_por_categoria(ana.id, date(2020, 1, 1), date(2020, 1, 31))
        renda_vazia = uow.ganhos.somar(ana.id, date(2020, 1, 1), date(2020, 1, 31))

    assert gastos == {
        CategoriaDoGasto.LAZER: Dinheiro(350),
        CategoriaDoGasto.GASTO_FIXO: Dinheiro(700),
    }
    assert renda == Dinheiro(500000)
    assert sem_nada == {}
    assert renda_vazia == Dinheiro(0)


# Metas


def test_metas_salvar_obter_listar_na_ordem_do_enum_e_trocar_o_percentual(uow):
    usuario, _ = _usuario_com_conta(uow)
    with uow:
        uow.metas.salvar(Meta(usuario.id, CategoriaDoGasto.GASTO_FIXO, 30))
        uow.metas.salvar(Meta(usuario.id, CategoriaDoGasto.INVESTIMENTOS, 10))
        uow.metas.salvar(Meta(usuario.id, CategoriaDoGasto.LAZER, 20))
        uow.commit()
    with uow:
        original = uow.metas.obter(usuario.id, CategoriaDoGasto.LAZER)
        uow.metas.salvar(Meta(usuario.id, CategoriaDoGasto.LAZER, 25))  # outro id, mesma categoria
        uow.commit()

    with uow:
        lista = uow.metas.listar(usuario.id)
        trocada = uow.metas.obter(usuario.id, CategoriaDoGasto.LAZER)

    assert [(m.categoria, m.percentual) for m in lista] == [
        (CategoriaDoGasto.INVESTIMENTOS, 10),
        (CategoriaDoGasto.LAZER, 25),
        (CategoriaDoGasto.GASTO_FIXO, 30),
    ]
    assert trocada.id == original.id
    assert uow_vazio(uow, uuid4()) == []


def uow_vazio(uow, usuario_id):
    with uow:
        return uow.metas.listar(usuario_id)


def test_metas_sao_por_usuario_e_remover_so_apaga_a_propria(uow):
    ana, _ = _usuario_com_conta(uow, "Ana")
    bia, _ = _usuario_com_conta(uow, "Bia")
    with uow:
        uow.metas.salvar(Meta(ana.id, CategoriaDoGasto.LAZER, 20))
        uow.metas.salvar(Meta(bia.id, CategoriaDoGasto.LAZER, 70))
        uow.commit()

    with uow:
        uow.metas.remover(ana.id, CategoriaDoGasto.LAZER)
        uow.commit()
    with uow:
        assert uow.metas.obter(ana.id, CategoriaDoGasto.LAZER) is None
        assert uow.metas.obter(bia.id, CategoriaDoGasto.LAZER).percentual == 70
    with pytest.raises(MetaNaoEncontrada), uow:
        uow.metas.remover(ana.id, CategoriaDoGasto.LAZER)
