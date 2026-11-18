from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import date
from uuid import UUID, uuid4

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import DestinacaoInvalida
from gastoba.domain.tag import Tag
from gastoba.domain.taxa_do_investimento import TaxaDoInvestimento


@dataclass(frozen=True, slots=True)
class Investimento:
    """Posição atual de um investimento do usuário, com identidade própria no Gastoba."""

    id: UUID
    id_externo: str
    nome: str
    tipo: str
    subtipo: str | None
    saldo: Dinheiro
    # Dia do último registro de saldo; nulo antes de o Gastoba guardar o histórico.
    atualizado_em: date | None = None
    # O que a instituição informa: quanto foi aplicado e o lucro (ou prejuízo) até hoje.
    valor_aplicado: Dinheiro | None = None
    rendimento: Dinheiro | None = None
    # A remuneração contratada (ex.: 101,2% do CDI), lida do registro da instituição.
    taxa: TaxaDoInvestimento | None = None
    conta_remunerada_id: UUID | None = None
    # Lidos do registro da instituição, quando ela informa (a Pluggy: ``issuer``, ``dueDate``,
    # ``code`` e ``status``).
    emissor: str | None = None
    vencimento: date | None = None
    codigo: str | None = None
    situacao: str | None = None

    @property
    def encerrado(self) -> bool:
        """Sem saldo: vencido ou resgatado por inteiro. Sai das listas, o histórico fica."""
        return self.saldo.centavos == 0


@dataclass(frozen=True, slots=True)
class PontoDoHistorico:
    """Saldo de um investimento num dia."""

    investimento_id: UUID
    data: date
    saldo: Dinheiro


@dataclass(slots=True, eq=False)
class Realocacao:
    """Entidade: parte do principal que passou de uma destinação para outra, com data."""

    investimento_id: UUID
    origem: Tag
    destino: Tag
    valor: Dinheiro
    data: date
    id: UUID = field(default_factory=uuid4)

    def __post_init__(self) -> None:
        if self.origem == self.destino:
            raise DestinacaoInvalida("A origem e o destino da realocação devem ser diferentes.")
        if self.valor.centavos <= 0:
            raise DestinacaoInvalida("O valor da realocação deve ser positivo.")

    def __eq__(self, outro: object) -> bool:
        if not isinstance(outro, Realocacao):
            return NotImplemented
        return self.id == outro.id

    def __hash__(self) -> int:
        return hash(self.id)


def rentabilidade_em_percentual(rendimento: Dinheiro | None, base: Dinheiro | None) -> str | None:
    """``rendimento / base`` em percentual com duas casas (ex.: ``"4.32"``, ``"-3.33"``).

    Truncado em direção ao zero, só com inteiros. Nulo se faltar um dos valores ou se a base for
    zero (não há rentabilidade sobre nada).
    """
    if rendimento is None or base is None or base.centavos <= 0:
        return None
    centesimos = abs(rendimento.centavos) * 10000 // base.centavos
    sinal = "-" if rendimento.centavos < 0 and centesimos > 0 else ""
    return f"{sinal}{centesimos // 100}.{centesimos % 100:02d}"


def valor_sem_destinacao(
    investimento: Investimento, principais: Mapping[Tag, Dinheiro]
) -> Dinheiro:
    """A parte da posição que ainda não tem principal registrado (nunca negativa).

    A base é o valor aplicado que a instituição informa ou, se ela não informa, o saldo; dela sai
    o principal já registrado nas destinações do investimento.
    """
    base = (
        investimento.valor_aplicado
        if investimento.valor_aplicado is not None
        else investimento.saldo
    )
    resto = base.centavos - sum(p.centavos for p in principais.values())
    return Dinheiro(max(resto, 0))


def apurar_resultado_realizado(
    vendas: list[tuple[Dinheiro, Dinheiro]], custos_de_venda: Dinheiro, rendimentos: Dinheiro
) -> Dinheiro:
    return Dinheiro(
        sum(receita.centavos - principal.centavos for receita, principal in vendas)
        - custos_de_venda.centavos
        + rendimentos.centavos
    )
