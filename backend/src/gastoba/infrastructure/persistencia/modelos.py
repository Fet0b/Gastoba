"""Modelos ORM, separados das entidades do domain; os repositórios convertem entre eles.

As associações de tags usam relacionamentos para carregar e ordenar suas linhas.
Nas demais relações, pai e filho pendentes precisam de ``flush()`` entre eles.
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
    Text,
    TypeDecorator,
    UniqueConstraint,
    Uuid,
    event,
    false,
    select,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, column_property, mapped_column, relationship


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


class RendaBaseModelo(Base):
    __tablename__ = "rendas_base"
    __table_args__ = (CheckConstraint("valor_centavos > 0", name="valor_positivo"),)

    usuario_id: Mapped[UUID] = mapped_column(ForeignKey("usuarios.id"), primary_key=True)
    valor_centavos: Mapped[int] = mapped_column(BigInteger)


class AparenciaModelo(Base):
    """Cor dominante, textura, nome e logo do app de uma pessoa (uma linha por pessoa)."""

    __tablename__ = "aparencias"
    __table_args__ = (CheckConstraint("matiz BETWEEN 0 AND 359", name="matiz_valida"),)

    usuario_id: Mapped[UUID] = mapped_column(
        ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True
    )
    matiz: Mapped[int] = mapped_column(Integer)
    # Textos sem CHECK de valores: opção nova não pede migration; código antigo cai no padrão.
    intensidade: Mapped[str] = mapped_column(String(20))
    textura: Mapped[str] = mapped_column(String(20))
    nome: Mapped[str] = mapped_column(String(20))
    marca: Mapped[str] = mapped_column(String(20))


class PreferenciaDoOrcamentoModelo(Base):
    """Preferências do Orçamento de uma pessoa (uma linha por pessoa)."""

    __tablename__ = "preferencias_do_orcamento"

    usuario_id: Mapped[UUID] = mapped_column(
        ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True
    )
    guardado_nas_metas: Mapped[bool] = mapped_column(Boolean)


class CaixinhaMarcadaModelo(Base):
    """Caixinha marcada como guardada para compras de uma categoria (só exibição, 066).

    O dono é o da destinação (3FN); a chave primária garante uma categoria por caixinha."""

    __tablename__ = "caixinhas_marcadas"

    destinacao_id: Mapped[UUID] = mapped_column(
        ForeignKey("destinacoes_cadastradas.id", ondelete="CASCADE"), primary_key=True
    )
    # Texto sem CHECK, como gastos.categoria: categoria nova não pede migration.
    categoria: Mapped[str] = mapped_column(String(30))


class ContaModelo(Base):
    __tablename__ = "contas"
    # NULLs não colidem: a unicidade do id externo só vale para as contas importadas.
    __table_args__ = (
        UniqueConstraint("usuario_id", "nome"),
        UniqueConstraint("usuario_id", "id_externo"),
        CheckConstraint("origem IN ('manual', 'open_finance')", name="origem_valida"),
        CheckConstraint(
            "(origem = 'open_finance') = (id_externo IS NOT NULL)", name="id_externo_so_no_banco"
        ),
        # Índice único (e não UniqueConstraint): a migration não recria a tabela, para não apagar
        # os gatilhos nem a visão que dependem dela. NULLs não colidem.
        Index("uq_contas_usuario_id_apelido", "usuario_id", "apelido", unique=True),
        CheckConstraint(
            "apelido IS NULL OR length(trim(apelido)) BETWEEN 1 AND 40", name="apelido_valido"
        ),
        CheckConstraint(
            "final_do_numero IS NULL OR final_do_numero GLOB '[0-9][0-9][0-9][0-9]'",
            name="final_do_numero_valido",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    usuario_id: Mapped[UUID] = mapped_column(ForeignKey("usuarios.id"), index=True)
    nome: Mapped[str] = mapped_column(String(100))
    saldo_centavos: Mapped[int] = mapped_column(BigInteger)
    origem: Mapped[str] = mapped_column(String(20), default="manual")
    id_externo: Mapped[str | None] = mapped_column(String(100), default=None)
    papel: Mapped[str | None] = mapped_column(String(20), default=None)
    # Sem CHECK, como a categoria: a validação é do domain (TipoDaConta).
    tipo: Mapped[str] = mapped_column(String(20), default="corrente", server_default="corrente")
    # Da pessoa (apelido) e do banco (nome e quatro últimos dígitos do número), todos opcionais.
    apelido: Mapped[str | None] = mapped_column(String(40), default=None)
    nome_no_banco: Mapped[str | None] = mapped_column(String(100), default=None)
    final_do_numero: Mapped[str | None] = mapped_column(String(4), default=None)


class CadastroDeDestinacaoModelo(Base):
    __tablename__ = "destinacoes_cadastradas"
    __table_args__ = (UniqueConstraint("usuario_id", "nome"),)
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    usuario_id: Mapped[UUID] = mapped_column(ForeignKey("usuarios.id"), index=True)
    nome: Mapped[str] = mapped_column(String(30))
    icone: Mapped[str | None] = mapped_column(String(20), nullable=True)


class TagModelo(Base):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("usuario_id", "nome"),)
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    usuario_id: Mapped[UUID] = mapped_column(ForeignKey("usuarios.id"), index=True)
    nome: Mapped[str] = mapped_column(String(30))


class GastoModelo(Base):
    __tablename__ = "gastos"
    __table_args__ = (
        CheckConstraint("valor_centavos > 0", name="valor_positivo"),
        Index(None, "conta_id", "data"),
        # Uma competência por recorrência: a geração nunca duplica (NULLs não colidem no SQLite).
        UniqueConstraint("recorrencia_id", "competencia"),
        CheckConstraint("origem IN ('manual', 'open_finance')", name="origem_valida"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    conta_id: Mapped[UUID] = mapped_column(ForeignKey("contas.id"))
    descricao: Mapped[str] = mapped_column(String(200))
    valor_centavos: Mapped[int] = mapped_column(BigInteger)
    data: Mapped[date] = mapped_column(Date)
    # Associações ordenadas; a ordem determina o resto de centavos no rateio por tag.
    tags_associadas: Mapped[list[TagDeGastoModelo]] = relationship(
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
        order_by="TagDeGastoModelo.ordem",
    )

    @property
    def tags(self) -> list[str]:
        return [associacao.tag.nome for associacao in self.tags_associadas]

    categoria: Mapped[str] = mapped_column(String(30))
    origem: Mapped[str] = mapped_column(String(20))
    recorrencia_id: Mapped[UUID | None] = mapped_column(ForeignKey("recorrencias.id"), default=None)
    competencia: Mapped[str | None] = mapped_column(String(7), default=None)

    transacao_importada_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("transacoes_importadas.id"), default=None, index=True
    )


class GanhoModelo(Base):
    __tablename__ = "ganhos"
    __table_args__ = (
        CheckConstraint("valor_centavos > 0", name="valor_positivo"),
        Index(None, "conta_id", "data"),
        UniqueConstraint("recorrencia_id", "competencia"),
        CheckConstraint("origem IN ('manual', 'open_finance')", name="origem_valida"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    conta_id: Mapped[UUID] = mapped_column(ForeignKey("contas.id"))
    descricao: Mapped[str] = mapped_column(String(200))
    valor_centavos: Mapped[int] = mapped_column(BigInteger)
    data: Mapped[date] = mapped_column(Date)
    tags_associadas: Mapped[list[TagDeGanhoModelo]] = relationship(
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
        order_by="TagDeGanhoModelo.ordem",
    )

    @property
    def tags(self) -> list[str]:
        return [associacao.tag.nome for associacao in self.tags_associadas]

    origem: Mapped[str] = mapped_column(String(20))
    recorrencia_id: Mapped[UUID | None] = mapped_column(ForeignKey("recorrencias.id"), default=None)
    competencia: Mapped[str | None] = mapped_column(String(7), default=None)

    transacao_importada_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("transacoes_importadas.id"), default=None, index=True
    )


class TransacaoImportadaModelo(Base):
    motivo_ignorada: Mapped[str | None] = mapped_column(
        String(40),
        CheckConstraint(
            "motivo_ignorada IS NULL OR motivo_ignorada IN "
            "('transferencia_entre_contas', 'movimento_interno_da_conta')",
            name="motivo_ignorada_valido",
        ),
        CheckConstraint("motivo_ignorada IS NULL OR estado = 'ignorada'", name="motivo_coerente"),
    )
    __tablename__ = "transacoes_importadas"
    __table_args__ = (
        CheckConstraint("valor_centavos > 0", name="valor_positivo"),
        # Importar duas vezes a mesma transação da mesma conta nunca duplica.
        UniqueConstraint("conta_id", "id_externo"),
        Index(None, "conta_id", "estado"),
        CheckConstraint("sentido IN ('entrada', 'saida')", name="sentido_valido"),
        CheckConstraint("estado IN ('pendente', 'aceita', 'ignorada')", name="estado_valido"),
        CheckConstraint(
            "(parcela_numero IS NULL AND parcela_total IS NULL) OR "
            "(parcela_numero IS NOT NULL AND parcela_total IS NOT NULL "
            "AND parcela_numero >= 1 AND parcela_total >= parcela_numero)",
            name="parcela_valida",
        ),
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
    # Só em compras de cartão; a fatura some sem apagar a transação (``SET NULL``).
    fatura_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("faturas.id", ondelete="SET NULL"), default=None, index=True
    )
    id_externo_da_fatura: Mapped[str | None] = mapped_column(String(100), default=None)
    parcela_numero: Mapped[int | None] = mapped_column(Integer, default=None)
    parcela_total: Mapped[int | None] = mapped_column(Integer, default=None)


class FaturaModelo(Base):
    __tablename__ = "faturas"
    __table_args__ = (
        CheckConstraint("total_centavos >= 0", name="total_nao_negativo"),
        CheckConstraint("minimo_centavos >= 0", name="minimo_nao_negativo"),
        CheckConstraint("fonte IN ('banco', 'estimada')", name="fonte_valida"),
        # Sincronizar de novo atualiza a fatura do ciclo; nunca duplica.
        UniqueConstraint("conta_id", "fechamento"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    conta_id: Mapped[UUID] = mapped_column(ForeignKey("contas.id"), index=True)
    id_externo: Mapped[str | None] = mapped_column(String(100), default=None)
    inicio: Mapped[date | None] = mapped_column(Date, default=None)
    fechamento: Mapped[date] = mapped_column(Date)
    vencimento: Mapped[date | None] = mapped_column(Date, default=None)
    total_centavos: Mapped[int] = mapped_column(BigInteger)
    minimo_centavos: Mapped[int | None] = mapped_column(BigInteger, default=None)
    fonte: Mapped[str] = mapped_column(String(10))


class PagamentoDeFaturaModelo(Base):
    __tablename__ = "pagamentos_de_fatura"
    __table_args__ = (
        CheckConstraint("valor_centavos > 0", name="valor_positivo"),
        # O mesmo pagamento lido duas vezes não duplica.
        UniqueConstraint("fatura_id", "data", "valor_centavos"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    fatura_id: Mapped[UUID] = mapped_column(ForeignKey("faturas.id", ondelete="CASCADE"))
    data: Mapped[date] = mapped_column(Date)
    valor_centavos: Mapped[int] = mapped_column(BigInteger)
    forma: Mapped[str | None] = mapped_column(String(30), default=None)


class InvestimentoModelo(Base):
    __tablename__ = "investimentos"
    __table_args__ = (
        # Sincronizar de novo atualiza a posição; nunca duplica.
        UniqueConstraint("usuario_id", "id_externo"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    usuario_id: Mapped[UUID] = mapped_column(ForeignKey("usuarios.id"))
    conta_remunerada_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("contas.id"), unique=True, default=None
    )
    id_externo: Mapped[str] = mapped_column(String(100))
    nome: Mapped[str] = mapped_column(String(200))
    tipo: Mapped[str] = mapped_column(String(30))
    subtipo: Mapped[str | None] = mapped_column(String(30), default=None)
    saldo_centavos: Mapped[int] = mapped_column(BigInteger)
    # Quanto foi aplicado e o lucro até hoje, como a instituição informa; nulos se não informa.
    valor_aplicado_centavos: Mapped[int | None] = mapped_column(BigInteger, default=None)
    rendimento_centavos: Mapped[int | None] = mapped_column(BigInteger, default=None)
    # O registro inteiro da Pluggy em JSON: o que o Gastoba ainda não usa não se perde.
    dados: Mapped[str] = mapped_column(Text)


class MovimentoDeInvestimentoModelo(Base):
    vencimento_confirmado: Mapped[bool] = mapped_column(Boolean, server_default=false())
    __tablename__ = "movimentos_de_investimento"
    __table_args__ = (
        CheckConstraint("valor_centavos > 0", name="valor_positivo"),
        CheckConstraint(
            "tipo IN ('aporte', 'resgate', 'rendimento', 'custo', 'imposto')", name="tipo_valido"
        ),
        CheckConstraint(
            "origem IN ('manual', 'open_finance', 'saldo_inicial')", name="origem_valida"
        ),
        # Só o saldo inicial não sai de uma conta, e ele sempre pertence a um investimento.
        CheckConstraint(
            "(conta_id IS NULL) = (origem = 'saldo_inicial')", name="conta_so_no_saldo_inicial"
        ),
        CheckConstraint(
            "origem <> 'saldo_inicial' OR investimento_id IS NOT NULL",
            name="saldo_inicial_com_investimento",
        ),
        Index(None, "conta_id", "data"),
        Index(None, "investimento_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    # Nulo só no saldo inicial (origem ``saldo_inicial``), cujo dono é o do investimento.
    conta_id: Mapped[UUID | None] = mapped_column(ForeignKey("contas.id"), default=None)
    investimento_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("investimentos.id"), default=None
    )
    movimento_relacionado_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("movimentos_de_investimento.id"), default=None, index=True
    )
    categoria: Mapped[str | None] = mapped_column(String(30), default=None)
    revisao_contabil_pendente: Mapped[bool] = mapped_column(Boolean, server_default=false())
    revisao_pendente: Mapped[bool] = mapped_column(Boolean, server_default=false())
    tipo: Mapped[str] = mapped_column(String(10))
    descricao: Mapped[str] = mapped_column(String(200))
    valor_centavos: Mapped[int] = mapped_column(BigInteger)
    data: Mapped[date] = mapped_column(Date)
    origem: Mapped[str] = mapped_column(String(20))

    transacao_importada_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("transacoes_importadas.id"), default=None, index=True
    )


class CoberturaDeCompraModelo(Base):
    __tablename__ = "coberturas_de_compra"
    __table_args__ = (
        CheckConstraint("valor_centavos > 0", name="valor_positivo"),
        UniqueConstraint("gasto_id", "destinacao_id"),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    gasto_id: Mapped[UUID] = mapped_column(ForeignKey("gastos.id"), index=True)
    destinacao_id: Mapped[UUID] = mapped_column(
        ForeignKey("destinacoes_cadastradas.id"), index=True
    )
    tag = column_property(
        select(CadastroDeDestinacaoModelo.nome)
        .where(CadastroDeDestinacaoModelo.id == destinacao_id)
        .correlate_except(CadastroDeDestinacaoModelo)
        .scalar_subquery()
    )
    valor_centavos: Mapped[int] = mapped_column(BigInteger)
    # O resgate real que pagou a compra e o principal que ele abateu (nulos: só métrica).
    movimento_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("movimentos_de_investimento.id"), nullable=True, index=True
    )
    principal_centavos: Mapped[int | None] = mapped_column(BigInteger, nullable=True)


class CorDaDestinacaoModelo(Base):
    __tablename__ = "cores_das_destinacoes"
    __table_args__ = (UniqueConstraint("destinacao_id"),)
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    destinacao_id: Mapped[UUID] = mapped_column(
        ForeignKey("destinacoes_cadastradas.id"), index=True
    )
    usuario_id = column_property(
        select(CadastroDeDestinacaoModelo.usuario_id)
        .where(CadastroDeDestinacaoModelo.id == destinacao_id)
        .correlate_except(CadastroDeDestinacaoModelo)
        .scalar_subquery()
    )
    tag = column_property(
        select(CadastroDeDestinacaoModelo.nome)
        .where(CadastroDeDestinacaoModelo.id == destinacao_id)
        .correlate_except(CadastroDeDestinacaoModelo)
        .scalar_subquery()
    )
    cor: Mapped[str] = mapped_column(String(20))


class DestinacaoModelo(Base):
    __tablename__ = "destinacoes"
    __table_args__ = (
        CheckConstraint("valor_centavos <> 0", name="valor_nao_nulo"),
        CheckConstraint(
            "principal_centavos IS NULL OR "
            "(principal_centavos <> 0 AND (principal_centavos > 0) = (valor_centavos > 0))",
            name="principal_do_mesmo_sinal",
        ),
        UniqueConstraint("movimento_id", "destinacao_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    movimento_id: Mapped[UUID] = mapped_column(
        ForeignKey("movimentos_de_investimento.id"), index=True
    )
    # O investimento é o do movimento: guardá-lo aqui também seria uma segunda fonte da verdade.
    destinacao_id: Mapped[UUID] = mapped_column(
        ForeignKey("destinacoes_cadastradas.id"), index=True
    )
    tag = column_property(
        select(CadastroDeDestinacaoModelo.nome)
        .where(CadastroDeDestinacaoModelo.id == destinacao_id)
        .correlate_except(CadastroDeDestinacaoModelo)
        .scalar_subquery()
    )
    # Com sinal: positivo no aporte, negativo no resgate.
    valor_centavos: Mapped[int] = mapped_column(BigInteger)
    # Principal abatido, só nos resgates por custo médio; nulo = o próprio valor (linhas antigas).
    principal_centavos: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    # Foto da categoria do vínculo da tag na hora do aporte; nula sem vínculo (e nos resgates).
    categoria: Mapped[str | None] = mapped_column(String(30), nullable=True)


class RealocacaoModelo(Base):
    __tablename__ = "realocacoes"
    __table_args__ = (
        CheckConstraint("valor_centavos > 0", name="valor_positivo"),
        CheckConstraint("destinacao_origem_id <> destinacao_destino_id", name="tags_diferentes"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    investimento_id: Mapped[UUID] = mapped_column(ForeignKey("investimentos.id"), index=True)
    data: Mapped[date] = mapped_column(Date)
    destinacao_origem_id: Mapped[UUID] = mapped_column(
        ForeignKey("destinacoes_cadastradas.id"), index=True
    )
    tag_origem = column_property(
        select(CadastroDeDestinacaoModelo.nome)
        .where(CadastroDeDestinacaoModelo.id == destinacao_origem_id)
        .correlate_except(CadastroDeDestinacaoModelo)
        .scalar_subquery()
    )
    destinacao_destino_id: Mapped[UUID] = mapped_column(
        ForeignKey("destinacoes_cadastradas.id"), index=True
    )
    tag_destino = column_property(
        select(CadastroDeDestinacaoModelo.nome)
        .where(CadastroDeDestinacaoModelo.id == destinacao_destino_id)
        .correlate_except(CadastroDeDestinacaoModelo)
        .scalar_subquery()
    )
    valor_centavos: Mapped[int] = mapped_column(BigInteger)


class HistoricoDeInvestimentoModelo(Base):
    __tablename__ = "investimentos_historico"
    __table_args__ = (
        # Um saldo por investimento e dia: sincronizar de novo no mesmo dia só o atualiza.
        UniqueConstraint("investimento_id", "data"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    investimento_id: Mapped[UUID] = mapped_column(ForeignKey("investimentos.id"), index=True)
    data: Mapped[date] = mapped_column(Date)
    saldo_centavos: Mapped[int] = mapped_column(BigInteger)


class RecorrenciaModelo(Base):
    __tablename__ = "recorrencias"
    __table_args__ = (
        CheckConstraint("valor_centavos > 0", name="valor_positivo"),
        CheckConstraint("dia_do_mes BETWEEN 1 AND 31", name="dia_valido"),
        CheckConstraint("tipo IN ('ganho', 'gasto')", name="tipo_valido"),
        # O gasto exige categoria e o ganho não tem.
        CheckConstraint("(tipo = 'gasto') = (categoria IS NOT NULL)", name="categoria_so_no_gasto"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    tipo: Mapped[str] = mapped_column(String(10))
    # O dono da recorrência é o da conta: não há usuario_id aqui, para não haver duas fontes.
    conta_id: Mapped[UUID] = mapped_column(ForeignKey("contas.id"), index=True)
    valor_centavos: Mapped[int] = mapped_column(BigInteger)
    descricao: Mapped[str] = mapped_column(String(200))
    dia_do_mes: Mapped[int] = mapped_column(Integer)
    inicio: Mapped[date] = mapped_column(Date)
    fim: Mapped[date | None] = mapped_column(Date, default=None)
    # Só no gasto; sem CHECK, como em gastos.categoria.
    categoria: Mapped[str | None] = mapped_column(String(30), default=None)
    tags_associadas: Mapped[list[TagDeRecorrenciaModelo]] = relationship(
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
        order_by="TagDeRecorrenciaModelo.ordem",
    )

    @property
    def tags(self) -> list[str]:
        return [associacao.tag.nome for associacao in self.tags_associadas]

    ativa: Mapped[bool] = mapped_column(Boolean, default=True)


class ReaplicacaoDeResgateModelo(Base):
    __tablename__ = "reaplicacoes_de_resgates"
    __table_args__ = (
        CheckConstraint("valor_centavos > 0", name="valor_positivo"),
        UniqueConstraint("resgate_id"),
        UniqueConstraint("aporte_id"),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    resgate_id: Mapped[UUID] = mapped_column(
        ForeignKey("movimentos_de_investimento.id", ondelete="RESTRICT")
    )
    aporte_id: Mapped[UUID] = mapped_column(
        ForeignKey("movimentos_de_investimento.id", ondelete="RESTRICT")
    )
    valor_centavos: Mapped[int] = mapped_column(BigInteger)


class HistoricoDeMetaModelo(Base):
    __tablename__ = "historico_de_metas"
    __table_args__ = (
        CheckConstraint("acao IN ('criada','alterada','removida')", name="acao_valida"),
        CheckConstraint(
            "(acao = 'criada' AND percentual_anterior IS NULL AND percentual_novo IS NOT "
            "NULL) OR (acao = 'alterada' AND percentual_anterior IS NOT NULL AND "
            "percentual_novo IS NOT NULL AND percentual_anterior != percentual_novo) OR "
            "(acao = 'removida' AND percentual_anterior IS NOT NULL AND percentual_novo "
            "IS NULL)",
            name="acao_coerente",
        ),
        CheckConstraint(
            "percentual_anterior IS NULL OR percentual_anterior BETWEEN 1 AND 100",
            name="anterior_valido",
        ),
        CheckConstraint(
            "percentual_novo IS NULL OR percentual_novo BETWEEN 1 AND 100", name="novo_valido"
        ),
        Index("ix_historico_de_metas_usuario_id_instante", "usuario_id", "instante"),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    usuario_id: Mapped[UUID] = mapped_column(ForeignKey("usuarios.id"))
    categoria: Mapped[str] = mapped_column(String(30))
    percentual_anterior: Mapped[int | None] = mapped_column(Integer)
    percentual_novo: Mapped[int | None] = mapped_column(Integer)
    acao: Mapped[str] = mapped_column(String(10))
    instante: Mapped[datetime] = mapped_column(InstanteUtc)


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


class ReversaoDeClassificacaoModelo(Base):
    __tablename__ = "reversoes_de_classificacao"
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    usuario_id: Mapped[UUID] = mapped_column(ForeignKey("usuarios.id"), nullable=False)
    transacao_id: Mapped[UUID] = mapped_column(
        ForeignKey("transacoes_importadas.id"), nullable=False
    )
    estado_anterior: Mapped[str] = mapped_column(String(10), nullable=False)
    instante: Mapped[datetime] = mapped_column(InstanteUtc(), nullable=False)
    lancamentos: Mapped[list] = mapped_column(JSON, nullable=False)


class TransferenciaEntreContasModelo(Base):
    __tablename__ = "transferencias_entre_contas"
    __table_args__ = (
        CheckConstraint("valor_centavos > 0", name="valor_positivo"),
        CheckConstraint("conta_origem_id <> conta_destino_id", name="contas_distintas"),
        CheckConstraint(
            "transacao_origem_id IS NOT NULL OR transacao_destino_id IS NOT NULL", name="tem_ponta"
        ),
    )
    # Cada transação tem sentido fixo: saída só ocupa origem e entrada só destino.
    # As validações relacionais impedem reutilização cruzada entre as duas colunas.
    __table_args__ += (
        Index(
            "uq_transferencia_ativa_origem",
            "transacao_origem_id",
            unique=True,
            sqlite_where=text("ativa = 1"),
        ),
        Index(
            "uq_transferencia_ativa_destino",
            "transacao_destino_id",
            unique=True,
            sqlite_where=text("ativa = 1"),
        ),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    usuario_id: Mapped[UUID] = mapped_column(ForeignKey("usuarios.id"), index=True)
    conta_origem_id: Mapped[UUID] = mapped_column(ForeignKey("contas.id"))
    conta_destino_id: Mapped[UUID] = mapped_column(ForeignKey("contas.id"))
    valor_centavos: Mapped[int] = mapped_column(BigInteger)
    data: Mapped[date] = mapped_column(Date)
    papel_origem: Mapped[str] = mapped_column(String(20))
    papel_destino: Mapped[str] = mapped_column(String(20))
    transacao_origem_id: Mapped[UUID | None] = mapped_column(ForeignKey("transacoes_importadas.id"))
    transacao_destino_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("transacoes_importadas.id")
    )
    competencia_provisoria: Mapped[bool] = mapped_column(Boolean)
    ativa: Mapped[bool] = mapped_column(Boolean)


class ReferenciaMensalDaCaixinhaModelo(Base):
    __tablename__ = "referencias_mensais_de_caixinhas"
    __table_args__ = (
        CheckConstraint(
            "saldo_inicial_centavos >= 0 AND saldo_final_centavos >= 0", name="saldos_nao_negativos"
        ),
    )
    investimento_id: Mapped[UUID] = mapped_column(ForeignKey("investimentos.id"), primary_key=True)
    mes: Mapped[str] = mapped_column(String(7), primary_key=True)
    saldo_inicial_centavos: Mapped[int] = mapped_column(BigInteger)
    saldo_final_centavos: Mapped[int] = mapped_column(BigInteger)
    periodo_completo: Mapped[bool] = mapped_column(Boolean)


class TagDeGastoModelo(Base):
    __tablename__ = "tags_de_gastos"
    __table_args__ = (
        UniqueConstraint("gasto_id", "ordem"),
        CheckConstraint("ordem >= 0", name="ordem_nao_negativa"),
    )
    gasto_id: Mapped[UUID] = mapped_column(
        ForeignKey("gastos.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[UUID] = mapped_column(ForeignKey("tags.id"), primary_key=True)
    ordem: Mapped[int] = mapped_column(Integer)
    tag: Mapped[TagModelo] = relationship(lazy="joined")


class TagDeGanhoModelo(Base):
    __tablename__ = "tags_de_ganhos"
    __table_args__ = (
        UniqueConstraint("ganho_id", "ordem"),
        CheckConstraint("ordem >= 0", name="ordem_nao_negativa"),
    )
    ganho_id: Mapped[UUID] = mapped_column(
        ForeignKey("ganhos.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[UUID] = mapped_column(ForeignKey("tags.id"), primary_key=True)
    ordem: Mapped[int] = mapped_column(Integer)
    tag: Mapped[TagModelo] = relationship(lazy="joined")


class TagDeRecorrenciaModelo(Base):
    __tablename__ = "tags_de_recorrencias"
    __table_args__ = (
        UniqueConstraint("recorrencia_id", "ordem"),
        CheckConstraint("ordem >= 0", name="ordem_nao_negativa"),
    )
    recorrencia_id: Mapped[UUID] = mapped_column(
        ForeignKey("recorrencias.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[UUID] = mapped_column(ForeignKey("tags.id"), primary_key=True)
    ordem: Mapped[int] = mapped_column(Integer)
    tag: Mapped[TagModelo] = relationship(lazy="joined")


@event.listens_for(Base.metadata, "after_create")
def instalar_integridade_relacional(metadata, conexao, **kwargs) -> None:
    from gastoba.infrastructure.persistencia.integridade_relacional import instalar

    instalar(conexao)


class PosicaoDeInvestimentoModelo(Base):
    __tablename__ = "posicoes_de_investimento"

    investimento_id: Mapped[UUID] = mapped_column(
        ForeignKey("investimentos.id", ondelete="RESTRICT"), primary_key=True
    )
    # Texto decimal: a quantidade nunca passa por float.
    quantidade_observada: Mapped[str | None] = mapped_column(String(40), default=None)
    valor_de_mercado_centavos: Mapped[int | None] = mapped_column(BigInteger, default=None)
    atualizada_em: Mapped[datetime | None] = mapped_column(DateTime, default=None)


class OperacaoDeInvestimentoModelo(Base):
    __tablename__ = "operacoes_de_investimento"
    __table_args__ = (
        UniqueConstraint("posicao_id", "id_externo"),
        CheckConstraint("valor_bruto_centavos >= 0", name="valor_nao_negativo"),
        CheckConstraint("custos_centavos >= 0", name="custos_nao_negativos"),
        CheckConstraint("quantidade NOT LIKE '-%'", name="quantidade_nao_negativa"),
        CheckConstraint(
            "tipo IN ('COMPRA','VENDA','PROVENTO','TAXA','IMPOSTO','VENCIMENTO','ABERTURA')",
            name="tipo_valido",
        ),
        CheckConstraint("origem IN ('pluggy','manual','abertura')", name="origem_valida"),
        CheckConstraint("tipo != 'ABERTURA' OR id_externo IS NULL", name="abertura_sem_id_externo"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    posicao_id: Mapped[UUID] = mapped_column(
        ForeignKey("posicoes_de_investimento.investimento_id", ondelete="RESTRICT")
    )
    tipo: Mapped[str] = mapped_column(String(12))
    data: Mapped[date] = mapped_column(Date)
    quantidade: Mapped[str] = mapped_column(String(40))
    valor_bruto_centavos: Mapped[int] = mapped_column(BigInteger)
    custos_centavos: Mapped[int] = mapped_column(BigInteger, server_default="0")
    origem: Mapped[str] = mapped_column(String(10))
    id_externo: Mapped[str | None] = mapped_column(String(120), default=None)
    operacao_relacionada_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("operacoes_de_investimento.id", ondelete="RESTRICT"), default=None
    )
    # Quantidade derivada na migração: enquanto estimada, o histórico não conta como completo.
    quantidade_estimada: Mapped[bool] = mapped_column(Boolean, server_default=false())


class AlocacaoDeCaixinhaModelo(Base):
    __tablename__ = "alocacoes_de_caixinha"
    __table_args__ = (CheckConstraint("peso_centavos > 0", name="peso_positivo"),)

    posicao_id: Mapped[UUID] = mapped_column(
        ForeignKey("posicoes_de_investimento.investimento_id", ondelete="RESTRICT"),
        primary_key=True,
    )
    destinacao_id: Mapped[UUID] = mapped_column(
        ForeignKey("destinacoes_cadastradas.id", ondelete="RESTRICT"), primary_key=True
    )
    peso_centavos: Mapped[int] = mapped_column(BigInteger)


class MudancaDeFracaoModelo(Base):
    """Mudança datada da fração de uma caixinha (072): alocação da parte sem caixinha (sem
    origem) ou realocação entre caixinhas. Os pesos atuais ficam em ``alocacoes_de_caixinha``."""

    __tablename__ = "mudancas_de_fracao"
    __table_args__ = (
        CheckConstraint("valor_centavos > 0", name="valor_positivo"),
        CheckConstraint(
            "destinacao_origem_id IS NULL OR destinacao_origem_id <> destinacao_destino_id",
            name="origem_diferente_do_destino",
        ),
        Index("ix_mudancas_de_fracao_posicao_id_data", "posicao_id", "data"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    posicao_id: Mapped[UUID] = mapped_column(
        ForeignKey("posicoes_de_investimento.investimento_id", ondelete="RESTRICT")
    )
    data: Mapped[date] = mapped_column(Date)
    destinacao_destino_id: Mapped[UUID] = mapped_column(
        ForeignKey("destinacoes_cadastradas.id", ondelete="RESTRICT")
    )
    tag_destino = column_property(
        select(CadastroDeDestinacaoModelo.nome)
        .where(CadastroDeDestinacaoModelo.id == destinacao_destino_id)
        .correlate_except(CadastroDeDestinacaoModelo)
        .scalar_subquery()
    )
    destinacao_origem_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("destinacoes_cadastradas.id", ondelete="RESTRICT"), default=None
    )
    tag_origem = column_property(
        select(CadastroDeDestinacaoModelo.nome)
        .where(CadastroDeDestinacaoModelo.id == destinacao_origem_id)
        .correlate_except(CadastroDeDestinacaoModelo)
        .scalar_subquery()
    )
    valor_centavos: Mapped[int] = mapped_column(BigInteger)
    criada_em: Mapped[datetime] = mapped_column(InstanteUtc, default=lambda: datetime.now(UTC))


class CasamentoDeOperacaoModelo(Base):
    __tablename__ = "casamentos_de_operacao"
    __table_args__ = (CheckConstraint("estado IN ('sugerido','confirmado')", name="estado_valido"),)

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    estado: Mapped[str] = mapped_column(String(12))


class OperacaoDoCasamentoModelo(Base):
    """Um casamento liga uma ou mais operações; uma operação está em no máximo um casamento."""

    __tablename__ = "operacoes_do_casamento"
    __table_args__ = (UniqueConstraint("operacao_id"),)

    casamento_id: Mapped[UUID] = mapped_column(
        ForeignKey("casamentos_de_operacao.id", ondelete="RESTRICT"), primary_key=True
    )
    operacao_id: Mapped[UUID] = mapped_column(
        ForeignKey("operacoes_de_investimento.id", ondelete="RESTRICT"), primary_key=True
    )


class VinculoDeCasamentoModelo(Base):
    __tablename__ = "vinculos_de_casamento"
    __table_args__ = (
        UniqueConstraint("transacao_importada_id"),
        CheckConstraint("papel IN ('bruto','taxa','imposto')", name="papel_valido"),
    )

    casamento_id: Mapped[UUID] = mapped_column(
        ForeignKey("casamentos_de_operacao.id", ondelete="RESTRICT"), primary_key=True
    )
    transacao_importada_id: Mapped[UUID] = mapped_column(
        ForeignKey("transacoes_importadas.id", ondelete="RESTRICT"), primary_key=True
    )
    papel: Mapped[str] = mapped_column(String(8))


class TratamentoDeAporteModelo(Base):
    __tablename__ = "tratamentos_de_aporte"
    __table_args__ = (
        CheckConstraint("acao IN ('mesclado','excluido')", name="acao_valida"),
        CheckConstraint(
            "(acao = 'mesclado' AND mesclado_em_id IS NOT NULL "
            "AND mesclado_em_id != movimento_id) OR (acao = 'excluido' AND mesclado_em_id IS NULL)",
            name="mescla_coerente",
        ),
        Index(
            "uq_tratamentos_de_aporte_ativo",
            "movimento_id",
            unique=True,
            sqlite_where=text("desfeito_em IS NULL"),
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    movimento_id: Mapped[UUID] = mapped_column(
        ForeignKey("movimentos_de_investimento.id", ondelete="RESTRICT")
    )
    acao: Mapped[str] = mapped_column(String(10))
    mesclado_em_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("movimentos_de_investimento.id", ondelete="RESTRICT"), default=None
    )
    valores_originais: Mapped[str] = mapped_column(Text)
    criado_em: Mapped[datetime] = mapped_column(InstanteUtc)
    aprovado_em: Mapped[datetime | None] = mapped_column(InstanteUtc, default=None)
    desfeito_em: Mapped[datetime | None] = mapped_column(InstanteUtc, default=None)
