from sqlalchemy import Engine, create_engine, event, make_url
from sqlalchemy.orm import Session, sessionmaker


def criar_engine(url_banco: str) -> Engine:
    eh_sqlite = make_url(url_banco).get_backend_name() == "sqlite"
    # O FastAPI roda endpoints síncronos em threads diferentes; sem isso o sqlite3
    # recusa usar a conexão fora da thread que a criou.
    connect_args = {"check_same_thread": False} if eh_sqlite else {}
    # hide_parameters: as mensagens de erro do SQLAlchemy não trazem valores nem descrições
    # dos gastos, que acabariam no log (Art. IV.3 da constituição).
    engine = create_engine(url_banco, connect_args=connect_args, hide_parameters=True)

    if eh_sqlite:

        @event.listens_for(engine, "connect")
        def _ativar_chaves_estrangeiras(conexao_dbapi, _registro) -> None:
            # O SQLite vem com chaves estrangeiras desligadas por padrão.
            cursor = conexao_dbapi.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


def criar_fabrica_de_sessoes(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False)
