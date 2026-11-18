"""Um casamento passa a ligar várias operações (o débito do pregão paga várias compras).

Cria ``operacoes_do_casamento``, copia o par (casamento, operação) de cada casamento existente e
remove ``casamentos_de_operacao.operacao_id``. O downgrade recria a coluna com a operação de menor
id e recusa, sem alterar nada, se algum casamento tiver mais de uma operação.
"""

import sqlalchemy as sa
from alembic import op

revision = "c61000000001"
down_revision = "b60000000002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "operacoes_do_casamento",
        sa.Column("casamento_id", sa.Uuid(), nullable=False),
        sa.Column("operacao_id", sa.Uuid(), nullable=False),
        sa.PrimaryKeyConstraint(
            "casamento_id", "operacao_id", name=op.f("pk_operacoes_do_casamento")
        ),
        sa.ForeignKeyConstraint(
            ["casamento_id"],
            ["casamentos_de_operacao.id"],
            ondelete="RESTRICT",
            name=op.f("fk_operacoes_do_casamento_casamento_id_casamentos_de_operacao"),
        ),
        sa.ForeignKeyConstraint(
            ["operacao_id"],
            ["operacoes_de_investimento.id"],
            ondelete="RESTRICT",
            name=op.f("fk_operacoes_do_casamento_operacao_id_operacoes_de_investimento"),
        ),
        sa.UniqueConstraint("operacao_id", name=op.f("uq_operacoes_do_casamento_operacao_id")),
    )
    op.execute(
        "INSERT INTO operacoes_do_casamento (casamento_id, operacao_id) "
        "SELECT id, operacao_id FROM casamentos_de_operacao"
    )
    with op.batch_alter_table("casamentos_de_operacao") as lote:
        lote.drop_constraint("uq_casamentos_de_operacao_operacao_id", type_="unique")
        lote.drop_constraint(
            "fk_casamentos_de_operacao_operacao_id_operacoes_de_investimento", type_="foreignkey"
        )
        lote.drop_column("operacao_id")


def downgrade() -> None:
    ligacao = op.get_bind()
    com_varias = ligacao.execute(
        sa.text(
            "SELECT count(*) FROM (SELECT casamento_id FROM operacoes_do_casamento "
            "GROUP BY casamento_id HAVING count(*) > 1)"
        )
    ).scalar()
    if com_varias:
        raise RuntimeError(
            f"{com_varias} casamento(s) ligam mais de uma operação; desfaça-os antes de descer."
        )
    with op.batch_alter_table("casamentos_de_operacao") as lote:
        lote.add_column(sa.Column("operacao_id", sa.Uuid(), nullable=True))
    op.execute(
        "UPDATE casamentos_de_operacao SET operacao_id = ("
        "SELECT min(operacao_id) FROM operacoes_do_casamento "
        "WHERE casamento_id = casamentos_de_operacao.id)"
    )
    with op.batch_alter_table("casamentos_de_operacao") as lote:
        lote.alter_column("operacao_id", existing_type=sa.Uuid(), nullable=False)
        lote.create_foreign_key(
            "fk_casamentos_de_operacao_operacao_id_operacoes_de_investimento",
            "operacoes_de_investimento",
            ["operacao_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        lote.create_unique_constraint("uq_casamentos_de_operacao_operacao_id", ["operacao_id"])
    op.drop_table("operacoes_do_casamento")
