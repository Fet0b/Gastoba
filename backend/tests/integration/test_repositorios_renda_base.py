from uuid import uuid4

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy


def test_grava_altera_mesma_base_e_isola_por_usuario(fabrica_de_sessoes):
    uow = UnidadeDeTrabalhoSqlAlchemy(fabrica_de_sessoes)
    pessoa, outra = Usuario("Pessoa exemplo"), Usuario("Outra pessoa exemplo")
    with uow:
        uow.usuarios.garantir(pessoa)
        uow.usuarios.garantir(outra)
        uow.commit()
    with uow:
        assert uow.renda_base.obter(pessoa.id) is None
        uow.renda_base.definir(pessoa.id, Dinheiro(500000))
        uow.renda_base.definir(outra.id, Dinheiro(700000))
        uow.commit()
    with uow:
        assert uow.renda_base.obter(pessoa.id) == Dinheiro(500000)
        assert uow.renda_base.obter(outra.id) == Dinheiro(700000)
        assert uow.renda_base.obter(uuid4()) is None
        uow.renda_base.definir(pessoa.id, Dinheiro(600000))
        uow.commit()
    with uow:
        assert uow.renda_base.obter(pessoa.id) == Dinheiro(600000)
        uow.renda_base.remover(pessoa.id)
        uow.renda_base.remover(pessoa.id)
        uow.commit()
    with uow:
        assert uow.renda_base.obter(pessoa.id) is None
        assert uow.renda_base.obter(outra.id) == Dinheiro(700000)


def test_sem_commit_descarta_definicao_alteracao_e_remocao(fabrica_de_sessoes):
    uow = UnidadeDeTrabalhoSqlAlchemy(fabrica_de_sessoes)
    pessoa = Usuario("Pessoa exemplo")
    with uow:
        uow.usuarios.garantir(pessoa)
        uow.commit()
    with uow:
        uow.renda_base.definir(pessoa.id, Dinheiro(500000))
    with uow:
        assert uow.renda_base.obter(pessoa.id) is None
        uow.renda_base.definir(pessoa.id, Dinheiro(600000))
        uow.commit()
    with uow:
        uow.renda_base.definir(pessoa.id, Dinheiro(700000))
    with uow:
        assert uow.renda_base.obter(pessoa.id) == Dinheiro(600000)
        uow.renda_base.remover(pessoa.id)
    with uow:
        assert uow.renda_base.obter(pessoa.id) == Dinheiro(600000)
