from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from gastoba.api.dependencias import obter_resumir_gastos_por_tag, obter_usuario_atual
from gastoba.api.esquemas import (
    FatiaPorTagResposta,
    RespostaDeErro,
    ResumoPorTagsResposta,
    dinheiro_para_texto,
)
from gastoba.application.resumir_gastos_por_tag import ResumirGastosPorTag
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.usuario import Usuario

roteador = APIRouter(tags=["resumos"])

_ERRO = {"model": RespostaDeErro}
_RESPOSTAS_DE_ERRO = {401: _ERRO, 403: _ERRO, 404: _ERRO, 422: _ERRO}


@roteador.get(
    "/resumos/tags",
    response_model=ResumoPorTagsResposta,
    responses=_RESPOSTAS_DE_ERRO,
)
def resumir_gastos_por_tag(
    inicio: date,
    fim: date,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[ResumirGastosPorTag, Depends(obter_resumir_gastos_por_tag)],
    conta_id: UUID | None = None,
    categoria: CategoriaDoGasto | None = None,
) -> ResumoPorTagsResposta:
    resumo = caso_de_uso.executar(usuario.id, inicio, fim, conta_id=conta_id, categoria=categoria)
    return ResumoPorTagsResposta(
        inicio=inicio,
        fim=fim,
        total=dinheiro_para_texto(resumo.total),
        fatias=[
            FatiaPorTagResposta(
                tag=None if fatia.tag is None else str(fatia.tag),
                valor=dinheiro_para_texto(fatia.valor),
            )
            for fatia in resumo.fatias
        ],
    )
