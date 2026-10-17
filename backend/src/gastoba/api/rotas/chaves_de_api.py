from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status

from gastoba.api.dependencias import (
    obter_autenticacao_de_sessao,
    obter_criar_chave_de_api,
    obter_listar_chaves_de_api,
    obter_revogar_chave_de_api,
)
from gastoba.api.esquemas import (
    ChaveDeApiCriadaResposta,
    ChaveDeApiResposta,
    CriarChaveDeApiRequisicao,
    RespostaDeErro,
)
from gastoba.application.autenticacao import Autenticacao
from gastoba.application.criar_chave_de_api import CriarChaveDeApi
from gastoba.application.listar_chaves_de_api import ListarChavesDeApi
from gastoba.application.revogar_chave_de_api import RevogarChaveDeApi
from gastoba.domain.chave_de_api import ChaveDeApi

# Gerir chaves exige sessão: uma chave de API não cria, lista nem revoga chaves (403).
roteador = APIRouter(prefix="/chaves-de-api", tags=["chaves de API"])

_ERRO = {"model": RespostaDeErro}
SessaoAtual = Annotated[Autenticacao, Depends(obter_autenticacao_de_sessao)]


def _dados(chave: ChaveDeApi) -> dict[str, object]:
    return {
        "id": chave.id,
        "nome": chave.nome,
        "prefixo": chave.prefixo,
        "escopo": chave.escopo,
        "criada_em": chave.criada_em,
        "ultimo_uso": chave.ultimo_uso,
        "expira_em": chave.expira_em,
    }


# Rotas síncronas porque os casos de uso fazem I/O bloqueante do SQLAlchemy síncrono.
@roteador.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=ChaveDeApiCriadaResposta,
    responses={401: _ERRO, 403: _ERRO, 422: _ERRO},
)
def criar_chave_de_api(
    requisicao: CriarChaveDeApiRequisicao,
    sessao: SessaoAtual,
    caso_de_uso: Annotated[CriarChaveDeApi, Depends(obter_criar_chave_de_api)],
) -> ChaveDeApiCriadaResposta:
    criada = caso_de_uso.executar(
        sessao.usuario.id, requisicao.nome, requisicao.escopo, requisicao.expira_em
    )
    return ChaveDeApiCriadaResposta.model_validate(
        {**_dados(criada.chave), "segredo": criada.segredo.valor}
    )


@roteador.get("", response_model=list[ChaveDeApiResposta], responses={401: _ERRO, 403: _ERRO})
def listar_chaves_de_api(
    sessao: SessaoAtual,
    caso_de_uso: Annotated[ListarChavesDeApi, Depends(obter_listar_chaves_de_api)],
) -> list[ChaveDeApiResposta]:
    return [
        ChaveDeApiResposta.model_validate(_dados(chave))
        for chave in caso_de_uso.executar(sessao.usuario.id)
    ]


@roteador.delete(
    "/{chave_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses={401: _ERRO, 403: _ERRO, 404: _ERRO},
)
def revogar_chave_de_api(
    chave_id: UUID,
    sessao: SessaoAtual,
    caso_de_uso: Annotated[RevogarChaveDeApi, Depends(obter_revogar_chave_de_api)],
) -> Response:
    caso_de_uso.executar(sessao.usuario.id, chave_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
