from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status

from gastoba.api.dependencias import obter_listar_gastos, obter_registrar_gasto, obter_usuario_atual
from gastoba.api.esquemas import (
    GastoResposta,
    RegistrarGastoRequisicao,
    RespostaDeErro,
    dinheiro_para_texto,
)
from gastoba.application.listar_gastos import ListarGastos
from gastoba.application.registrar_gasto import RegistrarGasto
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.gasto import Gasto
from gastoba.domain.usuario import Usuario

roteador = APIRouter(tags=["gastos"])

_ERRO = {"model": RespostaDeErro}
_RESPOSTAS_DE_ERRO = {401: _ERRO, 403: _ERRO, 404: _ERRO, 422: _ERRO}


def _para_resposta(gasto: Gasto) -> GastoResposta:
    return GastoResposta(
        id=gasto.id,
        conta_id=gasto.conta_id,
        valor=dinheiro_para_texto(gasto.valor),
        descricao=gasto.descricao,
        data=gasto.data,
        categoria=gasto.categoria.value,
        tags=[str(tag) for tag in gasto.tags],
        origem=gasto.origem.value,
        recorrencia_id=gasto.recorrencia_id,
    )


# Rotas síncronas porque os casos de uso fazem I/O bloqueante do SQLAlchemy síncrono.
@roteador.post(
    "/gastos",
    status_code=status.HTTP_201_CREATED,
    response_model=GastoResposta,
    responses=_RESPOSTAS_DE_ERRO,
)
def registrar_gasto(
    requisicao: RegistrarGastoRequisicao,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[RegistrarGasto, Depends(obter_registrar_gasto)],
) -> GastoResposta:
    gasto = caso_de_uso.executar(
        usuario.id,
        requisicao.conta_id,
        Dinheiro.de_reais(requisicao.valor),
        requisicao.descricao,
        requisicao.data,
        requisicao.categoria,
        requisicao.tags,
    )
    return _para_resposta(gasto)


@roteador.get("/gastos", response_model=list[GastoResposta], responses=_RESPOSTAS_DE_ERRO)
def listar_gastos(
    inicio: date,
    fim: date,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[ListarGastos, Depends(obter_listar_gastos)],
    conta_id: UUID | None = None,
    tag: str | None = None,
    categoria: CategoriaDoGasto | None = None,
) -> list[GastoResposta]:
    gastos = caso_de_uso.executar(
        usuario.id, inicio, fim, conta_id=conta_id, tag=tag, categoria=categoria
    )
    return [_para_resposta(gasto) for gasto in gastos]
