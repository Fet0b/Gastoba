"""Normaliza identidades, tags ordenadas e integridade das relações (055)."""

import json
from uuid import UUID, uuid4

import sqlalchemy as sa
from alembic import op

revision = "f70b1594d23e"
down_revision = "e6fa0483c12d"
branch_labels = None
depends_on = None

# Snapshot dos triggers desta revisão, preenchido abaixo; independente do código de runtime.
RESTRICOES = (
    (
        "CREATE VIEW IF NOT EXISTS pontas_de_transferencias AS SELECT "
        "transacao_origem_id AS transacao_id, id AS transferencia_id FROM "
        "transferencias_entre_contas WHERE ativa=1 AND transacao_origem_id IS "
        "NOT NULL UNION ALL SELECT transacao_destino_id, id FROM "
        "transferencias_entre_contas WHERE ativa=1 AND transacao_destino_id IS "
        "NOT NULL"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_conta_remunerada_insert "
        "BEFORE INSERT ON investimentos WHEN NOT (NEW.conta_remunerada_id IS "
        "NULL OR (NEW.tipo='CAIXINHA' AND NEW.usuario_id IS (SELECT usuario_id "
        "FROM contas WHERE id = NEW.conta_remunerada_id))) BEGIN SELECT "
        "RAISE(ABORT, 'Relacoes incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_conta_remunerada_update "
        "BEFORE UPDATE ON investimentos WHEN NOT (NEW.conta_remunerada_id IS "
        "NULL OR (NEW.tipo='CAIXINHA' AND NEW.usuario_id IS (SELECT usuario_id "
        "FROM contas WHERE id = NEW.conta_remunerada_id))) BEGIN SELECT "
        "RAISE(ABORT, 'Relacoes incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_transferencia_insert BEFORE "
        "INSERT ON transferencias_entre_contas WHEN NOT (NEW.usuario_id IS "
        "(SELECT usuario_id FROM contas WHERE id = NEW.conta_origem_id) AND "
        "NEW.usuario_id IS (SELECT usuario_id FROM contas WHERE id = "
        "NEW.conta_destino_id) AND (NEW.transacao_origem_id IS NULL OR EXISTS "
        "(SELECT 1 FROM transacoes_importadas t WHERE "
        "t.id=NEW.transacao_origem_id AND t.conta_id=NEW.conta_origem_id AND "
        "t.sentido='saida' AND t.valor_centavos=NEW.valor_centavos)) AND "
        "(NEW.transacao_destino_id IS NULL OR EXISTS (SELECT 1 FROM "
        "transacoes_importadas t WHERE t.id=NEW.transacao_destino_id AND "
        "t.conta_id=NEW.conta_destino_id AND t.sentido='entrada' AND "
        "t.valor_centavos=NEW.valor_centavos))) BEGIN SELECT RAISE(ABORT, "
        "'Relacoes incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_transferencia_update BEFORE "
        "UPDATE ON transferencias_entre_contas WHEN NOT (NEW.usuario_id IS "
        "(SELECT usuario_id FROM contas WHERE id = NEW.conta_origem_id) AND "
        "NEW.usuario_id IS (SELECT usuario_id FROM contas WHERE id = "
        "NEW.conta_destino_id) AND (NEW.transacao_origem_id IS NULL OR EXISTS "
        "(SELECT 1 FROM transacoes_importadas t WHERE "
        "t.id=NEW.transacao_origem_id AND t.conta_id=NEW.conta_origem_id AND "
        "t.sentido='saida' AND t.valor_centavos=NEW.valor_centavos)) AND "
        "(NEW.transacao_destino_id IS NULL OR EXISTS (SELECT 1 FROM "
        "transacoes_importadas t WHERE t.id=NEW.transacao_destino_id AND "
        "t.conta_id=NEW.conta_destino_id AND t.sentido='entrada' AND "
        "t.valor_centavos=NEW.valor_centavos))) BEGIN SELECT RAISE(ABORT, "
        "'Relacoes incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_reversao_insert BEFORE "
        "INSERT ON reversoes_de_classificacao WHEN NOT (NEW.usuario_id IS "
        "(SELECT c.usuario_id FROM transacoes_importadas t JOIN contas c ON "
        "c.id=t.conta_id WHERE t.id=NEW.transacao_id)) BEGIN SELECT "
        "RAISE(ABORT, 'Relacoes incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_reversao_update BEFORE "
        "UPDATE ON reversoes_de_classificacao WHEN NOT (NEW.usuario_id IS "
        "(SELECT c.usuario_id FROM transacoes_importadas t JOIN contas c ON "
        "c.id=t.conta_id WHERE t.id=NEW.transacao_id)) BEGIN SELECT "
        "RAISE(ABORT, 'Relacoes incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_movimento_posicao_insert "
        "BEFORE INSERT ON movimentos_de_investimento WHEN NOT (NEW.conta_id IS "
        "NULL OR NEW.investimento_id IS NULL OR (SELECT usuario_id FROM contas "
        "WHERE id = NEW.conta_id) IS (SELECT usuario_id FROM investimentos "
        "WHERE id = NEW.investimento_id)) BEGIN SELECT RAISE(ABORT, 'Relacoes "
        "incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_movimento_posicao_update "
        "BEFORE UPDATE ON movimentos_de_investimento WHEN NOT (NEW.conta_id IS "
        "NULL OR NEW.investimento_id IS NULL OR (SELECT usuario_id FROM contas "
        "WHERE id = NEW.conta_id) IS (SELECT usuario_id FROM investimentos "
        "WHERE id = NEW.investimento_id)) BEGIN SELECT RAISE(ABORT, 'Relacoes "
        "incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_operacao_relacionada_insert "
        "BEFORE INSERT ON movimentos_de_investimento WHEN NOT "
        "(NEW.movimento_relacionado_id IS NULL OR EXISTS (SELECT 1 FROM "
        "movimentos_de_investimento m WHERE m.id=NEW.movimento_relacionado_id "
        "AND m.investimento_id IS NEW.investimento_id AND m.conta_id IS "
        "NEW.conta_id)) BEGIN SELECT RAISE(ABORT, 'Relacoes incompativeis'); "
        "END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_operacao_relacionada_update "
        "BEFORE UPDATE ON movimentos_de_investimento WHEN NOT "
        "(NEW.movimento_relacionado_id IS NULL OR EXISTS (SELECT 1 FROM "
        "movimentos_de_investimento m WHERE m.id=NEW.movimento_relacionado_id "
        "AND m.investimento_id IS NEW.investimento_id AND m.conta_id IS "
        "NEW.conta_id)) BEGIN SELECT RAISE(ABORT, 'Relacoes incompativeis'); "
        "END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_movimento_destinacoes_insert "
        "BEFORE INSERT ON movimentos_de_investimento WHEN NOT (NOT EXISTS "
        "(SELECT 1 FROM destinacoes d JOIN destinacoes_cadastradas c ON "
        "c.id=d.destinacao_id WHERE d.movimento_id=NEW.id AND c.usuario_id IS "
        "NOT COALESCE((SELECT usuario_id FROM contas WHERE id = NEW.conta_id), "
        "(SELECT usuario_id FROM investimentos WHERE id = "
        "NEW.investimento_id)))) BEGIN SELECT RAISE(ABORT, 'Relacoes "
        "incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_movimento_destinacoes_update "
        "BEFORE UPDATE ON movimentos_de_investimento WHEN NOT (NOT EXISTS "
        "(SELECT 1 FROM destinacoes d JOIN destinacoes_cadastradas c ON "
        "c.id=d.destinacao_id WHERE d.movimento_id=NEW.id AND c.usuario_id IS "
        "NOT COALESCE((SELECT usuario_id FROM contas WHERE id = NEW.conta_id), "
        "(SELECT usuario_id FROM investimentos WHERE id = "
        "NEW.investimento_id)))) BEGIN SELECT RAISE(ABORT, 'Relacoes "
        "incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_gastos_origem_insert BEFORE "
        "INSERT ON gastos WHEN NOT (NEW.transacao_importada_id IS NULL OR "
        "EXISTS (SELECT 1 FROM transacoes_importadas t WHERE "
        "t.id=NEW.transacao_importada_id AND t.conta_id=NEW.conta_id)) BEGIN "
        "SELECT RAISE(ABORT, 'Relacoes incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_gastos_origem_update BEFORE "
        "UPDATE ON gastos WHEN NOT (NEW.transacao_importada_id IS NULL OR "
        "EXISTS (SELECT 1 FROM transacoes_importadas t WHERE "
        "t.id=NEW.transacao_importada_id AND t.conta_id=NEW.conta_id)) BEGIN "
        "SELECT RAISE(ABORT, 'Relacoes incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_ganhos_origem_insert BEFORE "
        "INSERT ON ganhos WHEN NOT (NEW.transacao_importada_id IS NULL OR "
        "EXISTS (SELECT 1 FROM transacoes_importadas t WHERE "
        "t.id=NEW.transacao_importada_id AND t.conta_id=NEW.conta_id)) BEGIN "
        "SELECT RAISE(ABORT, 'Relacoes incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_ganhos_origem_update BEFORE "
        "UPDATE ON ganhos WHEN NOT (NEW.transacao_importada_id IS NULL OR "
        "EXISTS (SELECT 1 FROM transacoes_importadas t WHERE "
        "t.id=NEW.transacao_importada_id AND t.conta_id=NEW.conta_id)) BEGIN "
        "SELECT RAISE(ABORT, 'Relacoes incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS "
        "integridade_movimentos_de_investimento_origem_insert BEFORE INSERT ON "
        "movimentos_de_investimento WHEN NOT (NEW.transacao_importada_id IS "
        "NULL OR EXISTS (SELECT 1 FROM transacoes_importadas t WHERE "
        "t.id=NEW.transacao_importada_id AND t.conta_id=NEW.conta_id)) BEGIN "
        "SELECT RAISE(ABORT, 'Relacoes incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS "
        "integridade_movimentos_de_investimento_origem_update BEFORE UPDATE ON "
        "movimentos_de_investimento WHEN NOT (NEW.transacao_importada_id IS "
        "NULL OR EXISTS (SELECT 1 FROM transacoes_importadas t WHERE "
        "t.id=NEW.transacao_importada_id AND t.conta_id=NEW.conta_id)) BEGIN "
        "SELECT RAISE(ABORT, 'Relacoes incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_fatura_da_conta_insert "
        "BEFORE INSERT ON transacoes_importadas WHEN NOT (NEW.fatura_id IS "
        "NULL OR EXISTS (SELECT 1 FROM faturas f WHERE f.id=NEW.fatura_id AND "
        "f.conta_id=NEW.conta_id)) BEGIN SELECT RAISE(ABORT, 'Relacoes "
        "incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_fatura_da_conta_update "
        "BEFORE UPDATE ON transacoes_importadas WHEN NOT (NEW.fatura_id IS "
        "NULL OR EXISTS (SELECT 1 FROM faturas f WHERE f.id=NEW.fatura_id AND "
        "f.conta_id=NEW.conta_id)) BEGIN SELECT RAISE(ABORT, 'Relacoes "
        "incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_gastos_recorrencia_insert "
        "BEFORE INSERT ON gastos WHEN NOT (NEW.recorrencia_id IS NULL OR "
        "EXISTS (SELECT 1 FROM recorrencias r WHERE r.id=NEW.recorrencia_id "
        "AND r.conta_id=NEW.conta_id)) BEGIN SELECT RAISE(ABORT, 'Relacoes "
        "incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_gastos_recorrencia_update "
        "BEFORE UPDATE ON gastos WHEN NOT (NEW.recorrencia_id IS NULL OR "
        "EXISTS (SELECT 1 FROM recorrencias r WHERE r.id=NEW.recorrencia_id "
        "AND r.conta_id=NEW.conta_id)) BEGIN SELECT RAISE(ABORT, 'Relacoes "
        "incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_ganhos_recorrencia_insert "
        "BEFORE INSERT ON ganhos WHEN NOT (NEW.recorrencia_id IS NULL OR "
        "EXISTS (SELECT 1 FROM recorrencias r WHERE r.id=NEW.recorrencia_id "
        "AND r.conta_id=NEW.conta_id)) BEGIN SELECT RAISE(ABORT, 'Relacoes "
        "incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_ganhos_recorrencia_update "
        "BEFORE UPDATE ON ganhos WHEN NOT (NEW.recorrencia_id IS NULL OR "
        "EXISTS (SELECT 1 FROM recorrencias r WHERE r.id=NEW.recorrencia_id "
        "AND r.conta_id=NEW.conta_id)) BEGIN SELECT RAISE(ABORT, 'Relacoes "
        "incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_destinacoes_dono_insert "
        "BEFORE INSERT ON destinacoes WHEN NOT ((SELECT COALESCE(c.usuario_id, "
        "i.usuario_id) FROM movimentos_de_investimento m LEFT JOIN contas c ON "
        "c.id=m.conta_id LEFT JOIN investimentos i ON i.id=m.investimento_id "
        "WHERE m.id=NEW.movimento_id) IS (SELECT usuario_id FROM "
        "destinacoes_cadastradas WHERE id=NEW.destinacao_id)) BEGIN SELECT "
        "RAISE(ABORT, 'Relacoes incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_destinacoes_dono_update "
        "BEFORE UPDATE ON destinacoes WHEN NOT ((SELECT COALESCE(c.usuario_id, "
        "i.usuario_id) FROM movimentos_de_investimento m LEFT JOIN contas c ON "
        "c.id=m.conta_id LEFT JOIN investimentos i ON i.id=m.investimento_id "
        "WHERE m.id=NEW.movimento_id) IS (SELECT usuario_id FROM "
        "destinacoes_cadastradas WHERE id=NEW.destinacao_id)) BEGIN SELECT "
        "RAISE(ABORT, 'Relacoes incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS "
        "integridade_coberturas_de_compra_dono_insert BEFORE INSERT ON "
        "coberturas_de_compra WHEN NOT ((SELECT c.usuario_id FROM gastos g "
        "JOIN contas c ON c.id=g.conta_id WHERE g.id=NEW.gasto_id) IS (SELECT "
        "usuario_id FROM destinacoes_cadastradas WHERE id=NEW.destinacao_id)) "
        "BEGIN SELECT RAISE(ABORT, 'Relacoes incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS "
        "integridade_coberturas_de_compra_dono_update BEFORE UPDATE ON "
        "coberturas_de_compra WHEN NOT ((SELECT c.usuario_id FROM gastos g "
        "JOIN contas c ON c.id=g.conta_id WHERE g.id=NEW.gasto_id) IS (SELECT "
        "usuario_id FROM destinacoes_cadastradas WHERE id=NEW.destinacao_id)) "
        "BEGIN SELECT RAISE(ABORT, 'Relacoes incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_cobertura_resgate_insert "
        "BEFORE INSERT ON coberturas_de_compra WHEN NOT (NEW.movimento_id IS "
        "NULL OR (SELECT c.usuario_id FROM gastos g JOIN contas c ON "
        "c.id=g.conta_id WHERE g.id=NEW.gasto_id) IS (SELECT "
        "COALESCE(c.usuario_id, i.usuario_id) FROM movimentos_de_investimento "
        "m LEFT JOIN contas c ON c.id=m.conta_id LEFT JOIN investimentos i ON "
        "i.id=m.investimento_id WHERE m.id=NEW.movimento_id)) BEGIN SELECT "
        "RAISE(ABORT, 'Relacoes incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_cobertura_resgate_update "
        "BEFORE UPDATE ON coberturas_de_compra WHEN NOT (NEW.movimento_id IS "
        "NULL OR (SELECT c.usuario_id FROM gastos g JOIN contas c ON "
        "c.id=g.conta_id WHERE g.id=NEW.gasto_id) IS (SELECT "
        "COALESCE(c.usuario_id, i.usuario_id) FROM movimentos_de_investimento "
        "m LEFT JOIN contas c ON c.id=m.conta_id LEFT JOIN investimentos i ON "
        "i.id=m.investimento_id WHERE m.id=NEW.movimento_id)) BEGIN SELECT "
        "RAISE(ABORT, 'Relacoes incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_realocacao_origem_insert "
        "BEFORE INSERT ON realocacoes WHEN NOT ((SELECT usuario_id FROM "
        "investimentos WHERE id = NEW.investimento_id) IS (SELECT usuario_id "
        "FROM destinacoes_cadastradas WHERE id=NEW.destinacao_origem_id)) "
        "BEGIN SELECT RAISE(ABORT, 'Relacoes incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_realocacao_origem_update "
        "BEFORE UPDATE ON realocacoes WHEN NOT ((SELECT usuario_id FROM "
        "investimentos WHERE id = NEW.investimento_id) IS (SELECT usuario_id "
        "FROM destinacoes_cadastradas WHERE id=NEW.destinacao_origem_id)) "
        "BEGIN SELECT RAISE(ABORT, 'Relacoes incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_realocacao_destino_insert "
        "BEFORE INSERT ON realocacoes WHEN NOT ((SELECT usuario_id FROM "
        "investimentos WHERE id = NEW.investimento_id) IS (SELECT usuario_id "
        "FROM destinacoes_cadastradas WHERE id=NEW.destinacao_destino_id)) "
        "BEGIN SELECT RAISE(ABORT, 'Relacoes incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_realocacao_destino_update "
        "BEFORE UPDATE ON realocacoes WHEN NOT ((SELECT usuario_id FROM "
        "investimentos WHERE id = NEW.investimento_id) IS (SELECT usuario_id "
        "FROM destinacoes_cadastradas WHERE id=NEW.destinacao_destino_id)) "
        "BEGIN SELECT RAISE(ABORT, 'Relacoes incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_tags_gastos_insert BEFORE "
        "INSERT ON tags_de_gastos WHEN NOT ((SELECT c.usuario_id FROM gastos l "
        "JOIN contas c ON c.id=l.conta_id WHERE l.id=NEW.gasto_id) IS (SELECT "
        "usuario_id FROM tags WHERE id=NEW.tag_id)) BEGIN SELECT RAISE(ABORT, "
        "'Relacoes incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_tags_gastos_update BEFORE "
        "UPDATE ON tags_de_gastos WHEN NOT ((SELECT c.usuario_id FROM gastos l "
        "JOIN contas c ON c.id=l.conta_id WHERE l.id=NEW.gasto_id) IS (SELECT "
        "usuario_id FROM tags WHERE id=NEW.tag_id)) BEGIN SELECT RAISE(ABORT, "
        "'Relacoes incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_tags_ganhos_insert BEFORE "
        "INSERT ON tags_de_ganhos WHEN NOT ((SELECT c.usuario_id FROM ganhos l "
        "JOIN contas c ON c.id=l.conta_id WHERE l.id=NEW.ganho_id) IS (SELECT "
        "usuario_id FROM tags WHERE id=NEW.tag_id)) BEGIN SELECT RAISE(ABORT, "
        "'Relacoes incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_tags_ganhos_update BEFORE "
        "UPDATE ON tags_de_ganhos WHEN NOT ((SELECT c.usuario_id FROM ganhos l "
        "JOIN contas c ON c.id=l.conta_id WHERE l.id=NEW.ganho_id) IS (SELECT "
        "usuario_id FROM tags WHERE id=NEW.tag_id)) BEGIN SELECT RAISE(ABORT, "
        "'Relacoes incompativeis'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_tags_recorrencias_insert "
        "BEFORE INSERT ON tags_de_recorrencias WHEN NOT ((SELECT c.usuario_id "
        "FROM recorrencias l JOIN contas c ON c.id=l.conta_id WHERE "
        "l.id=NEW.recorrencia_id) IS (SELECT usuario_id FROM tags WHERE "
        "id=NEW.tag_id)) BEGIN SELECT RAISE(ABORT, 'Relacoes incompativeis'); "
        "END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_tags_recorrencias_update "
        "BEFORE UPDATE ON tags_de_recorrencias WHEN NOT ((SELECT c.usuario_id "
        "FROM recorrencias l JOIN contas c ON c.id=l.conta_id WHERE "
        "l.id=NEW.recorrencia_id) IS (SELECT usuario_id FROM tags WHERE "
        "id=NEW.tag_id)) BEGIN SELECT RAISE(ABORT, 'Relacoes incompativeis'); "
        "END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_contas_identidade BEFORE "
        "UPDATE ON contas WHEN NEW.id IS NOT OLD.id OR NEW.usuario_id IS NOT "
        "OLD.usuario_id BEGIN SELECT RAISE(ABORT, 'Identidade imutavel'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_investimentos_identidade "
        "BEFORE UPDATE ON investimentos WHEN NEW.id IS NOT OLD.id OR "
        "NEW.usuario_id IS NOT OLD.usuario_id BEGIN SELECT RAISE(ABORT, "
        "'Identidade imutavel'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_tags_identidade BEFORE "
        "UPDATE ON tags WHEN NEW.id IS NOT OLD.id OR NEW.usuario_id IS NOT "
        "OLD.usuario_id BEGIN SELECT RAISE(ABORT, 'Identidade imutavel'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS "
        "integridade_destinacoes_cadastradas_identidade BEFORE UPDATE ON "
        "destinacoes_cadastradas WHEN NEW.id IS NOT OLD.id OR NEW.usuario_id "
        "IS NOT OLD.usuario_id BEGIN SELECT RAISE(ABORT, 'Identidade "
        "imutavel'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_ponta_imutavel BEFORE UPDATE "
        "ON transacoes_importadas WHEN (NEW.conta_id IS NOT OLD.conta_id OR "
        "NEW.sentido IS NOT OLD.sentido OR NEW.valor_centavos IS NOT "
        "OLD.valor_centavos) AND EXISTS (SELECT 1 FROM "
        "transferencias_entre_contas t WHERE t.transacao_origem_id=OLD.id OR "
        "t.transacao_destino_id=OLD.id) BEGIN SELECT RAISE(ABORT, 'Ponta "
        "vinculada imutavel'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_gastos_conta BEFORE UPDATE "
        "ON gastos WHEN NEW.conta_id IS NOT OLD.conta_id BEGIN SELECT "
        "RAISE(ABORT, 'Conta do lancamento imutavel'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_ganhos_conta BEFORE UPDATE "
        "ON ganhos WHEN NEW.conta_id IS NOT OLD.conta_id BEGIN SELECT "
        "RAISE(ABORT, 'Conta do lancamento imutavel'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_recorrencias_conta BEFORE "
        "UPDATE ON recorrencias WHEN NEW.conta_id IS NOT OLD.conta_id BEGIN "
        "SELECT RAISE(ABORT, 'Conta do lancamento imutavel'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_faturas_conta BEFORE UPDATE "
        "ON faturas WHEN NEW.conta_id IS NOT OLD.conta_id BEGIN SELECT "
        "RAISE(ABORT, 'Conta do lancamento imutavel'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS "
        "integridade_movimentos_de_investimento_conta BEFORE UPDATE ON "
        "movimentos_de_investimento WHEN NEW.conta_id IS NOT OLD.conta_id "
        "BEGIN SELECT RAISE(ABORT, 'Conta do lancamento imutavel'); END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS integridade_transacoes_importadas_conta "
        "BEFORE UPDATE ON transacoes_importadas WHEN NEW.conta_id IS NOT "
        "OLD.conta_id BEGIN SELECT RAISE(ABORT, 'Conta do lancamento "
        "imutavel'); END"
    ),
)

_DESTINACOES = {
    "destinacoes": ("tag",),
    "coberturas_de_compra": ("tag",),
    "vinculos_das_destinacoes": ("tag",),
    "cores_das_destinacoes": ("tag",),
    "realocacoes": ("tag_origem", "tag_destino"),
}
_LANCAMENTOS = {"gastos": "gasto", "ganhos": "ganho", "recorrencias": "recorrencia"}


def _linhas(tabela):
    return list(op.get_bind().execute(sa.text(f"SELECT * FROM {tabela}")).mappings())


def _catalogo(nome):
    op.create_table(
        nome,
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("usuario_id", sa.Uuid(), sa.ForeignKey("usuarios.id"), nullable=False),
        sa.Column("nome", sa.String(30), nullable=False),
        sa.UniqueConstraint("usuario_id", "nome", name=f"uq_{nome}_usuario_id_nome"),
    )
    op.create_index(f"ix_{nome}_usuario_id", nome, ["usuario_id"])


def _novo_id(nome, dono, texto):
    bind = op.get_bind()
    atual = bind.execute(
        sa.text(f"SELECT id FROM {nome} WHERE usuario_id=:u AND nome=:n"), {"u": dono, "n": texto}
    ).scalar()
    if atual:
        return atual
    novo = uuid4().hex
    bind.execute(
        sa.text(f"INSERT INTO {nome}(id,usuario_id,nome) VALUES (:i,:u,:n)"),
        {"i": novo, "u": dono, "n": texto},
    )
    return novo


def _coluna_destinacao(campo):
    return "destinacao_id" if campo == "tag" else campo.replace("tag_", "destinacao_") + "_id"


def _validar_nome(nome):
    if (
        not isinstance(nome, str)
        or not 1 <= len(nome) <= 30
        or not nome.isprintable()
        or nome != " ".join(nome.strip().lower().split())
    ):
        raise RuntimeError("Existem tags ou destinações inválidas; revise antes da migration.")


def _iniciar_transacao_sqlite(bind):
    # sqlite3 em modo legado não inicia transação para DDL. O Alembic gerencia commit/rollback.
    if bind.dialect.name == "sqlite" and not bind.connection.driver_connection.in_transaction:
        bind.exec_driver_sql("BEGIN")


def upgrade():
    bind = op.get_bind()
    _iniciar_transacao_sqlite(bind)
    if bind.exec_driver_sql("PRAGMA foreign_key_check").first():
        raise RuntimeError("Existem referências inválidas; revise antes da migration.")
    # Valida também relações já presentes antes do backfill. Regras sobre estruturas novas
    # serão satisfeitas pela construção dos cadastros por dono e pelas FKs.
    for sql in RESTRICOES:
        if "BEFORE INSERT ON " not in sql:
            continue
        if any(
            novo in sql for novo in ("conta_remunerada_id", "destinacoes_cadastradas", "tags_de_")
        ):
            continue
        tabela = sql.split("BEFORE INSERT ON ", 1)[1].split(" WHEN", 1)[0]
        regra = sql.split(" WHEN NOT (", 1)[1].rsplit(") BEGIN", 1)[0]
        if bind.execute(
            sa.text(f"SELECT 1 FROM {tabela} n WHERE NOT ({regra.replace('NEW.', 'n.')}) LIMIT 1")
        ).first():
            raise RuntimeError("Existem relações incompatíveis; revise antes da migration.")
    contas = {r["id"]: r["usuario_id"] for r in _linhas("contas")}
    investimentos = {r["id"]: r for r in _linhas("investimentos")}
    movimentos = {r["id"]: r for r in _linhas("movimentos_de_investimento")}
    gastos = {r["id"]: r for r in _linhas("gastos")}
    transacoes = {r["id"]: r for r in _linhas("transacoes_importadas")}
    destinos = {t: _linhas(t) for t in _DESTINACOES}
    tags = {}
    # Pré-validação integral antes de qualquer DDL.
    for tabela in _LANCAMENTOS:
        tags[tabela] = []
        for linha in _linhas(tabela):
            try:
                nomes = json.loads(linha["tags"])
            except TypeError, ValueError:
                raise RuntimeError(
                    "Existem tags JSON inválidas; revise antes da migration."
                ) from None
            if (
                not isinstance(nomes, list)
                or any(not isinstance(n, str) for n in nomes)
                or len(nomes) != len(set(nomes))
                or len(nomes) > 10
            ):
                raise RuntimeError("Existem tags JSON inválidas; revise antes da migration.")
            for nome in nomes:
                _validar_nome(nome)
            tags[tabela].append((linha["id"], contas[linha["conta_id"]], nomes))
    for tabela, campos in _DESTINACOES.items():
        for linha in destinos[tabela]:
            for campo in campos:
                _validar_nome(linha[campo])
    for m in movimentos.values():
        if (
            m["conta_id"]
            and m["investimento_id"]
            and contas[m["conta_id"]] != investimentos[m["investimento_id"]]["usuario_id"]
        ):
            raise RuntimeError(
                "Movimentos e posições de pessoas diferentes; revise antes da migration."
            )
    caixinhas = []
    for inv in investimentos.values():
        externo = inv["id_externo"]
        if inv["tipo"] == "CAIXINHA" and externo.startswith("caixinha:"):
            try:
                conta = UUID(externo.removeprefix("caixinha:")).hex
            except ValueError:
                raise RuntimeError("Referência legada de conta remunerada inválida.") from None
            if contas.get(conta) != inv["usuario_id"]:
                raise RuntimeError("Conta remunerada inexistente ou de outra pessoa.")
            caixinhas.append((inv["id"], conta))
    if len({conta for _, conta in caixinhas}) != len(caixinhas):
        raise RuntimeError("Mais de uma posição remunerada para a mesma conta; revise.")
    usadas = set()
    reservas_esperadas = set()
    for t in _linhas("transferencias_entre_contas"):
        if (
            contas[t["conta_origem_id"]] != t["usuario_id"]
            or contas[t["conta_destino_id"]] != t["usuario_id"]
        ):
            raise RuntimeError("Transferência com proprietários incompatíveis.")
        for lado, sentido in (("origem", "saida"), ("destino", "entrada")):
            ponta = t[f"transacao_{lado}_id"]
            if ponta is None:
                continue
            p = transacoes[ponta]
            if (
                p["conta_id"] != t[f"conta_{lado}_id"]
                or p["sentido"] != sentido
                or p["valor_centavos"] != t["valor_centavos"]
            ):
                raise RuntimeError("Transferência com ponta incompatível.")
            if t["ativa"]:
                if ponta in usadas:
                    raise RuntimeError("Ponta usada por mais de uma transferência ativa.")
                usadas.add(ponta)
                reservas_esperadas.add((t["id"], ponta))

    reservas_existentes = {
        (r["transferencia_id"], r["transacao_id"]) for r in _linhas("pontas_de_transferencias")
    }
    if reservas_existentes != reservas_esperadas:
        raise RuntimeError("As reservas de pontas divergem das transferências; revise.")

    _catalogo("destinacoes_cadastradas")
    _catalogo("tags")
    # FK explícita sem alterar a identidade da posição nem o saldo observado.
    with op.batch_alter_table("investimentos") as batch:
        batch.add_column(sa.Column("conta_remunerada_id", sa.Uuid(), nullable=True))
        batch.create_foreign_key(
            "fk_investimentos_conta_remunerada_id_contas", "contas", ["conta_remunerada_id"], ["id"]
        )
        batch.create_unique_constraint(
            "uq_investimentos_conta_remunerada_id", ["conta_remunerada_id"]
        )
    for inv, conta in caixinhas:
        bind.execute(
            sa.text("UPDATE investimentos SET conta_remunerada_id=:c WHERE id=:i"),
            {"c": conta, "i": inv},
        )

    for tabela, singular in _LANCAMENTOS.items():
        associacao = f"tags_de_{tabela}"
        op.create_table(
            associacao,
            sa.Column(
                f"{singular}_id",
                sa.Uuid(),
                sa.ForeignKey(f"{tabela}.id", ondelete="CASCADE"),
                primary_key=True,
            ),
            sa.Column("tag_id", sa.Uuid(), sa.ForeignKey("tags.id"), primary_key=True),
            sa.Column("ordem", sa.Integer(), nullable=False),
            sa.UniqueConstraint(
                f"{singular}_id", "ordem", name=f"uq_{associacao}_{singular}_id_ordem"
            ),
            sa.CheckConstraint("ordem >= 0", name="ordem_nao_negativa"),
        )
        for id_, dono, nomes in tags[tabela]:
            for ordem, nome in enumerate(nomes):
                tag = _novo_id("tags", dono, nome)
                bind.execute(
                    sa.text(
                        f"INSERT INTO {associacao}({singular}_id,tag_id,ordem) VALUES (:i,:t,:o)"
                    ),
                    {"i": id_, "t": tag, "o": ordem},
                )
        with op.batch_alter_table(tabela) as batch:
            batch.drop_column("tags")

    for tabela, campos in _DESTINACOES.items():
        with op.batch_alter_table(tabela) as batch:
            for campo in campos:
                coluna = _coluna_destinacao(campo)
                batch.add_column(sa.Column(coluna, sa.Uuid(), nullable=True))
                batch.create_foreign_key(
                    f"fk_{tabela}_{coluna}_destinacoes_cadastradas",
                    "destinacoes_cadastradas",
                    [coluna],
                    ["id"],
                )
                batch.create_index(f"ix_{tabela}_{coluna}", [coluna])
        for linha in destinos[tabela]:
            if tabela in ("vinculos_das_destinacoes", "cores_das_destinacoes"):
                dono = linha["usuario_id"]
            elif tabela == "destinacoes":
                m = movimentos[linha["movimento_id"]]
                dono = (
                    contas[m["conta_id"]]
                    if m["conta_id"]
                    else investimentos[m["investimento_id"]]["usuario_id"]
                )
            elif tabela == "coberturas_de_compra":
                dono = contas[gastos[linha["gasto_id"]]["conta_id"]]
            else:
                dono = investimentos[linha["investimento_id"]]["usuario_id"]
            for campo in campos:
                coluna = _coluna_destinacao(campo)
                cadastro = _novo_id("destinacoes_cadastradas", dono, linha[campo])
                bind.execute(
                    sa.text(f"UPDATE {tabela} SET {coluna}=:d WHERE id=:i"),
                    {"d": cadastro, "i": linha["id"]},
                )
        with op.batch_alter_table(tabela) as batch:
            if tabela in ("vinculos_das_destinacoes", "cores_das_destinacoes"):
                batch.drop_constraint(f"uq_{tabela}_usuario_id_tag", type_="unique")
                batch.drop_constraint(f"fk_{tabela}_usuario_id_usuarios", type_="foreignkey")
                batch.drop_column("usuario_id")
                batch.create_unique_constraint(f"uq_{tabela}_destinacao_id", ["destinacao_id"])
            elif tabela == "realocacoes":
                batch.drop_constraint(op.f("ck_realocacoes_tags_diferentes"), type_="check")
                batch.create_check_constraint(
                    "tags_diferentes", "destinacao_origem_id <> destinacao_destino_id"
                )
            else:
                chave = "movimento_id" if tabela == "destinacoes" else "gasto_id"
                batch.drop_constraint(f"uq_{tabela}_{chave}_tag", type_="unique")
                batch.create_unique_constraint(
                    f"uq_{tabela}_{chave}_destinacao_id", [chave, "destinacao_id"]
                )
            for campo in campos:
                batch.drop_column(campo)
                batch.alter_column(
                    _coluna_destinacao(campo), existing_type=sa.Uuid(), nullable=False
                )

    op.drop_table("pontas_de_transferencias")
    op.create_index(
        "uq_transferencia_ativa_origem",
        "transferencias_entre_contas",
        ["transacao_origem_id"],
        unique=True,
        sqlite_where=sa.text("ativa = 1"),
    )
    op.create_index(
        "uq_transferencia_ativa_destino",
        "transferencias_entre_contas",
        ["transacao_destino_id"],
        unique=True,
        sqlite_where=sa.text("ativa = 1"),
    )
    for sql in RESTRICOES:
        bind.exec_driver_sql(sql)


def downgrade():
    bind = op.get_bind()
    _iniciar_transacao_sqlite(bind)
    for linha in bind.execute(
        sa.text("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'integridade_%'")
    ):
        bind.exec_driver_sql(f'DROP TRIGGER "{linha[0]}"')
    bind.exec_driver_sql("DROP VIEW pontas_de_transferencias")
    op.drop_index("uq_transferencia_ativa_origem", table_name="transferencias_entre_contas")
    op.drop_index("uq_transferencia_ativa_destino", table_name="transferencias_entre_contas")
    op.create_table(
        "pontas_de_transferencias",
        sa.Column(
            "transacao_id", sa.Uuid(), sa.ForeignKey("transacoes_importadas.id"), primary_key=True
        ),
        sa.Column(
            "transferencia_id",
            sa.Uuid(),
            sa.ForeignKey("transferencias_entre_contas.id"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_pontas_de_transferencias_transferencia_id",
        "pontas_de_transferencias",
        ["transferencia_id"],
    )
    bind.execute(
        sa.text(
            "INSERT INTO pontas_de_transferencias SELECT "
            "transacao_origem_id,id FROM transferencias_entre_contas WHERE "
            "ativa=1 AND transacao_origem_id IS NOT NULL UNION ALL SELECT "
            "transacao_destino_id,id FROM transferencias_entre_contas WHERE "
            "ativa=1 AND transacao_destino_id IS NOT NULL"
        )
    )
    for tabela, campos in _DESTINACOES.items():
        with op.batch_alter_table(tabela) as batch:
            for campo in campos:
                batch.add_column(sa.Column(campo, sa.String(30), nullable=True))
            if tabela in ("vinculos_das_destinacoes", "cores_das_destinacoes"):
                batch.add_column(sa.Column("usuario_id", sa.Uuid(), nullable=True))
                batch.create_foreign_key(
                    f"fk_{tabela}_usuario_id_usuarios", "usuarios", ["usuario_id"], ["id"]
                )
        for campo in campos:
            coluna = _coluna_destinacao(campo)
            bind.execute(
                sa.text(
                    f"UPDATE {tabela} SET {campo}=(SELECT nome FROM destinacoes_cadastradas d "
                    f"WHERE d.id={tabela}.{coluna})"
                )
            )
        if tabela in ("vinculos_das_destinacoes", "cores_das_destinacoes"):
            bind.execute(
                sa.text(
                    f"UPDATE {tabela} SET usuario_id=(SELECT usuario_id "
                    "FROM destinacoes_cadastradas d "
                    f"WHERE d.id={tabela}.destinacao_id)"
                )
            )
        with op.batch_alter_table(tabela) as batch:
            for campo in campos:
                coluna = _coluna_destinacao(campo)
                batch.drop_index(f"ix_{tabela}_{coluna}")
                batch.drop_constraint(
                    f"fk_{tabela}_{coluna}_destinacoes_cadastradas", type_="foreignkey"
                )
                batch.alter_column(campo, existing_type=sa.String(30), nullable=False)
            if tabela in ("vinculos_das_destinacoes", "cores_das_destinacoes"):
                batch.drop_constraint(f"uq_{tabela}_destinacao_id", type_="unique")
                batch.alter_column("usuario_id", existing_type=sa.Uuid(), nullable=False)
                batch.create_unique_constraint(f"uq_{tabela}_usuario_id_tag", ["usuario_id", "tag"])
            elif tabela == "realocacoes":
                batch.drop_constraint(op.f("ck_realocacoes_tags_diferentes"), type_="check")
                batch.create_check_constraint("tags_diferentes", "tag_origem <> tag_destino")
            else:
                chave = "movimento_id" if tabela == "destinacoes" else "gasto_id"
                batch.drop_constraint(f"uq_{tabela}_{chave}_destinacao_id", type_="unique")
                batch.create_unique_constraint(f"uq_{tabela}_{chave}_tag", [chave, "tag"])
            for campo in campos:
                batch.drop_column(_coluna_destinacao(campo))
    for tabela, singular in _LANCAMENTOS.items():
        with op.batch_alter_table(tabela) as batch:
            batch.add_column(sa.Column("tags", sa.JSON(), nullable=False, server_default="[]"))
        for linha in _linhas(tabela):
            nomes = (
                bind.execute(
                    sa.text(
                        f"SELECT t.nome FROM tags_de_{tabela} a JOIN tags t ON t.id=a.tag_id "
                        f"WHERE a.{singular}_id=:i ORDER BY a.ordem"
                    ),
                    {"i": linha["id"]},
                )
                .scalars()
                .all()
            )
            bind.execute(
                sa.text(f"UPDATE {tabela} SET tags=:t WHERE id=:i"),
                {"t": json.dumps(nomes, ensure_ascii=False), "i": linha["id"]},
            )
        op.drop_table(f"tags_de_{tabela}")
    with op.batch_alter_table("investimentos") as batch:
        batch.drop_constraint("uq_investimentos_conta_remunerada_id", type_="unique")
        batch.drop_constraint("fk_investimentos_conta_remunerada_id_contas", type_="foreignkey")
        batch.drop_column("conta_remunerada_id")
    op.drop_table("tags")
    op.drop_table("destinacoes_cadastradas")
