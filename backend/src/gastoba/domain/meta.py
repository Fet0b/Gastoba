from dataclasses import dataclass, field
from enum import StrEnum
from uuid import UUID, uuid4

from gastoba.domain.caixinha_marcada import percentual_guardado
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import PercentualInvalido
from gastoba.domain.tag import Tag

# A partir de 80% do limite a meta entra em alerta.
PERCENTUAL_DE_ALERTA = 80


class AlvoDaMeta(StrEnum):
    LIBERDADE_FINANCEIRA = "liberdade_financeira"
    LAZER = "lazer"
    CONHECIMENTO = "conhecimento"
    CONFORTO = "conforto"
    GASTO_FIXO = "gasto_fixo"

    @property
    def nome(self) -> str:
        return (
            "Liberdade financeira"
            if self is AlvoDaMeta.LIBERDADE_FINANCEIRA
            else CategoriaDoGasto(self.value).nome
        )

    @classmethod
    def de_categoria(cls, categoria: CategoriaDoGasto) -> AlvoDaMeta | None:
        return None if categoria.legada else cls(categoria.value)


@dataclass(slots=True, eq=False)
class Meta:
    """Porcentagem (inteira, de 1 a 100) da renda do mês destinada a uma categoria."""

    usuario_id: UUID
    alvo: AlvoDaMeta
    percentual: int
    id: UUID = field(default_factory=uuid4)

    def __post_init__(self) -> None:
        if isinstance(self.percentual, bool) or not 1 <= self.percentual <= 100:
            raise PercentualInvalido("O percentual da meta deve ser um inteiro de 1 a 100.")

    def __eq__(self, outro: object) -> bool:
        if not isinstance(outro, Meta):
            return NotImplemented
        return self.id == outro.id

    def __hash__(self) -> int:
        return hash(self.id)


class SituacaoDaMeta(StrEnum):
    DENTRO = "dentro"
    ALERTA = "alerta"
    ESTOUROU = "estourou"
    # O mês não tem renda: a meta existe, mas não há base para avaliá-la.
    SEM_RENDA = "sem_renda"


@dataclass(frozen=True, slots=True)
class CaixinhaDaMeta:
    """Uma caixinha ligada à meta: o que pagou compras da categoria no mês e a rentabilidade."""

    tag: Tag
    valor: Dinheiro
    rentabilidade: str | None = None


@dataclass(frozen=True, slots=True)
class ProgressoDaMeta:
    """Quanto da meta de uma categoria já foi gasto no mês. Só aritmética inteira, em centavos.

    ``gasto`` é líquido: já desconta o que as caixinhas pagaram (``adicional``). O card mostra a
    composição ``gasto_bruto`` de ``limite`` mais ``adicional``; ``restante`` é o mesmo nas duas
    leituras e a situação segue o gasto líquido.
    """

    alvo: AlvoDaMeta
    percentual: int
    renda: Dinheiro
    gasto: Dinheiro
    adicional: Dinheiro = Dinheiro(0)
    caixinhas: tuple[CaixinhaDaMeta, ...] = ()
    rentabilidade: str | None = None
    # Só exibição (066): o que foi guardado no mês nas caixinhas marcadas. Não entra em
    # gasto, limite, restante, percentual_usado nem situação.
    guardado: Dinheiro = Dinheiro(0)
    caixinhas_guardadas: tuple[Tag, ...] = ()

    @property
    def percentual_guardado(self) -> int:
        return percentual_guardado(self.guardado, self.limite)

    @property
    def gasto_bruto(self) -> Dinheiro:
        return self.gasto + self.adicional

    @property
    def limite(self) -> Dinheiro:
        """O quanto a categoria pode gastar no mês: o percentual da renda, para baixo."""
        return self.renda.percentual(self.percentual)

    @property
    def restante(self) -> Dinheiro:
        """Negativo quando estoura."""
        return self.limite - self.gasto

    @property
    def percentual_usado(self) -> int | None:
        """``gasto * 100 // limite``; ``None`` se há gasto e o limite é zero (renda minúscula)."""
        if self.gasto.centavos <= 0:
            return 0
        if self.limite.centavos <= 0:
            return None
        return self.gasto.centavos * 100 // self.limite.centavos

    @property
    def situacao(self) -> SituacaoDaMeta:
        if self.renda.centavos <= 0:
            return SituacaoDaMeta.SEM_RENDA
        gasto = self.gasto.centavos
        limite = self.limite.centavos
        if gasto <= 0:
            return SituacaoDaMeta.DENTRO
        if gasto > limite:
            return SituacaoDaMeta.ESTOUROU
        if gasto * 100 >= limite * PERCENTUAL_DE_ALERTA:
            return SituacaoDaMeta.ALERTA
        return SituacaoDaMeta.DENTRO


@dataclass(frozen=True, slots=True)
class ResumoDasMetas:
    """A renda do mês e o progresso de cada categoria que tem meta."""

    renda: Dinheiro
    progressos: tuple[ProgressoDaMeta, ...]
    renda_base: Dinheiro | None = None
    classificacoes_para_revisar: int = 0
    aportes_do_mes: Dinheiro = Dinheiro(0)

    @property
    def renda_de_referencia(self) -> Dinheiro:
        return self.renda_base if self.renda_base is not None else self.renda
