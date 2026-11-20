"""Cria ``mudancas_de_fracao``: o registro datado das mudanças de fração das caixinhas (072).

Só cria a tabela: sem backfill (as alocações e realocações anteriores não têm data a recuperar) e
sem tocar em dado existente. Os pesos atuais continuam em ``alocacoes_de_caixinha``. O downgrade
remove só a tabela (perde o histórico de mudanças; os pesos ficam).
"""

import sqlalchemy as sa
from alembic import op

revision = "f72000000001"
down_revision = "f68000000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mudancas_de_fracao",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("posicao_id", sa.Uuid(), nullable=False),
        sa.Column("data", sa.Date(), nullable=False),
        sa.Column("destinacao_destino_id", sa.Uuid(), nullable=False),
        sa.Column("destinacao_origem_id", sa.Uuid(), nullable=True),
        sa.Column("valor_centavos", sa.BigInteger(), nullable=False),
        sa.Column("criada_em", sa.DateTime(), nullable=False),
        sa.CheckConstraint("valor_centavos > 0", name=op.f("ck_mudancas_de_fracao_valor_positivo")),
        sa.CheckConstraint(
            "destinacao_origem_id IS NULL OR destinacao_origem_id <> destinacao_destino_id",
            name=op.f("ck_mudancas_de_fracao_origem_diferente_do_destino"),
        ),
        sa.ForeignKeyConstraint(
            ["posicao_id"],
            ["posicoes_de_investimento.investimento_id"],
            ondelete="RESTRICT",
            name=op.f("fk_mudancas_de_fracao_posicao_id_posicoes_de_investimento"),
        ),
        sa.ForeignKeyConstraint(
            ["destinacao_destino_id"],
            ["destinacoes_cadastradas.id"],
            ondelete="RESTRICT",
            name=op.f("fk_mudancas_de_fracao_destinacao_destino_id_destinacoes_cadastradas"),
        ),
        sa.ForeignKeyConstraint(
            ["destinacao_origem_id"],
            ["destinacoes_cadastradas.id"],
            ondelete="RESTRICT",
            name=op.f("fk_mudancas_de_fracao_destinacao_origem_id_destinacoes_cadastradas"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_mudancas_de_fracao")),
    )
    op.create_index(
        "ix_mudancas_de_fracao_posicao_id_data",
        "mudancas_de_fracao",
        ["posicao_id", "data"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_mudancas_de_fracao_posicao_id_data", table_name="mudancas_de_fracao")
    op.drop_table("mudancas_de_fracao")
