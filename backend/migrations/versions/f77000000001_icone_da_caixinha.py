"""Acrescenta `destinacoes_cadastradas.icone` (077): ícone escolhido para a caixinha.

Aditiva: coluna de texto curto, nula (nula = ícone padrão, o cofre), sem `CHECK` (a lista de
códigos é do domínio, como `gastos.categoria`) e sem backfill. O downgrade remove só a coluna.
"""

import sqlalchemy as sa
from alembic import op

revision = "f77000000001"
down_revision = "f72000000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("destinacoes_cadastradas", sa.Column("icone", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("destinacoes_cadastradas", "icone")
