"""Separa alvos das metas e prepara revisão, cobertura e cores.

Downgrade perde categorias dos aportes, marca de revisão, coberturas e cores.
Não desfaz as revisões de categoria em gastos ou recorrências.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "9f4b2c7d6a10"
down_revision: str | Sequence[str] | None = "8c3d9e1a6b20"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("movimentos_de_investimento") as lote:
        lote.add_column(sa.Column("categoria", sa.String(30), nullable=True))
        lote.add_column(
            sa.Column("revisao_pendente", sa.Boolean(), nullable=False, server_default=sa.false())
        )
    op.execute(
        "UPDATE movimentos_de_investimento SET revisao_pendente = 1 WHERE tipo = "
        "'aporte' AND origem <> 'saldo_inicial'"
    )
    op.execute(
        "UPDATE metas SET categoria = 'liberdade_financeira' WHERE categoria = 'investimentos'"
    )
    op.create_table(
        "coberturas_de_compra",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("gasto_id", sa.Uuid(), nullable=False),
        sa.Column("tag", sa.String(30), nullable=False),
        sa.Column("valor_centavos", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(
            ["gasto_id"], ["gastos.id"], name="fk_coberturas_de_compra_gasto_id_gastos"
        ),
        sa.CheckConstraint(
            "valor_centavos > 0", name=op.f("ck_coberturas_de_compra_valor_positivo")
        ),
        sa.UniqueConstraint("gasto_id", "tag", name="uq_coberturas_de_compra_gasto_id_tag"),
    )
    op.create_index("ix_coberturas_de_compra_gasto_id", "coberturas_de_compra", ["gasto_id"])
    op.create_table(
        "cores_das_destinacoes",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("usuario_id", sa.Uuid(), nullable=False),
        sa.Column("tag", sa.String(30), nullable=False),
        sa.Column("cor", sa.String(20), nullable=False),
        sa.ForeignKeyConstraint(
            ["usuario_id"], ["usuarios.id"], name="fk_cores_das_destinacoes_usuario_id_usuarios"
        ),
        sa.UniqueConstraint("usuario_id", "tag", name="uq_cores_das_destinacoes_usuario_id_tag"),
    )


def downgrade() -> None:
    op.drop_table("cores_das_destinacoes")
    op.drop_index("ix_coberturas_de_compra_gasto_id", table_name="coberturas_de_compra")
    op.drop_table("coberturas_de_compra")
    op.execute(
        "UPDATE metas SET categoria = 'investimentos' WHERE categoria = 'liberdade_financeira'"
    )
    with op.batch_alter_table("movimentos_de_investimento") as lote:
        lote.drop_column("revisao_pendente")
        lote.drop_column("categoria")
