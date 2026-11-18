from datetime import date
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from gastoba.domain.conta import Conta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.configuracoes import obter_configuracoes
from gastoba.infrastructure.persistencia.banco import criar_engine, criar_fabrica_de_sessoes
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy

ANTERIOR = "a05600000004"
NOVA = "31c8da2c974b"
TABELA = "reaplicacoes_de_resgates"


@pytest.fixture
def banco_migrado(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path}/reaplicacoes.db"
    monkeypatch.setenv("GASTOBA_URL_BANCO", url)
    obter_configuracoes.cache_clear()
    config = Config()
    config.set_main_option(
        "script_location", str(Path(__file__).resolve().parents[2] / "migrations")
    )
    command.upgrade(config, ANTERIOR)
    engine = criar_engine(url)
    uow = UnidadeDeTrabalhoSqlAlchemy(criar_fabrica_de_sessoes(engine))
    pessoa = Usuario("Pessoa fictícia")
    conta = Conta(pessoa.id, "Carteira fictícia", Dinheiro(123456))
    with uow as u:
        u.usuarios.garantir(pessoa)
        u.contas.adicionar(conta)
        for nome in ["origem", "destino"]:
            u.investimentos.salvar_posicao(
                pessoa.id,
                InvestimentoExterno(nome, nome, "FIXED_INCOME", None, Dinheiro(10000), "{}"),
            )
        u.commit()
    linhas = []
    with uow as u:
        origem, destino = u.investimentos.listar_posicoes(pessoa.id)
        movimentos = []
        for tipo, posicao, valor in [
            (TipoDeMovimento.RESGATE, origem, 10000),
            (TipoDeMovimento.APORTE, destino, 15000),
            (TipoDeMovimento.RESGATE, origem, 9000),
            (TipoDeMovimento.APORTE, destino, 8000),
        ]:
            movimento = MovimentoDeInvestimento(
                conta.id, tipo, Dinheiro(valor), "Exemplo", date(2026, 11, 1), posicao.id
            )
            linhas.append(
                {
                    "id": movimento.id.hex,
                    "conta": conta.id.hex,
                    "investimento": posicao.id.hex,
                    "tipo": tipo.value,
                    "valor": valor,
                }
            )
            movimentos.append(movimento.id.hex)
        u.commit()
    # O cenário é anterior à 058: não usar o ORM atual para gravar colunas futuras.
    with engine.begin() as conexao:
        conexao.execute(
            text(
                "INSERT INTO movimentos_de_investimento "
                "(id,conta_id,investimento_id,tipo,valor_centavos,descricao,data,origem) "
                "VALUES (:id,:conta,:investimento,:tipo,:valor,'Exemplo','2026-11-01','manual')"
            ),
            linhas,
        )
    try:
        yield config, engine, movimentos
    finally:
        engine.dispose()
        obter_configuracoes.cache_clear()


def fotografia(engine):
    with engine.connect() as conexao:
        return {
            tabela: conexao.execute(text(f"SELECT * FROM {tabela} ORDER BY id")).all()
            for tabela in ["contas", "investimentos", "movimentos_de_investimento"]
        }


def inserir(engine, resgate, aporte, valor=5000):
    with engine.begin() as conexao:
        conexao.execute(
            text(
                "INSERT INTO reaplicacoes_de_resgates "
                "(id, resgate_id, aporte_id, valor_centavos) "
                "VALUES (:id, :resgate, :aporte, :valor)"
            ),
            {"id": uuid4().hex, "resgate": resgate, "aporte": aporte, "valor": valor},
        )


def test_upgrade_downgrade_preserva_financas_e_nao_inventa_vinculos(banco_migrado):
    config, engine, movimentos = banco_migrado
    antes = fotografia(engine)
    command.upgrade(config, NOVA)
    engine.dispose()
    assert fotografia(engine) == antes
    with engine.connect() as conexao:
        assert conexao.execute(text(f"SELECT count(*) FROM {TABELA}")).scalar_one() == 0
    inserir(engine, *movimentos[:2])
    command.downgrade(config, ANTERIOR)
    assert TABELA not in inspect(engine).get_table_names()
    assert fotografia(engine) == antes
    command.upgrade(config, NOVA)
    engine.dispose()
    with engine.connect() as conexao:
        assert conexao.execute(text(f"SELECT count(*) FROM {TABELA}")).scalar_one() == 0
    assert fotografia(engine) == antes


def test_migration_cria_fk_restrict_unique_e_check_positivo(banco_migrado):
    config, engine, movimentos = banco_migrado
    command.upgrade(config, NOVA)
    engine.dispose()
    inspetor = inspect(engine)
    fks = inspetor.get_foreign_keys(TABELA)
    assert {fk["constrained_columns"][0] for fk in fks} == {"resgate_id", "aporte_id"}
    assert all(fk["referred_table"] == "movimentos_de_investimento" for fk in fks)
    assert all(fk["options"]["ondelete"] == "RESTRICT" for fk in fks)
    assert {tuple(u["column_names"]) for u in inspetor.get_unique_constraints(TABELA)} == {
        ("resgate_id",),
        ("aporte_id",),
    }
    assert len(inspetor.get_check_constraints(TABELA)) == 1
    resgate, aporte, outro_resgate, outro_aporte = movimentos
    inserir(engine, resgate, aporte)
    for r, a, valor in [
        (resgate, outro_aporte, 1),
        (outro_resgate, aporte, 1),
        (outro_resgate, outro_aporte, 0),
        (outro_resgate, outro_aporte, -1),
        (uuid4().hex, outro_aporte, 1),
        (outro_resgate, uuid4().hex, 1),
    ]:
        with pytest.raises(IntegrityError):
            inserir(engine, r, a, valor)
    for identidade in [resgate, aporte]:
        with pytest.raises(IntegrityError), engine.begin() as conexao:
            conexao.execute(
                text("DELETE FROM movimentos_de_investimento WHERE id=:id"), {"id": identidade}
            )
