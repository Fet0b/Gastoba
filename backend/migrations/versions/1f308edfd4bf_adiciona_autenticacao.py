"""adiciona autenticacao: email e senha dos usuarios, sessoes e chaves de api

Revision ID: 1f308edfd4bf
Revises: ab2e8cee8c19
Create Date: 2026-10-10 21:57:13.452031

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "1f308edfd4bf"
down_revision: str | Sequence[str] | None = "ab2e8cee8c19"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Nulos: o usuário padrão herdado não tem e-mail nem senha.
    with op.batch_alter_table("usuarios", schema=None) as batch_op:
        batch_op.add_column(sa.Column("email", sa.String(length=254), nullable=True))
        batch_op.add_column(sa.Column("senha_hash", sa.String(length=255), nullable=True))
        batch_op.create_unique_constraint(batch_op.f("uq_usuarios_email"), ["email"])

    # Instantes como DateTime sem fuso: o modelo (InstanteUtc) grava e lê sempre em UTC.
    op.create_table(
        "sessoes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("usuario_id", sa.Uuid(), nullable=False),
        sa.Column("hash_do_segredo", sa.String(length=64), nullable=False),
        sa.Column("criada_em", sa.DateTime(), nullable=False),
        sa.Column("expira_em", sa.DateTime(), nullable=False),
        sa.Column("revogada", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(
            ["usuario_id"], ["usuarios.id"], name=op.f("fk_sessoes_usuario_id_usuarios")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sessoes")),
    )
    with op.batch_alter_table("sessoes", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_sessoes_hash_do_segredo"), ["hash_do_segredo"], unique=True
        )
        batch_op.create_index(batch_op.f("ix_sessoes_usuario_id"), ["usuario_id"], unique=False)

    op.create_table(
        "chaves_de_api",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("usuario_id", sa.Uuid(), nullable=False),
        sa.Column("nome", sa.String(length=60), nullable=False),
        sa.Column("prefixo", sa.String(length=8), nullable=False),
        sa.Column("hash_do_segredo", sa.String(length=64), nullable=False),
        sa.Column("escopo", sa.String(length=20), nullable=False),
        sa.Column("criada_em", sa.DateTime(), nullable=False),
        sa.Column("ultimo_uso", sa.DateTime(), nullable=True),
        sa.Column("expira_em", sa.DateTime(), nullable=True),
        sa.Column("revogada", sa.Boolean(), nullable=False),
        sa.CheckConstraint(
            "escopo IN ('leitura', 'escrita')", name=op.f("ck_chaves_de_api_escopo_valido")
        ),
        sa.CheckConstraint(
            "length(trim(nome)) >= 1 AND length(nome) <= 60",
            name=op.f("ck_chaves_de_api_nome_valido"),
        ),
        sa.ForeignKeyConstraint(
            ["usuario_id"], ["usuarios.id"], name=op.f("fk_chaves_de_api_usuario_id_usuarios")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_chaves_de_api")),
    )
    with op.batch_alter_table("chaves_de_api", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_chaves_de_api_hash_do_segredo"), ["hash_do_segredo"], unique=True
        )
        batch_op.create_index(
            batch_op.f("ix_chaves_de_api_usuario_id"), ["usuario_id"], unique=False
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("chaves_de_api", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_chaves_de_api_usuario_id"))
        batch_op.drop_index(batch_op.f("ix_chaves_de_api_hash_do_segredo"))
    op.drop_table("chaves_de_api")

    with op.batch_alter_table("sessoes", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_sessoes_usuario_id"))
        batch_op.drop_index(batch_op.f("ix_sessoes_hash_do_segredo"))
    op.drop_table("sessoes")

    with op.batch_alter_table("usuarios", schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f("uq_usuarios_email"), type_="unique")
        batch_op.drop_column("senha_hash")
        batch_op.drop_column("email")
