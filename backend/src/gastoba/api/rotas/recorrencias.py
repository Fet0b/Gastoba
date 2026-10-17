from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status

from gastoba.api.dependencias import (
    obter_alterar_recorrencia,
    obter_criar_recorrencia,
    obter_encerrar_recorrencia,
    obter_listar_recorrencias,
    obter_usuario_atual,
)
from gastoba.api.esquemas import (
    AlterarRecorrenciaRequisicao,
    CriarRecorrenciaRequisicao,
    RecorrenciaResposta,
    RespostaDeErro,
    dinheiro_para_texto,
)
from gastoba.application.alterar_recorrencia import AlterarRecorrencia
from gastoba.application.criar_recorrencia import CriarRecorrencia
from gastoba.application.encerrar_recorrencia import EncerrarRecorrencia
from gastoba.application.listar_recorrencias import ListarRecorrencias
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.recorrencia import Recorrencia
from gastoba.domain.usuario import Usuario

roteador = APIRouter(tags=["recorrencias"])

_ERRO = {"model": RespostaDeErro}
_RESPOSTAS_DE_ERRO = {401: _ERRO, 403: _ERRO, 404: _ERRO, 422: _ERRO}


def _para_resposta(recorrencia: Recorrencia) -> RecorrenciaResposta:
    return RecorrenciaResposta(
        id=recorrencia.id,
        tipo=recorrencia.tipo.value,
        conta_id=recorrencia.conta_id,
        valor=dinheiro_para_texto(recorrencia.valor),
        descricao=recorrencia.descricao,
        dia_do_mes=recorrencia.dia_do_mes,
        inicio=recorrencia.inicio,
        fim=recorrencia.fim,
        categoria=recorrencia.categoria.value if recorrencia.categoria else None,
        tags=[str(tag) for tag in recorrencia.tags],
        ativa=recorrencia.ativa,
    )


# Rotas síncronas porque os casos de uso fazem I/O bloqueante do SQLAlchemy síncrono.
@roteador.post(
    "/recorrencias",
    status_code=status.HTTP_201_CREATED,
    response_model=RecorrenciaResposta,
    responses=_RESPOSTAS_DE_ERRO,
)
def criar_recorrencia(
    requisicao: CriarRecorrenciaRequisicao,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[CriarRecorrencia, Depends(obter_criar_recorrencia)],
) -> RecorrenciaResposta:
    recorrencia = caso_de_uso.executar(
        usuario.id,
        requisicao.tipo,
        requisicao.conta_id,
        Dinheiro.de_reais(requisicao.valor),
        requisicao.descricao,
        requisicao.dia_do_mes,
        requisicao.inicio,
        requisicao.categoria,
        requisicao.tags,
        requisicao.fim,
    )
    return _para_resposta(recorrencia)


@roteador.get(
    "/recorrencias", response_model=list[RecorrenciaResposta], responses=_RESPOSTAS_DE_ERRO
)
def listar_recorrencias(
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[ListarRecorrencias, Depends(obter_listar_recorrencias)],
) -> list[RecorrenciaResposta]:
    return [_para_resposta(r) for r in caso_de_uso.executar(usuario.id)]


@roteador.put(
    "/recorrencias/{recorrencia_id}",
    response_model=RecorrenciaResposta,
    responses=_RESPOSTAS_DE_ERRO,
)
def alterar_recorrencia(
    recorrencia_id: UUID,
    requisicao: AlterarRecorrenciaRequisicao,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[AlterarRecorrencia, Depends(obter_alterar_recorrencia)],
) -> RecorrenciaResposta:
    recorrencia = caso_de_uso.executar(
        usuario.id,
        recorrencia_id,
        Dinheiro.de_reais(requisicao.valor),
        requisicao.descricao,
        requisicao.dia_do_mes,
        requisicao.categoria,
        requisicao.tags,
        requisicao.fim,
    )
    return _para_resposta(recorrencia)


@roteador.delete(
    "/recorrencias/{recorrencia_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=_RESPOSTAS_DE_ERRO,
)
def encerrar_recorrencia(
    recorrencia_id: UUID,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[EncerrarRecorrencia, Depends(obter_encerrar_recorrencia)],
) -> Response:
    caso_de_uso.executar(usuario.id, recorrencia_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
