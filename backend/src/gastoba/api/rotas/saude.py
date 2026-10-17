from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel

from gastoba.api.dependencias import obter_verificar_saude
from gastoba.application.verificar_saude import VerificarSaude

roteador = APIRouter()


class RespostaDeSaude(BaseModel):
    status: Literal["ok", "indisponivel"]
    banco: Literal["ok", "indisponivel"]


# Síncrona porque a verificação faz I/O bloqueante do SQLAlchemy síncrono.
@roteador.get("/health", response_model=RespostaDeSaude)
def verificar_saude(
    response: Response,
    caso_de_uso: Annotated[VerificarSaude, Depends(obter_verificar_saude)],
) -> RespostaDeSaude:
    relatorio = caso_de_uso.executar()
    if relatorio.saudavel:
        return RespostaDeSaude(status="ok", banco="ok")

    # Sem HTTPException: ela trocaria o corpo por {"detail": ...}.
    response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return RespostaDeSaude(status="indisponivel", banco="indisponivel")
