"""adiciona a renda-base mensal, sem alterar lançamentos existentes"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "7f2a8b9c4d10"
down_revision: str | Sequence[str] | None = "552bd1f93894"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "rendas_base",
        sa.Column("usuario_id", sa.Uuid(), nullable=False),
        sa.Column("valor_centavos", sa.BigInteger(), nullable=False),
        sa.CheckConstraint("valor_centavos > 0", name=op.f("ck_rendas_base_valor_positivo")),
        sa.ForeignKeyConstraint(
            ["usuario_id"], ["usuarios.id"], name=op.f("fk_rendas_base_usuario_id_usuarios")
        ),
        sa.PrimaryKeyConstraint("usuario_id", name=op.f("pk_rendas_base")),
    )


def downgrade() -> None:
    op.drop_table("rendas_base")
