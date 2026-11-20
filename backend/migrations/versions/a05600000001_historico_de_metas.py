"""Histórico de alterações efetivas de metas, inicialmente vazio."""

import sqlalchemy as sa
from alembic import op

revision = "a05600000001"
down_revision = "f70b1594d23e"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "historico_de_metas",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "usuario_id",
            sa.Uuid(),
            sa.ForeignKey("usuarios.id", name=op.f("fk_historico_de_metas_usuario_id_usuarios")),
            nullable=False,
        ),
        sa.Column("categoria", sa.String(30), nullable=False),
        sa.Column("percentual_anterior", sa.Integer(), nullable=True),
        sa.Column("percentual_novo", sa.Integer(), nullable=True),
        sa.Column("acao", sa.String(10), nullable=False),
        sa.Column("instante", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "acao IN ('criada','alterada','removida')",
            name=op.f("ck_historico_de_metas_acao_valida"),
        ),
        sa.CheckConstraint(
            "(acao = 'criada' AND percentual_anterior IS NULL AND percentual_novo IS NOT "
            "NULL) OR (acao = 'alterada' AND percentual_anterior IS NOT NULL AND "
            "percentual_novo IS NOT NULL AND percentual_anterior != percentual_novo) OR "
            "(acao = 'removida' AND percentual_anterior IS NOT NULL AND percentual_novo "
            "IS NULL)",
            name=op.f("ck_historico_de_metas_acao_coerente"),
        ),
        sa.CheckConstraint(
            "percentual_anterior IS NULL OR percentual_anterior BETWEEN 1 AND 100",
            name=op.f("ck_historico_de_metas_anterior_valido"),
        ),
        sa.CheckConstraint(
            "percentual_novo IS NULL OR percentual_novo BETWEEN 1 AND 100",
            name=op.f("ck_historico_de_metas_novo_valido"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_historico_de_metas")),
    )
    op.create_index(
        "ix_historico_de_metas_usuario_id_instante",
        "historico_de_metas",
        ["usuario_id", "instante"],
    )


def downgrade():
    op.drop_table("historico_de_metas")
