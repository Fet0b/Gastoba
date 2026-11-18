"""Tratamento lógico e reversível de aportes sem investimento: só uma tabela nova e vazia.

``movimentos_de_investimento`` não é alterada; o aporte só sai dos totais depois de aprovado.
"""

import sqlalchemy as sa
from alembic import op

revision = "b60000000002"
down_revision = "b60000000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tratamentos_de_aporte",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("movimento_id", sa.Uuid(), nullable=False),
        sa.Column("acao", sa.String(length=10), nullable=False),
        sa.Column("mesclado_em_id", sa.Uuid(), nullable=True),
        sa.Column("valores_originais", sa.Text(), nullable=False),
        sa.Column("criado_em", sa.DateTime(), nullable=False),
        sa.Column("aprovado_em", sa.DateTime(), nullable=True),
        sa.Column("desfeito_em", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tratamentos_de_aporte")),
        sa.ForeignKeyConstraint(
            ["movimento_id"],
            ["movimentos_de_investimento.id"],
            ondelete="RESTRICT",
            name=op.f("fk_tratamentos_de_aporte_movimento_id_movimentos_de_investimento"),
        ),
        sa.ForeignKeyConstraint(
            ["mesclado_em_id"],
            ["movimentos_de_investimento.id"],
            ondelete="RESTRICT",
            name=op.f("fk_tratamentos_de_aporte_mesclado_em_id_movimentos_de_investimento"),
        ),
        sa.CheckConstraint(
            "acao IN ('mesclado','excluido')", name=op.f("ck_tratamentos_de_aporte_acao_valida")
        ),
        sa.CheckConstraint(
            "(acao = 'mesclado' AND mesclado_em_id IS NOT NULL "
            "AND mesclado_em_id != movimento_id) OR (acao = 'excluido' AND mesclado_em_id IS NULL)",
            name=op.f("ck_tratamentos_de_aporte_mescla_coerente"),
        ),
    )
    # Um aporte tem no máximo um tratamento ativo (desfeito_em nulo).
    op.create_index(
        "uq_tratamentos_de_aporte_ativo",
        "tratamentos_de_aporte",
        ["movimento_id"],
        unique=True,
        sqlite_where=sa.text("desfeito_em IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_tratamentos_de_aporte_ativo", table_name="tratamentos_de_aporte")
    op.drop_table("tratamentos_de_aporte")
