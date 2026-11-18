from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import text

from gastoba.domain.conta import Conta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.configuracoes import obter_configuracoes
from gastoba.infrastructure.persistencia.banco import criar_engine, criar_fabrica_de_sessoes
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy


def test_renomeia_so_caixinhas_geradas_e_preserva_valores(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path}/nomes.db"
    monkeypatch.setenv("GASTOBA_URL_BANCO", url)
    obter_configuracoes.cache_clear()
    config = Config()
    config.set_main_option(
        "script_location", str(Path(__file__).resolve().parents[2] / "migrations")
    )
    command.upgrade(config, "31c8da2c974b")
    engine = criar_engine(url)
    try:
        uow = UnidadeDeTrabalhoSqlAlchemy(criar_fabrica_de_sessoes(engine))
        pessoa = Usuario("Pessoa fictícia")
        conta = Conta(pessoa.id, "Banco fictício", Dinheiro(100))
        with uow as u:
            u.usuarios.garantir(pessoa)
            u.contas.adicionar(conta)
            for codigo, nome, tipo, fk in [
                ("a", "Conta remunerada (Banco)", "CAIXINHA", conta.id),
                ("b", "Conta remunerada particular", "STOCK", None),
            ]:
                u.investimentos.salvar_posicao(
                    pessoa.id,
                    InvestimentoExterno(
                        codigo, nome, tipo, None, Dinheiro(96217), "{}", conta_remunerada_id=fk
                    ),
                )
            u.commit()
        with engine.connect() as c:
            antes = c.execute(
                text(
                    "SELECT id, saldo_centavos, conta_remunerada_id "
                    "FROM investimentos ORDER BY id_externo"
                )
            ).all()
        command.upgrade(config, "a05800000001")
        with engine.connect() as c:
            assert c.execute(
                text("SELECT nome FROM investimentos ORDER BY id_externo")
            ).scalars().all() == ["Conta investimentos (Banco)", "Conta remunerada particular"]
            assert (
                c.execute(
                    text(
                        "SELECT id, saldo_centavos, conta_remunerada_id "
                        "FROM investimentos ORDER BY id_externo"
                    )
                ).all()
                == antes
            )
        command.downgrade(config, "31c8da2c974b")
        with engine.connect() as c:
            assert (
                c.execute(text("SELECT nome FROM investimentos WHERE id_externo='a'")).scalar()
                == "Conta remunerada (Banco)"
            )
    finally:
        engine.dispose()
        obter_configuracoes.cache_clear()
