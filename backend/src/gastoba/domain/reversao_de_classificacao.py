import json
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from uuid import UUID, uuid4

from gastoba.domain.transacao_importada import TransacaoImportada


@dataclass(frozen=True, slots=True)
class ReversaoDeClassificacao:
    usuario_id: UUID
    transacao_id: UUID
    estado_anterior: str
    lancamentos: tuple[dict, ...]
    id: UUID = field(default_factory=uuid4)
    instante: datetime = field(default_factory=lambda: datetime.now(UTC))

    @classmethod
    def de_grupo(
        cls, usuario_id, transacao: TransacaoImportada, grupo, partes=None, coberturas=None
    ):
        return cls(
            usuario_id,
            transacao.id,
            transacao.estado.value,
            tuple(
                {
                    **json.loads(json.dumps(asdict(item), default=str)),
                    "id": str(item.id),
                    "tipo": type(item).__name__,
                    "destinacoes": [
                        {"tag": t.valor, "valor_centavos": v.centavos}
                        for t, v in (partes or {}).get(item.id, [])
                    ],
                    "coberturas": [
                        json.loads(json.dumps(asdict(c), default=str))
                        for c in (coberturas or {}).get(item.id, [])
                    ],
                    "categoria": getattr(item, "categoria", None),
                    "tags": [str(tag.valor) for tag in getattr(item, "tags", ())],
                    "investimento_id": str(item.investimento_id)
                    if getattr(item, "investimento_id", None)
                    else None,
                }
                for item in grupo
            ),
        )
