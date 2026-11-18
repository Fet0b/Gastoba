"""adiciona movimentos de investimento

Revision ID: e5a2c9d07b31
Revises: d4f1b2c8e5a7
Create Date: 2026-10-22 15:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e5a2c9d07b31"
down_revision: str | Sequence[str] | None = "d4f1b2c8e5a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "movimentos_de_investimento",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("conta_id", sa.Uuid(), nullable=False),
        sa.Column("investimento_id", sa.Uuid(), nullable=True),
        sa.Column("tipo", sa.String(length=10), nullable=False),
        sa.Column("descricao", sa.String(length=200), nullable=False),
        sa.Column("valor_centavos", sa.BigInteger(), nullable=False),
        sa.Column("data", sa.Date(), nullable=False),
        sa.Column("origem", sa.String(length=20), nullable=False),
        sa.CheckConstraint(
            "tipo IN ('aporte', 'resgate')", name=op.f("ck_movimentos_de_investimento_tipo_valido")
        ),
        sa.CheckConstraint(
            "valor_centavos > 0", name=op.f("ck_movimentos_de_investimento_valor_positivo")
        ),
        sa.ForeignKeyConstraint(
            ["conta_id"], ["contas.id"], name=op.f("fk_movimentos_de_investimento_conta_id_contas")
        ),
        sa.ForeignKeyConstraint(
            ["investimento_id"],
            ["investimentos.id"],
            name=op.f("fk_movimentos_de_investimento_investimento_id_investimentos"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_movimentos_de_investimento")),
    )
    op.create_index(
        op.f("ix_movimentos_de_investimento_conta_id_data"),
        "movimentos_de_investimento",
        ["conta_id", "data"],
    )
    # Os gastos antigos da categoria "investimentos" passam a ser aportes (sem investimento
    # definido); os gerados por recorrência ficam, porque a geração os recriaria como gasto.
    op.execute(
        """
        INSERT INTO movimentos_de_investimento
            (id, conta_id, investimento_id, tipo, descricao, valor_centavos, data, origem)
        SELECT id, conta_id, NULL, 'aporte', descricao, valor_centavos, data, origem
        FROM gastos
        WHERE categoria = 'investimentos' AND recorrencia_id IS NULL
        """
    )
    op.execute("DELETE FROM gastos WHERE categoria = 'investimentos' AND recorrencia_id IS NULL")


def downgrade() -> None:
    """Downgrade schema."""
    # Os aportes voltam a ser gastos; as tags não existiam no aporte e não são recuperadas.
    op.execute(
        """
        INSERT INTO gastos
            (id, conta_id, descricao, valor_centavos, data, tags, categoria, origem)
        SELECT id, conta_id, descricao, valor_centavos, data, '[]', 'investimentos', origem
        FROM movimentos_de_investimento
        WHERE tipo = 'aporte'
        """
    )
    op.drop_index(
        op.f("ix_movimentos_de_investimento_conta_id_data"),
        table_name="movimentos_de_investimento",
    )
    op.drop_table("movimentos_de_investimento")
