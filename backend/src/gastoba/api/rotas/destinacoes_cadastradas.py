from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status

from gastoba.api.dependencias import (
    obter_criar_destinacao_cadastrada,
    obter_definir_icone_da_caixinha,
    obter_excluir_destinacao_cadastrada,
    obter_listar_destinacoes_cadastradas,
    obter_usuario_atual,
)
from gastoba.api.esquemas import (
    CriarDestinacaoCadastradaCorpo,
    DefinirIconeDaCaixinhaCorpo,
    DestinacaoCadastradaResposta,
    RespostaDeErro,
)
from gastoba.application.criar_destinacao_cadastrada import CriarDestinacaoCadastrada
from gastoba.application.definir_icone_da_caixinha import DefinirIconeDaCaixinha
from gastoba.application.excluir_destinacao_cadastrada import ExcluirDestinacaoCadastrada
from gastoba.application.listar_destinacoes_cadastradas import ListarDestinacoesCadastradas
from gastoba.domain.destinacao_cadastrada import DestinacaoCadastrada
from gastoba.domain.usuario import Usuario

roteador = APIRouter(tags=["destinacoes-cadastradas"])
_ERRO = {"model": RespostaDeErro}
_RESPOSTAS_DE_ERRO = {401: _ERRO, 403: _ERRO, 409: _ERRO, 422: _ERRO}


def _para_resposta(destinacao: DestinacaoCadastrada) -> DestinacaoCadastradaResposta:
    return DestinacaoCadastradaResposta(
        id=destinacao.id, nome=destinacao.nome.valor, icone=destinacao.icone, cor=destinacao.cor
    )


@roteador.get(
    "/destinacoes-cadastradas",
    response_model=list[DestinacaoCadastradaResposta],
    responses=_RESPOSTAS_DE_ERRO,
)
def listar_destinacoes_cadastradas(
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[
        ListarDestinacoesCadastradas, Depends(obter_listar_destinacoes_cadastradas)
    ],
) -> list[DestinacaoCadastradaResposta]:
    return [_para_resposta(item) for item in caso_de_uso.executar(usuario.id)]


@roteador.post(
    "/destinacoes-cadastradas",
    response_model=DestinacaoCadastradaResposta,
    status_code=status.HTTP_201_CREATED,
    responses=_RESPOSTAS_DE_ERRO,
)
def criar_destinacao_cadastrada(
    requisicao: CriarDestinacaoCadastradaCorpo,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[CriarDestinacaoCadastrada, Depends(obter_criar_destinacao_cadastrada)],
) -> DestinacaoCadastradaResposta:
    criada = caso_de_uso.executar(
        usuario.id, requisicao.nome, icone=requisicao.icone, cor=requisicao.cor
    )
    return _para_resposta(criada)


@roteador.put(
    "/destinacoes-cadastradas/{destinacao_id}/icone",
    response_model=DestinacaoCadastradaResposta,
    responses={**_RESPOSTAS_DE_ERRO, 404: _ERRO},
)
def definir_icone_da_caixinha(
    destinacao_id: UUID,
    requisicao: DefinirIconeDaCaixinhaCorpo,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[DefinirIconeDaCaixinha, Depends(obter_definir_icone_da_caixinha)],
) -> DestinacaoCadastradaResposta:
    atualizada = caso_de_uso.executar(usuario.id, destinacao_id, requisicao.icone)
    return _para_resposta(atualizada)


@roteador.delete(
    "/destinacoes-cadastradas/{destinacao_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses={**_RESPOSTAS_DE_ERRO, 404: _ERRO},
)
def excluir_destinacao_cadastrada(
    destinacao_id: UUID,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[
        ExcluirDestinacaoCadastrada, Depends(obter_excluir_destinacao_cadastrada)
    ],
) -> Response:
    caso_de_uso.executar(usuario.id, destinacao_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
