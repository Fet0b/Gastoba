"""Confirmações explícitas de reaplicação; começa vazia, sem reescrever dinheiro."""

import sqlalchemy as sa
from alembic import op

revision = "31c8da2c974b"
down_revision = "a05600000004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reaplicacoes_de_resgates",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("resgate_id", sa.Uuid(), nullable=False),
        sa.Column("aporte_id", sa.Uuid(), nullable=False),
        sa.Column("valor_centavos", sa.BigInteger(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_reaplicacoes_de_resgates")),
        sa.ForeignKeyConstraint(
            ["resgate_id"],
            ["movimentos_de_investimento.id"],
            ondelete="RESTRICT",
            name=op.f("fk_reaplicacoes_de_resgates_resgate_id_movimentos_de_investimento"),
        ),
        sa.ForeignKeyConstraint(
            ["aporte_id"],
            ["movimentos_de_investimento.id"],
            ondelete="RESTRICT",
            name=op.f("fk_reaplicacoes_de_resgates_aporte_id_movimentos_de_investimento"),
        ),
        sa.UniqueConstraint("resgate_id", name=op.f("uq_reaplicacoes_de_resgates_resgate_id")),
        sa.UniqueConstraint("aporte_id", name=op.f("uq_reaplicacoes_de_resgates_aporte_id")),
        sa.CheckConstraint(
            "valor_centavos > 0", name=op.f("ck_reaplicacoes_de_resgates_valor_positivo")
        ),
    )


def downgrade() -> None:
    op.drop_table("reaplicacoes_de_resgates")
