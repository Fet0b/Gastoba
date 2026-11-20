"""Cria as tabelas do guardado nas metas: ``preferencias_do_orcamento`` e ``caixinhas_marcadas``.

Só cria as duas tabelas: sem backfill e sem tocar em dado existente. O downgrade remove só elas.
"""

import sqlalchemy as sa
from alembic import op

revision = "e66000000001"
down_revision = "d65000000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "preferencias_do_orcamento",
        sa.Column("usuario_id", sa.Uuid(), nullable=False),
        sa.Column("guardado_nas_metas", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(
            ["usuario_id"],
            ["usuarios.id"],
            ondelete="CASCADE",
            name=op.f("fk_preferencias_do_orcamento_usuario_id_usuarios"),
        ),
        sa.PrimaryKeyConstraint("usuario_id", name=op.f("pk_preferencias_do_orcamento")),
    )
    op.create_table(
        "caixinhas_marcadas",
        sa.Column("destinacao_id", sa.Uuid(), nullable=False),
        sa.Column("categoria", sa.String(length=30), nullable=False),
        sa.ForeignKeyConstraint(
            ["destinacao_id"],
            ["destinacoes_cadastradas.id"],
            ondelete="CASCADE",
            name=op.f("fk_caixinhas_marcadas_destinacao_id_destinacoes_cadastradas"),
        ),
        sa.PrimaryKeyConstraint("destinacao_id", name=op.f("pk_caixinhas_marcadas")),
    )


def downgrade() -> None:
    op.drop_table("caixinhas_marcadas")
    op.drop_table("preferencias_do_orcamento")
