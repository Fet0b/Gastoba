from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.conta import Conta, OrigemDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ContaJaExiste, ContaNaoEncontrada
from gastoba.domain.gasto import Gasto, OrigemDoGasto
from gastoba.domain.tag import Tag
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.persistencia.banco import criar_engine
from gastoba.infrastructure.persistencia.modelos import (
    ContaModelo,
    GastoModelo,
    UsuarioModelo,
)
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy


@pytest.fixture
def uow(fabrica_de_sessoes):
    return UnidadeDeTrabalhoSqlAlchemy(fabrica_de_sessoes)


@pytest.fixture
def usuario(uow):
    usuario = Usuario("Ana")
    with uow:
        uow.usuarios.garantir(usuario)
        uow.commit()
    return usuario


def criar_conta(uow, usuario_id, nome="Carteira", saldo=None):
    saldo = saldo if saldo is not None else Dinheiro(10000)
    conta = Conta(usuario_id=usuario_id, nome=nome, saldo=saldo)
    with uow:
        uow.contas.adicionar(conta)
        uow.commit()
    return conta


def criar_gasto(
    uow,
    conta_id,
    data=date(2026, 10, 5),
    tags=(),
    categoria=CategoriaDoGasto.CONFORTO,
    centavos=1000,
    descricao="Compra",
):
    gasto = Gasto(
        conta_id=conta_id,
        valor=Dinheiro(centavos),
        descricao=descricao,
        data=data,
        categoria=categoria,
        tags=tuple(Tag.de_texto(t) for t in tags),
    )
    with uow:
        uow.gastos.adicionar(gasto)
        uow.commit()
    return gasto


def listar(uow, usuario_id, inicio=date(2026, 1, 1), fim=date(2026, 12, 31), **filtros):
    with uow:
        return uow.gastos.listar(usuario_id, inicio, fim, **filtros)


def test_engine_esconde_parametros_das_mensagens_de_erro(tmp_path):
    engine = criar_engine(f"sqlite:///{tmp_path}/x.db")
    try:
        assert engine.hide_parameters is True
    finally:
        engine.dispose()


# Usuários


def test_garantir_repetido_mantem_um_unico_usuario(uow, fabrica_de_sessoes):
    usuario = Usuario("Ana")
    with uow:
        uow.usuarios.garantir(usuario)
        uow.usuarios.garantir(Usuario("Outro nome", id=usuario.id))
        uow.commit()
    with uow:
        uow.usuarios.garantir(usuario)
        uow.commit()

    with fabrica_de_sessoes() as sessao:
        assert sessao.scalar(select(func.count()).select_from(UsuarioModelo)) == 1
    with uow:
        obtido = uow.usuarios.obter(usuario.id)
    assert obtido is not None
    assert obtido.id == usuario.id
    assert obtido.nome == "Ana"


def test_obter_usuario_inexistente_devolve_none(uow):
    with uow:
        assert uow.usuarios.obter(uuid4()) is None


# Contas


def test_ida_e_volta_de_conta(uow, usuario):
    conta = criar_conta(uow, usuario.id, nome="Nubank", saldo=Dinheiro(-2590))

    with uow:
        obtida = uow.contas.obter(usuario.id, conta.id)

    assert obtida is not None
    assert obtida.id == conta.id
    assert obtida.usuario_id == usuario.id
    assert obtida.nome == "Nubank"
    assert obtida.saldo == Dinheiro(-2590)
    assert obtida.origem is OrigemDaConta.MANUAL


def test_obter_conta_de_outro_usuario_devolve_none(uow, usuario):
    conta = criar_conta(uow, usuario.id)
    with uow:
        assert uow.contas.obter(uuid4(), conta.id) is None


def test_conta_com_nome_repetido_levanta_conta_ja_existe(uow, usuario):
    criar_conta(uow, usuario.id, nome="Carteira")
    with pytest.raises(ContaJaExiste), uow:
        uow.contas.adicionar(Conta(usuario_id=usuario.id, nome="Carteira", saldo=Dinheiro(0)))


def test_conta_de_usuario_inexistente_relanca_integrity_error(uow):
    with pytest.raises(IntegrityError), uow:
        uow.contas.adicionar(Conta(usuario_id=uuid4(), nome="Carteira", saldo=Dinheiro(0)))


def test_debitar_em_duas_unidades_sequenciais_soma_os_debitos(uow, usuario):
    conta = criar_conta(uow, usuario.id, saldo=Dinheiro(10000))

    with uow:
        uow.contas.debitar(conta.id, Dinheiro(2500))
        uow.commit()
    with uow:
        uow.contas.debitar(conta.id, Dinheiro(1000))
        uow.commit()

    with uow:
        obtida = uow.contas.obter(usuario.id, conta.id)
    assert obtida is not None
    assert obtida.saldo == Dinheiro(6500)


def test_debitar_conta_inexistente_levanta_conta_nao_encontrada(uow):
    with pytest.raises(ContaNaoEncontrada), uow:
        uow.contas.debitar(uuid4(), Dinheiro(100))


def test_listar_contas_ordena_por_nome(uow, usuario):
    for nome in ["nubank", "carteira", "itau"]:
        criar_conta(uow, usuario.id, nome=nome)

    with uow:
        contas = uow.contas.listar(usuario.id)

    assert [c.nome for c in contas] == ["carteira", "itau", "nubank"]


def test_unidade_sem_commit_nao_persiste_nada(uow, fabrica_de_sessoes):
    usuario = Usuario("Ana")
    with uow:
        uow.usuarios.garantir(usuario)
        uow.contas.adicionar(Conta(usuario_id=usuario.id, nome="Carteira", saldo=Dinheiro(0)))

    with fabrica_de_sessoes() as sessao:
        assert sessao.scalar(select(func.count()).select_from(UsuarioModelo)) == 0
        assert sessao.scalar(select(func.count()).select_from(ContaModelo)) == 0


def test_debito_que_falha_desfaz_o_gasto_ja_adicionado(uow, usuario, fabrica_de_sessoes):
    conta = criar_conta(uow, usuario.id)
    gasto = Gasto(
        conta_id=conta.id,
        valor=Dinheiro(1000),
        descricao="Compra",
        data=date(2026, 10, 5),
        categoria=CategoriaDoGasto.CONFORTO,
    )

    # O UPDATE faz autoflush do gasto antes de falhar; o rollback do __exit__ precisa desfazê-lo.
    with pytest.raises(ContaNaoEncontrada), uow:
        uow.gastos.adicionar(gasto)
        uow.contas.debitar(uuid4(), gasto.valor)

    with fabrica_de_sessoes() as sessao:
        assert sessao.scalar(select(func.count()).select_from(GastoModelo)) == 0


# Gastos


def test_ida_e_volta_de_gasto(uow, usuario):
    conta = criar_conta(uow, usuario.id)
    gasto = criar_gasto(
        uow,
        conta.id,
        data=date(2026, 10, 5),
        tags=["café", "mercado livre", "pix"],
        categoria=CategoriaDoGasto.LAZER,
        centavos=2590,
        descricao="Café da manhã",
    )

    [obtido] = listar(uow, usuario.id)

    assert obtido.id == gasto.id
    assert obtido.conta_id == conta.id
    assert obtido.valor == Dinheiro(2590)
    assert obtido.descricao == "Café da manhã"
    assert obtido.data == date(2026, 10, 5)
    assert obtido.categoria is CategoriaDoGasto.LAZER
    assert obtido.tags == (Tag("café"), Tag("mercado livre"), Tag("pix"))
    assert obtido.origem is OrigemDoGasto.MANUAL


def test_tags_ficam_gravadas_como_lista(uow, usuario, fabrica_de_sessoes):
    conta = criar_conta(uow, usuario.id)
    criar_gasto(uow, conta.id, tags=["café", "mercado livre"])

    with fabrica_de_sessoes() as sessao:
        modelo = sessao.scalars(select(GastoModelo)).one()
    assert modelo.tags == ["café", "mercado livre"]
    assert modelo.valor_centavos == 1000
    assert modelo.categoria == "conforto"
    assert modelo.origem == "manual"


def test_listar_filtra_por_periodo_inclusivo_e_ordena_por_data_decrescente(uow, usuario):
    conta = criar_conta(uow, usuario.id)
    antes = criar_gasto(uow, conta.id, data=date(2026, 9, 30))
    no_inicio = criar_gasto(uow, conta.id, data=date(2026, 10, 1))
    no_meio = criar_gasto(uow, conta.id, data=date(2026, 10, 15))
    no_fim = criar_gasto(uow, conta.id, data=date(2026, 10, 31))
    depois = criar_gasto(uow, conta.id, data=date(2026, 11, 1))

    gastos = listar(uow, usuario.id, inicio=date(2026, 10, 1), fim=date(2026, 10, 31))

    assert [g.id for g in gastos] == [no_fim.id, no_meio.id, no_inicio.id]
    assert antes.id not in {g.id for g in gastos}
    assert depois.id not in {g.id for g in gastos}


def test_listar_desempata_por_id(uow, usuario):
    conta = criar_conta(uow, usuario.id)
    gastos_criados = [criar_gasto(uow, conta.id, data=date(2026, 10, 5)) for _ in range(4)]

    gastos = listar(uow, usuario.id)

    assert [g.id for g in gastos] == sorted(g.id for g in gastos_criados)


def test_listar_filtra_por_conta(uow, usuario):
    carteira = criar_conta(uow, usuario.id, nome="carteira")
    banco = criar_conta(uow, usuario.id, nome="banco")
    gasto_carteira = criar_gasto(uow, carteira.id)
    criar_gasto(uow, banco.id)

    gastos = listar(uow, usuario.id, conta_id=carteira.id)

    assert [g.id for g in gastos] == [gasto_carteira.id]


@pytest.mark.parametrize("tag", ["café", "mercado livre", "pix"])
def test_listar_filtra_por_tag(uow, usuario, tag):
    conta = criar_conta(uow, usuario.id)
    com_tag = criar_gasto(uow, conta.id, tags=[tag, "outra"])
    criar_gasto(uow, conta.id, tags=["outra"])
    criar_gasto(uow, conta.id, tags=[])

    gastos = listar(uow, usuario.id, tag=Tag(tag))

    assert [g.id for g in gastos] == [com_tag.id]


def test_listar_filtra_por_categoria(uow, usuario):
    conta = criar_conta(uow, usuario.id)
    lazer = criar_gasto(uow, conta.id, categoria=CategoriaDoGasto.LAZER)
    criar_gasto(uow, conta.id, categoria=CategoriaDoGasto.GASTO_FIXO)

    gastos = listar(uow, usuario.id, categoria=CategoriaDoGasto.LAZER)

    assert [g.id for g in gastos] == [lazer.id]


def test_listar_combina_categoria_tag_e_conta(uow, usuario):
    carteira = criar_conta(uow, usuario.id, nome="carteira")
    banco = criar_conta(uow, usuario.id, nome="banco")
    alvo = criar_gasto(uow, carteira.id, tags=["pix"], categoria=CategoriaDoGasto.LAZER)
    criar_gasto(uow, carteira.id, tags=["pix"], categoria=CategoriaDoGasto.CONFORTO)
    criar_gasto(uow, carteira.id, tags=["debito"], categoria=CategoriaDoGasto.LAZER)
    criar_gasto(uow, banco.id, tags=["pix"], categoria=CategoriaDoGasto.LAZER)

    gastos = listar(
        uow,
        usuario.id,
        conta_id=carteira.id,
        tag=Tag("pix"),
        categoria=CategoriaDoGasto.LAZER,
    )

    assert [g.id for g in gastos] == [alvo.id]


def test_mesma_tag_em_duas_categorias(uow, usuario):
    conta = criar_conta(uow, usuario.id)
    conforto = criar_gasto(uow, conta.id, tags=["mercado"], categoria=CategoriaDoGasto.CONFORTO)
    fixo = criar_gasto(uow, conta.id, tags=["mercado"], categoria=CategoriaDoGasto.GASTO_FIXO)

    em_conforto = listar(uow, usuario.id, tag=Tag("mercado"), categoria=CategoriaDoGasto.CONFORTO)
    em_fixo = listar(uow, usuario.id, tag=Tag("mercado"), categoria=CategoriaDoGasto.GASTO_FIXO)
    with uow:
        tags = uow.gastos.listar_tags(usuario.id)

    assert [g.id for g in em_conforto] == [conforto.id]
    assert [g.id for g in em_fixo] == [fixo.id]
    assert tags == [Tag("mercado")]


def test_listar_tags_devolve_tags_distintas_e_ordenadas(uow, usuario):
    conta = criar_conta(uow, usuario.id)
    criar_gasto(uow, conta.id, tags=["pix", "mercado"])
    criar_gasto(uow, conta.id, tags=["mercado", "ifood"])
    criar_gasto(uow, conta.id, tags=[])

    with uow:
        tags = uow.gastos.listar_tags(usuario.id)

    assert tags == [Tag("ifood"), Tag("mercado"), Tag("pix")]


def test_listar_tags_sem_gastos_devolve_lista_vazia(uow, usuario):
    with uow:
        assert uow.gastos.listar_tags(usuario.id) == []


def test_dados_de_outro_usuario_nao_aparecem(uow, usuario):
    outro = Usuario("Bruno")
    with uow:
        uow.usuarios.garantir(outro)
        uow.commit()
    minha_conta = criar_conta(uow, usuario.id, nome="carteira")
    conta_do_outro = criar_conta(uow, outro.id, nome="carteira")
    meu_gasto = criar_gasto(uow, minha_conta.id, tags=["mercado"])
    criar_gasto(uow, conta_do_outro.id, tags=["mercado", "segredo"])

    gastos = listar(uow, usuario.id)
    com_tag = listar(uow, usuario.id, tag=Tag("mercado"))
    with uow:
        tags = uow.gastos.listar_tags(usuario.id)
        contas = uow.contas.listar(usuario.id)

    assert [g.id for g in gastos] == [meu_gasto.id]
    assert [g.id for g in com_tag] == [meu_gasto.id]
    assert tags == [Tag("mercado")]
    assert [c.id for c in contas] == [minha_conta.id]


# Restrições do banco


def _modelo_de_gasto(conta_id, **campos):
    valores = {
        "id": uuid4(),
        "conta_id": conta_id,
        "descricao": "Compra",
        "valor_centavos": 1000,
        "data": date(2026, 10, 5),
        "tags": [],
        "origem": "manual",
        "categoria": "conforto",
    }
    valores.update(campos)
    return GastoModelo(**valores)


def _usuario_e_conta_no_orm(sessao):
    usuario_id = uuid4()
    conta_id = uuid4()
    sessao.add(UsuarioModelo(id=usuario_id, nome="Ana"))
    sessao.flush()
    sessao.add(
        ContaModelo(
            id=conta_id,
            usuario_id=usuario_id,
            nome="Carteira",
            saldo_centavos=0,
            origem="manual",
        )
    )
    sessao.flush()
    return conta_id


def test_gasto_com_valor_zero_viola_o_check(fabrica_de_sessoes):
    with fabrica_de_sessoes() as sessao:
        conta_id = _usuario_e_conta_no_orm(sessao)
        sessao.add(_modelo_de_gasto(conta_id, valor_centavos=0))
        with pytest.raises(IntegrityError):
            sessao.flush()


def test_gasto_sem_categoria_viola_not_null(fabrica_de_sessoes):
    with fabrica_de_sessoes() as sessao:
        conta_id = _usuario_e_conta_no_orm(sessao)
        sessao.add(_modelo_de_gasto(conta_id, categoria=None))
        with pytest.raises(IntegrityError):
            sessao.flush()


def test_gasto_com_conta_inexistente_viola_a_chave_estrangeira(fabrica_de_sessoes):
    with fabrica_de_sessoes() as sessao:
        sessao.add(_modelo_de_gasto(uuid4()))
        with pytest.raises(IntegrityError):
            sessao.flush()
