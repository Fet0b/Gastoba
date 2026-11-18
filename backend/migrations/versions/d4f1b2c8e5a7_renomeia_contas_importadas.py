"""renomeia contas importadas que exibem parte do id externo

Revision ID: d4f1b2c8e5a7
Revises: c3e7a1d94b20
Create Date: 2026-10-22 13:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d4f1b2c8e5a7"
down_revision: str | Sequence[str] | None = "c3e7a1d94b20"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TAMANHO_DO_TRECHO = 6


def upgrade() -> None:
    """Troca ``Nome (a1b2c3)`` por ``Nome (2)``, ``Nome (3)``... nas contas importadas.

    Só muda a conta cujo sufixo é o começo do próprio ``id_externo``: era o que a sincronização
    antiga gerava. Qualquer outro nome, inclusive de conta manual, fica como está.
    """
    conexao = op.get_bind()
    contas = conexao.execute(
        sa.text(
            "SELECT id, usuario_id, nome, id_externo FROM contas "
            "WHERE origem = 'open_finance' AND id_externo IS NOT NULL ORDER BY id"
        )
    ).all()
    em_uso: dict[str, set[str]] = {}
    for _, usuario_id, nome, _ in conexao.execute(
        sa.text("SELECT id, usuario_id, nome, id_externo FROM contas")
    ):
        em_uso.setdefault(usuario_id, set()).add(nome)

    for id_, usuario_id, nome, id_externo in contas:
        sufixo = f" ({id_externo[:TAMANHO_DO_TRECHO]})"
        if len(id_externo) < TAMANHO_DO_TRECHO or not nome.endswith(sufixo):
            continue
        base = nome[: -len(sufixo)]
        numero = 2
        while f"{base} ({numero})" in em_uso[usuario_id]:
            numero += 1
        novo = f"{base} ({numero})"
        conexao.execute(
            sa.text("UPDATE contas SET nome = :nome WHERE id = :id"), {"nome": novo, "id": id_}
        )
        em_uso[usuario_id].discard(nome)
        em_uso[usuario_id].add(novo)


def downgrade() -> None:
    """Sem volta: o trecho do id externo não era um dado que valha restaurar."""
