from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status

from gastoba.api.dependencias import (
    NOME_DO_COOKIE_DE_SESSAO,
    ConfiguracoesDaApp,
    Credencial,
    e_dono_da_importacao,
    obter_autenticacao_de_sessao,
    obter_cadastrar_usuario,
    obter_credencial,
    obter_entrar_com_senha,
    obter_sair_da_sessao,
    obter_usuario_atual,
)
from gastoba.api.esquemas import (
    CadastroRequisicao,
    EntrarRequisicao,
    PerfilResposta,
    RespostaDeErro,
    SessaoResposta,
    UsuarioResposta,
)
from gastoba.application.autenticacao import Autenticacao
from gastoba.application.cadastrar_usuario import CadastrarUsuario
from gastoba.application.entrar_com_senha import EntrarComSenha
from gastoba.application.sair_da_sessao import SairDaSessao
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.configuracoes import Configuracoes

roteador = APIRouter(prefix="/auth", tags=["autenticacao"])

_ERRO = {"model": RespostaDeErro}


def _para_resposta(usuario: Usuario) -> UsuarioResposta:
    return UsuarioResposta(
        id=usuario.id,
        email=None if usuario.email is None else usuario.email.valor,
        nome=usuario.nome,
    )


# HttpOnly: o JavaScript da página não lê o token (um XSS não o rouba). SameSite=Strict:
# o navegador não o envia em requisições vindas de outro site. Secure: configurável, porque o
# servidor caseiro é servido por HTTP dentro da VPN (Decisões aprovadas do plano).
def _definir_cookie(response: Response, token: str, configuracoes: Configuracoes) -> None:
    response.set_cookie(
        NOME_DO_COOKIE_DE_SESSAO,
        token,
        max_age=configuracoes.duracao_da_sessao_horas * 3600,
        path="/",
        httponly=True,
        samesite="strict",
        secure=configuracoes.cookie_seguro,
    )


def _apagar_cookie(response: Response, configuracoes: Configuracoes) -> None:
    response.delete_cookie(
        NOME_DO_COOKIE_DE_SESSAO,
        path="/",
        httponly=True,
        samesite="strict",
        secure=configuracoes.cookie_seguro,
    )


# Rotas síncronas porque os casos de uso fazem I/O bloqueante (SQLAlchemy e scrypt).
@roteador.post(
    "/cadastro",
    status_code=status.HTTP_201_CREATED,
    response_model=UsuarioResposta,
    responses={403: _ERRO, 409: _ERRO, 422: _ERRO},
)
def cadastrar(
    requisicao: CadastroRequisicao,
    caso_de_uso: Annotated[CadastrarUsuario, Depends(obter_cadastrar_usuario)],
) -> UsuarioResposta:
    usuario = caso_de_uso.executar(requisicao.nome, requisicao.email, requisicao.senha)
    return _para_resposta(usuario)


@roteador.post(
    "/entrar",
    response_model=SessaoResposta,
    responses={401: _ERRO, 422: _ERRO, 429: _ERRO},
)
def entrar(
    requisicao: EntrarRequisicao,
    request: Request,
    response: Response,
    caso_de_uso: Annotated[EntrarComSenha, Depends(obter_entrar_com_senha)],
    configuracoes: ConfiguracoesDaApp,
) -> SessaoResposta:
    origem = None if request.client is None else request.client.host
    sessao = caso_de_uso.executar(requisicao.email, requisicao.senha, origem=origem)
    _definir_cookie(response, sessao.token.valor, configuracoes)
    return SessaoResposta(token=sessao.token.valor, expira_em=sessao.expira_em)


@roteador.post(
    "/sair",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses={401: _ERRO, 403: _ERRO},
)
def sair(
    credencial: Annotated[Credencial, Depends(obter_credencial)],
    _autenticacao: Annotated[Autenticacao, Depends(obter_autenticacao_de_sessao)],
    caso_de_uso: Annotated[SairDaSessao, Depends(obter_sair_da_sessao)],
    configuracoes: ConfiguracoesDaApp,
) -> Response:
    caso_de_uso.executar(credencial.token)
    resposta = Response(status_code=status.HTTP_204_NO_CONTENT)
    _apagar_cookie(resposta, configuracoes)
    return resposta


@roteador.get("/eu", response_model=PerfilResposta, responses={401: _ERRO, 403: _ERRO})
def eu(
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    configuracoes: ConfiguracoesDaApp,
) -> PerfilResposta:
    return PerfilResposta(
        **_para_resposta(usuario).model_dump(),
        importacao_bancaria=e_dono_da_importacao(configuracoes, usuario),
    )
