"""Operações, alocações de caixinha e casamentos: só tabelas novas e vazias.

Nada existente é alterado; o downgrade remove apenas o que esta migration criou.
"""

import sqlalchemy as sa
from alembic import op

revision = "b60000000001"
down_revision = "a05800000003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "posicoes_de_investimento",
        sa.Column("investimento_id", sa.Uuid(), nullable=False),
        sa.Column("quantidade_observada", sa.String(length=40), nullable=True),
        sa.Column("valor_de_mercado_centavos", sa.BigInteger(), nullable=True),
        sa.Column("atualizada_em", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("investimento_id", name=op.f("pk_posicoes_de_investimento")),
        sa.ForeignKeyConstraint(
            ["investimento_id"],
            ["investimentos.id"],
            ondelete="RESTRICT",
            name=op.f("fk_posicoes_de_investimento_investimento_id_investimentos"),
        ),
    )
    op.create_table(
        "operacoes_de_investimento",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("posicao_id", sa.Uuid(), nullable=False),
        sa.Column("tipo", sa.String(length=12), nullable=False),
        sa.Column("data", sa.Date(), nullable=False),
        sa.Column("quantidade", sa.String(length=40), nullable=False),
        sa.Column("valor_bruto_centavos", sa.BigInteger(), nullable=False),
        sa.Column("custos_centavos", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("origem", sa.String(length=10), nullable=False),
        sa.Column("id_externo", sa.String(length=120), nullable=True),
        sa.Column("operacao_relacionada_id", sa.Uuid(), nullable=True),
        sa.Column("quantidade_estimada", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_operacoes_de_investimento")),
        sa.ForeignKeyConstraint(
            ["posicao_id"],
            ["posicoes_de_investimento.investimento_id"],
            ondelete="RESTRICT",
            name=op.f("fk_operacoes_de_investimento_posicao_id_posicoes_de_investimento"),
        ),
        sa.ForeignKeyConstraint(
            ["operacao_relacionada_id"],
            ["operacoes_de_investimento.id"],
            ondelete="RESTRICT",
            name=op.f(
                "fk_operacoes_de_investimento_operacao_relacionada_id_operacoes_de_investimento"
            ),
        ),
        sa.UniqueConstraint(
            "posicao_id",
            "id_externo",
            name=op.f("uq_operacoes_de_investimento_posicao_id_id_externo"),
        ),
        sa.CheckConstraint(
            "valor_bruto_centavos >= 0",
            name=op.f("ck_operacoes_de_investimento_valor_nao_negativo"),
        ),
        sa.CheckConstraint(
            "custos_centavos >= 0", name=op.f("ck_operacoes_de_investimento_custos_nao_negativos")
        ),
        sa.CheckConstraint(
            "quantidade NOT LIKE '-%'",
            name=op.f("ck_operacoes_de_investimento_quantidade_nao_negativa"),
        ),
        sa.CheckConstraint(
            "tipo IN ('COMPRA','VENDA','PROVENTO','TAXA','IMPOSTO','VENCIMENTO','ABERTURA')",
            name=op.f("ck_operacoes_de_investimento_tipo_valido"),
        ),
        sa.CheckConstraint(
            "origem IN ('pluggy','manual','abertura')",
            name=op.f("ck_operacoes_de_investimento_origem_valida"),
        ),
        sa.CheckConstraint(
            "tipo != 'ABERTURA' OR id_externo IS NULL",
            name=op.f("ck_operacoes_de_investimento_abertura_sem_id_externo"),
        ),
    )
    op.create_table(
        "alocacoes_de_caixinha",
        sa.Column("posicao_id", sa.Uuid(), nullable=False),
        sa.Column("destinacao_id", sa.Uuid(), nullable=False),
        sa.Column("peso_centavos", sa.BigInteger(), nullable=False),
        sa.PrimaryKeyConstraint(
            "posicao_id", "destinacao_id", name=op.f("pk_alocacoes_de_caixinha")
        ),
        sa.ForeignKeyConstraint(
            ["posicao_id"],
            ["posicoes_de_investimento.investimento_id"],
            ondelete="RESTRICT",
            name=op.f("fk_alocacoes_de_caixinha_posicao_id_posicoes_de_investimento"),
        ),
        sa.ForeignKeyConstraint(
            ["destinacao_id"],
            ["destinacoes_cadastradas.id"],
            ondelete="RESTRICT",
            name=op.f("fk_alocacoes_de_caixinha_destinacao_id_destinacoes_cadastradas"),
        ),
        sa.CheckConstraint(
            "peso_centavos > 0", name=op.f("ck_alocacoes_de_caixinha_peso_positivo")
        ),
    )
    op.create_table(
        "casamentos_de_operacao",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("operacao_id", sa.Uuid(), nullable=False),
        sa.Column("estado", sa.String(length=12), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_casamentos_de_operacao")),
        sa.ForeignKeyConstraint(
            ["operacao_id"],
            ["operacoes_de_investimento.id"],
            ondelete="RESTRICT",
            name=op.f("fk_casamentos_de_operacao_operacao_id_operacoes_de_investimento"),
        ),
        sa.UniqueConstraint("operacao_id", name=op.f("uq_casamentos_de_operacao_operacao_id")),
        sa.CheckConstraint(
            "estado IN ('sugerido','confirmado')",
            name=op.f("ck_casamentos_de_operacao_estado_valido"),
        ),
    )
    op.create_table(
        "vinculos_de_casamento",
        sa.Column("casamento_id", sa.Uuid(), nullable=False),
        sa.Column("transacao_importada_id", sa.Uuid(), nullable=False),
        sa.Column("papel", sa.String(length=8), nullable=False),
        sa.PrimaryKeyConstraint(
            "casamento_id", "transacao_importada_id", name=op.f("pk_vinculos_de_casamento")
        ),
        sa.ForeignKeyConstraint(
            ["casamento_id"],
            ["casamentos_de_operacao.id"],
            ondelete="RESTRICT",
            name=op.f("fk_vinculos_de_casamento_casamento_id_casamentos_de_operacao"),
        ),
        sa.ForeignKeyConstraint(
            ["transacao_importada_id"],
            ["transacoes_importadas.id"],
            ondelete="RESTRICT",
            name=op.f("fk_vinculos_de_casamento_transacao_importada_id_transacoes_importadas"),
        ),
        sa.UniqueConstraint(
            "transacao_importada_id", name=op.f("uq_vinculos_de_casamento_transacao_importada_id")
        ),
        sa.CheckConstraint(
            "papel IN ('bruto','taxa','imposto')",
            name=op.f("ck_vinculos_de_casamento_papel_valido"),
        ),
    )


def downgrade() -> None:
    op.drop_table("vinculos_de_casamento")
    op.drop_table("casamentos_de_operacao")
    op.drop_table("alocacoes_de_caixinha")
    op.drop_table("operacoes_de_investimento")
    op.drop_table("posicoes_de_investimento")
