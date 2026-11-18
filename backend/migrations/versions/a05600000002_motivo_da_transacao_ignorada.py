"""Motivo opcional de descarte; ALTER aditivo preserva todas as triggers.

Checks na própria coluna permitem removê-la sem reconstruir a tabela SQLite.
"""

import sqlalchemy as sa
from alembic import op

revision = "a05600000002"
down_revision = "a05600000001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "transacoes_importadas",
        sa.Column(
            "motivo_ignorada",
            sa.String(40),
            sa.CheckConstraint(
                "motivo_ignorada IS NULL OR motivo_ignorada = 'transferencia_entre_contas'",
                name=op.f("ck_transacoes_importadas_motivo_ignorada_valido"),
            ),
            sa.CheckConstraint(
                "motivo_ignorada IS NULL OR estado = 'ignorada'",
                name=op.f("ck_transacoes_importadas_motivo_coerente"),
            ),
            nullable=True,
        ),
    )


def downgrade():
    op.drop_column("transacoes_importadas", "motivo_ignorada")
