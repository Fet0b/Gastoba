"""faturas do cartao

Revision ID: f1a8c4d92e37
Revises: a7c3e5f19d24
Create Date: 2026-11-05 12:01:44.517059

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f1a8c4d92e37"
down_revision: str | Sequence[str] | None = "a7c3e5f19d24"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "faturas",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("conta_id", sa.Uuid(), nullable=False),
        sa.Column("id_externo", sa.String(length=100), nullable=True),
        sa.Column("inicio", sa.Date(), nullable=True),
        sa.Column("fechamento", sa.Date(), nullable=False),
        sa.Column("vencimento", sa.Date(), nullable=True),
        sa.Column("total_centavos", sa.BigInteger(), nullable=False),
        sa.Column("minimo_centavos", sa.BigInteger(), nullable=True),
        sa.Column("fonte", sa.String(length=10), nullable=False),
        sa.CheckConstraint("fonte IN ('banco', 'estimada')", name=op.f("ck_faturas_fonte_valida")),
        sa.CheckConstraint("minimo_centavos >= 0", name=op.f("ck_faturas_minimo_nao_negativo")),
        sa.CheckConstraint("total_centavos >= 0", name=op.f("ck_faturas_total_nao_negativo")),
        sa.ForeignKeyConstraint(
            ["conta_id"], ["contas.id"], name=op.f("fk_faturas_conta_id_contas")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_faturas")),
        sa.UniqueConstraint("conta_id", "fechamento", name=op.f("uq_faturas_conta_id_fechamento")),
    )
    with op.batch_alter_table("faturas", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_faturas_conta_id"), ["conta_id"], unique=False)

    op.create_table(
        "pagamentos_de_fatura",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("fatura_id", sa.Uuid(), nullable=False),
        sa.Column("data", sa.Date(), nullable=False),
        sa.Column("valor_centavos", sa.BigInteger(), nullable=False),
        sa.Column("forma", sa.String(length=30), nullable=True),
        sa.CheckConstraint(
            "valor_centavos > 0", name=op.f("ck_pagamentos_de_fatura_valor_positivo")
        ),
        sa.ForeignKeyConstraint(
            ["fatura_id"],
            ["faturas.id"],
            name=op.f("fk_pagamentos_de_fatura_fatura_id_faturas"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_pagamentos_de_fatura")),
        sa.UniqueConstraint(
            "fatura_id",
            "data",
            "valor_centavos",
            name=op.f("uq_pagamentos_de_fatura_fatura_id_data_valor_centavos"),
        ),
    )
    with op.batch_alter_table("transacoes_importadas", schema=None) as batch_op:
        batch_op.add_column(sa.Column("fatura_id", sa.Uuid(), nullable=True))
        batch_op.add_column(sa.Column("id_externo_da_fatura", sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column("parcela_numero", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("parcela_total", sa.Integer(), nullable=True))
        batch_op.create_index(
            batch_op.f("ix_transacoes_importadas_fatura_id"), ["fatura_id"], unique=False
        )
        batch_op.create_foreign_key(
            batch_op.f("fk_transacoes_importadas_fatura_id_faturas"),
            "faturas",
            ["fatura_id"],
            ["id"],
            ondelete="SET NULL",
        )
        # O autogenerate não detecta CHECK: criado à mão, com o mesmo nome do modelo.
        batch_op.create_check_constraint(
            op.f("ck_transacoes_importadas_parcela_valida"),
            "(parcela_numero IS NULL AND parcela_total IS NULL) OR "
            "(parcela_numero IS NOT NULL AND parcela_total IS NOT NULL "
            "AND parcela_numero >= 1 AND parcela_total >= parcela_numero)",
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("transacoes_importadas", schema=None) as batch_op:
        batch_op.drop_constraint(
            batch_op.f("ck_transacoes_importadas_parcela_valida"), type_="check"
        )
        batch_op.drop_constraint(
            batch_op.f("fk_transacoes_importadas_fatura_id_faturas"), type_="foreignkey"
        )
        batch_op.drop_index(batch_op.f("ix_transacoes_importadas_fatura_id"))
        batch_op.drop_column("parcela_total")
        batch_op.drop_column("parcela_numero")
        batch_op.drop_column("id_externo_da_fatura")
        batch_op.drop_column("fatura_id")

    op.drop_table("pagamentos_de_fatura")
    with op.batch_alter_table("faturas", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_faturas_conta_id"))

    op.drop_table("faturas")
