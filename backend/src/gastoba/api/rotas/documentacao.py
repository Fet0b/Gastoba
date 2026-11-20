"""Documentação da API (contrato OpenAPI, Swagger UI e ReDoc), só para quem entrou."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.responses import HTMLResponse

from gastoba.api.dependencias import obter_usuario_atual
from gastoba.domain.usuario import Usuario

roteador = APIRouter()

UsuarioAtual = Annotated[Usuario, Depends(obter_usuario_atual)]

# Relativo, para valer tanto em /docs quanto em /api/docs (atrás do nginx).
_CONTRATO_RELATIVO = "openapi.json"


@roteador.get("/openapi.json", include_in_schema=False)
def contrato_openapi(request: Request, _usuario: UsuarioAtual) -> dict[str, Any]:
    return request.app.openapi()


@roteador.get("/docs", include_in_schema=False)
def documentacao_swagger(request: Request, _usuario: UsuarioAtual) -> HTMLResponse:
    return get_swagger_ui_html(
        openapi_url=_CONTRATO_RELATIVO, title=f"{request.app.title} - Swagger UI"
    )


@roteador.get("/redoc", include_in_schema=False)
def documentacao_redoc(request: Request, _usuario: UsuarioAtual) -> HTMLResponse:
    return get_redoc_html(openapi_url=_CONTRATO_RELATIVO, title=f"{request.app.title} - ReDoc")
