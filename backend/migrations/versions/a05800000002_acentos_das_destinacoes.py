"""Corrige nomes de destinações preservando suas identidades e relações."""

import sqlalchemy as sa
from alembic import op

revision = "a05800000002"
down_revision = "a05800000001"
branch_labels = None
depends_on = None
CORRECOES = {"patrimonio": "patrimônio", "reserva de emergencia": "reserva de emergência"}


def upgrade() -> None:
    conexao = op.get_bind()
    linhas = conexao.execute(
        sa.text("SELECT id, usuario_id, nome FROM destinacoes_cadastradas")
    ).all()
    alteracoes = [
        (r.id, r.usuario_id, CORRECOES[r.nome.lower()])
        for r in linhas
        if r.nome.lower() in CORRECOES
    ]
    for id_, dono, nome in alteracoes:
        if any(r.usuario_id == dono and r.id != id_ and r.nome.lower() == nome for r in linhas):
            raise RuntimeError(
                "Há destinações com nomes equivalentes; revise antes de corrigir acentos."
            )
    for id_, _, nome in alteracoes:
        conexao.execute(
            sa.text("UPDATE destinacoes_cadastradas SET nome=:nome WHERE id=:id"),
            {"nome": nome, "id": id_},
        )


def downgrade() -> None:
    # Não é possível distinguir nomes já corretos antes do upgrade; não retirar acentos.
    pass
