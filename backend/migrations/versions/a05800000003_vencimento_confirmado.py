"""Marca explícita de vencimento, sem mudar a natureza financeira do resgate."""

import sqlalchemy as sa
from alembic import op

revision = "a05800000003"
down_revision = "a05800000002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "movimentos_de_investimento",
        sa.Column("vencimento_confirmado", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    # DROP COLUMN nativo preserva triggers/índices de outras relações no SQLite.
    op.drop_column("movimentos_de_investimento", "vencimento_confirmado")
