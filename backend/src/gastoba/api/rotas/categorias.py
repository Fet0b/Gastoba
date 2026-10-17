from fastapi import APIRouter, Depends

from gastoba.api.dependencias import obter_usuario_atual
from gastoba.api.esquemas import CategoriaResposta, RespostaDeErro
from gastoba.domain.categoria import CategoriaDoGasto

roteador = APIRouter(tags=["categorias"])


# Conjunto fixo definido no domain: sem I/O, então sem caso de uso nem unidade de trabalho.
# Exige credencial mesmo assim (decisão do plano: nada de negócio sem login).
@roteador.get(
    "/categorias",
    response_model=list[CategoriaResposta],
    dependencies=[Depends(obter_usuario_atual)],
    responses={401: {"model": RespostaDeErro}, 403: {"model": RespostaDeErro}},
)
def listar_categorias() -> list[CategoriaResposta]:
    return [
        CategoriaResposta(codigo=categoria.value, nome=categoria.nome)
        for categoria in CategoriaDoGasto
    ]
