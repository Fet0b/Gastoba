"""adiciona o tipo da conta

Revision ID: 070a4af81078
Revises: 8dc18abafe91
Create Date: 2026-10-16 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "070a4af81078"
down_revision: str | Sequence[str] | None = "8dc18abafe91"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # As contas que já existem ficam como corrente; a próxima sincronização corrige os cartões.
    # Sem CHECK: a validação do tipo é do domain (TipoDaConta).
    with op.batch_alter_table("contas", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("tipo", sa.String(length=20), nullable=False, server_default="corrente")
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("contas", schema=None) as batch_op:
        batch_op.drop_column("tipo")
