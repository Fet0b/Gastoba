"""Renomeia somente o prefixo das posições de conta geradas, sem alterar relações."""

import sqlalchemy as sa
from alembic import op

revision = "a05800000001"
down_revision = "31c8da2c974b"
branch_labels = None
depends_on = None


def _renomear(anterior: str, novo: str) -> None:
    op.get_bind().execute(
        sa.text(
            "UPDATE investimentos SET nome = :novo || substr(nome, :inicio) "
            "WHERE tipo = 'CAIXINHA' AND conta_remunerada_id IS NOT NULL "
            "AND substr(nome, 1, :tamanho) = :anterior"
        ),
        {"novo": novo, "inicio": len(anterior) + 1, "tamanho": len(anterior), "anterior": anterior},
    )


def upgrade() -> None:
    _renomear("Conta remunerada", "Conta investimentos")


def downgrade() -> None:
    _renomear("Conta investimentos", "Conta remunerada")
