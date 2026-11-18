"""Restrições relacionais entre donos: SQLite, além das FKs e dos índices UNIQUE.

Nomes e mensagens não incluem dados financeiros. A migration 055 congela estas definições.
"""

from sqlalchemy import Connection


def comandos() -> list[str]:
    sql = []

    def validar(tabela: str, regra: str, nome: str) -> None:
        for operacao in ("INSERT", "UPDATE"):
            sql.append(
                f"CREATE TRIGGER IF NOT EXISTS integridade_{nome}_{operacao.lower()} "
                f"BEFORE {operacao} ON {tabela} WHEN NOT ({regra}) "
                "BEGIN SELECT RAISE(ABORT, 'Relacoes incompativeis'); END"
            )

    def dono_conta(campo: str) -> str:
        return f"(SELECT usuario_id FROM contas WHERE id = {campo})"

    def dono_investimento(campo: str) -> str:
        return f"(SELECT usuario_id FROM investimentos WHERE id = {campo})"

    def dono_movimento(campo: str) -> str:
        return (
            "(SELECT COALESCE(c.usuario_id, i.usuario_id) FROM movimentos_de_investimento m "
            "LEFT JOIN contas c ON c.id=m.conta_id LEFT JOIN investimentos i "
            "ON i.id=m.investimento_id "
            f"WHERE m.id={campo})"
        )

    def dono_gasto(campo: str) -> str:
        return (
            "(SELECT c.usuario_id FROM gastos g JOIN contas c ON c.id=g.conta_id "
            f"WHERE g.id={campo})"
        )

    # Views são projeções: não há segunda fonte de escrita das pontas ativas.
    sql.append(
        "CREATE VIEW IF NOT EXISTS pontas_de_transferencias AS "
        "SELECT transacao_origem_id AS transacao_id, id AS transferencia_id "
        "FROM transferencias_entre_contas WHERE ativa=1 AND transacao_origem_id IS NOT NULL "
        "UNION ALL SELECT transacao_destino_id, id FROM transferencias_entre_contas "
        "WHERE ativa=1 AND transacao_destino_id IS NOT NULL"
    )
    validar(
        "investimentos",
        "NEW.conta_remunerada_id IS NULL OR (NEW.tipo='CAIXINHA' AND "
        f"NEW.usuario_id IS {dono_conta('NEW.conta_remunerada_id')})",
        "conta_remunerada",
    )
    regras = [
        f"NEW.usuario_id IS {dono_conta('NEW.conta_origem_id')}",
        f"NEW.usuario_id IS {dono_conta('NEW.conta_destino_id')}",
    ]
    for lado, sentido in (("origem", "saida"), ("destino", "entrada")):
        regras.append(
            f"(NEW.transacao_{lado}_id IS NULL OR EXISTS (SELECT 1 FROM transacoes_importadas t "
            f"WHERE t.id=NEW.transacao_{lado}_id AND t.conta_id=NEW.conta_{lado}_id "
            f"AND t.sentido='{sentido}' AND t.valor_centavos=NEW.valor_centavos))"
        )
    validar("transferencias_entre_contas", " AND ".join(regras), "transferencia")
    validar(
        "reversoes_de_classificacao",
        "NEW.usuario_id IS (SELECT c.usuario_id "
        "FROM transacoes_importadas t JOIN contas c ON c.id=t.conta_id "
        "WHERE t.id=NEW.transacao_id)",
        "reversao",
    )
    validar(
        "movimentos_de_investimento",
        "NEW.conta_id IS NULL OR NEW.investimento_id IS NULL OR "
        f"{dono_conta('NEW.conta_id')} IS {dono_investimento('NEW.investimento_id')}",
        "movimento_posicao",
    )
    validar(
        "movimentos_de_investimento",
        "NEW.movimento_relacionado_id IS NULL OR EXISTS "
        "(SELECT 1 FROM movimentos_de_investimento m WHERE m.id=NEW.movimento_relacionado_id "
        "AND m.investimento_id IS NEW.investimento_id AND m.conta_id IS NEW.conta_id)",
        "operacao_relacionada",
    )
    validar(
        "movimentos_de_investimento",
        "NOT EXISTS (SELECT 1 FROM destinacoes d JOIN destinacoes_cadastradas c "
        "ON c.id=d.destinacao_id WHERE d.movimento_id=NEW.id AND c.usuario_id IS NOT "
        f"COALESCE({dono_conta('NEW.conta_id')}, {dono_investimento('NEW.investimento_id')}))",
        "movimento_destinacoes",
    )
    for tabela in ("gastos", "ganhos", "movimentos_de_investimento"):
        validar(
            tabela,
            "NEW.transacao_importada_id IS NULL OR EXISTS (SELECT 1 FROM transacoes_importadas t "
            "WHERE t.id=NEW.transacao_importada_id AND t.conta_id=NEW.conta_id)",
            f"{tabela}_origem",
        )
    validar(
        "transacoes_importadas",
        "NEW.fatura_id IS NULL OR EXISTS (SELECT 1 FROM faturas f "
        "WHERE f.id=NEW.fatura_id AND f.conta_id=NEW.conta_id)",
        "fatura_da_conta",
    )
    for tabela in ("gastos", "ganhos"):
        validar(
            tabela,
            "NEW.recorrencia_id IS NULL OR EXISTS (SELECT 1 FROM recorrencias r "
            "WHERE r.id=NEW.recorrencia_id AND r.conta_id=NEW.conta_id)",
            f"{tabela}_recorrencia",
        )
    for tabela, dono in (
        ("destinacoes", dono_movimento("NEW.movimento_id")),
        ("coberturas_de_compra", dono_gasto("NEW.gasto_id")),
    ):
        validar(
            tabela,
            f"{dono} IS (SELECT usuario_id FROM destinacoes_cadastradas "
            "WHERE id=NEW.destinacao_id)",
            f"{tabela}_dono",
        )
    validar(
        "coberturas_de_compra",
        "NEW.movimento_id IS NULL OR "
        f"{dono_gasto('NEW.gasto_id')} IS {dono_movimento('NEW.movimento_id')}",
        "cobertura_resgate",
    )
    for lado in ("origem", "destino"):
        validar(
            "realocacoes",
            f"{dono_investimento('NEW.investimento_id')} IS "
            f"(SELECT usuario_id FROM destinacoes_cadastradas WHERE id=NEW.destinacao_{lado}_id)",
            f"realocacao_{lado}",
        )
    for singular, plural in (
        ("gasto", "gastos"),
        ("ganho", "ganhos"),
        ("recorrencia", "recorrencias"),
    ):
        validar(
            f"tags_de_{plural}",
            "(SELECT c.usuario_id FROM " + plural + " l JOIN contas c "
            f"ON c.id=l.conta_id WHERE l.id=NEW.{singular}_id) IS "
            "(SELECT usuario_id FROM tags WHERE id=NEW.tag_id)",
            f"tags_{plural}",
        )
    # Mudar um dono invalidaria todas as FKs indiretas; IDs e donos são imutáveis.
    for tabela in ("contas", "investimentos", "tags", "destinacoes_cadastradas"):
        sql.append(
            f"CREATE TRIGGER IF NOT EXISTS integridade_{tabela}_identidade "
            f"BEFORE UPDATE ON {tabela} "
            "WHEN NEW.id IS NOT OLD.id OR NEW.usuario_id IS NOT OLD.usuario_id "
            "BEGIN SELECT RAISE(ABORT, 'Identidade imutavel'); END"
        )
    # Uma ponta bancária já classificada em transferência não pode mudar de significado.
    sql.append(
        "CREATE TRIGGER IF NOT EXISTS integridade_ponta_imutavel BEFORE "
        "UPDATE ON transacoes_importadas "
        "WHEN (NEW.conta_id IS NOT OLD.conta_id OR NEW.sentido IS NOT OLD.sentido OR "
        "NEW.valor_centavos IS NOT OLD.valor_centavos) AND EXISTS (SELECT "
        "1 FROM transferencias_entre_contas t "
        "WHERE t.transacao_origem_id=OLD.id OR t.transacao_destino_id=OLD.id) "
        "BEGIN SELECT RAISE(ABORT, 'Ponta vinculada imutavel'); END"
    )
    # Conta de um lançamento/recorrência/fatura é identidade, não campo editável.
    for tabela in (
        "gastos",
        "ganhos",
        "recorrencias",
        "faturas",
        "movimentos_de_investimento",
        "transacoes_importadas",
    ):
        sql.append(
            f"CREATE TRIGGER IF NOT EXISTS integridade_{tabela}_conta "
            f"BEFORE UPDATE ON {tabela} "
            "WHEN NEW.conta_id IS NOT OLD.conta_id "
            "BEGIN SELECT RAISE(ABORT, 'Conta do lancamento imutavel'); END"
        )
    return sql


def instalar(conexao: Connection) -> None:
    if conexao.dialect.name == "sqlite":
        for comando in comandos():
            conexao.exec_driver_sql(comando)
