"""Cria a tabela ``aparencias`` (cor, textura, nome e logo do app de cada pessoa).

Só cria a tabela: sem backfill e sem tocar em dado existente. O downgrade remove só ela.
"""

import sqlalchemy as sa
from alembic import op

revision = "d65000000001"
down_revision = "c61000000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "aparencias",
        sa.Column("usuario_id", sa.Uuid(), nullable=False),
        sa.Column("matiz", sa.Integer(), nullable=False),
        sa.Column("intensidade", sa.String(length=20), nullable=False),
        sa.Column("textura", sa.String(length=20), nullable=False),
        sa.Column("nome", sa.String(length=20), nullable=False),
        sa.Column("marca", sa.String(length=20), nullable=False),
        sa.CheckConstraint("matiz BETWEEN 0 AND 359", name=op.f("ck_aparencias_matiz_valida")),
        sa.ForeignKeyConstraint(
            ["usuario_id"],
            ["usuarios.id"],
            ondelete="CASCADE",
            name=op.f("fk_aparencias_usuario_id_usuarios"),
        ),
        sa.PrimaryKeyConstraint("usuario_id", name=op.f("pk_aparencias")),
    )


def downgrade() -> None:
    op.drop_table("aparencias")
