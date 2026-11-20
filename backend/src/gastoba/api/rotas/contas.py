from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status

from gastoba.api.dependencias import (
    obter_autenticacao_de_sessao,
    obter_criar_conta,
    obter_definir_apelido_da_conta,
    obter_definir_papel_da_conta,
    obter_excluir_conta,
    obter_listar_contas,
    obter_remover_apelido_da_conta,
    obter_usuario_atual,
)
from gastoba.api.esquemas import (
    ContaResposta,
    CriarContaRequisicao,
    DefinirApelidoDaContaRequisicao,
    DefinirPapelDaContaRequisicao,
    RespostaDeErro,
    dinheiro_para_texto,
)
from gastoba.application.autenticacao import Autenticacao
from gastoba.application.criar_conta import CriarConta
from gastoba.application.definir_apelido_da_conta import DefinirApelidoDaConta
from gastoba.application.definir_papel_da_conta import DefinirPapelDaConta
from gastoba.application.excluir_conta import ExcluirConta
from gastoba.application.listar_contas import ListarContas
from gastoba.application.remover_apelido_da_conta import RemoverApelidoDaConta
from gastoba.domain.conta import Conta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.usuario import Usuario

roteador = APIRouter(tags=["contas"])

_ERRO = {"model": RespostaDeErro}
_ERROS_DE_AUTENTICACAO = {401: _ERRO, 403: _ERRO}


def _para_resposta(conta: Conta) -> ContaResposta:
    return ContaResposta(
        id=conta.id,
        nome=conta.nome,
        saldo=dinheiro_para_texto(conta.saldo),
        origem=conta.origem.value,
        tipo=conta.tipo.value,
        papel=conta.papel.value if conta.papel else None,
        rotulo=conta.rotulo,
        apelido=conta.apelido,
        nome_no_banco=conta.nome_no_banco,
        final_do_numero=conta.final_do_numero,
    )


# Rotas síncronas porque os casos de uso fazem I/O bloqueante do SQLAlchemy síncrono.
@roteador.post(
    "/contas",
    status_code=status.HTTP_201_CREATED,
    response_model=ContaResposta,
    responses={**_ERROS_DE_AUTENTICACAO, 409: _ERRO, 422: _ERRO},
)
def criar_conta(
    requisicao: CriarContaRequisicao,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[CriarConta, Depends(obter_criar_conta)],
) -> ContaResposta:
    conta = caso_de_uso.executar(
        usuario.id, requisicao.nome, Dinheiro.de_reais(requisicao.saldo_inicial)
    )
    return _para_resposta(conta)


@roteador.get("/contas", response_model=list[ContaResposta], responses=_ERROS_DE_AUTENTICACAO)
def listar_contas(
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[ListarContas, Depends(obter_listar_contas)],
) -> list[ContaResposta]:
    return [_para_resposta(conta) for conta in caso_de_uso.executar(usuario.id)]


@roteador.delete(
    "/contas/{conta_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={**_ERROS_DE_AUTENTICACAO, 404: _ERRO, 409: _ERRO},
)
def excluir_conta(
    conta_id: UUID,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[ExcluirConta, Depends(obter_excluir_conta)],
) -> Response:
    caso_de_uso.executar(usuario.id, conta_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@roteador.put(
    "/contas/{conta_id}/papel",
    response_model=ContaResposta,
    responses={401: _ERRO, 403: _ERRO, 404: _ERRO, 422: _ERRO},
)
def definir_papel_da_conta(
    conta_id: UUID,
    requisicao: DefinirPapelDaContaRequisicao,
    autenticacao: Annotated[Autenticacao, Depends(obter_autenticacao_de_sessao)],
    caso: Annotated[DefinirPapelDaConta, Depends(obter_definir_papel_da_conta)],
) -> ContaResposta:
    return _para_resposta(caso.executar(autenticacao.usuario.id, conta_id, requisicao.papel))


@roteador.put(
    "/contas/{conta_id}/apelido",
    response_model=ContaResposta,
    responses={**_ERROS_DE_AUTENTICACAO, 404: _ERRO, 409: _ERRO, 422: _ERRO},
)
def definir_apelido_da_conta(
    conta_id: UUID,
    requisicao: DefinirApelidoDaContaRequisicao,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[DefinirApelidoDaConta, Depends(obter_definir_apelido_da_conta)],
) -> ContaResposta:
    return _para_resposta(caso_de_uso.executar(usuario.id, conta_id, requisicao.apelido))


@roteador.delete(
    "/contas/{conta_id}/apelido",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={**_ERROS_DE_AUTENTICACAO, 404: _ERRO},
)
def remover_apelido_da_conta(
    conta_id: UUID,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[RemoverApelidoDaConta, Depends(obter_remover_apelido_da_conta)],
) -> Response:
    caso_de_uso.executar(usuario.id, conta_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
