import json
from uuid import uuid4

import pytest
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from gastoba.domain.cor_da_destinacao import CorDaDestinacao
from gastoba.domain.destinacao_cadastrada import DestinacaoCadastrada, IconeDaCaixinha
from gastoba.domain.excecoes import DestinacaoJaCadastrada
from gastoba.domain.tag import Tag
from gastoba.infrastructure.persistencia.banco import criar_engine, criar_fabrica_de_sessoes
from gastoba.infrastructure.persistencia.modelos import (
    Base,
    CadastroDeDestinacaoModelo,
    CaixinhaMarcadaModelo,
    CorDaDestinacaoModelo,
    TagModelo,
    UsuarioModelo,
)
from gastoba.infrastructure.persistencia.repositorios import (
    RepositorioDeDestinacoesCadastradasSqlAlchemy,
)


@pytest.fixture(scope="module")
def fabrica_de_sessoes(tmp_path_factory):
    engine = criar_engine(f"sqlite:///{tmp_path_factory.mktemp('caixinhas')}/teste.db")
    Base.metadata.create_all(engine)
    yield criar_fabrica_de_sessoes(engine)
    engine.dispose()


@pytest.fixture(autouse=True)
def limpar_banco(fabrica_de_sessoes):
    with fabrica_de_sessoes() as sessao:
        for tabela in reversed(Base.metadata.sorted_tables):
            sessao.execute(delete(tabela))
        sessao.commit()


@pytest.fixture
def repositorio(fabrica_de_sessoes):
    sessao = fabrica_de_sessoes()
    try:
        yield RepositorioDeDestinacoesCadastradasSqlAlchemy(sessao)
    finally:
        sessao.rollback()
        sessao.close()


@pytest.fixture
def usuarios(fabrica_de_sessoes):
    ids = (uuid4(), uuid4())
    with fabrica_de_sessoes() as sessao:
        sessao.add_all(
            [
                UsuarioModelo(id=id, nome=f"Pessoa {i}", email=None, senha_hash=None)
                for i, id in enumerate(ids)
            ]
        )
        sessao.commit()
    return ids


def test_catalogo_vazio_e_ordenado_por_nome(repositorio, usuarios):
    ana, bia = usuarios
    assert repositorio.listar(ana) == []

    repositorio.adicionar(DestinacaoCadastrada.criar(ana, "Viagem"))
    repositorio.adicionar(DestinacaoCadastrada.criar(ana, "Casa"))
    repositorio.adicionar(DestinacaoCadastrada.criar(bia, "Outra pessoa"))

    assert [d.nome.valor for d in repositorio.listar(ana)] == ["casa", "viagem"]
    assert [d.nome.valor for d in repositorio.listar(bia)] == ["outra pessoa"]


def test_nome_unico_por_pessoa_e_tags_comuns_nao_colidem(repositorio, usuarios):
    ana, bia = usuarios
    primeira = DestinacaoCadastrada.criar(ana, "viagem")
    repositorio.adicionar(primeira)
    with pytest.raises(DestinacaoJaCadastrada):
        repositorio.adicionar(DestinacaoCadastrada.criar(ana, " VIAGEM "))

    repositorio.adicionar(DestinacaoCadastrada.criar(bia, "viagem"))
    with repositorio._sessao.begin_nested():
        repositorio._sessao.add(TagModelo(id=uuid4(), usuario_id=ana, nome="viagem"))

    assert repositorio.tem_referencias(ana, primeira) is False


def test_obter_e_remover_sao_isolados_por_pessoa(repositorio, usuarios):
    ana, bia = usuarios
    destinacao = DestinacaoCadastrada.criar(ana, "viagem")
    repositorio.adicionar(destinacao)

    assert repositorio.obter(bia, destinacao.id) is None
    assert repositorio.obter_por_nome(bia, Tag("viagem")) is None
    repositorio.remover(bia, destinacao.id)
    assert repositorio.obter(ana, destinacao.id) == destinacao


# D5 = A (077): toda FK para `destinacoes_cadastradas.id` é classificada. As que bloqueiam a
# exclusão guardam uso ou histórico; a cor é só aparência e é apagada junto com a caixinha.
FKS_QUE_BLOQUEIAM = {
    ("coberturas_de_compra", "destinacao_id"),
    ("destinacoes", "destinacao_id"),
    ("realocacoes", "destinacao_origem_id"),
    ("realocacoes", "destinacao_destino_id"),
    ("alocacoes_de_caixinha", "destinacao_id"),
    ("mudancas_de_fracao", "destinacao_origem_id"),
    ("mudancas_de_fracao", "destinacao_destino_id"),
    ("caixinhas_marcadas", "destinacao_id"),
}
FKS_APAGADAS_JUNTO = {("cores_das_destinacoes", "destinacao_id")}


def test_inventario_de_fk_classifica_cada_coluna_como_bloqueia_ou_apagada_junto():
    encontradas = {
        (tabela.name, fk.parent.name)
        for tabela in Base.metadata.tables.values()
        for fk in tabela.foreign_keys
        if fk.target_fullname == "destinacoes_cadastradas.id"
    }
    assert not FKS_QUE_BLOQUEIAM & FKS_APAGADAS_JUNTO
    assert encontradas == FKS_QUE_BLOQUEIAM | FKS_APAGADAS_JUNTO, (
        "FK nova para destinacoes_cadastradas: classifique-a em bloqueia ou apagada junto"
    )


def test_catalogo_persistido_reaparece_em_nova_sessao(fabrica_de_sessoes, usuarios):
    ana, _ = usuarios
    item = DestinacaoCadastrada.criar(ana, "longo prazo")
    with fabrica_de_sessoes() as sessao:
        repositorio = RepositorioDeDestinacoesCadastradasSqlAlchemy(sessao)
        repositorio.adicionar(item)
        sessao.commit()
    with fabrica_de_sessoes() as sessao:
        carregado = sessao.scalar(
            select(CadastroDeDestinacaoModelo).where(CadastroDeDestinacaoModelo.id == item.id)
        )
    assert carregado is not None
    assert (carregado.usuario_id, carregado.nome) == (ana, "longo prazo")


REFERENCIAS = {
    ("coberturas_de_compra", "destinacao_id"): lambda ids: (
        "id, gasto_id, destinacao_id, valor_centavos",
        (ids[0], ids[1], ids[2], 1),
    ),
    ("destinacoes", "destinacao_id"): lambda ids: (
        "id, movimento_id, destinacao_id, valor_centavos",
        (ids[0], ids[1], ids[2], 1),
    ),
    ("realocacoes", "destinacao_origem_id"): lambda ids: (
        "id, investimento_id, data, destinacao_origem_id, destinacao_destino_id, valor_centavos",
        (ids[0], ids[1], "2026-01-01", ids[2], ids[3], 1),
    ),
    ("realocacoes", "destinacao_destino_id"): lambda ids: (
        "id, investimento_id, data, destinacao_origem_id, destinacao_destino_id, valor_centavos",
        (ids[0], ids[1], "2026-01-01", ids[3], ids[2], 1),
    ),
    ("alocacoes_de_caixinha", "destinacao_id"): lambda ids: (
        "posicao_id, destinacao_id, peso_centavos",
        (ids[1], ids[2], 1),
    ),
    ("mudancas_de_fracao", "destinacao_destino_id"): lambda ids: (
        "id, posicao_id, data, destinacao_destino_id, valor_centavos, criada_em",
        (ids[0], ids[1], "2026-01-01", ids[2], 1, "2026-01-01 00:00:00+00:00"),
    ),
    ("mudancas_de_fracao", "destinacao_origem_id"): lambda ids: (
        "id, posicao_id, data, destinacao_destino_id, destinacao_origem_id, "
        "valor_centavos, criada_em",
        (ids[0], ids[1], "2026-01-01", ids[3], ids[2], 1, "2026-01-01 00:00:00+00:00"),
    ),
    ("caixinhas_marcadas", "destinacao_id"): lambda ids: (
        "destinacao_id, categoria",
        (ids[2], "moradia"),
    ),
}


def inserir_referencia_sintetica(fabrica_de_sessoes, tabela, colunas, valores):
    engine = fabrica_de_sessoes.kw["bind"]
    conexao = engine.raw_connection()
    try:
        cursor = conexao.cursor()
        cursor.execute("PRAGMA foreign_keys=OFF")
        # As linhas artificiais isolam cada FK da guarda; triggers de domínio exigem uma árvore
        # financeira completa. Eles são restaurados antes de qualquer asserção do repositório.
        gatilhos = cursor.execute(
            "SELECT name, sql FROM sqlite_master WHERE type='trigger' AND name LIKE 'integridade_%'"
        ).fetchall()
        try:
            for nome, _ in gatilhos:
                cursor.execute(f'DROP TRIGGER "{nome}"')
            placeholders = ", ".join("?" for _ in valores)
            cursor.execute(
                f"INSERT INTO {tabela} ({colunas}) VALUES ({placeholders})",
                tuple(
                    valor.hex if hasattr(valor, "hex") and not isinstance(valor, str) else valor
                    for valor in valores
                ),
            )
        finally:
            for _, sql in gatilhos:
                cursor.execute(sql)
        conexao.commit()
        cursor.execute("PRAGMA foreign_keys=ON")
        conexao.commit()
    finally:
        conexao.close()


def test_referencias_sinteticas_cobrem_exatamente_as_fks_que_bloqueiam():
    assert set(REFERENCIAS) == FKS_QUE_BLOQUEIAM


@pytest.mark.parametrize("referencia", REFERENCIAS, ids=lambda x: f"{x[0]}.{x[1]}")
def test_cada_coluna_fk_bloqueia_exclusao_isoladamente(fabrica_de_sessoes, usuarios, referencia):
    ana, _ = usuarios
    destinacao = DestinacaoCadastrada.criar(ana, "viagem")
    with fabrica_de_sessoes() as sessao:
        sessao.add(
            CadastroDeDestinacaoModelo(id=destinacao.id, usuario_id=ana, nome=destinacao.nome.valor)
        )
        sessao.commit()

    gerador = REFERENCIAS[referencia]
    colunas, valores = gerador((uuid4(), uuid4(), destinacao.id, uuid4()))
    inserir_referencia_sintetica(fabrica_de_sessoes, referencia[0], colunas, valores)

    with fabrica_de_sessoes() as sessao:
        repositorio = RepositorioDeDestinacoesCadastradasSqlAlchemy(sessao)
        assert repositorio.tem_referencias(ana, destinacao) is True


@pytest.mark.parametrize(
    "snapshot",
    [
        {"lancamentos": [{"destinacoes": [{"tag": "viagem", "valor_centavos": 100}]}]},
        json.dumps({"lancamentos": [{"destinacoes": [{"tag": "viagem", "valor_centavos": 100}]}]}),
        [{"destinacoes": [{"tag": "viagem", "valor_centavos": 100}]}],
        "{snapshot legado ilegível",
    ],
    ids=["objeto-conhecido", "json-em-string", "lista-na-raiz", "malformado"],
)
def test_snapshot_de_reversao_financeira_bloqueia_conservadoramente(
    fabrica_de_sessoes, usuarios, snapshot
):
    ana, _ = usuarios
    destinacao = DestinacaoCadastrada.criar(ana, "viagem")
    with fabrica_de_sessoes() as sessao:
        sessao.add(
            CadastroDeDestinacaoModelo(id=destinacao.id, usuario_id=ana, nome=destinacao.nome.valor)
        )
        sessao.commit()
    inserir_referencia_sintetica(
        fabrica_de_sessoes,
        "reversoes_de_classificacao",
        "id, usuario_id, transacao_id, estado_anterior, instante, lancamentos",
        (
            uuid4(),
            ana,
            uuid4(),
            "aceita",
            "2026-01-01 00:00:00+00:00",
            json.dumps(snapshot),
        ),
    )
    with fabrica_de_sessoes() as sessao:
        repositorio = RepositorioDeDestinacoesCadastradasSqlAlchemy(sessao)
        assert repositorio.tem_referencias(ana, destinacao) is True


def test_reserva_escrita_antes_de_ler_catalogo(fabrica_de_sessoes, usuarios):
    from sqlalchemy import event

    ana, _ = usuarios
    statements = []
    engine = fabrica_de_sessoes.kw["bind"]

    def capturar(_conexao, _cursor, sql, *_):
        statements.append(sql)

    event.listen(engine, "before_cursor_execute", capturar)
    try:
        with fabrica_de_sessoes() as sessao:
            repositorio = RepositorioDeDestinacoesCadastradasSqlAlchemy(sessao)
            repositorio.bloquear(ana)
            repositorio.listar(ana)
    finally:
        event.remove(
            engine,
            "before_cursor_execute",
            capturar,
        )

    instrucoes = [sql.lstrip().upper() for sql in statements]
    assert instrucoes[0].startswith("UPDATE")
    assert any(sql.startswith("SELECT") for sql in instrucoes[1:])


def test_rollback_reverte_exclusao_do_cadastro(fabrica_de_sessoes, usuarios):
    ana, _ = usuarios
    destinacao = DestinacaoCadastrada.criar(ana, "viagem")
    with fabrica_de_sessoes() as sessao:
        repositorio = RepositorioDeDestinacoesCadastradasSqlAlchemy(sessao)
        repositorio.adicionar(destinacao)
        sessao.commit()
    with fabrica_de_sessoes() as sessao:
        repositorio = RepositorioDeDestinacoesCadastradasSqlAlchemy(sessao)
        repositorio.remover(ana, destinacao.id)
        sessao.rollback()
    with fabrica_de_sessoes() as sessao:
        repositorio = RepositorioDeDestinacoesCadastradasSqlAlchemy(sessao)
        assert repositorio.obter(ana, destinacao.id) == destinacao


def test_referencia_confirmada_em_outra_conexao_bloqueia_a_guarda(fabrica_de_sessoes, usuarios):
    ana, _ = usuarios
    destinacao = DestinacaoCadastrada.criar(ana, "viagem")
    with fabrica_de_sessoes() as sessao:
        sessao.add(
            CadastroDeDestinacaoModelo(id=destinacao.id, usuario_id=ana, nome=destinacao.nome.valor)
        )
        sessao.commit()
    # A conexão independente grava uma marcação válida usando a FK existente.
    with fabrica_de_sessoes() as outra_sessao:
        outra_sessao.add(CaixinhaMarcadaModelo(destinacao_id=destinacao.id, categoria="lazer"))
        outra_sessao.commit()
    with fabrica_de_sessoes() as sessao:
        repositorio = RepositorioDeDestinacoesCadastradasSqlAlchemy(sessao)
        assert repositorio.tem_referencias(ana, destinacao) is True


def test_exclusao_confirmada_primeiro_impede_referencia_com_uuid_antigo(
    fabrica_de_sessoes, usuarios
):
    ana, _ = usuarios
    destinacao = DestinacaoCadastrada.criar(ana, "viagem")
    with fabrica_de_sessoes() as sessao:
        repositorio = RepositorioDeDestinacoesCadastradasSqlAlchemy(sessao)
        repositorio.adicionar(destinacao)
        sessao.commit()
    with fabrica_de_sessoes() as sessao:
        RepositorioDeDestinacoesCadastradasSqlAlchemy(sessao).remover(ana, destinacao.id)
        sessao.commit()
    with fabrica_de_sessoes() as outra_sessao, pytest.raises(IntegrityError):
        outra_sessao.add(
            CorDaDestinacaoModelo(id=uuid4(), destinacao_id=destinacao.id, cor="ametista")
        )
        outra_sessao.flush()


def test_partes_historicas_com_soma_liquida_zero_ainda_bloqueiam(fabrica_de_sessoes, usuarios):
    ana, _ = usuarios
    destinacao = DestinacaoCadastrada.criar(ana, "viagem")
    with fabrica_de_sessoes() as sessao:
        sessao.add(
            CadastroDeDestinacaoModelo(id=destinacao.id, usuario_id=ana, nome=destinacao.nome.valor)
        )
        sessao.commit()
    for valor in (100, -100):
        inserir_referencia_sintetica(
            fabrica_de_sessoes,
            "destinacoes",
            "id, movimento_id, destinacao_id, valor_centavos",
            (uuid4(), uuid4(), destinacao.id, valor),
        )
    with fabrica_de_sessoes() as sessao:
        repositorio = RepositorioDeDestinacoesCadastradasSqlAlchemy(sessao)
        assert repositorio.tem_referencias(ana, destinacao) is True


def test_peso_positivo_com_valor_de_mercado_zero_bloqueia(fabrica_de_sessoes, usuarios):
    ana, _ = usuarios
    destinacao = DestinacaoCadastrada.criar(ana, "viagem")
    with fabrica_de_sessoes() as sessao:
        sessao.add(
            CadastroDeDestinacaoModelo(id=destinacao.id, usuario_id=ana, nome=destinacao.nome.valor)
        )
        sessao.commit()
    posicao_id = uuid4()
    inserir_referencia_sintetica(
        fabrica_de_sessoes,
        "posicoes_de_investimento",
        "investimento_id, quantidade_observada, valor_de_mercado_centavos",
        (posicao_id, "1", 0),
    )
    inserir_referencia_sintetica(
        fabrica_de_sessoes,
        "alocacoes_de_caixinha",
        "posicao_id, destinacao_id, peso_centavos",
        (posicao_id, destinacao.id, 1),
    )
    with fabrica_de_sessoes() as sessao:
        repositorio = RepositorioDeDestinacoesCadastradasSqlAlchemy(sessao)
        assert repositorio.tem_referencias(ana, destinacao) is True


def test_definir_icone_grava_para_o_dono_e_nulo_volta_ao_padrao(repositorio, usuarios):
    ana, _ = usuarios
    destinacao = DestinacaoCadastrada.criar(ana, "viagem")
    repositorio.adicionar(destinacao)

    repositorio.definir_icone(ana, destinacao.id, IconeDaCaixinha.AVIAO)
    assert repositorio.obter(ana, destinacao.id).icone is IconeDaCaixinha.AVIAO
    assert repositorio.listar(ana)[0].icone is IconeDaCaixinha.AVIAO

    repositorio.definir_icone(ana, destinacao.id, None)
    assert repositorio.obter(ana, destinacao.id).icone is None


def test_definir_icone_de_caixinha_alheia_nao_altera_nada(repositorio, usuarios):
    ana, bia = usuarios
    destinacao = DestinacaoCadastrada.criar(ana, "viagem", icone="casa")
    repositorio.adicionar(destinacao)

    repositorio.definir_icone(bia, destinacao.id, IconeDaCaixinha.CARRO)

    assert repositorio.obter(ana, destinacao.id).icone is IconeDaCaixinha.CASA


def test_adicionar_grava_o_icone_informado(repositorio, usuarios):
    ana, _ = usuarios
    repositorio.adicionar(DestinacaoCadastrada.criar(ana, "casa nova", icone="casa"))

    assert repositorio.obter_por_nome(ana, Tag("casa nova")).icone is IconeDaCaixinha.CASA


def test_listar_e_obter_trazem_a_cor_da_propria_caixinha(fabrica_de_sessoes, usuarios):
    ana, bia = usuarios
    com_cor = DestinacaoCadastrada.criar(ana, "viagem")
    sem_cor = DestinacaoCadastrada.criar(ana, "casa")
    alheia = DestinacaoCadastrada.criar(bia, "viagem")
    with fabrica_de_sessoes() as sessao:
        repositorio = RepositorioDeDestinacoesCadastradasSqlAlchemy(sessao)
        for item in (com_cor, sem_cor, alheia):
            repositorio.adicionar(item)
        sessao.add(CorDaDestinacaoModelo(id=uuid4(), destinacao_id=com_cor.id, cor="coral"))
        sessao.commit()
    with fabrica_de_sessoes() as sessao:
        repositorio = RepositorioDeDestinacoesCadastradasSqlAlchemy(sessao)
        assert {d.nome.valor: d.cor for d in repositorio.listar(ana)} == {
            "viagem": CorDaDestinacao.CORAL,
            "casa": None,
        }
        assert repositorio.obter(ana, com_cor.id).cor is CorDaDestinacao.CORAL
        assert repositorio.obter_por_nome(ana, Tag("casa")).cor is None
        assert repositorio.listar(bia)[0].cor is None


def test_icone_nao_conta_como_referencia(repositorio, usuarios):
    ana, _ = usuarios
    destinacao = DestinacaoCadastrada.criar(ana, "viagem", icone="aviao")
    repositorio.adicionar(destinacao)

    assert repositorio.tem_referencias(ana, destinacao) is False


def test_cor_nao_bloqueia_e_e_apagada_junto_com_a_caixinha_e_o_icone_some_com_a_linha(
    fabrica_de_sessoes, usuarios
):
    ana, bia = usuarios
    destinacao = DestinacaoCadastrada.criar(ana, "viagem", icone="aviao")
    outra = DestinacaoCadastrada.criar(bia, "viagem")
    with fabrica_de_sessoes() as sessao:
        repositorio = RepositorioDeDestinacoesCadastradasSqlAlchemy(sessao)
        repositorio.adicionar(destinacao)
        repositorio.adicionar(outra)
        sessao.add(CorDaDestinacaoModelo(id=uuid4(), destinacao_id=destinacao.id, cor="coral"))
        sessao.add(CorDaDestinacaoModelo(id=uuid4(), destinacao_id=outra.id, cor="ceu"))
        sessao.commit()
    with fabrica_de_sessoes() as sessao:
        repositorio = RepositorioDeDestinacoesCadastradasSqlAlchemy(sessao)
        assert repositorio.tem_referencias(ana, destinacao) is False
        repositorio.remover(ana, destinacao.id)
        sessao.commit()
    with fabrica_de_sessoes() as sessao:
        assert sessao.query(CadastroDeDestinacaoModelo).count() == 1
        restantes = sessao.query(CorDaDestinacaoModelo).all()
        assert [(c.destinacao_id, c.cor) for c in restantes] == [(outra.id, "ceu")]


def test_remover_com_cor_que_bloqueia_por_outra_referencia_desfaz_a_cor_no_rollback(
    fabrica_de_sessoes, usuarios
):
    ana, _ = usuarios
    destinacao = DestinacaoCadastrada.criar(ana, "viagem")
    with fabrica_de_sessoes() as sessao:
        RepositorioDeDestinacoesCadastradasSqlAlchemy(sessao).adicionar(destinacao)
        sessao.add(CorDaDestinacaoModelo(id=uuid4(), destinacao_id=destinacao.id, cor="coral"))
        sessao.commit()
    with fabrica_de_sessoes() as sessao:
        RepositorioDeDestinacoesCadastradasSqlAlchemy(sessao).remover(ana, destinacao.id)
        sessao.rollback()
    with fabrica_de_sessoes() as sessao:
        assert sessao.query(CorDaDestinacaoModelo).count() == 1
