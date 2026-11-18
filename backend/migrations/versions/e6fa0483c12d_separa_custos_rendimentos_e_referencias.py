"""Separa custos/rendimentos e guarda referências observadas da caixinha."""

import sqlalchemy as sa
from alembic import op

revision = "e6fa0483c12d"
down_revision = "d5e9f3a72b01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("movimentos_de_investimento") as batch:
        batch.drop_constraint(op.f("ck_movimentos_de_investimento_tipo_valido"), type_="check")
        batch.create_check_constraint(
            "tipo_valido", "tipo IN ('aporte', 'resgate', 'rendimento', 'custo', 'imposto')"
        )
        batch.add_column(
            sa.Column(
                "revisao_contabil_pendente", sa.Boolean(), nullable=False, server_default=sa.false()
            )
        )
        batch.add_column(sa.Column("movimento_relacionado_id", sa.Uuid(), nullable=True))
        batch.create_foreign_key(
            "fk_movimentos_de_investimento_movimento_relacionado_id_movimentos_de_investimento",
            "movimentos_de_investimento",
            ["movimento_relacionado_id"],
            ["id"],
        )
        batch.create_index(
            "ix_movimentos_de_investimento_movimento_relacionado_id", ["movimento_relacionado_id"]
        )
    op.execute(
        sa.text(
            "UPDATE movimentos_de_investimento SET revisao_contabil_pendente = 1 "
            "WHERE origem <> 'saldo_inicial'"
        )
    )
    op.create_table(
        "referencias_mensais_de_caixinhas",
        sa.Column(
            "investimento_id", sa.Uuid(), sa.ForeignKey("investimentos.id"), primary_key=True
        ),
        sa.Column("mes", sa.String(7), primary_key=True),
        sa.Column("saldo_inicial_centavos", sa.BigInteger(), nullable=False),
        sa.Column("saldo_final_centavos", sa.BigInteger(), nullable=False),
        sa.Column("periodo_completo", sa.Boolean(), nullable=False),
        sa.CheckConstraint(
            "saldo_inicial_centavos >= 0 AND saldo_final_centavos >= 0", name="saldos_nao_negativos"
        ),
    )


def downgrade() -> None:
    quantidade = (
        op.get_bind()
        .execute(
            sa.text(
                "SELECT count(*) FROM movimentos_de_investimento "
                "WHERE tipo NOT IN ('aporte', 'resgate')"
            )
        )
        .scalar_one()
    )
    if quantidade:
        raise RuntimeError(
            "Reverta os novos tipos de movimento antes do downgrade; "
            "dados financeiros não serão apagados."
        )
    op.drop_table("referencias_mensais_de_caixinhas")
    with op.batch_alter_table("movimentos_de_investimento") as batch:
        batch.drop_index("ix_movimentos_de_investimento_movimento_relacionado_id")
        batch.drop_constraint(
            "fk_movimentos_de_investimento_movimento_relacionado_id_movimentos_de_investimento",
            type_="foreignkey",
        )
        batch.drop_column("movimento_relacionado_id")
        batch.drop_column("revisao_contabil_pendente")
        batch.drop_constraint(op.f("ck_movimentos_de_investimento_tipo_valido"), type_="check")
        batch.create_check_constraint("tipo_valido", "tipo IN ('aporte', 'resgate')")
