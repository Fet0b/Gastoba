"""Modelos ORM, separados das entidades do domain; os repositórios convertem entre eles.

Sem ``relationship()``: o flush do ORM não ordena os INSERT pelas chaves estrangeiras,
então pai e filho pendentes precisam de ``flush()`` entre eles.
"""

from datetime import UTC, date, datetime
from uuid import UUID

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Dialect,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    String,
    TypeDecorator,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class InstanteUtc(TypeDecorator[datetime]):
    """Instante sempre com fuso: gravado em UTC (sem fuso, como o SQLite guarda) e lido em UTC.

    O SQLite descarta o ``tzinfo`` em silêncio; sem esta conversão um horário de outro fuso
    seria gravado como se fosse UTC, e a leitura devolveria instantes ingênuos, que não se
    comparam com os do ``Relogio``.
    """

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Instante sem fuso horário não pode ser gravado.")
        return value.astimezone(UTC).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        return None if value is None else value.replace(tzinfo=UTC)


class Base(DeclarativeBase):
    """Base declarativa dos modelos ORM.

    A convenção de nomes dá nomes estáveis às constraints, de que as migrations em modo
    batch do SQLite precisam para recriar tabelas. Todo ``CheckConstraint`` precisa de
    ``name`` explícito, por causa do ``%(constraint_name)s``.
    """

    metadata = MetaData(
        naming_convention={
            "ix": "ix_%(table_name)s_%(column_0_N_name)s",
            "uq": "uq_%(table_name)s_%(column_0_N_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "pk": "pk_%(table_name)s",
        }
    )


class UsuarioModelo(Base):
    __tablename__ = "usuarios"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    nome: Mapped[str] = mapped_column(String(100))
    # Nulos no usuário padrão herdado; o SQLite permite vários NULL numa coluna UNIQUE.
    email: Mapped[str | None] = mapped_column(String(254), unique=True)
    senha_hash: Mapped[str | None] = mapped_column(String(255))


class ContaModelo(Base):
    __tablename__ = "contas"
    # NULLs não colidem: a unicidade do id externo só vale para as contas importadas.
    __table_args__ = (
        UniqueConstraint("usuario_id", "nome"),
        UniqueConstraint("usuario_id", "id_externo"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    usuario_id: Mapped[UUID] = mapped_column(ForeignKey("usuarios.id"), index=True)
    nome: Mapped[str] = mapped_column(String(100))
    saldo_centavos: Mapped[int] = mapped_column(BigInteger)
    origem: Mapped[str] = mapped_column(String(20), default="manual")
    id_externo: Mapped[str | None] = mapped_column(String(100), default=None)
    # Sem CHECK, como a categoria: a validação é do domain (TipoDaConta).
    tipo: Mapped[str] = mapped_column(String(20), default="corrente", server_default="corrente")


class GastoModelo(Base):
    __tablename__ = "gastos"
    __table_args__ = (
        CheckConstraint("valor_centavos > 0", name="valor_positivo"),
        Index(None, "conta_id", "data"),
        # Uma competência por recorrência: a geração nunca duplica (NULLs não colidem no SQLite).
        UniqueConstraint("recorrencia_id", "competencia"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    conta_id: Mapped[UUID] = mapped_column(ForeignKey("contas.id"))
    descricao: Mapped[str] = mapped_column(String(200))
    valor_centavos: Mapped[int] = mapped_column(BigInteger)
    data: Mapped[date] = mapped_column(Date)
    # Lista de textos das tags; filtrada com json_each do SQLite nos repositórios.
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    categoria: Mapped[str] = mapped_column(String(30))
    origem: Mapped[str] = mapped_column(String(20))
    recorrencia_id: Mapped[UUID | None] = mapped_column(ForeignKey("recorrencias.id"), default=None)
    competencia: Mapped[str | None] = mapped_column(String(7), default=None)


class GanhoModelo(Base):
    __tablename__ = "ganhos"
    __table_args__ = (
        CheckConstraint("valor_centavos > 0", name="valor_positivo"),
        Index(None, "conta_id", "data"),
        UniqueConstraint("recorrencia_id", "competencia"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    conta_id: Mapped[UUID] = mapped_column(ForeignKey("contas.id"))
    descricao: Mapped[str] = mapped_column(String(200))
    valor_centavos: Mapped[int] = mapped_column(BigInteger)
    data: Mapped[date] = mapped_column(Date)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    origem: Mapped[str] = mapped_column(String(20))
    recorrencia_id: Mapped[UUID | None] = mapped_column(ForeignKey("recorrencias.id"), default=None)
    competencia: Mapped[str | None] = mapped_column(String(7), default=None)


class TransacaoImportadaModelo(Base):
    __tablename__ = "transacoes_importadas"
    __table_args__ = (
        CheckConstraint("valor_centavos > 0", name="valor_positivo"),
        # Importar duas vezes a mesma transação da mesma conta nunca duplica.
        UniqueConstraint("conta_id", "id_externo"),
        Index(None, "conta_id", "estado"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    conta_id: Mapped[UUID] = mapped_column(ForeignKey("contas.id"))
    id_externo: Mapped[str] = mapped_column(String(100))
    data: Mapped[date] = mapped_column(Date)
    descricao: Mapped[str] = mapped_column(String(200))
    valor_centavos: Mapped[int] = mapped_column(BigInteger)
    sentido: Mapped[str] = mapped_column(String(10))
    tipo_de_operacao: Mapped[str | None] = mapped_column(String(60), default=None)
    estado: Mapped[str] = mapped_column(String(10), default="pendente")


class RecorrenciaModelo(Base):
    __tablename__ = "recorrencias"
    __table_args__ = (
        CheckConstraint("valor_centavos > 0", name="valor_positivo"),
        CheckConstraint("dia_do_mes BETWEEN 1 AND 31", name="dia_valido"),
        CheckConstraint("tipo IN ('ganho', 'gasto')", name="tipo_valido"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    usuario_id: Mapped[UUID] = mapped_column(ForeignKey("usuarios.id"), index=True)
    tipo: Mapped[str] = mapped_column(String(10))
    conta_id: Mapped[UUID] = mapped_column(ForeignKey("contas.id"))
    valor_centavos: Mapped[int] = mapped_column(BigInteger)
    descricao: Mapped[str] = mapped_column(String(200))
    dia_do_mes: Mapped[int] = mapped_column(Integer)
    inicio: Mapped[date] = mapped_column(Date)
    fim: Mapped[date | None] = mapped_column(Date, default=None)
    # Só no gasto; sem CHECK, como em gastos.categoria.
    categoria: Mapped[str | None] = mapped_column(String(30), default=None)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    ativa: Mapped[bool] = mapped_column(Boolean, default=True)


class MetaModelo(Base):
    __tablename__ = "metas"
    __table_args__ = (
        UniqueConstraint("usuario_id", "categoria"),
        CheckConstraint("percentual BETWEEN 1 AND 100", name="percentual_valido"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    usuario_id: Mapped[UUID] = mapped_column(ForeignKey("usuarios.id"), index=True)
    categoria: Mapped[str] = mapped_column(String(30))
    percentual: Mapped[int] = mapped_column(Integer)


class SessaoModelo(Base):
    """Sessão de login; guarda só o SHA-256 do token, nunca o token em claro."""

    __tablename__ = "sessoes"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    usuario_id: Mapped[UUID] = mapped_column(ForeignKey("usuarios.id"), index=True)
    hash_do_segredo: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    criada_em: Mapped[datetime] = mapped_column(InstanteUtc)
    expira_em: Mapped[datetime] = mapped_column(InstanteUtc)
    revogada: Mapped[bool] = mapped_column(Boolean, default=False)


class ChaveDeApiModelo(Base):
    """Chave de API; guarda só o SHA-256 do segredo, nunca o segredo em claro."""

    __tablename__ = "chaves_de_api"
    __table_args__ = (
        CheckConstraint("escopo IN ('leitura', 'escrita')", name="escopo_valido"),
        CheckConstraint("length(trim(nome)) >= 1 AND length(nome) <= 60", name="nome_valido"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    usuario_id: Mapped[UUID] = mapped_column(ForeignKey("usuarios.id"), index=True)
    nome: Mapped[str] = mapped_column(String(60))
    prefixo: Mapped[str] = mapped_column(String(8))
    hash_do_segredo: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    escopo: Mapped[str] = mapped_column(String(20))
    criada_em: Mapped[datetime] = mapped_column(InstanteUtc)
    ultimo_uso: Mapped[datetime | None] = mapped_column(InstanteUtc)
    expira_em: Mapped[datetime | None] = mapped_column(InstanteUtc)
    revogada: Mapped[bool] = mapped_column(Boolean, default=False)
