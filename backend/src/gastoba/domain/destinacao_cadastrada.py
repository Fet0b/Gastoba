from dataclasses import dataclass, field, replace
from enum import StrEnum
from uuid import UUID, uuid4

from gastoba.domain.cor_da_destinacao import CorDaDestinacao
from gastoba.domain.excecoes import DestinacaoEmUso, IconeInvalido
from gastoba.domain.tag import Tag


class IconeDaCaixinha(StrEnum):
    """Ícone escolhido para a caixinha; ausente (nulo) vale o padrão, o cofre."""

    AVIAO = "aviao"
    CASA = "casa"
    CARRO = "carro"
    COMPUTADOR = "computador"
    COFRE = "cofre"
    EXCLAMACAO = "exclamacao"

    @classmethod
    def de_codigo(cls, codigo: object) -> IconeDaCaixinha:
        if isinstance(codigo, str):
            try:
                return cls(codigo)
            except ValueError:
                pass
        raise IconeInvalido("Escolha um dos ícones disponíveis para a caixinha.")


def _como_icone(icone: IconeDaCaixinha | str | None) -> IconeDaCaixinha | None:
    return None if icone is None else IconeDaCaixinha.de_codigo(icone)


@dataclass(frozen=True, slots=True)
class DestinacaoCadastrada:
    """Finalidade pessoal de investimento, sem saldo ou posição próprios."""

    usuario_id: UUID
    nome: Tag
    id: UUID = field(default_factory=uuid4)
    icone: IconeDaCaixinha | None = None
    # Leitura da cor por pessoa/tag (cores_das_destinacoes); nula = automática.
    cor: CorDaDestinacao | None = None

    @classmethod
    def criar(
        cls,
        usuario_id: UUID,
        nome: str,
        icone: IconeDaCaixinha | str | None = None,
        cor: CorDaDestinacao | None = None,
    ) -> DestinacaoCadastrada:
        return cls(
            usuario_id=usuario_id, nome=Tag.de_texto(nome), icone=_como_icone(icone), cor=cor
        )

    def com_icone(self, icone: IconeDaCaixinha | str | None) -> DestinacaoCadastrada:
        return replace(self, icone=_como_icone(icone))

    def validar_exclusao(self, tem_referencias: bool) -> None:
        if tem_referencias:
            raise DestinacaoEmUso(
                "Esta caixinha tem uso ou histórico e não pode ser excluída. "
                "Mantenha-a para consultar seus registros."
            )
