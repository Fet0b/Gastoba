"""Registra transferências próprias sem inferir papéis de contas existentes."""

import sqlalchemy as sa
from alembic import op

revision = "d5e9f3a72b01"
down_revision = "c4d8e2f61a90"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("contas") as batch:
        batch.add_column(sa.Column("papel", sa.String(20), nullable=True))
    op.create_table(
        "transferencias_entre_contas",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("usuario_id", sa.Uuid(), sa.ForeignKey("usuarios.id"), nullable=False),
        sa.Column("conta_origem_id", sa.Uuid(), sa.ForeignKey("contas.id"), nullable=False),
        sa.Column("conta_destino_id", sa.Uuid(), sa.ForeignKey("contas.id"), nullable=False),
        sa.Column("valor_centavos", sa.BigInteger(), nullable=False),
        sa.Column("data", sa.Date(), nullable=False),
        sa.Column("papel_origem", sa.String(20), nullable=False),
        sa.Column("papel_destino", sa.String(20), nullable=False),
        sa.Column(
            "transacao_origem_id",
            sa.Uuid(),
            sa.ForeignKey("transacoes_importadas.id"),
            nullable=True,
        ),
        sa.Column(
            "transacao_destino_id",
            sa.Uuid(),
            sa.ForeignKey("transacoes_importadas.id"),
            nullable=True,
        ),
        sa.Column("competencia_provisoria", sa.Boolean(), nullable=False),
        sa.Column("ativa", sa.Boolean(), nullable=False),
        sa.CheckConstraint("valor_centavos > 0", name="valor_positivo"),
        sa.CheckConstraint("conta_origem_id <> conta_destino_id", name="contas_distintas"),
        sa.CheckConstraint(
            "transacao_origem_id IS NOT NULL OR transacao_destino_id IS NOT NULL", name="tem_ponta"
        ),
    )
    op.create_index(
        "ix_transferencias_entre_contas_usuario_id", "transferencias_entre_contas", ["usuario_id"]
    )
    op.create_table(
        "pontas_de_transferencias",
        sa.Column(
            "transacao_id", sa.Uuid(), sa.ForeignKey("transacoes_importadas.id"), primary_key=True
        ),
        sa.Column(
            "transferencia_id",
            sa.Uuid(),
            sa.ForeignKey("transferencias_entre_contas.id"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_pontas_de_transferencias_transferencia_id",
        "pontas_de_transferencias",
        ["transferencia_id"],
    )


def downgrade() -> None:
    op.drop_table("pontas_de_transferencias")
    op.drop_table("transferencias_entre_contas")
    with op.batch_alter_table("contas") as batch:
        batch.drop_column("papel")
