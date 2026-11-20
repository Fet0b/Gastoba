"""Revisão de consistência dos dados e das relações: só leitura, relatório sem dados sensíveis.

Cada verificação é uma função pequena com uma consulta SQL de leitura e entra no catálogo
``VERIFICACOES`` (para acrescentar a próxima em um lugar só). O resultado é a contagem de casos
defeituosos: o relatório mostra o nome, a descrição fixa e o número, nunca valores, nomes nem
identificadores. O mesmo comando serve ao banco de teste e, só leitura, a uma **cópia** de outro
banco (a autorização do dono para usar uma cópia real continua sendo necessária a cada vez).
"""

import sqlite3
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import TextIO

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import make_url

from dados_de_teste.popular import RAIZ_DO_BACKEND
from gastoba.domain.aparencia import IntensidadeDaCor, MarcaDoApp, TexturaDoFundo
from gastoba.domain.casamento_de_operacao import EstadoDoCasamento, PapelDoVinculo
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.chave_de_api import EscopoDaChave
from gastoba.domain.conta import OrigemDaConta, PapelDaConta, TipoDaConta
from gastoba.domain.cor_da_destinacao import CorDaDestinacao
from gastoba.domain.fatura import FonteDaFatura
from gastoba.domain.ganho import OrigemDoGanho
from gastoba.domain.gasto import OrigemDoGasto
from gastoba.domain.meta import AlvoDaMeta
from gastoba.domain.movimento_de_investimento import OrigemDoMovimento, TipoDeMovimento
from gastoba.domain.natureza_do_movimento import NaturezaDoMovimento, natureza_da_descricao
from gastoba.domain.operacao import OrigemDaOperacao, TipoDeOperacao
from gastoba.domain.recorrencia import TipoDeRecorrencia
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    MotivoDaTransacaoIgnorada,
    SentidoDaTransacao,
)

# O saldo inicial (em centavos) das contas manuais do cenário de teste: a única conta cujo saldo
# inicial é conhecido (a tabela ``contas`` só guarda o saldo atual).
SALDOS_INICIAIS_DO_CENARIO = {"Carteira (manual)": 150000, "Carteira da outra pessoa": 30000}
MATIZ_MAXIMO = 359


@dataclass(frozen=True, slots=True)
class ResultadoDaVerificacao:
    nome: str
    descricao: str
    falhas: int
    # Falso quando a verificação não faz sentido neste banco (tabela inexistente, sem o cenário).
    aplica: bool = True
    # "erro" reprova a revisão; "aviso" só é relatado (dado antigo que a pessoa decide, como o D7).
    nivel: str = "erro"

    @property
    def reprova(self) -> bool:
        return self.aplica and self.falhas > 0 and self.nivel == "erro"


# Devolve a contagem de casos defeituosos, ou None quando a verificação não se aplica.
Funcao = Callable[[sqlite3.Connection], int | None]


@dataclass(frozen=True, slots=True)
class Verificacao:
    nome: str
    grupo: str
    descricao: str
    executar: Funcao
    requer_tabelas: tuple[str, ...] = ()
    nivel: str = "erro"


VERIFICACOES: list[Verificacao] = []


def verificacao(nome: str, grupo: str, descricao: str, *requer_tabelas: str):
    """Registra a função no catálogo."""

    def registrar(funcao: Funcao) -> Funcao:
        VERIFICACOES.append(Verificacao(nome, grupo, descricao, funcao, requer_tabelas))
        return funcao

    return registrar


def _contar(conexao: sqlite3.Connection, sql: str, *parametros: object) -> int:
    return int(conexao.execute(sql, parametros).fetchone()[0])


def _sql_de_contagem(
    nome: str, grupo: str, descricao: str, tabelas: tuple[str, ...], sql: str, nivel: str = "erro"
) -> None:
    """Verificação cuja função é só uma consulta ``SELECT COUNT(*)`` (sem parâmetros)."""
    VERIFICACOES.append(
        Verificacao(nome, grupo, descricao, lambda conexao: _contar(conexao, sql), tabelas, nivel)
    )


# Dono de cada movimento: o do investimento, ou o da conta quando não há investimento.
DONO_DO_MOVIMENTO = """
WITH dono_do_movimento AS (
    SELECT m.id AS id, COALESCE(i.usuario_id, c.usuario_id) AS usuario_id
    FROM movimentos_de_investimento m
    LEFT JOIN investimentos i ON i.id = m.investimento_id
    LEFT JOIN contas c ON c.id = m.conta_id
)
"""

# ---------------------------------------------------------------- estrutura


@verificacao(
    "integridade_do_sqlite",
    "estrutura",
    "O arquivo do banco passa no PRAGMA integrity_check.",
)
def _integridade(conexao: sqlite3.Connection) -> int:
    linhas = [r[0] for r in conexao.execute("PRAGMA integrity_check")]
    return 0 if linhas == ["ok"] else len(linhas)


@verificacao(
    "chaves_estrangeiras",
    "estrutura",
    "Toda chave estrangeira aponta para uma linha que existe (PRAGMA foreign_key_check).",
)
def _chaves_estrangeiras(conexao: sqlite3.Connection) -> int:
    return len(conexao.execute("PRAGMA foreign_key_check").fetchall())


def cabeca_do_alembic() -> str | None:
    configuracao = Config(str(RAIZ_DO_BACKEND / "alembic.ini"))
    configuracao.set_main_option("script_location", str(RAIZ_DO_BACKEND / "migrations"))
    return ScriptDirectory.from_config(configuracao).get_current_head()


@verificacao(
    "esquema_na_cabeca_do_alembic",
    "estrutura",
    "A revisão do banco é a cabeça das migrations do repositório.",
)
def _esquema(conexao: sqlite3.Connection) -> int:
    if not _tabela_existe(conexao, "alembic_version"):
        return 1
    versoes = [r[0] for r in conexao.execute("SELECT version_num FROM alembic_version")]
    return 0 if versoes == [cabeca_do_alembic()] else 1


# ---------------------------------------------------------------- posse (nada cruza pessoas)

_POSSE = "posse"
_sql_de_contagem(
    "posse_do_movimento",
    _POSSE,
    "Conta e investimento de um movimento são da mesma pessoa.",
    ("movimentos_de_investimento", "contas", "investimentos"),
    """SELECT COUNT(*) FROM movimentos_de_investimento m
       JOIN contas c ON c.id = m.conta_id JOIN investimentos i ON i.id = m.investimento_id
       WHERE c.usuario_id <> i.usuario_id""",
)
_sql_de_contagem(
    "movimento_e_transacao_da_mesma_conta",
    _POSSE,
    "Um movimento e a transação de que nasceu são da mesma conta.",
    ("movimentos_de_investimento", "transacoes_importadas"),
    """SELECT COUNT(*) FROM movimentos_de_investimento m
       JOIN transacoes_importadas t ON t.id = m.transacao_importada_id
       WHERE m.conta_id IS NOT t.conta_id""",
)
_sql_de_contagem(
    "gasto_e_transacao_da_mesma_conta",
    _POSSE,
    "Um gasto e a transação de que nasceu são da mesma conta.",
    ("gastos", "transacoes_importadas"),
    """SELECT COUNT(*) FROM gastos g JOIN transacoes_importadas t ON t.id = g.transacao_importada_id
       WHERE g.conta_id <> t.conta_id""",
)
_sql_de_contagem(
    "ganho_e_transacao_da_mesma_conta",
    _POSSE,
    "Um ganho e a transação de que nasceu são da mesma conta.",
    ("ganhos", "transacoes_importadas"),
    """SELECT COUNT(*) FROM ganhos g JOIN transacoes_importadas t ON t.id = g.transacao_importada_id
       WHERE g.conta_id <> t.conta_id""",
)
_sql_de_contagem(
    "posse_da_destinacao",
    _POSSE,
    "A destinação de cada parte é da mesma pessoa que dona do movimento.",
    ("destinacoes", "destinacoes_cadastradas", "movimentos_de_investimento"),
    DONO_DO_MOVIMENTO
    + """SELECT COUNT(*) FROM destinacoes d
         JOIN destinacoes_cadastradas dc ON dc.id = d.destinacao_id
         JOIN dono_do_movimento dm ON dm.id = d.movimento_id
         WHERE dc.usuario_id IS NOT dm.usuario_id""",
)
_sql_de_contagem(
    "posse_da_cobertura",
    _POSSE,
    "Gasto, destinação e resgate de uma cobertura de compra são da mesma pessoa.",
    ("coberturas_de_compra", "gastos", "contas", "destinacoes_cadastradas"),
    DONO_DO_MOVIMENTO
    + """SELECT COUNT(*) FROM coberturas_de_compra cc
         JOIN gastos g ON g.id = cc.gasto_id JOIN contas c ON c.id = g.conta_id
         JOIN destinacoes_cadastradas dc ON dc.id = cc.destinacao_id
         LEFT JOIN dono_do_movimento dm ON dm.id = cc.movimento_id
         WHERE c.usuario_id <> dc.usuario_id
            OR (cc.movimento_id IS NOT NULL AND dm.usuario_id IS NOT c.usuario_id)""",
)
_sql_de_contagem(
    "posse_da_reaplicacao",
    _POSSE,
    "Aporte e resgate de uma reaplicação são da mesma pessoa.",
    ("reaplicacoes_de_resgates", "movimentos_de_investimento"),
    DONO_DO_MOVIMENTO
    + """SELECT COUNT(*) FROM reaplicacoes_de_resgates r
         JOIN dono_do_movimento a ON a.id = r.aporte_id
         JOIN dono_do_movimento b ON b.id = r.resgate_id
         WHERE a.usuario_id IS NOT b.usuario_id""",
)
_sql_de_contagem(
    "posse_da_operacao_relacionada",
    _POSSE,
    "Uma operação e a operação relacionada a ela são da mesma posição.",
    ("operacoes_de_investimento",),
    """SELECT COUNT(*) FROM operacoes_de_investimento o
       JOIN operacoes_de_investimento r ON r.id = o.operacao_relacionada_id
       WHERE o.posicao_id <> r.posicao_id""",
)
_sql_de_contagem(
    "posse_do_casamento",
    _POSSE,
    "Transações e operações de um casamento da bolsa são da mesma pessoa.",
    ("vinculos_de_casamento", "operacoes_do_casamento", "transacoes_importadas", "contas"),
    """SELECT COUNT(*) FROM (
         SELECT casamento_id FROM (
           SELECT v.casamento_id AS casamento_id, c.usuario_id AS usuario_id
           FROM vinculos_de_casamento v
           JOIN transacoes_importadas t ON t.id = v.transacao_importada_id
           JOIN contas c ON c.id = t.conta_id
           UNION ALL
           SELECT o.casamento_id, i.usuario_id FROM operacoes_do_casamento o
           JOIN operacoes_de_investimento op ON op.id = o.operacao_id
           JOIN investimentos i ON i.id = op.posicao_id)
         GROUP BY casamento_id HAVING COUNT(DISTINCT usuario_id) > 1)""",
)
_sql_de_contagem(
    "fatura_da_mesma_conta",
    _POSSE,
    "Uma compra só está numa fatura da mesma conta.",
    ("transacoes_importadas", "faturas"),
    """SELECT COUNT(*) FROM transacoes_importadas t JOIN faturas f ON f.id = t.fatura_id
       WHERE f.conta_id <> t.conta_id""",
)
_sql_de_contagem(
    "posse_da_alocacao",
    _POSSE,
    "A caixinha de uma alocação é da mesma pessoa que dona da posição.",
    ("alocacoes_de_caixinha", "destinacoes_cadastradas", "investimentos"),
    """SELECT COUNT(*) FROM alocacoes_de_caixinha a
       JOIN destinacoes_cadastradas dc ON dc.id = a.destinacao_id
       JOIN investimentos i ON i.id = a.posicao_id
       WHERE dc.usuario_id <> i.usuario_id""",
)
_sql_de_contagem(
    "posse_da_realocacao",
    _POSSE,
    "Origem e destino de uma realocação são da mesma pessoa que dona do investimento.",
    ("realocacoes", "destinacoes_cadastradas", "investimentos"),
    """SELECT COUNT(*) FROM realocacoes r
       JOIN investimentos i ON i.id = r.investimento_id
       JOIN destinacoes_cadastradas o ON o.id = r.destinacao_origem_id
       JOIN destinacoes_cadastradas d ON d.id = r.destinacao_destino_id
       WHERE o.usuario_id <> i.usuario_id OR d.usuario_id <> i.usuario_id""",
)
_sql_de_contagem(
    "posse_da_conta_remunerada",
    _POSSE,
    "A conta remunerada de uma posição é da mesma pessoa que dona da posição.",
    ("investimentos", "contas"),
    """SELECT COUNT(*) FROM investimentos i JOIN contas c ON c.id = i.conta_remunerada_id
       WHERE c.usuario_id <> i.usuario_id""",
)
_sql_de_contagem(
    "posse_da_caixinha_marcada",
    _POSSE,
    "Quem tem caixinha marcada no guardado das metas tem a preferência do orçamento.",
    ("caixinhas_marcadas", "destinacoes_cadastradas", "preferencias_do_orcamento"),
    """SELECT COUNT(*) FROM caixinhas_marcadas m
       JOIN destinacoes_cadastradas dc ON dc.id = m.destinacao_id
       LEFT JOIN preferencias_do_orcamento p ON p.usuario_id = dc.usuario_id
       WHERE p.usuario_id IS NULL""",
)
_sql_de_contagem(
    "posse_da_transferencia",
    _POSSE,
    "As contas de uma transferência entre contas próprias são da pessoa dela.",
    ("transferencias_entre_contas", "contas"),
    """SELECT COUNT(*) FROM transferencias_entre_contas t
       JOIN contas o ON o.id = t.conta_origem_id JOIN contas d ON d.id = t.conta_destino_id
       WHERE o.usuario_id <> t.usuario_id OR d.usuario_id <> t.usuario_id""",
)
_sql_de_contagem(
    "posse_das_tags",
    _POSSE,
    "Toda tag de gasto, ganho ou recorrência é da mesma pessoa que dona do lançamento.",
    ("tags", "tags_de_gastos", "tags_de_ganhos", "tags_de_recorrencias", "contas"),
    """SELECT
         (SELECT COUNT(*) FROM tags_de_gastos x JOIN tags t ON t.id = x.tag_id
            JOIN gastos g ON g.id = x.gasto_id JOIN contas c ON c.id = g.conta_id
            WHERE t.usuario_id <> c.usuario_id)
       + (SELECT COUNT(*) FROM tags_de_ganhos x JOIN tags t ON t.id = x.tag_id
            JOIN ganhos g ON g.id = x.ganho_id JOIN contas c ON c.id = g.conta_id
            WHERE t.usuario_id <> c.usuario_id)
       + (SELECT COUNT(*) FROM tags_de_recorrencias x JOIN tags t ON t.id = x.tag_id
            JOIN recorrencias r ON r.id = x.recorrencia_id JOIN contas c ON c.id = r.conta_id
            WHERE t.usuario_id <> c.usuario_id)""",
)
_sql_de_contagem(
    "posse_da_reversao",
    _POSSE,
    "O registro de reversão é da mesma pessoa que dona da transação.",
    ("reversoes_de_classificacao", "transacoes_importadas", "contas"),
    """SELECT COUNT(*) FROM reversoes_de_classificacao r
       JOIN transacoes_importadas t ON t.id = r.transacao_id JOIN contas c ON c.id = t.conta_id
       WHERE c.usuario_id <> r.usuario_id""",
)
_sql_de_contagem(
    "recorrencia_da_mesma_conta",
    _POSSE,
    "Gasto ou ganho gerado por uma recorrência está na conta dela.",
    ("gastos", "ganhos", "recorrencias"),
    """SELECT (SELECT COUNT(*) FROM gastos g JOIN recorrencias r ON r.id = g.recorrencia_id
                WHERE g.conta_id <> r.conta_id)
            + (SELECT COUNT(*) FROM ganhos g JOIN recorrencias r ON r.id = g.recorrencia_id
                WHERE g.conta_id <> r.conta_id)""",
)

# ---------------------------------------------------------------- dinheiro (as somas fecham)

_DINHEIRO = "dinheiro"


@verificacao(
    "saldo_da_conta_manual",
    _DINHEIRO,
    "Conta manual do cenário: saldo = saldo inicial + ganhos - gastos (só no banco do cenário).",
    "contas",
    "gastos",
    "ganhos",
)
def _saldo_da_conta_manual(conexao: sqlite3.Connection) -> int | None:
    contas = conexao.execute(
        """SELECT nome, saldo_centavos
             - COALESCE((SELECT SUM(valor_centavos) FROM ganhos WHERE conta_id = contas.id), 0)
             + COALESCE((SELECT SUM(valor_centavos) FROM gastos WHERE conta_id = contas.id), 0)
           FROM contas WHERE origem = 'manual'"""
    ).fetchall()
    do_cenario = [(nome, inicial) for nome, inicial in contas if nome in SALDOS_INICIAIS_DO_CENARIO]
    if not do_cenario:
        return None
    return sum(1 for nome, inicial in do_cenario if inicial != SALDOS_INICIAIS_DO_CENARIO[nome])


_sql_de_contagem(
    "destinacoes_somam_o_movimento",
    _DINHEIRO,
    "A soma das partes de um movimento é o valor dele (com o sinal do resgate).",
    ("movimentos_de_investimento", "destinacoes"),
    """SELECT COUNT(*) FROM (
         SELECT m.tipo AS tipo, m.valor_centavos AS v, SUM(d.valor_centavos) AS s
         FROM movimentos_de_investimento m JOIN destinacoes d ON d.movimento_id = m.id
         GROUP BY m.id)
       WHERE s <> CASE WHEN tipo = 'resgate' THEN -v ELSE v END""",
)
_sql_de_contagem(
    "partes_com_o_sinal_do_movimento",
    _DINHEIRO,
    "As partes do resgate são negativas e as dos demais movimentos são positivas.",
    ("movimentos_de_investimento", "destinacoes"),
    """SELECT COUNT(*) FROM destinacoes d JOIN movimentos_de_investimento m ON m.id = d.movimento_id
       WHERE (m.tipo = 'resgate' AND d.valor_centavos > 0)
          OR (m.tipo <> 'resgate' AND d.valor_centavos < 0)""",
)
_sql_de_contagem(
    "principal_nunca_negativo",
    _DINHEIRO,
    "O principal de cada caixinha em cada investimento nunca fica negativo.",
    ("destinacoes", "movimentos_de_investimento", "realocacoes"),
    """SELECT COUNT(*) FROM (
         SELECT investimento, destinacao FROM (
           SELECT m.investimento_id AS investimento, d.destinacao_id AS destinacao,
                  COALESCE(d.principal_centavos, d.valor_centavos) AS v
           FROM destinacoes d JOIN movimentos_de_investimento m ON m.id = d.movimento_id
           UNION ALL
           SELECT investimento_id, destinacao_destino_id, valor_centavos FROM realocacoes
           UNION ALL
           SELECT investimento_id, destinacao_origem_id, -valor_centavos FROM realocacoes)
         GROUP BY investimento, destinacao HAVING SUM(v) < 0)""",
)
_sql_de_contagem(
    "cobertura_dentro_do_gasto",
    _DINHEIRO,
    "As coberturas de um gasto não passam do valor do gasto.",
    ("gastos", "coberturas_de_compra"),
    """SELECT COUNT(*) FROM (
         SELECT g.valor_centavos AS v, SUM(c.valor_centavos) AS s
         FROM gastos g JOIN coberturas_de_compra c ON c.gasto_id = g.id GROUP BY g.id)
       WHERE s > v""",
)
_sql_de_contagem(
    "cobertura_dentro_do_resgate",
    _DINHEIRO,
    "As coberturas ligadas a um resgate não passam do que o resgate tirou da caixinha.",
    ("coberturas_de_compra", "destinacoes"),
    """SELECT COUNT(*) FROM (
         SELECT movimento_id AS mid, destinacao_id AS did, SUM(valor_centavos) AS s
         FROM coberturas_de_compra WHERE movimento_id IS NOT NULL GROUP BY 1, 2) x
       LEFT JOIN (
         SELECT movimento_id, destinacao_id, -SUM(valor_centavos) AS tirado
         FROM destinacoes GROUP BY 1, 2) d
         ON d.movimento_id = x.mid AND d.destinacao_id = x.did
       WHERE d.tirado IS NULL OR x.s > d.tirado""",
)
_sql_de_contagem(
    "reaplicacao_dentro_dos_limites",
    _DINHEIRO,
    "Uma reaplicação cabe no aporte e no que o resgate ainda tinha livre das coberturas.",
    ("reaplicacoes_de_resgates", "movimentos_de_investimento", "coberturas_de_compra"),
    """SELECT COUNT(*) FROM reaplicacoes_de_resgates r
       JOIN movimentos_de_investimento a ON a.id = r.aporte_id
       JOIN movimentos_de_investimento b ON b.id = r.resgate_id
       WHERE r.valor_centavos > a.valor_centavos
          OR r.valor_centavos
             + COALESCE((SELECT SUM(valor_centavos) FROM coberturas_de_compra
                         WHERE movimento_id = b.id), 0) > b.valor_centavos""",
)
_sql_de_contagem(
    "total_da_fatura_estimada",
    _DINHEIRO,
    "O total de uma fatura estimada é a soma das compras ligadas a ela (estornos descontam).",
    ("faturas", "transacoes_importadas"),
    """SELECT COUNT(*) FROM faturas f WHERE f.fonte = 'estimada' AND f.total_centavos <> MAX(0,
         COALESCE((SELECT SUM(CASE t.sentido WHEN 'saida' THEN t.valor_centavos
                                             ELSE -t.valor_centavos END)
                   FROM transacoes_importadas t WHERE t.fatura_id = f.id), 0))""",
)

# ---------------------------------------------------------------- estados

_ESTADOS = "estados"
_TEM_LANCAMENTO = """(EXISTS (SELECT 1 FROM gastos x WHERE x.transacao_importada_id = t.id)
    OR EXISTS (SELECT 1 FROM ganhos x WHERE x.transacao_importada_id = t.id)
    OR EXISTS (SELECT 1 FROM movimentos_de_investimento x WHERE x.transacao_importada_id = t.id))"""
_E_CASADA_OU_TRANSFERENCIA = """(EXISTS (SELECT 1 FROM vinculos_de_casamento v
                                          WHERE v.transacao_importada_id = t.id)
    OR EXISTS (SELECT 1 FROM transferencias_entre_contas x
               WHERE x.transacao_origem_id = t.id OR x.transacao_destino_id = t.id))"""
_TABELAS_DE_LANCAMENTO = (
    "transacoes_importadas",
    "gastos",
    "ganhos",
    "movimentos_de_investimento",
    "vinculos_de_casamento",
    "transferencias_entre_contas",
)
_sql_de_contagem(
    "aceita_tem_lancamento",
    _ESTADOS,
    "Toda transação aceita tem lançamento, ligação da bolsa ou transferência.",
    _TABELAS_DE_LANCAMENTO,
    f"""SELECT COUNT(*) FROM transacoes_importadas t WHERE t.estado = 'aceita'
        AND NOT {_TEM_LANCAMENTO} AND NOT {_E_CASADA_OU_TRANSFERENCIA}""",
)
# O aporte já excluído logicamente (tratamento aprovado e ativo) fica guardado, por causa da chave
# estrangeira, mas não é lançamento: não conta como residuo da transação pendente ou ignorada.
_MOVIMENTO_VIVO = """EXISTS (SELECT 1 FROM movimentos_de_investimento x
    WHERE x.transacao_importada_id = t.id
      AND NOT EXISTS (SELECT 1 FROM tratamentos_de_aporte tr
                      WHERE tr.movimento_id = x.id AND tr.aprovado_em IS NOT NULL
                        AND tr.desfeito_em IS NULL))"""
_TEM_LANCAMENTO_VIVO = (
    """(EXISTS (SELECT 1 FROM gastos x WHERE x.transacao_importada_id = t.id)
    OR EXISTS (SELECT 1 FROM ganhos x WHERE x.transacao_importada_id = t.id)
    OR """
    + _MOVIMENTO_VIVO
    + ")"
)
_sql_de_contagem(
    "pendente_ou_ignorada_sem_lancamento",
    _ESTADOS,
    "Transação pendente ou ignorada não tem gasto, ganho nem movimento (fora o aporte excluído).",
    (*_TABELAS_DE_LANCAMENTO, "tratamentos_de_aporte"),
    f"""SELECT COUNT(*) FROM transacoes_importadas t
        WHERE t.estado IN ('pendente', 'ignorada') AND {_TEM_LANCAMENTO_VIVO}""",
)


def _espelhos(conexao: sqlite3.Connection) -> list[tuple[str, str]]:
    """As transações de aplicação ou resgate automático da conta investimentos, pela descrição
    (a mesma regra do domínio): ``(id, estado)``."""
    return [
        (id_, estado)
        for id_, descricao, estado in conexao.execute(
            "SELECT id, descricao, estado FROM transacoes_importadas"
        )
        if natureza_da_descricao(descricao) == NaturezaDoMovimento.CONTA_REMUNERADA
    ]


@verificacao(
    "espelho_nunca_pendente_nem_aceito",
    _ESTADOS,
    "A aplicação e o resgate automáticos da conta investimentos nunca estão na caixa nem aceitos.",
    "transacoes_importadas",
)
def _espelho_nunca_pendente_nem_aceito(conexao: sqlite3.Connection) -> int:
    return sum(estado in ("pendente", "aceita") for _, estado in _espelhos(conexao))


@verificacao(
    "espelho_sem_lancamento",
    _ESTADOS,
    "Nenhum ganho, gasto nem aporte ativo nasce da aplicação ou do resgate automático da conta.",
    "transacoes_importadas",
    "gastos",
    "ganhos",
    "movimentos_de_investimento",
    "tratamentos_de_aporte",
)
def _espelho_sem_lancamento(conexao: sqlite3.Connection) -> int:
    ids = {id_ for id_, _ in _espelhos(conexao)}
    ligados = conexao.execute(
        """SELECT transacao_importada_id FROM gastos WHERE transacao_importada_id IS NOT NULL
           UNION ALL
           SELECT transacao_importada_id FROM ganhos WHERE transacao_importada_id IS NOT NULL
           UNION ALL
           SELECT m.transacao_importada_id FROM movimentos_de_investimento m
            WHERE m.transacao_importada_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM tratamentos_de_aporte tr
                              WHERE tr.movimento_id = m.id AND tr.aprovado_em IS NOT NULL
                                AND tr.desfeito_em IS NULL)"""
    ).fetchall()
    return sum(linha[0] in ids for linha in ligados)


_sql_de_contagem(
    "soma_dos_lancamentos_da_transacao",
    _ESTADOS,
    "A soma dos lançamentos de uma transação aceita é o valor dela (fora bolsa e transferência).",
    _TABELAS_DE_LANCAMENTO,
    f"""SELECT COUNT(*) FROM transacoes_importadas t
        WHERE t.estado = 'aceita' AND NOT {_E_CASADA_OU_TRANSFERENCIA}
          AND t.valor_centavos <>
              COALESCE((SELECT SUM(valor_centavos) FROM gastos x
                        WHERE x.transacao_importada_id = t.id), 0)
            + COALESCE((SELECT SUM(valor_centavos) FROM ganhos x
                        WHERE x.transacao_importada_id = t.id), 0)
            + COALESCE((SELECT SUM(valor_centavos) FROM movimentos_de_investimento x
                        WHERE x.transacao_importada_id = t.id), 0)""",
)
_sql_de_contagem(
    "recorrencia_com_competencia_unica",
    _ESTADOS,
    "Lançamento de recorrência tem competência, e só um por recorrência e mês.",
    ("gastos", "ganhos"),
    """SELECT
         (SELECT COUNT(*) FROM gastos WHERE (recorrencia_id IS NULL) <> (competencia IS NULL))
       + (SELECT COUNT(*) FROM ganhos WHERE (recorrencia_id IS NULL) <> (competencia IS NULL))
       + (SELECT COUNT(*) FROM (SELECT 1 FROM gastos WHERE recorrencia_id IS NOT NULL
                                GROUP BY recorrencia_id, competencia HAVING COUNT(*) > 1))
       + (SELECT COUNT(*) FROM (SELECT 1 FROM ganhos WHERE recorrencia_id IS NOT NULL
                                GROUP BY recorrencia_id, competencia HAVING COUNT(*) > 1))""",
)
_sql_de_contagem(
    "movimento_sem_conta_so_saldo_inicial",
    _ESTADOS,
    "Só o saldo inicial fica sem conta, e ele sempre tem investimento.",
    ("movimentos_de_investimento",),
    """SELECT COUNT(*) FROM movimentos_de_investimento
       WHERE (conta_id IS NULL AND origem <> 'saldo_inicial')
          OR (conta_id IS NOT NULL AND origem = 'saldo_inicial')
          OR (origem = 'saldo_inicial' AND investimento_id IS NULL)""",
)
_sql_de_contagem(
    "recorrencia_com_categoria_coerente",
    _ESTADOS,
    "Recorrência de gasto tem categoria e a de ganho não tem.",
    ("recorrencias",),
    """SELECT COUNT(*) FROM recorrencias
       WHERE (tipo = 'gasto' AND categoria IS NULL)
          OR (tipo = 'ganho' AND categoria IS NOT NULL)""",
)
_sql_de_contagem(
    "conta_importada_com_id_externo",
    _ESTADOS,
    "Conta de origem Open Finance tem id externo e a manual não tem.",
    ("contas",),
    """SELECT COUNT(*) FROM contas
       WHERE (origem = 'open_finance') <> (id_externo IS NOT NULL)""",
)
_sql_de_contagem(
    "casamento_completo",
    _ESTADOS,
    "Todo casamento da bolsa tem ao menos uma transação bruta e uma operação.",
    ("casamentos_de_operacao", "vinculos_de_casamento", "operacoes_do_casamento"),
    """SELECT COUNT(*) FROM casamentos_de_operacao c
       WHERE NOT EXISTS (SELECT 1 FROM vinculos_de_casamento v
                         WHERE v.casamento_id = c.id AND v.papel = 'bruto')
          OR NOT EXISTS (SELECT 1 FROM operacoes_do_casamento o WHERE o.casamento_id = c.id)""",
)
_sql_de_contagem(
    "transferencia_ativa_com_pontas_aceitas",
    _ESTADOS,
    "As pontas de uma transferência ativa são transações aceitas.",
    ("transferencias_entre_contas", "transacoes_importadas"),
    """SELECT COUNT(*) FROM transferencias_entre_contas x
       WHERE x.ativa = 1 AND (
         EXISTS (SELECT 1 FROM transacoes_importadas t
                 WHERE t.id = x.transacao_origem_id AND t.estado <> 'aceita')
         OR EXISTS (SELECT 1 FROM transacoes_importadas t
                    WHERE t.id = x.transacao_destino_id AND t.estado <> 'aceita'))""",
)

# ---------------------------------------------------------------- caixa sem resíduos (069)

_RESIDUOS = "residuos"
_LIGADA = "EXISTS (SELECT 1 FROM vinculos_de_casamento v WHERE v.transacao_importada_id = t.id)"
_COM_TRANSFERENCIA_ATIVA = """EXISTS (SELECT 1 FROM transferencias_entre_contas x
              WHERE x.ativa = 1
                AND (x.transacao_origem_id = t.id OR x.transacao_destino_id = t.id))"""
_sql_de_contagem(
    "pendente_sem_vestigio",
    _RESIDUOS,
    "Transação pendente não tem ligação da bolsa nem transferência ativa (nada a desfazer).",
    ("transacoes_importadas", "vinculos_de_casamento", "transferencias_entre_contas"),
    f"""SELECT COUNT(*) FROM transacoes_importadas t
        WHERE t.estado = 'pendente' AND ({_LIGADA} OR {_COM_TRANSFERENCIA_ATIVA})""",
)
_sql_de_contagem(
    "ligada_sem_gasto_nem_ganho",
    _RESIDUOS,
    "Transação ligada às operações da corretora não tem gasto nem ganho: a ligação a substitui.",
    ("transacoes_importadas", "vinculos_de_casamento", "gastos", "ganhos"),
    f"""SELECT COUNT(*) FROM transacoes_importadas t
        WHERE {_LIGADA}
          AND (EXISTS (SELECT 1 FROM gastos g WHERE g.transacao_importada_id = t.id)
               OR EXISTS (SELECT 1 FROM ganhos g WHERE g.transacao_importada_id = t.id))""",
)
_sql_de_contagem(
    "movimentos_da_ligacao_por_operacao",
    _RESIDUOS,
    "Uma ligação com aportes ou resgates registrados tem um por operação (a antiga tem zero).",
    (
        "casamentos_de_operacao",
        "vinculos_de_casamento",
        "operacoes_do_casamento",
        "movimentos_de_investimento",
    ),
    """SELECT COUNT(*) FROM (
         SELECT c.id,
                (SELECT COUNT(*) FROM operacoes_do_casamento o WHERE o.casamento_id = c.id) AS ops,
                (SELECT COUNT(*) FROM movimentos_de_investimento m
                   JOIN vinculos_de_casamento v
                     ON v.transacao_importada_id = m.transacao_importada_id
                  WHERE v.casamento_id = c.id AND v.papel = 'bruto'
                    AND m.origem = 'open_finance') AS movs
         FROM casamentos_de_operacao c) x
       WHERE x.movs > 0 AND x.movs <> x.ops""",
)
_sql_de_contagem(
    "liquidacao_de_bolsa_sem_gasto_novo",
    _RESIDUOS,
    "Liquidação bruta da bolsa não vira gasto (aviso: um gasto antigo é a trocar pela ligação).",
    ("transacoes_importadas", "gastos"),
    """SELECT COUNT(*) FROM gastos g JOIN transacoes_importadas t ON t.id = g.transacao_importada_id
       WHERE lower(t.descricao) LIKE 'liq bolsa%' AND lower(t.descricao) NOT LIKE '%tx %'""",
    "aviso",  # D7: gasto antigo não é defeito; a pessoa troca pela ligação quando quiser
)
_sql_de_contagem(
    "vencimento_confirmado_com_posicao",
    _RESIDUOS,
    "Vencimento confirmado é um resgate ligado a uma posição.",
    ("movimentos_de_investimento",),
    """SELECT COUNT(*) FROM movimentos_de_investimento
       WHERE vencimento_confirmado = 1 AND (tipo <> 'resgate' OR investimento_id IS NULL)""",
)
_sql_de_contagem(
    "metas_ate_100",
    _RESIDUOS,
    "A soma dos percentuais das metas de cada pessoa não passa de 100.",
    ("metas",),
    """SELECT COUNT(*) FROM (SELECT usuario_id FROM metas GROUP BY usuario_id
                            HAVING SUM(percentual) > 100)""",
)
_sql_de_contagem(
    "transferencia_coerente",
    _RESIDUOS,
    "Cada ponta de uma transferência ativa é da conta, do sentido e do valor dela.",
    ("transferencias_entre_contas", "transacoes_importadas"),
    """SELECT COUNT(*) FROM transferencias_entre_contas x
       WHERE x.ativa = 1 AND (
         EXISTS (SELECT 1 FROM transacoes_importadas t WHERE t.id = x.transacao_origem_id
                 AND (t.conta_id <> x.conta_origem_id OR t.sentido <> 'saida'
                      OR t.valor_centavos <> x.valor_centavos))
         OR EXISTS (SELECT 1 FROM transacoes_importadas t WHERE t.id = x.transacao_destino_id
                    AND (t.conta_id <> x.conta_destino_id OR t.sentido <> 'entrada'
                         OR t.valor_centavos <> x.valor_centavos)))""",
)
_sql_de_contagem(
    "reaplicacao_coerente",
    _RESIDUOS,
    "A reaplicação liga um resgate a um aporte de outra posição.",
    ("reaplicacoes_de_resgates", "movimentos_de_investimento"),
    """SELECT COUNT(*) FROM reaplicacoes_de_resgates r
       JOIN movimentos_de_investimento rg ON rg.id = r.resgate_id
       JOIN movimentos_de_investimento ap ON ap.id = r.aporte_id
       WHERE rg.tipo <> 'resgate' OR ap.tipo <> 'aporte'
          OR rg.investimento_id IS NULL OR ap.investimento_id IS NULL
          OR rg.investimento_id = ap.investimento_id""",
)


@verificacao(
    "saldo_da_conta_importada_do_cenario",
    _RESIDUOS,
    "Conta importada do cenário: o saldo é o do banco (o cartão é a dívida, negativa).",
    "contas",
)
def _saldo_da_conta_importada(conexao: sqlite3.Connection) -> int | None:
    import json

    from dados_de_teste.transporte_simulado import PASTA_DO_CENARIO

    esperados = {
        c["name"]: round((-1 if c["type"] == "CREDIT" else 1) * Decimal(str(c["balance"])) * 100)
        for c in json.loads((PASTA_DO_CENARIO / "accounts.json").read_text())["results"]
        if c["currencyCode"] == "BRL"
    }
    atuais = dict(
        conexao.execute(
            "SELECT nome, saldo_centavos FROM contas WHERE origem = 'open_finance'"
        ).fetchall()
    )
    if not set(esperados) & set(atuais):
        return None  # não é o banco do cenário
    return sum(
        1 for nome, saldo in atuais.items() if nome in esperados and esperados[nome] != saldo
    )


_sql_de_contagem(
    "compra_no_ciclo_da_fatura",
    _RESIDUOS,
    "A compra de uma fatura é de uma data dentro do ciclo dela.",
    ("transacoes_importadas", "faturas"),
    """SELECT COUNT(*) FROM transacoes_importadas t JOIN faturas f ON f.id = t.fatura_id
       WHERE t.data < f.inicio OR t.data > f.fechamento""",
)

# ---------------------------------------------------------------- identificação da conta (068)


def _tem_colunas(conexao: sqlite3.Connection, tabela: str, *colunas: str) -> bool:
    existentes = {linha[1] for linha in conexao.execute(f"PRAGMA table_info({tabela})")}
    return set(colunas) <= existentes


@verificacao(
    "final_da_conta_com_quatro_digitos",
    _RESIDUOS,
    "O final do número da conta, quando existe, tem exatamente quatro dígitos.",
    "contas",
)
def _final_da_conta(conexao: sqlite3.Connection) -> int | None:
    if not _tem_colunas(conexao, "contas", "final_do_numero"):
        return None  # esquema anterior à 068
    return _contar(
        conexao,
        """SELECT COUNT(*) FROM contas
           WHERE final_do_numero IS NOT NULL
             AND NOT (length(final_do_numero) = 4 AND final_do_numero NOT GLOB '*[^0-9]*')""",
    )


@verificacao(
    "apelido_unico_por_pessoa",
    _RESIDUOS,
    "Nenhuma pessoa tem dois apelidos iguais nas suas contas.",
    "contas",
)
def _apelido_unico(conexao: sqlite3.Connection) -> int | None:
    if not _tem_colunas(conexao, "contas", "apelido"):
        return None
    return _contar(
        conexao,
        """SELECT COUNT(*) FROM (
               SELECT 1 FROM contas WHERE apelido IS NOT NULL
               GROUP BY usuario_id, apelido HAVING COUNT(*) > 1)""",
    )


@verificacao(
    "conta_manual_sem_dados_do_banco",
    _RESIDUOS,
    "Conta manual não tem nome no banco nem final do número.",
    "contas",
)
def _conta_manual_sem_dados_do_banco(conexao: sqlite3.Connection) -> int | None:
    if not _tem_colunas(conexao, "contas", "nome_no_banco", "final_do_numero"):
        return None
    return _contar(
        conexao,
        """SELECT COUNT(*) FROM contas WHERE origem = 'manual'
             AND (nome_no_banco IS NOT NULL OR final_do_numero IS NOT NULL)""",
    )


# ---------------------------------------------------------------- catálogos (códigos em texto)


def _valores(enum: Iterable) -> tuple[str, ...]:
    return tuple(item.value for item in enum)


@dataclass(frozen=True, slots=True)
class ColunaDeCatalogo:
    tabela: str
    coluna: str
    permitidos: tuple[str, ...]
    aceita_nulo: bool = False


def _verificar_catalogo(nome: str, descricao: str, colunas: tuple[ColunaDeCatalogo, ...]) -> None:
    def executar(conexao: sqlite3.Connection) -> int:
        total = 0
        for c in colunas:
            if not _tabela_existe(conexao, c.tabela):
                continue
            marcadores = ", ".join("?" for _ in c.permitidos)
            # Tabela, coluna e valores vêm das constantes deste módulo, nunca de entrada externa.
            nulo = "" if c.aceita_nulo else f" OR {c.coluna} IS NULL"
            total += _contar(
                conexao,
                f"SELECT COUNT(*) FROM {c.tabela} WHERE {c.coluna} NOT IN ({marcadores}){nulo}",
                *c.permitidos,
            )
        return total

    VERIFICACOES.append(
        Verificacao(nome, "catalogos", descricao, executar, tuple({c.tabela for c in colunas}))
    )


_verificar_catalogo(
    "catalogo_de_categorias",
    "Toda categoria guardada existe no código (gastos, recorrências, metas e movimentos).",
    (
        ColunaDeCatalogo("gastos", "categoria", _valores(CategoriaDoGasto)),
        ColunaDeCatalogo("recorrencias", "categoria", _valores(CategoriaDoGasto), True),
        ColunaDeCatalogo("metas", "categoria", _valores(AlvoDaMeta)),
        ColunaDeCatalogo("historico_de_metas", "categoria", _valores(AlvoDaMeta)),
        ColunaDeCatalogo(
            "movimentos_de_investimento", "categoria", _valores(CategoriaDoGasto), True
        ),
        ColunaDeCatalogo("destinacoes", "categoria", _valores(CategoriaDoGasto), True),
    ),
)
_verificar_catalogo(
    "catalogo_de_contas",
    "Tipo, papel e origem das contas existem no código.",
    (
        ColunaDeCatalogo("contas", "tipo", _valores(TipoDaConta)),
        ColunaDeCatalogo("contas", "papel", _valores(PapelDaConta), True),
        ColunaDeCatalogo("contas", "origem", _valores(OrigemDaConta)),
    ),
)
_verificar_catalogo(
    "catalogo_de_lancamentos",
    "Origem, sentido, estado, motivo e fonte dos lançamentos existem no código.",
    (
        ColunaDeCatalogo("gastos", "origem", _valores(OrigemDoGasto)),
        ColunaDeCatalogo("ganhos", "origem", _valores(OrigemDoGanho)),
        ColunaDeCatalogo("transacoes_importadas", "sentido", _valores(SentidoDaTransacao)),
        ColunaDeCatalogo("transacoes_importadas", "estado", _valores(EstadoDaTransacaoImportada)),
        ColunaDeCatalogo(
            "transacoes_importadas", "motivo_ignorada", _valores(MotivoDaTransacaoIgnorada), True
        ),
        ColunaDeCatalogo("recorrencias", "tipo", _valores(TipoDeRecorrencia)),
        ColunaDeCatalogo("faturas", "fonte", _valores(FonteDaFatura)),
        ColunaDeCatalogo("chaves_de_api", "escopo", _valores(EscopoDaChave)),
    ),
)
_verificar_catalogo(
    "catalogo_de_investimentos",
    "Tipo e origem de movimentos, operações e casamentos existem no código.",
    (
        ColunaDeCatalogo("movimentos_de_investimento", "tipo", _valores(TipoDeMovimento)),
        ColunaDeCatalogo("movimentos_de_investimento", "origem", _valores(OrigemDoMovimento)),
        ColunaDeCatalogo("operacoes_de_investimento", "tipo", _valores(TipoDeOperacao)),
        ColunaDeCatalogo("operacoes_de_investimento", "origem", _valores(OrigemDaOperacao)),
        ColunaDeCatalogo("casamentos_de_operacao", "estado", _valores(EstadoDoCasamento)),
        ColunaDeCatalogo("vinculos_de_casamento", "papel", _valores(PapelDoVinculo)),
    ),
)
_verificar_catalogo(
    "catalogo_de_aparencia_e_cores",
    "Intensidade, textura, marca e cores das caixinhas existem no código.",
    (
        ColunaDeCatalogo("aparencias", "intensidade", _valores(IntensidadeDaCor)),
        ColunaDeCatalogo("aparencias", "textura", _valores(TexturaDoFundo)),
        ColunaDeCatalogo("aparencias", "marca", _valores(MarcaDoApp)),
        ColunaDeCatalogo("cores_das_destinacoes", "cor", _valores(CorDaDestinacao)),
    ),
)

# ---------------------------------------------------------------- frentes novas (065 e 066)
# A frente 063 (classe, nota e peso das estratégias) ainda não existe: quando existir, acrescentar
# aqui as verificações dela (pesos de cada estratégia somam 10.000; nota só em estratégia que usa
# notas), com ``requer_tabelas`` das tabelas novas.

_sql_de_contagem(
    "aparencia_valida",
    "frentes_novas",
    "A aparência tem matiz de 0 a 359 e nome de 1 a 20 caracteres, sem espaços nas pontas.",
    ("aparencias",),
    f"""SELECT COUNT(*) FROM aparencias
        WHERE matiz < 0 OR matiz > {MATIZ_MAXIMO} OR LENGTH(nome) < 1 OR LENGTH(nome) > 20
           OR nome <> TRIM(nome)""",
)
_sql_de_contagem(
    "caixinha_marcada_em_categoria_ativa",
    "frentes_novas",
    "A caixinha marcada no guardado está numa categoria ativa (não na legada).",
    ("caixinhas_marcadas",),
    "SELECT COUNT(*) FROM caixinhas_marcadas WHERE categoria NOT IN ("
    + ", ".join(f"'{c.value}'" for c in CategoriaDoGasto.ativas())
    + ")",
)
_sql_de_contagem(
    "guardado_nas_metas_valido",
    "frentes_novas",
    "A preferência do guardado nas metas é ligada (1) ou desligada (0).",
    ("preferencias_do_orcamento",),
    "SELECT COUNT(*) FROM preferencias_do_orcamento WHERE guardado_nas_metas NOT IN (0, 1)",
)

# ---------------------------------------------------------------- execução

_ESTRUTURA = ("integridade_do_sqlite", "chaves_estrangeiras", "esquema_na_cabeca_do_alembic")


def _tabela_existe(conexao: sqlite3.Connection, nome: str) -> bool:
    return (
        conexao.execute(
            "SELECT 1 FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?", (nome,)
        ).fetchone()
        is not None
    )


def abrir_somente_leitura(url_do_banco: str) -> sqlite3.Connection:
    """Abre o SQLite em modo ``ro`` e com ``query_only``: nada é escrito, nem por engano."""
    url = make_url(url_do_banco)
    if url.get_backend_name() != "sqlite" or url.database in (None, "", ":memory:"):
        raise ValueError("A revisão lê um banco SQLite em arquivo.")
    caminho = Path(url.database).resolve()
    if not caminho.is_file():
        raise FileNotFoundError("O arquivo do banco não existe (a revisão nunca cria banco).")
    conexao = sqlite3.connect(f"file:{caminho}?mode=ro", uri=True)
    conexao.execute("PRAGMA query_only=ON")
    return conexao


def _executar(conexao: sqlite3.Connection, v: Verificacao) -> ResultadoDaVerificacao:
    if any(not _tabela_existe(conexao, t) for t in v.requer_tabelas):
        return ResultadoDaVerificacao(v.nome, v.descricao, 0, aplica=False, nivel=v.nivel)
    falhas = v.executar(conexao)
    if falhas is None:
        return ResultadoDaVerificacao(v.nome, v.descricao, 0, aplica=False, nivel=v.nivel)
    return ResultadoDaVerificacao(v.nome, v.descricao, falhas, nivel=v.nivel)


def revisar(url_do_banco: str) -> list[ResultadoDaVerificacao]:
    """Roda o catálogo inteiro. Se o esquema não é o da cabeça das migrations, só a estrutura
    é conferida: o resto não faria sentido num esquema antigo."""
    conexao = abrir_somente_leitura(url_do_banco)
    try:
        resultados = [_executar(conexao, v) for v in VERIFICACOES if v.nome in _ESTRUTURA]
        if any(r.falhas for r in resultados if r.nome == "esquema_na_cabeca_do_alembic"):
            return resultados
        resultados += [_executar(conexao, v) for v in VERIFICACOES if v.nome not in _ESTRUTURA]
        return resultados
    finally:
        conexao.close()


def imprimir_relatorio(
    resultados: list[ResultadoDaVerificacao], saida: TextIO | None = None
) -> None:
    """Uma linha por verificação: situação, nome, contagem e descrição fixa."""
    import sys

    saida = saida or sys.stdout
    for r in resultados:
        if not r.aplica:
            situacao = "n/a  "
        elif r.falhas:
            situacao = "FALHA" if r.nivel == "erro" else "AVISO"
        else:
            situacao = "ok   "
        contagem = f" ({r.falhas} caso(s))" if r.aplica and r.falhas else ""
        print(f"[{situacao}] {r.nome}{contagem}: {r.descricao}", file=saida)
    com_falha = sum(1 for r in resultados if r.reprova)
    nao_se_aplicam = sum(1 for r in resultados if not r.aplica)
    print(
        f"{len(resultados)} verificações: {com_falha} com falha, {nao_se_aplicam} não se aplicam.",
        file=saida,
    )
