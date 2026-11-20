"""permite o saldo inicial do investimento, um movimento sem conta

Revision ID: 552bd1f93894
Revises: c0539990298a
Create Date: 2026-10-22 18:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "552bd1f93894"
down_revision: str | Sequence[str] | None = "c0539990298a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # O movimento de origem ``saldo_inicial`` não sai de conta nenhuma.
    with op.batch_alter_table("movimentos_de_investimento", schema=None) as batch_op:
        batch_op.alter_column("conta_id", existing_type=sa.Uuid(), nullable=True)


def downgrade() -> None:
    """Downgrade schema."""
    # Sem conta, o saldo inicial não cabe no esquema antigo: ele e as suas destinações saem.
    op.execute(
        """
        DELETE FROM destinacoes
        WHERE movimento_id IN (
            SELECT id FROM movimentos_de_investimento WHERE origem = 'saldo_inicial'
        )
        """
    )
    op.execute("DELETE FROM movimentos_de_investimento WHERE origem = 'saldo_inicial'")
    with op.batch_alter_table("movimentos_de_investimento", schema=None) as batch_op:
        batch_op.alter_column("conta_id", existing_type=sa.Uuid(), nullable=False)
