"""Acrescenta à conta o apelido, o nome no banco e o final do número (068).

Só acrescenta três colunas nulas, os dois CHECKs e a unicidade do apelido por pessoa; nenhum dado é
escrito (sem backfill: a próxima sincronização preenche o nome no banco e o final). Só os quatro
últimos dígitos do número são guardados, nunca o número inteiro.

As colunas entram por ``ALTER TABLE ... ADD COLUMN`` e a unicidade por índice único, sem recriar a
tabela ``contas`` (modo batch): recriá-la apagaria os gatilhos ``integridade_*`` e a visão
``pontas_de_transferencias``, que dependem dela. NULLs não colidem no índice único. O downgrade
remove só isso.
"""

import sqlalchemy as sa
from alembic import op

revision = "f68000000001"
down_revision = "f71000000001"
branch_labels = None
depends_on = None

INDICE = "uq_contas_usuario_id_apelido"


def upgrade() -> None:
    op.execute(
        "ALTER TABLE contas ADD COLUMN apelido VARCHAR(40) "
        "CONSTRAINT ck_contas_apelido_valido "
        "CHECK (apelido IS NULL OR length(trim(apelido)) BETWEEN 1 AND 40)"
    )
    op.execute("ALTER TABLE contas ADD COLUMN nome_no_banco VARCHAR(100)")
    op.execute(
        "ALTER TABLE contas ADD COLUMN final_do_numero VARCHAR(4) "
        "CONSTRAINT ck_contas_final_do_numero_valido "
        "CHECK (final_do_numero IS NULL OR final_do_numero GLOB '[0-9][0-9][0-9][0-9]')"
    )
    op.create_index(INDICE, "contas", ["usuario_id", "apelido"], unique=True)


def downgrade() -> None:
    op.drop_index(INDICE, table_name="contas")
    bind = op.get_bind()
    for coluna in ("final_do_numero", "nome_no_banco", "apelido"):
        bind.execute(sa.text(f"ALTER TABLE contas DROP COLUMN {coluna}"))
