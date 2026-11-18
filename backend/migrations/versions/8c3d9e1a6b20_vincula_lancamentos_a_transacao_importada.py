"""vincula novos lançamentos à transação importada, preservando os antigos"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "8c3d9e1a6b20"
down_revision: str | Sequence[str] | None = "7f2a8b9c4d10"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABELAS = ("gastos", "ganhos", "movimentos_de_investimento")


def upgrade() -> None:
    for tabela in _TABELAS:
        with op.batch_alter_table(tabela) as lote:
            lote.add_column(sa.Column("transacao_importada_id", sa.Uuid(), nullable=True))
            lote.create_foreign_key(
                f"fk_{tabela}_transacao_importada_id_transacoes_importadas",
                "transacoes_importadas",
                ["transacao_importada_id"],
                ["id"],
            )
            lote.create_index(
                f"ix_{tabela}_transacao_importada_id", ["transacao_importada_id"], unique=False
            )


def downgrade() -> None:
    for tabela in reversed(_TABELAS):
        with op.batch_alter_table(tabela) as lote:
            lote.drop_index(f"ix_{tabela}_transacao_importada_id")
            lote.drop_constraint(
                f"fk_{tabela}_transacao_importada_id_transacoes_importadas", type_="foreignkey"
            )
            lote.drop_column("transacao_importada_id")
