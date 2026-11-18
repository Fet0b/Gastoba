"""Religa somente correspondências estritas e exclusivas em ambas as direções.

Downgrade deliberadamente não desfaz vínculos: são dados corretos e aditivos,
indistinguíveis dos vínculos criados normalmente pela aplicação.
"""

from collections import defaultdict

import sqlalchemy as sa
from alembic import op

revision = "a05600000004"
down_revision = "a05600000003"
branch_labels = None
depends_on = None


def upgrade():
    conexao = op.get_bind()
    tabelas = ("gastos", "ganhos", "movimentos_de_investimento")
    ligados = set()
    for tabela in tabelas:
        ligados.update(
            conexao.execute(
                sa.text(
                    f"SELECT transacao_importada_id FROM {tabela} "
                    "WHERE transacao_importada_id IS NOT NULL"
                )
            ).scalars()
        )
    ligados.update(
        conexao.execute(sa.text("SELECT transacao_id FROM pontas_de_transferencias")).scalars()
    )
    transacoes = (
        conexao.execute(
            sa.text(
                "SELECT id, conta_id, data, valor_centavos, descricao, sentido FROM "
                "transacoes_importadas WHERE estado = 'aceita'"
            )
        )
        .mappings()
        .all()
    )
    candidatos = defaultdict(list)
    for tabela in tabelas:
        tipo = ", tipo" if tabela == "movimentos_de_investimento" else ""
        linhas = conexao.execute(
            sa.text(
                f"SELECT id, conta_id, data, valor_centavos, descricao{tipo} FROM {tabela} "
                "WHERE transacao_importada_id IS NULL"
            )
        ).mappings()
        for linha in linhas:
            sentido = "saida" if tabela == "gastos" else "entrada"
            if tabela == "movimentos_de_investimento":
                if linha["tipo"] not in ("aporte", "resgate"):
                    continue
                sentido = "saida" if linha["tipo"] == "aporte" else "entrada"
            chave = (
                linha["conta_id"],
                linha["data"],
                linha["valor_centavos"],
                linha["descricao"],
                sentido,
            )
            candidatos[chave].append((tabela, linha["id"]))
    por_chave = defaultdict(list)
    for t in transacoes:
        if t["id"] not in ligados:
            por_chave[
                (t["conta_id"], t["data"], t["valor_centavos"], t["descricao"], t["sentido"])
            ].append(t["id"])
    for chave, ids in por_chave.items():
        if len(ids) == 1 and len(candidatos[chave]) == 1:
            tabela, id_lancamento = candidatos[chave][0]
            conexao.execute(
                sa.text(
                    f"UPDATE {tabela} SET transacao_importada_id = :transacao "
                    "WHERE id = :id AND transacao_importada_id IS NULL"
                ),
                {"transacao": ids[0], "id": id_lancamento},
            )


def downgrade():
    pass
