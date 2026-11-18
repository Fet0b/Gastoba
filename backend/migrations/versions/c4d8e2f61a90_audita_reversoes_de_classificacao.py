"""Audita reversões sem modificar classificações existentes."""

import sqlalchemy as sa
from alembic import op

revision = "c4d8e2f61a90"
down_revision = "b3e9d1a74c58"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reversoes_de_classificacao",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("usuario_id", sa.Uuid(), sa.ForeignKey("usuarios.id"), nullable=False),
        sa.Column(
            "transacao_id", sa.Uuid(), sa.ForeignKey("transacoes_importadas.id"), nullable=False
        ),
        sa.Column("estado_anterior", sa.String(10), nullable=False),
        sa.Column("instante", sa.DateTime(), nullable=False),
        sa.Column("lancamentos", sa.JSON(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("reversoes_de_classificacao")
