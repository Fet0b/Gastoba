from sqlalchemy import Engine, text
from sqlalchemy.exc import SQLAlchemyError


class VerificadorDeBancoSqlAlchemy:
    """Implementa a porta VerificadorDeBanco executando SELECT 1 no banco."""

    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def esta_disponivel(self) -> bool:
        try:
            with self._engine.connect() as conexao:
                conexao.execute(text("SELECT 1"))
        except SQLAlchemyError:
            return False
        return True
