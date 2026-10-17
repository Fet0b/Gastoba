from typing import Annotated

from fastapi import APIRouter, Depends

from gastoba.api.dependencias import obter_listar_tags, obter_usuario_atual
from gastoba.api.esquemas import RespostaDeErro
from gastoba.application.listar_tags import ListarTags
from gastoba.domain.usuario import Usuario

roteador = APIRouter(tags=["tags"])


# Rota síncrona porque o caso de uso faz I/O bloqueante do SQLAlchemy síncrono.
@roteador.get(
    "/tags",
    response_model=list[str],
    responses={401: {"model": RespostaDeErro}, 403: {"model": RespostaDeErro}},
)
def listar_tags(
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[ListarTags, Depends(obter_listar_tags)],
) -> list[str]:
    return [str(tag) for tag in caso_de_uso.executar(usuario.id)]
