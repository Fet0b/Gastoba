"""Remove escolhas de categoria das destinações; downgrade recria vazia."""

import sqlalchemy as sa
from alembic import op

revision = "a05600000003"
down_revision = "a05600000002"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_table("vinculos_das_destinacoes")


def downgrade():
    op.create_table(
        "vinculos_das_destinacoes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("destinacao_id", sa.Uuid(), nullable=False),
        sa.Column("categoria", sa.String(30), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_vinculos_das_destinacoes")),
        sa.ForeignKeyConstraint(
            ["destinacao_id"],
            ["destinacoes_cadastradas.id"],
            name=op.f("fk_vinculos_das_destinacoes_destinacao_id_destinacoes_cadastradas"),
        ),
        sa.UniqueConstraint(
            "destinacao_id", name=op.f("uq_vinculos_das_destinacoes_destinacao_id")
        ),
    )
    op.create_index(
        "ix_vinculos_das_destinacoes_destinacao_id", "vinculos_das_destinacoes", ["destinacao_id"]
    )
