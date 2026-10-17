from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status

from gastoba.api.dependencias import (
    obter_excluir_ganho,
    obter_listar_ganhos,
    obter_registrar_ganho,
    obter_usuario_atual,
)
from gastoba.api.esquemas import (
    GanhoResposta,
    RegistrarGanhoRequisicao,
    RespostaDeErro,
    dinheiro_para_texto,
)
from gastoba.application.excluir_ganho import ExcluirGanho
from gastoba.application.listar_ganhos import ListarGanhos
from gastoba.application.registrar_ganho import RegistrarGanho
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.ganho import Ganho
from gastoba.domain.usuario import Usuario

roteador = APIRouter(tags=["ganhos"])

_ERRO = {"model": RespostaDeErro}
_RESPOSTAS_DE_ERRO = {401: _ERRO, 403: _ERRO, 404: _ERRO, 409: _ERRO, 422: _ERRO}


def _para_resposta(ganho: Ganho) -> GanhoResposta:
    return GanhoResposta(
        id=ganho.id,
        conta_id=ganho.conta_id,
        valor=dinheiro_para_texto(ganho.valor),
        descricao=ganho.descricao,
        data=ganho.data,
        tags=[str(tag) for tag in ganho.tags],
        origem=ganho.origem.value,
        recorrencia_id=ganho.recorrencia_id,
    )


# Rotas síncronas porque os casos de uso fazem I/O bloqueante do SQLAlchemy síncrono.
@roteador.post(
    "/ganhos",
    status_code=status.HTTP_201_CREATED,
    response_model=GanhoResposta,
    responses=_RESPOSTAS_DE_ERRO,
)
def registrar_ganho(
    requisicao: RegistrarGanhoRequisicao,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[RegistrarGanho, Depends(obter_registrar_ganho)],
) -> GanhoResposta:
    ganho = caso_de_uso.executar(
        usuario.id,
        requisicao.conta_id,
        Dinheiro.de_reais(requisicao.valor),
        requisicao.descricao,
        requisicao.data,
        requisicao.tags,
    )
    return _para_resposta(ganho)


@roteador.get("/ganhos", response_model=list[GanhoResposta], responses=_RESPOSTAS_DE_ERRO)
def listar_ganhos(
    inicio: date,
    fim: date,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[ListarGanhos, Depends(obter_listar_ganhos)],
    conta_id: UUID | None = None,
) -> list[GanhoResposta]:
    ganhos = caso_de_uso.executar(usuario.id, inicio, fim, conta_id=conta_id)
    return [_para_resposta(ganho) for ganho in ganhos]


@roteador.delete(
    "/ganhos/{ganho_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=_RESPOSTAS_DE_ERRO,
)
def excluir_ganho(
    ganho_id: UUID,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[ExcluirGanho, Depends(obter_excluir_ganho)],
) -> Response:
    caso_de_uso.executar(usuario.id, ganho_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
