from datetime import UTC, datetime


class RelogioDoSistema:
    """Satisfaz a porta Relogio: o instante atual do sistema, sempre em UTC."""

    def agora(self) -> datetime:
        return datetime.now(UTC)
