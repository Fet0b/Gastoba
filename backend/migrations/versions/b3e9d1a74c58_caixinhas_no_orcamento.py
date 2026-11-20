"""caixinhas no orcamento

Revision ID: b3e9d1a74c58
Revises: f1a8c4d92e37
Create Date: 2026-11-06 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b3e9d1a74c58"
down_revision: str | Sequence[str] | None = "f1a8c4d92e37"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "vinculos_das_destinacoes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("usuario_id", sa.Uuid(), nullable=False),
        sa.Column("tag", sa.String(length=30), nullable=False),
        sa.Column("categoria", sa.String(length=30), nullable=False),
        sa.ForeignKeyConstraint(
            ["usuario_id"],
            ["usuarios.id"],
            name=op.f("fk_vinculos_das_destinacoes_usuario_id_usuarios"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_vinculos_das_destinacoes")),
        sa.UniqueConstraint(
            "usuario_id", "tag", name=op.f("uq_vinculos_das_destinacoes_usuario_id_tag")
        ),
    )
    with op.batch_alter_table("destinacoes", schema=None) as batch_op:
        batch_op.add_column(sa.Column("categoria", sa.String(length=30), nullable=True))
    with op.batch_alter_table("coberturas_de_compra", schema=None) as batch_op:
        batch_op.add_column(sa.Column("movimento_id", sa.Uuid(), nullable=True))
        batch_op.add_column(sa.Column("principal_centavos", sa.BigInteger(), nullable=True))
        batch_op.create_index(
            batch_op.f("ix_coberturas_de_compra_movimento_id"), ["movimento_id"], unique=False
        )
        batch_op.create_foreign_key(
            batch_op.f("fk_coberturas_de_compra_movimento_id_movimentos_de_investimento"),
            "movimentos_de_investimento",
            ["movimento_id"],
            ["id"],
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("coberturas_de_compra", schema=None) as batch_op:
        batch_op.drop_constraint(
            batch_op.f("fk_coberturas_de_compra_movimento_id_movimentos_de_investimento"),
            type_="foreignkey",
        )
        batch_op.drop_index(batch_op.f("ix_coberturas_de_compra_movimento_id"))
        batch_op.drop_column("principal_centavos")
        batch_op.drop_column("movimento_id")
    with op.batch_alter_table("destinacoes", schema=None) as batch_op:
        batch_op.drop_column("categoria")
    op.drop_table("vinculos_das_destinacoes")
