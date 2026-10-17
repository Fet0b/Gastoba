"""Esquemas Pydantic de entrada e saída: o contrato OpenAPI consumido pelo frontend.

A API não expõe entidades do domain. Dinheiro trafega como string decimal (Art. III.3):
na entrada, ``StrictStr`` só nesse campo (número JSON vira 422); nunca ``strict=True`` no
modelo inteiro, que faria os campos ``UUID`` e ``date`` rejeitarem o texto vindo do JSON.
"""

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, StrictInt, StrictStr

from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.chave_de_api import EscopoDaChave
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.recorrencia import TipoDeRecorrencia


def dinheiro_para_texto(dinheiro: Dinheiro) -> str:
    """Quantia como string decimal com duas casas (ex.: ``"25.90"``, ``"-10.00"``)."""
    return format(dinheiro.em_reais, "f")


class CriarContaRequisicao(BaseModel):
    nome: str
    saldo_inicial: StrictStr = "0.00"


class ContaResposta(BaseModel):
    id: UUID
    nome: str
    saldo: str
    origem: str
    tipo: str


class RegistrarGastoRequisicao(BaseModel):
    conta_id: UUID
    valor: StrictStr
    descricao: str
    data: date
    categoria: CategoriaDoGasto
    tags: list[str] = []


class GastoResposta(BaseModel):
    id: UUID
    conta_id: UUID
    valor: str
    descricao: str
    data: date
    categoria: str
    tags: list[str]
    origem: str
    # Preenchido só no gasto gerado por uma recorrência.
    recorrencia_id: UUID | None = None


class FatiaPorTagResposta(BaseModel):
    """``tag`` é nula na fatia dos gastos sem tag."""

    tag: str | None
    valor: str


class ResumoPorTagsResposta(BaseModel):
    inicio: date
    fim: date
    total: str
    fatias: list[FatiaPorTagResposta]


class TransacaoImportadaResposta(BaseModel):
    id: UUID
    conta_id: UUID
    data: date
    descricao: str
    valor: str
    sentido: str
    tipo_de_operacao: str | None
    estado: str
    # Pagamento de fatura, transferência entre as próprias contas ou estorno.
    sugerir_descarte: bool
    # Já existe um lançamento manual da mesma conta, no mesmo dia e com o mesmo valor.
    possivel_duplicado: bool


class AceitarTransacaoImportadaRequisicao(BaseModel):
    # Obrigatória na saída (vira gasto); proibida na entrada (vira ganho).
    categoria: CategoriaDoGasto | None = None
    tags: list[str] = []


class AceiteResposta(BaseModel):
    tipo: str
    id: UUID


class SincronizacaoResposta(BaseModel):
    contas: int
    transacoes_novas: int
    falhas: int


class RegistrarGanhoRequisicao(BaseModel):
    conta_id: UUID
    valor: StrictStr
    descricao: str
    data: date
    tags: list[str] = []


class GanhoResposta(BaseModel):
    id: UUID
    conta_id: UUID
    valor: str
    descricao: str
    data: date
    tags: list[str]
    origem: str
    # Preenchido só no ganho gerado por uma recorrência.
    recorrencia_id: UUID | None = None


class CriarRecorrenciaRequisicao(BaseModel):
    tipo: TipoDeRecorrencia
    conta_id: UUID
    valor: StrictStr
    descricao: str
    dia_do_mes: StrictInt
    inicio: date
    categoria: CategoriaDoGasto | None = None
    tags: list[str] = []
    fim: date | None = None


class AlterarRecorrenciaRequisicao(BaseModel):
    valor: StrictStr
    descricao: str
    dia_do_mes: StrictInt
    categoria: CategoriaDoGasto | None = None
    tags: list[str] = []
    fim: date | None = None


class RecorrenciaResposta(BaseModel):
    id: UUID
    tipo: str
    conta_id: UUID
    valor: str
    descricao: str
    dia_do_mes: int
    inicio: date
    fim: date | None
    categoria: str | None
    tags: list[str]
    ativa: bool


class DefinirMetaRequisicao(BaseModel):
    percentual: StrictInt


class MetaResposta(BaseModel):
    categoria: str
    percentual: int


class ProgressoDaMetaResposta(BaseModel):
    categoria: str
    percentual: int
    limite: str
    gasto: str
    restante: str
    percentual_usado: int | None
    situacao: str


class ResumoDasMetasResposta(BaseModel):
    mes: str
    renda: str
    metas: list[ProgressoDaMetaResposta]


class CategoriaResposta(BaseModel):
    codigo: str
    nome: str


class CadastroRequisicao(BaseModel):
    nome: str
    email: str
    senha: str


class EntrarRequisicao(BaseModel):
    email: str
    senha: str


class UsuarioResposta(BaseModel):
    id: UUID
    email: str | None
    nome: str


class PerfilResposta(UsuarioResposta):
    """O usuário atual (GET /auth/eu), com o que a SPA precisa para montar as telas."""

    # A pessoa é a dona da importação bancária e vê a aba Importadas.
    importacao_bancaria: bool = False


class SessaoResposta(BaseModel):
    """O token de sessão, também entregue no cookie ``gastoba_sessao`` (HttpOnly)."""

    token: str
    expira_em: datetime


class CriarChaveDeApiRequisicao(BaseModel):
    nome: str
    escopo: EscopoDaChave
    # Com fuso horário (ex.: "2026-12-31T23:59:59Z"); sem ele, 422 expiracao_invalida.
    expira_em: datetime | None = None


class ChaveDeApiResposta(BaseModel):
    """Chave de API na listagem: nunca traz o segredo, só o prefixo público."""

    id: UUID
    nome: str
    prefixo: str
    escopo: EscopoDaChave
    criada_em: datetime
    ultimo_uso: datetime | None
    expira_em: datetime | None


class ChaveDeApiCriadaResposta(ChaveDeApiResposta):
    """Resposta da criação: o único momento em que o segredo aparece."""

    segredo: str


class DetalheDoErro(BaseModel):
    campo: str
    mensagem: str


class CorpoDoErro(BaseModel):
    codigo: str
    mensagem: str
    detalhes: list[DetalheDoErro] | None = None


class RespostaDeErro(BaseModel):
    """Formato único de erro: ``{"erro": {"codigo", "mensagem", "detalhes"?}}``."""

    erro: CorpoDoErro
