from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from gastoba.domain.caixinha_marcada import CaixinhaMarcada, GuardadoNasMetas
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.tag import Tag
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.configuracoes import obter_configuracoes
from gastoba.infrastructure.persistencia.banco import criar_engine
from gastoba.infrastructure.persistencia.modelos import CadastroDeDestinacaoModelo
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy

CONFORTO, LAZER = CategoriaDoGasto.CONFORTO, CategoriaDoGasto.LAZER


def _marca(tag, categoria=CONFORTO):
    return CaixinhaMarcada(categoria, Tag.de_texto(tag))


def _pessoa_com_caixinhas(fabrica, *tags):
    pessoa = Usuario("Pessoa exemplo")
    uow = UnidadeDeTrabalhoSqlAlchemy(fabrica)
    with uow:
        uow.usuarios.garantir(pessoa)
        uow.commit()
    with fabrica() as sessao:
        from uuid import uuid4

        for t in tags:
            sessao.add(CadastroDeDestinacaoModelo(id=uuid4(), usuario_id=pessoa.id, nome=t))
        sessao.commit()
    return pessoa, uow


def test_sem_configuracao_devolve_desligado(fabrica_de_sessoes):
    pessoa, uow = _pessoa_com_caixinhas(fabrica_de_sessoes)
    with uow:
        assert uow.guardado_nas_metas.obter(pessoa.id) == GuardadoNasMetas(False, ())


def test_salva_troca_e_desliga_preservando_marcacoes(fabrica_de_sessoes):
    pessoa, uow = _pessoa_com_caixinhas(fabrica_de_sessoes, "computador", "viagem")
    with uow:
        uow.guardado_nas_metas.salvar(pessoa.id, GuardadoNasMetas(True, (_marca("computador"),)))
        uow.commit()
    with uow:
        assert uow.guardado_nas_metas.obter(pessoa.id).marcacoes == (_marca("computador"),)
        uow.guardado_nas_metas.salvar(
            pessoa.id, GuardadoNasMetas(True, (_marca("viagem", LAZER), _marca("computador")))
        )
        uow.commit()
    with uow:
        lido = uow.guardado_nas_metas.obter(pessoa.id)
        assert lido.ativo and set(lido.marcacoes) == {_marca("viagem", LAZER), _marca("computador")}
        uow.guardado_nas_metas.salvar(pessoa.id, GuardadoNasMetas(False, lido.marcacoes))
        uow.commit()
    with uow:
        desligado = uow.guardado_nas_metas.obter(pessoa.id)
        assert desligado.ativo is False and len(desligado.marcacoes) == 2


def test_dois_usuarios_ficam_isolados(fabrica_de_sessoes):
    pessoa, uow = _pessoa_com_caixinhas(fabrica_de_sessoes, "computador")
    outra = Usuario("Outra pessoa")
    with uow:
        uow.usuarios.garantir(outra)
        uow.guardado_nas_metas.salvar(pessoa.id, GuardadoNasMetas(True, (_marca("computador"),)))
        uow.commit()
    with uow:
        assert uow.guardado_nas_metas.obter(outra.id) == GuardadoNasMetas(False, ())
        assert uow.guardado_nas_metas.tags_cadastradas(outra.id) == set()
        assert uow.guardado_nas_metas.tags_cadastradas(pessoa.id) == {Tag.de_texto("computador")}


def test_apagar_a_destinacao_apaga_a_marcacao(fabrica_de_sessoes):
    pessoa, uow = _pessoa_com_caixinhas(fabrica_de_sessoes, "computador")
    with uow:
        uow.guardado_nas_metas.salvar(pessoa.id, GuardadoNasMetas(True, (_marca("computador"),)))
        uow.commit()
    with fabrica_de_sessoes() as sessao:
        sessao.execute(text("DELETE FROM destinacoes_cadastradas"))
        sessao.commit()
        assert sessao.execute(text("SELECT count(*) FROM caixinhas_marcadas")).scalar_one() == 0
    with uow:
        assert uow.guardado_nas_metas.obter(pessoa.id).marcacoes == ()


def test_categoria_guardada_que_deixou_de_valer_e_ignorada(fabrica_de_sessoes):
    pessoa, uow = _pessoa_com_caixinhas(fabrica_de_sessoes, "computador", "viagem")
    with uow:
        uow.guardado_nas_metas.salvar(
            pessoa.id, GuardadoNasMetas(True, (_marca("computador"), _marca("viagem", LAZER)))
        )
        uow.commit()
    with fabrica_de_sessoes() as sessao:
        sessao.execute(text("UPDATE caixinhas_marcadas SET categoria='investimentos' WHERE 1"))
        sessao.commit()
    with uow:
        assert uow.guardado_nas_metas.obter(pessoa.id).marcacoes == ()


def test_sem_commit_descarta(fabrica_de_sessoes):
    pessoa, uow = _pessoa_com_caixinhas(fabrica_de_sessoes, "computador")
    with uow:
        uow.guardado_nas_metas.salvar(pessoa.id, GuardadoNasMetas(True, (_marca("computador"),)))
    with uow:
        assert uow.guardado_nas_metas.obter(pessoa.id) == GuardadoNasMetas(False, ())


def test_tag_sem_cadastro_nao_e_gravada(fabrica_de_sessoes):
    pessoa, uow = _pessoa_com_caixinhas(fabrica_de_sessoes)
    with uow, pytest.raises(ValueError):
        uow.guardado_nas_metas.salvar(pessoa.id, GuardadoNasMetas(True, (_marca("computador"),)))


def test_unicidade_da_caixinha_pela_chave_primaria(fabrica_de_sessoes):
    pessoa, uow = _pessoa_com_caixinhas(fabrica_de_sessoes, "computador")
    with uow:
        uow.guardado_nas_metas.salvar(pessoa.id, GuardadoNasMetas(True, (_marca("computador"),)))
        uow.commit()
    with fabrica_de_sessoes() as sessao, pytest.raises(IntegrityError):
        sessao.execute(
            text(
                "INSERT INTO caixinhas_marcadas SELECT destinacao_id, 'lazer' "
                "FROM caixinhas_marcadas"
            )
        )


def test_migration_cria_e_remove_so_as_duas_tabelas(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path}/guardado.db"
    monkeypatch.setenv("GASTOBA_URL_BANCO", url)
    obter_configuracoes.cache_clear()
    config = Config()
    config.set_main_option(
        "script_location", str(Path(__file__).resolve().parents[2] / "migrations")
    )
    command.upgrade(config, "d65000000001")
    antes = set(inspect(criar_engine(url)).get_table_names())
    assert not {"preferencias_do_orcamento", "caixinhas_marcadas"} & antes
    command.upgrade(config, "e66000000001")
    depois = set(inspect(criar_engine(url)).get_table_names())
    assert depois - antes == {"preferencias_do_orcamento", "caixinhas_marcadas"}
    command.downgrade(config, "d65000000001")
    assert set(inspect(criar_engine(url)).get_table_names()) == antes
