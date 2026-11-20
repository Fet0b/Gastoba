"""Normaliza destinações e recorrências e fecha regras de integridade no esquema.

- ``destinacoes.investimento_id`` sai: o investimento é o do movimento (3FN).
- ``recorrencias.usuario_id`` sai: o dono é o da conta (3FN).
- ``destinacoes`` ganha ``UNIQUE(movimento_id, tag)``.
- CHECKs de domínio (``origem``, ``sentido``, ``estado``) e de regras da própria tabela.

A migration só altera o esquema, nunca valores de gastos, ganhos, contas ou saldos. Antes de
mexer em qualquer coisa ela confere os dados e, se houver um que viole as novas regras, para com
uma mensagem que diz a regra e quantas linhas a violam (sem valores, descrições nem
identificadores). O único dado que ela escreve é copiar o ``investimento_id`` das destinações
para o movimento que ainda não o tinha, para a informação não se perder com a coluna.

O downgrade recria as colunas e as preenche pelo movimento e pela conta; perde só as garantias
novas, nenhum dado.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b6d1f4a82c35"
down_revision: str | Sequence[str] | None = "9f4b2c7d6a10"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (regra, consulta que conta as linhas que a violam)
VERIFICACOES: list[tuple[str, str]] = [
    (
        "destinação cujo investimento difere do investimento do movimento",
        "SELECT COUNT(*) FROM destinacoes d JOIN movimentos_de_investimento m "
        "ON m.id = d.movimento_id "
        "WHERE m.investimento_id IS NOT NULL AND m.investimento_id <> d.investimento_id",
    ),
    (
        "movimento sem investimento cujas destinações apontam para mais de um investimento",
        "SELECT COUNT(*) FROM (SELECT d.movimento_id FROM destinacoes d "
        "JOIN movimentos_de_investimento m ON m.id = d.movimento_id "
        "WHERE m.investimento_id IS NULL GROUP BY d.movimento_id "
        "HAVING COUNT(DISTINCT d.investimento_id) > 1)",
    ),
    (
        "mesma tag repetida nas destinações de um movimento",
        "SELECT COUNT(*) FROM (SELECT 1 FROM destinacoes GROUP BY movimento_id, tag "
        "HAVING COUNT(*) > 1)",
    ),
    (
        "recorrência de uma conta que não existe",
        "SELECT COUNT(*) FROM recorrencias WHERE conta_id NOT IN (SELECT id FROM contas)",
    ),
    (
        "recorrência cujo usuario_id difere do dono da conta",
        "SELECT COUNT(*) FROM recorrencias r JOIN contas c ON c.id = r.conta_id "
        "WHERE r.usuario_id <> c.usuario_id",
    ),
    (
        "recorrência de gasto sem categoria ou de ganho com categoria",
        "SELECT COUNT(*) FROM recorrencias WHERE (tipo = 'gasto') <> (categoria IS NOT NULL)",
    ),
    (
        "movimento com conta nula fora do saldo inicial (ou saldo inicial com conta)",
        "SELECT COUNT(*) FROM movimentos_de_investimento "
        "WHERE (conta_id IS NULL) <> (origem = 'saldo_inicial')",
    ),
    (
        "saldo inicial sem investimento",
        "SELECT COUNT(*) FROM movimentos_de_investimento "
        "WHERE origem = 'saldo_inicial' AND investimento_id IS NULL "
        "AND NOT EXISTS (SELECT 1 FROM destinacoes d WHERE d.movimento_id = "
        "movimentos_de_investimento.id)",
    ),
    (
        "movimento com origem desconhecida",
        "SELECT COUNT(*) FROM movimentos_de_investimento "
        "WHERE origem NOT IN ('manual', 'open_finance', 'saldo_inicial')",
    ),
    (
        "realocação com a mesma tag na origem e no destino",
        "SELECT COUNT(*) FROM realocacoes WHERE tag_origem = tag_destino",
    ),
    (
        "conta com origem desconhecida",
        "SELECT COUNT(*) FROM contas WHERE origem NOT IN ('manual', 'open_finance')",
    ),
    (
        "conta importada sem id externo ou conta manual com id externo",
        "SELECT COUNT(*) FROM contas WHERE (origem = 'open_finance') <> (id_externo IS NOT NULL)",
    ),
    (
        "gasto com origem desconhecida",
        "SELECT COUNT(*) FROM gastos WHERE origem NOT IN ('manual', 'open_finance')",
    ),
    (
        "ganho com origem desconhecida",
        "SELECT COUNT(*) FROM ganhos WHERE origem NOT IN ('manual', 'open_finance')",
    ),
    (
        "transação importada com sentido desconhecido",
        "SELECT COUNT(*) FROM transacoes_importadas WHERE sentido NOT IN ('entrada', 'saida')",
    ),
    (
        "transação importada com estado desconhecido",
        "SELECT COUNT(*) FROM transacoes_importadas "
        "WHERE estado NOT IN ('pendente', 'aceita', 'ignorada')",
    ),
]

# (tabela, nome completo da constraint, condição)
CHECKS: list[tuple[str, str, str]] = [
    ("contas", "ck_contas_origem_valida", "origem IN ('manual', 'open_finance')"),
    (
        "contas",
        "ck_contas_id_externo_so_no_banco",
        "(origem = 'open_finance') = (id_externo IS NOT NULL)",
    ),
    ("gastos", "ck_gastos_origem_valida", "origem IN ('manual', 'open_finance')"),
    ("ganhos", "ck_ganhos_origem_valida", "origem IN ('manual', 'open_finance')"),
    (
        "transacoes_importadas",
        "ck_transacoes_importadas_sentido_valido",
        "sentido IN ('entrada', 'saida')",
    ),
    (
        "transacoes_importadas",
        "ck_transacoes_importadas_estado_valido",
        "estado IN ('pendente', 'aceita', 'ignorada')",
    ),
    (
        "movimentos_de_investimento",
        "ck_movimentos_de_investimento_origem_valida",
        "origem IN ('manual', 'open_finance', 'saldo_inicial')",
    ),
    (
        "movimentos_de_investimento",
        "ck_movimentos_de_investimento_conta_so_no_saldo_inicial",
        "(conta_id IS NULL) = (origem = 'saldo_inicial')",
    ),
    (
        "movimentos_de_investimento",
        "ck_movimentos_de_investimento_saldo_inicial_com_investimento",
        "origem <> 'saldo_inicial' OR investimento_id IS NOT NULL",
    ),
    ("realocacoes", "ck_realocacoes_tags_diferentes", "tag_origem <> tag_destino"),
    (
        "recorrencias",
        "ck_recorrencias_categoria_so_no_gasto",
        "(tipo = 'gasto') = (categoria IS NOT NULL)",
    ),
]


def _conferir_dados() -> None:
    bind = op.get_bind()
    violacoes = []
    for regra, consulta in VERIFICACOES:
        quantas = bind.execute(sa.text(consulta)).scalar() or 0
        if quantas:
            violacoes.append(f"- {regra}: {quantas}")
    if violacoes:
        raise RuntimeError(
            "A migration parou sem alterar nada: há dados que violam as novas regras do "
            "esquema. Corrija-os e rode de novo.\n" + "\n".join(violacoes)
        )


def upgrade() -> None:
    _conferir_dados()
    # Atomicidade: o alembic roda esta revisão numa transação só, e o UPDATE abaixo (DML) abre a
    # transação implícita do pysqlite antes do primeiro batch (DDL). Por isso, se algo falhar
    # depois daqui, o banco volta ao estado anterior. Não remova nem reordene este UPDATE sem
    # refazer o teste de falha no meio (test_falha_no_meio_nao_deixa_o_banco_meio_migrado).
    # O movimento passa a ser a única fonte do investimento: copia para os que ainda não o
    # tinham, antes de a coluna da destinação sumir.
    op.execute(
        "UPDATE movimentos_de_investimento SET investimento_id = ("
        "SELECT MIN(d.investimento_id) FROM destinacoes d "
        "WHERE d.movimento_id = movimentos_de_investimento.id) "
        "WHERE investimento_id IS NULL AND EXISTS ("
        "SELECT 1 FROM destinacoes d WHERE d.movimento_id = movimentos_de_investimento.id)"
    )

    with op.batch_alter_table("destinacoes") as lote:
        lote.drop_index("ix_destinacoes_investimento_id")
        lote.drop_constraint("fk_destinacoes_investimento_id_investimentos", type_="foreignkey")
        lote.drop_column("investimento_id")
        lote.create_unique_constraint("uq_destinacoes_movimento_id_tag", ["movimento_id", "tag"])

    with op.batch_alter_table("recorrencias") as lote:
        lote.drop_index("ix_recorrencias_usuario_id")
        lote.drop_constraint("fk_recorrencias_usuario_id_usuarios", type_="foreignkey")
        lote.drop_column("usuario_id")
        lote.create_index("ix_recorrencias_conta_id", ["conta_id"])

    op.create_index(
        "ix_movimentos_de_investimento_investimento_id",
        "movimentos_de_investimento",
        ["investimento_id"],
    )

    for tabela, nome, condicao in CHECKS:
        with op.batch_alter_table(tabela) as lote:
            lote.create_check_constraint(op.f(nome), condicao)


def downgrade() -> None:
    for tabela, nome, _ in reversed(CHECKS):
        with op.batch_alter_table(tabela) as lote:
            lote.drop_constraint(op.f(nome), type_="check")

    op.drop_index(
        "ix_movimentos_de_investimento_investimento_id",
        table_name="movimentos_de_investimento",
    )

    bind = op.get_bind()
    sem_investimento = bind.execute(
        sa.text(
            "SELECT COUNT(*) FROM destinacoes d JOIN movimentos_de_investimento m "
            "ON m.id = d.movimento_id WHERE m.investimento_id IS NULL"
        )
    ).scalar()
    if sem_investimento:
        raise RuntimeError(
            "O downgrade parou: há destinações de movimentos sem investimento "
            f"({sem_investimento}), e a coluna antiga era obrigatória."
        )

    with op.batch_alter_table("recorrencias") as lote:
        lote.drop_index("ix_recorrencias_conta_id")
        lote.add_column(sa.Column("usuario_id", sa.Uuid(), nullable=True))
    op.execute(
        "UPDATE recorrencias SET usuario_id = "
        "(SELECT c.usuario_id FROM contas c WHERE c.id = recorrencias.conta_id)"
    )
    with op.batch_alter_table("recorrencias") as lote:
        lote.alter_column("usuario_id", existing_type=sa.Uuid(), nullable=False)
        lote.create_foreign_key(
            "fk_recorrencias_usuario_id_usuarios", "usuarios", ["usuario_id"], ["id"]
        )
        lote.create_index("ix_recorrencias_usuario_id", ["usuario_id"])

    with op.batch_alter_table("destinacoes") as lote:
        lote.drop_constraint("uq_destinacoes_movimento_id_tag", type_="unique")
        lote.add_column(sa.Column("investimento_id", sa.Uuid(), nullable=True))
    op.execute(
        "UPDATE destinacoes SET investimento_id = "
        "(SELECT m.investimento_id FROM movimentos_de_investimento m "
        "WHERE m.id = destinacoes.movimento_id)"
    )
    with op.batch_alter_table("destinacoes") as lote:
        lote.alter_column("investimento_id", existing_type=sa.Uuid(), nullable=False)
        lote.create_foreign_key(
            "fk_destinacoes_investimento_id_investimentos",
            "investimentos",
            ["investimento_id"],
            ["id"],
        )
        lote.create_index("ix_destinacoes_investimento_id", ["investimento_id"])
