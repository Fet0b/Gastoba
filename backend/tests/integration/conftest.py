import pytest

from gastoba.infrastructure.persistencia.banco import criar_engine, criar_fabrica_de_sessoes
from gastoba.infrastructure.persistencia.modelos import Base


@pytest.fixture
def fabrica_de_sessoes(tmp_path):
    # criar_engine liga o PRAGMA foreign_keys; o esquema vem dos modelos, sem migrations.
    engine = criar_engine(f"sqlite:///{tmp_path}/repositorios.db")
    Base.metadata.create_all(engine)
    yield criar_fabrica_de_sessoes(engine)
    engine.dispose()
