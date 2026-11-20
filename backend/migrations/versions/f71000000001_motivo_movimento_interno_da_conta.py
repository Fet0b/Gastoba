"""Aceita o motivo ``movimento_interno_da_conta`` em ``transacoes_importadas.motivo_ignorada``.

Só troca o texto do CHECK ``motivo_ignorada_valido``, que fica na própria coluna; nenhum dado é
alterado. Recriar a tabela (modo batch) apagaria os gatilhos dela, tornaria os CHECKs de coluna em
CHECKs de tabela (o que impede o downgrade da revisão ``a05600000002``, que remove a coluna) e
trocaria a visão ``pontas_de_transferencias``. Por isso a definição é editada no próprio esquema,
procedimento previsto na documentação do SQLite para **afrouxar** um CHECK (nenhuma linha existente
passa a violar a regra). O downgrade, que restringe, recusa se houver linha com o motivo novo.
"""

import sqlalchemy as sa
from alembic import op

revision = "f71000000001"
down_revision = "e66000000001"
branch_labels = None
depends_on = None

TABELA = "transacoes_importadas"
ANTIGO = "motivo_ignorada IS NULL OR motivo_ignorada = 'transferencia_entre_contas'"
NOVO = (
    "motivo_ignorada IS NULL OR motivo_ignorada IN "
    "('transferencia_entre_contas', 'movimento_interno_da_conta')"
)


def _trocar(de: str, para: str) -> None:
    bind = op.get_bind()
    sql = bind.execute(
        sa.text("SELECT sql FROM sqlite_master WHERE type='table' AND name=:t"), {"t": TABELA}
    ).scalar_one()
    if sql.count(de) != 1:
        raise RuntimeError("O CHECK do motivo de descarte não está na forma esperada.")
    versao = bind.exec_driver_sql("PRAGMA schema_version").scalar_one()
    bind.exec_driver_sql("PRAGMA writable_schema=ON")
    try:
        bind.execute(
            sa.text("UPDATE sqlite_master SET sql=:sql WHERE type='table' AND name=:t"),
            {"sql": sql.replace(de, para), "t": TABELA},
        )
        bind.exec_driver_sql(f"PRAGMA schema_version={versao + 1}")
    finally:
        bind.exec_driver_sql("PRAGMA writable_schema=OFF")
    if bind.exec_driver_sql("PRAGMA integrity_check").scalar_one() != "ok":
        raise RuntimeError("A conferência de integridade do banco falhou depois da troca do CHECK.")


def upgrade() -> None:
    _trocar(ANTIGO, NOVO)


def downgrade() -> None:
    bind = op.get_bind()
    em_uso = bind.execute(
        sa.text(
            f"SELECT count(*) FROM {TABELA} WHERE motivo_ignorada = 'movimento_interno_da_conta'"
        )
    ).scalar()
    if em_uso:
        raise RuntimeError(
            f"Há {em_uso} transação(ões) ignorada(s) como movimento interno da conta; "
            "o downgrade perderia essa informação."
        )
    _trocar(NOVO, ANTIGO)
