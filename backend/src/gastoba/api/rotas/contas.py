from typing import Annotated

from fastapi import APIRouter, Depends, status

from gastoba.api.dependencias import obter_criar_conta, obter_listar_contas, obter_usuario_atual
from gastoba.api.esquemas import (
    ContaResposta,
    CriarContaRequisicao,
    RespostaDeErro,
    dinheiro_para_texto,
)
from gastoba.application.criar_conta import CriarConta
from gastoba.application.listar_contas import ListarContas
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
