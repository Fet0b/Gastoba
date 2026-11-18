"""adiciona investimentos

Revision ID: c3e7a1d94b20
Revises: 070a4af81078
Create Date: 2026-10-22 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3e7a1d94b20"
down_revision: str | Sequence[str] | None = "070a4af81078"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "investimentos",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("usuario_id", sa.Uuid(), nullable=False),
        sa.Column("id_externo", sa.String(length=100), nullable=False),
        sa.Column("nome", sa.String(length=200), nullable=False),
        sa.Column("tipo", sa.String(length=30), nullable=False),
        sa.Column("subtipo", sa.String(length=30), nullable=True),
        sa.Column("saldo_centavos", sa.BigInteger(), nullable=False),
        sa.Column("dados", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ["usuario_id"], ["usuarios.id"], name=op.f("fk_investimentos_usuario_id_usuarios")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_investimentos")),
        sa.UniqueConstraint(
            "usuario_id", "id_externo", name=op.f("uq_investimentos_usuario_id_id_externo")
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("investimentos")
