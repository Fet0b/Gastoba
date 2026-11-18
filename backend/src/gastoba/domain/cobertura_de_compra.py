from dataclasses import dataclass, field
from uuid import UUID, uuid4

from gastoba.domain.categoria import CategoriaDoGasto, exigir_categoria_ativa
from gastoba.domain.cor_da_destinacao import CorDaDestinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import CoberturaInvalida, CoberturaJaExiste
from gastoba.domain.gasto import Gasto
from gastoba.domain.tag import Tag


@dataclass(slots=True, eq=False)
class CoberturaDeCompra:
    gasto_id: UUID
    tag: Tag
    valor: Dinheiro
    id: UUID = field(default_factory=uuid4)
    # O resgate real, já tagueado, que pagou a compra (nulo na cobertura só de métrica).
    movimento_id: UUID | None = None
    # Principal que o resgate abateu da tag nesta cobertura (nulo = o próprio valor).
    principal: Dinheiro | None = None

    def __post_init__(self) -> None:
        if self.valor.centavos <= 0:
            raise CoberturaInvalida("O valor coberto deve ser positivo.")


@dataclass(frozen=True, slots=True)
class ReservaDaDestinacao:
    categoria: CategoriaDoGasto
    tag: Tag
    reservado: Dinheiro
    coberto: Dinheiro
    cor: CorDaDestinacao | None = None

    @property
    def disponivel(self) -> Dinheiro:
        return self.reservado - self.coberto


def validar_cobertura(
    gasto: Gasto,
    tag: Tag,
    valor: Dinheiro,
    coberto_do_gasto: Dinheiro,
    reserva: ReservaDaDestinacao,
    tags_ja_cobertas: frozenset[Tag],
) -> CoberturaDeCompra:
    exigir_categoria_ativa(gasto.categoria)
    if tag in tags_ja_cobertas:
        raise CoberturaJaExiste("Esta destinação já cobre a compra: desfaça antes de alterar.")
    if reserva.categoria != gasto.categoria or reserva.tag != tag:
        raise CoberturaInvalida("Escolha uma reserva da mesma categoria da compra.")
    if (
        valor.centavos <= 0
        or valor.centavos > (gasto.valor - coberto_do_gasto).centavos
        or valor.centavos > reserva.disponivel.centavos
    ):
        raise CoberturaInvalida(
            "O valor deve ser positivo e caber no restante do gasto e no disponível da reserva."
        )
    return CoberturaDeCompra(gasto.id, tag, valor)


def validar_cobertura_com_resgate(
    gasto: Gasto,
    tag: Tag,
    valor: Dinheiro,
    movimento_id: UUID,
    coberto_do_gasto: Dinheiro,
    tags_ja_cobertas: frozenset[Tag],
    resgate_da_tag: Dinheiro,
    principal_do_resgate_da_tag: Dinheiro,
    ja_usado_do_resgate: Dinheiro,
    reservado: Dinheiro,
    principal_ja_usado_na_reserva: Dinheiro,
    disponivel_do_resgate: Dinheiro | None = None,
) -> CoberturaDeCompra:
    """Cobertura de compra paga com um resgate real da caixinha.

    O valor (dinheiro, com rendimento) cabe no restante do gasto e no que o resgate tirou da tag
    e ainda não foi usado; o principal correspondente (proporcional, truncado) cabe no que foi
    aportado na categoria e ainda não foi usado. O que sobrar da compra conta na categoria.
    """
    exigir_categoria_ativa(gasto.categoria)
    if tag in tags_ja_cobertas:
        raise CoberturaJaExiste("Esta destinação já cobre a compra: desfaça antes de alterar.")
    if resgate_da_tag.centavos <= 0:
        raise CoberturaInvalida("Este resgate não tirou valor desta destinação.")
    if (
        valor.centavos <= 0
        or valor.centavos > (gasto.valor - coberto_do_gasto).centavos
        or valor.centavos > (resgate_da_tag - ja_usado_do_resgate).centavos
    ):
        raise CoberturaInvalida(
            "O valor deve ser positivo e caber no restante da compra e no que o resgate "
            "ainda tem desta destinação."
        )
    if disponivel_do_resgate is not None and valor.centavos > disponivel_do_resgate.centavos:
        raise CoberturaInvalida(
            "O valor passa do resgate disponível após coberturas e reaplicação."
        )
    principal = Dinheiro(
        principal_do_resgate_da_tag.centavos * valor.centavos // resgate_da_tag.centavos
    )
    if principal.centavos > (reservado - principal_ja_usado_na_reserva).centavos:
        raise CoberturaInvalida(
            "O valor passa do que foi guardado nesta categoria para esta destinação."
        )
    return CoberturaDeCompra(gasto.id, tag, valor, movimento_id=movimento_id, principal=principal)
