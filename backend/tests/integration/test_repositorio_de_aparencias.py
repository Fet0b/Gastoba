from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from gastoba.domain.aparencia import Aparencia, IntensidadeDaCor, MarcaDoApp, TexturaDoFundo
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.configuracoes import obter_configuracoes
from gastoba.infrastructure.persistencia.banco import criar_engine
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy


def _aparencia(matiz=10, nome="Meu app"):
    return Aparencia(matiz, IntensidadeDaCor.VIVA, TexturaDoFundo.GRADE, nome, MarcaDoApp.COFRE)


def test_salva_troca_remove_e_isola_por_pessoa(fabrica_de_sessoes):
    uow = UnidadeDeTrabalhoSqlAlchemy(fabrica_de_sessoes)
    pessoa, outra = Usuario("Pessoa exemplo"), Usuario("Outra pessoa exemplo")
    with uow:
        uow.usuarios.garantir(pessoa)
        uow.usuarios.garantir(outra)
        uow.commit()
    with uow:
        assert uow.aparencias.obter(pessoa.id) is None
        uow.aparencias.salvar(pessoa.id, _aparencia())
        uow.aparencias.salvar(outra.id, _aparencia(200, "Outro"))
        uow.commit()
    with uow:
        assert uow.aparencias.obter(pessoa.id) == _aparencia()
        uow.aparencias.salvar(pessoa.id, _aparencia(300, "Trocado"))
        uow.commit()
    with uow:
        assert uow.aparencias.obter(pessoa.id) == _aparencia(300, "Trocado")
        assert uow.aparencias.obter(outra.id) == _aparencia(200, "Outro")
        uow.aparencias.remover(pessoa.id)
        uow.aparencias.remover(pessoa.id)
        uow.commit()
    with uow:
        assert uow.aparencias.obter(pessoa.id) is None
        assert uow.aparencias.obter(outra.id) is not None


def test_sem_commit_descarta(fabrica_de_sessoes):
    uow = UnidadeDeTrabalhoSqlAlchemy(fabrica_de_sessoes)
    pessoa = Usuario("Pessoa exemplo")
    with uow:
        uow.usuarios.garantir(pessoa)
        uow.commit()
    with uow:
        uow.aparencias.salvar(pessoa.id, _aparencia())
    with uow:
        assert uow.aparencias.obter(pessoa.id) is None


def test_codigo_desconhecido_cai_no_padrao_do_campo(fabrica_de_sessoes):
    uow = UnidadeDeTrabalhoSqlAlchemy(fabrica_de_sessoes)
    pessoa = Usuario("Pessoa exemplo")
    with uow:
        uow.usuarios.garantir(pessoa)
        uow.aparencias.salvar(pessoa.id, _aparencia())
        uow.commit()
    with fabrica_de_sessoes() as sessao:
        sessao.execute(
            text("UPDATE aparencias SET textura='holograma', marca='inexistente', intensidade='x'")
        )
        sessao.commit()
    with uow:
        lida = uow.aparencias.obter(pessoa.id)
    padrao = Aparencia.padrao()
    assert (lida.textura, lida.marca, lida.intensidade) == (
        padrao.textura,
        padrao.marca,
        padrao.intensidade,
    )
    assert lida.matiz == 10 and lida.nome == "Meu app"


def test_check_recusa_matiz_fora_do_espectro(fabrica_de_sessoes):
    uow = UnidadeDeTrabalhoSqlAlchemy(fabrica_de_sessoes)
    pessoa = Usuario("Pessoa exemplo")
    with uow:
        uow.usuarios.garantir(pessoa)
        uow.commit()
    with fabrica_de_sessoes() as sessao, pytest.raises(IntegrityError):
        sessao.execute(
            text("INSERT INTO aparencias VALUES (:u, 360, 'media', 'nenhuma', 'x', 'olho')"),
            {"u": pessoa.id.hex},
        )


def test_migration_cria_e_remove_so_a_tabela(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path}/aparencia.db"
    monkeypatch.setenv("GASTOBA_URL_BANCO", url)
    obter_configuracoes.cache_clear()
    config = Config()
    config.set_main_option(
        "script_location", str(Path(__file__).resolve().parents[2] / "migrations")
    )
    command.upgrade(config, "c61000000001")
    assert "aparencias" not in inspect(criar_engine(url)).get_table_names()
    command.upgrade(config, "d65000000001")
    assert "aparencias" in inspect(criar_engine(url)).get_table_names()
    command.downgrade(config, "c61000000001")
    tabelas = inspect(criar_engine(url)).get_table_names()
    assert "aparencias" not in tabelas and "usuarios" in tabelas
