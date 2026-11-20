from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from gastoba.api.dependencias import (
    obter_consultar_renda_base,
    obter_definir_renda_base,
    obter_remover_renda_base,
    obter_usuario_atual,
)
from gastoba.api.esquemas import (
    DefinirRendaBaseRequisicao,
    RendaBaseResposta,
    RespostaDeErro,
    dinheiro_para_texto,
)
from gastoba.application.consultar_renda_base import ConsultarRendaBase
from gastoba.application.definir_renda_base import DefinirRendaBase
from gastoba.application.remover_renda_base import RemoverRendaBase
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.usuario import Usuario

roteador = APIRouter(tags=["renda-base"])

_ERRO = {"model": RespostaDeErro}
_RESPOSTAS_DE_ERRO = {401: _ERRO, 403: _ERRO, 422: _ERRO}


@roteador.get("/renda-base", response_model=RendaBaseResposta, responses=_RESPOSTAS_DE_ERRO)
def consultar_renda_base(
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[ConsultarRendaBase, Depends(obter_consultar_renda_base)],
) -> RendaBaseResposta:
    valor = caso_de_uso.executar(usuario.id)
    return RendaBaseResposta(valor=dinheiro_para_texto(valor) if valor is not None else None)


@roteador.put("/renda-base", response_model=RendaBaseResposta, responses=_RESPOSTAS_DE_ERRO)
def definir_renda_base(
    requisicao: DefinirRendaBaseRequisicao,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[DefinirRendaBase, Depends(obter_definir_renda_base)],
) -> RendaBaseResposta:
    valor = caso_de_uso.executar(usuario.id, Dinheiro.de_reais(requisicao.valor))
    return RendaBaseResposta(valor=dinheiro_para_texto(valor))


@roteador.delete(
    "/renda-base",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    responses=_RESPOSTAS_DE_ERRO,
)
def remover_renda_base(
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[RemoverRendaBase, Depends(obter_remover_renda_base)],
) -> Response:
    caso_de_uso.executar(usuario.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
