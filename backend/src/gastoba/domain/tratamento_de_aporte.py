from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from gastoba.domain.excecoes import MovimentoNaoDesfazivel


class AcaoDoTratamento(StrEnum):
    MESCLADO = "mesclado"
    EXCLUIDO = "excluido"


@dataclass(slots=True)
class TratamentoDeAporte:
    """Tratamento lógico e reversível de um aporte sem investimento: nada é apagado, o original
    fica guardado e o aporte só sai das listas e dos totais depois de aprovado (RF-023)."""

    movimento_id: UUID
    acao: AcaoDoTratamento
    # Auditoria do que foi tratado: valor em centavos, data e conta, para restaurar idêntico.
    valores_originais: dict
    criado_em: datetime
    mesclado_em_id: UUID | None = None
    aprovado_em: datetime | None = None
    desfeito_em: datetime | None = None
    id: UUID = field(default_factory=uuid4)

    def __post_init__(self) -> None:
        if self.acao == AcaoDoTratamento.MESCLADO:
            if self.mesclado_em_id is None or self.mesclado_em_id == self.movimento_id:
                raise MovimentoNaoDesfazivel("Escolha outro aporte para mesclar.")
        elif self.mesclado_em_id is not None:
            raise MovimentoNaoDesfazivel("Só a mescla aponta para outro aporte.")

    @property
    def ativo(self) -> bool:
        return self.desfeito_em is None

    @property
    def afeta_os_totais(self) -> bool:
        """Só vale nas listas e totais depois da aprovação do dono e enquanto não for desfeito."""
        return self.ativo and self.aprovado_em is not None
