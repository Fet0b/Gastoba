"""Acrescenta ``destinacoes.principal_centavos`` para o resgate por custo médio.

``valor_centavos`` continua sendo o dinheiro da parte; ``principal_centavos`` guarda o principal
abatido e só é preenchido nos resgates novos (nulo = o principal é o próprio valor). Sem backfill.
O downgrade remove a coluna e a regra.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a7c3e5f19d24"
down_revision: str | Sequence[str] | None = "b6d1f4a82c35"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NOME = "ck_destinacoes_principal_do_mesmo_sinal"
CONDICAO = (
    "principal_centavos IS NULL OR "
    "(principal_centavos <> 0 AND (principal_centavos > 0) = (valor_centavos > 0))"
)


def upgrade() -> None:
    with op.batch_alter_table("destinacoes") as lote:
        lote.add_column(sa.Column("principal_centavos", sa.BigInteger(), nullable=True))
        lote.create_check_constraint(op.f(NOME), CONDICAO)


def downgrade() -> None:
    with op.batch_alter_table("destinacoes") as lote:
        lote.drop_constraint(op.f(NOME), type_="check")
        lote.drop_column("principal_centavos")
