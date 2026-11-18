from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status

from gastoba.api.dependencias import (
    obter_associar_compra_a_destinacao,
    obter_autenticacao_de_sessao,
    obter_desassociar_compra_da_destinacao,
    obter_listar_gastos,
    obter_registrar_gasto,
    obter_usuario_atual,
)
from gastoba.api.esquemas import (
    AssociarCompraRequisicao,
    CoberturaResposta,
    GastoResposta,
    RegistrarGastoRequisicao,
    RespostaDeErro,
    dinheiro_para_texto,
)
from gastoba.application.associar_compra_a_destinacao import AssociarCompraADestinacao
from gastoba.application.autenticacao import Autenticacao
from gastoba.application.desassociar_compra_da_destinacao import DesassociarCompraDaDestinacao
from gastoba.application.listar_gastos import ListarGastos
from gastoba.application.registrar_gasto import RegistrarGasto
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.cobertura_de_compra import CoberturaDeCompra
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.gasto import Gasto
from gastoba.domain.usuario import Usuario

roteador = APIRouter(tags=["gastos"])

_ERRO = {"model": RespostaDeErro}
_RESPOSTAS_DE_ERRO = {401: _ERRO, 403: _ERRO, 404: _ERRO, 409: _ERRO, 422: _ERRO}


def gasto_para_resposta(
    gasto: Gasto, coberturas: tuple[CoberturaDeCompra, ...] = ()
) -> GastoResposta:
    return GastoResposta(
        id=gasto.id,
        transacao_importada_id=gasto.transacao_importada_id,
        valor_coberto=dinheiro_para_texto(Dinheiro(sum(c.valor.centavos for c in coberturas))),
        coberturas=[cobertura_para_resposta(c) for c in coberturas],
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
    return gasto_para_resposta(gasto)


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
    return [gasto_para_resposta(item.gasto, item.coberturas) for item in gastos]


def cobertura_para_resposta(cobertura: CoberturaDeCompra) -> CoberturaResposta:
    return CoberturaResposta(
        id=cobertura.id,
        tag=str(cobertura.tag),
        valor=dinheiro_para_texto(cobertura.valor),
        movimento_id=cobertura.movimento_id,
    )


@roteador.post(
    "/gastos/{id}/coberturas",
    status_code=201,
    response_model=CoberturaResposta,
    responses=_RESPOSTAS_DE_ERRO,
)
def associar_compra(
    id: UUID,
    requisicao: AssociarCompraRequisicao,
    autenticacao: Annotated[Autenticacao, Depends(obter_autenticacao_de_sessao)],
    caso: Annotated[AssociarCompraADestinacao, Depends(obter_associar_compra_a_destinacao)],
) -> CoberturaResposta:
    return cobertura_para_resposta(
        caso.executar(
            autenticacao.usuario.id,
            id,
            requisicao.tag,
            Dinheiro.de_reais(requisicao.valor),
            requisicao.movimento_id,
        )
    )


@roteador.delete(
    "/gastos/{id}/coberturas/{cobertura_id}",
    status_code=204,
    response_model=None,
    responses=_RESPOSTAS_DE_ERRO,
)
def desassociar_compra(
    id: UUID,
    cobertura_id: UUID,
    autenticacao: Annotated[Autenticacao, Depends(obter_autenticacao_de_sessao)],
    caso: Annotated[DesassociarCompraDaDestinacao, Depends(obter_desassociar_compra_da_destinacao)],
) -> Response:
    caso.executar(autenticacao.usuario.id, id, cobertura_id)
    return Response(status_code=204)
