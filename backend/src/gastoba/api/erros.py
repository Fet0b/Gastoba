"""Tratadores de exceção: todo erro sai no formato ``{"erro": {"codigo", "mensagem"}}``.

As mensagens vêm das exceções e são fixas: nunca trazem e-mail, senha nem token.
"""

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from gastoba.domain.excecoes import (
    AcessoNegado,
    CadastroFechado,
    ChaveDeApiNaoEncontrada,
    ContaJaExiste,
    ContaNaoEncontrada,
    CredenciaisInvalidas,
    DescricaoInvalida,
    EmailInvalido,
    EmailJaCadastrado,
    ErroDeDominio,
    ExpiracaoInvalida,
    GanhoDeRecorrencia,
    GanhoNaoEncontrado,
    ImportacaoDesligada,
    MesInvalido,
    MetaNaoEncontrada,
    MuitasTentativas,
    NaoAutenticado,
    NomeDeChaveInvalido,
    NomeInvalido,
    PercentuaisExcedem100,
    PercentualInvalido,
    PeriodoInvalido,
    RecorrenciaInvalida,
    RecorrenciaNaoEncontrada,
    SenhaInvalida,
    SincronizacaoEmAndamento,
    TagInvalida,
    TransacaoImportadaInvalida,
    TransacaoImportadaNaoEncontrada,
    TransacaoJaTratada,
    ValorInvalido,
)


class RequisicaoSemCabecalhoDeOrigem(Exception):
    """Escrita autenticada por cookie sem o cabeçalho anti-CSRF (``X-Gastoba-Requisicao``)."""


# Exceções de domínio conhecidas: (status HTTP, código do erro).
_ERROS_DE_DOMINIO: dict[type[ErroDeDominio], tuple[int, str]] = {
    ContaNaoEncontrada: (status.HTTP_404_NOT_FOUND, "conta_nao_encontrada"),
    ContaJaExiste: (status.HTTP_409_CONFLICT, "conta_ja_existe"),
    PeriodoInvalido: (status.HTTP_422_UNPROCESSABLE_CONTENT, "periodo_invalido"),
    ValorInvalido: (status.HTTP_422_UNPROCESSABLE_CONTENT, "valor_invalido"),
    DescricaoInvalida: (status.HTTP_422_UNPROCESSABLE_CONTENT, "descricao_invalida"),
    NomeInvalido: (status.HTTP_422_UNPROCESSABLE_CONTENT, "nome_invalido"),
    TagInvalida: (status.HTTP_422_UNPROCESSABLE_CONTENT, "tag_invalida"),
    NaoAutenticado: (status.HTTP_401_UNAUTHORIZED, "nao_autenticado"),
    CredenciaisInvalidas: (status.HTTP_401_UNAUTHORIZED, "credenciais_invalidas"),
    AcessoNegado: (status.HTTP_403_FORBIDDEN, "acesso_negado"),
    CadastroFechado: (status.HTTP_403_FORBIDDEN, "cadastro_fechado"),
    EmailJaCadastrado: (status.HTTP_409_CONFLICT, "email_ja_cadastrado"),
    EmailInvalido: (status.HTTP_422_UNPROCESSABLE_CONTENT, "email_invalido"),
    SenhaInvalida: (status.HTTP_422_UNPROCESSABLE_CONTENT, "senha_invalida"),
    ChaveDeApiNaoEncontrada: (status.HTTP_404_NOT_FOUND, "chave_de_api_nao_encontrada"),
    NomeDeChaveInvalido: (status.HTTP_422_UNPROCESSABLE_CONTENT, "nome_de_chave_invalido"),
    ExpiracaoInvalida: (status.HTTP_422_UNPROCESSABLE_CONTENT, "expiracao_invalida"),
    MuitasTentativas: (status.HTTP_429_TOO_MANY_REQUESTS, "muitas_tentativas"),
    GanhoNaoEncontrado: (status.HTTP_404_NOT_FOUND, "ganho_nao_encontrado"),
    ImportacaoDesligada: (status.HTTP_404_NOT_FOUND, "importacao_desligada"),
    TransacaoImportadaNaoEncontrada: (
        status.HTTP_404_NOT_FOUND,
        "transacao_importada_nao_encontrada",
    ),
    TransacaoJaTratada: (status.HTTP_409_CONFLICT, "transacao_ja_tratada"),
    SincronizacaoEmAndamento: (status.HTTP_409_CONFLICT, "sincronizacao_em_andamento"),
    TransacaoImportadaInvalida: (
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "transacao_importada_invalida",
    ),
    GanhoDeRecorrencia: (status.HTTP_409_CONFLICT, "ganho_de_recorrencia"),
    RecorrenciaNaoEncontrada: (status.HTTP_404_NOT_FOUND, "recorrencia_nao_encontrada"),
    RecorrenciaInvalida: (status.HTTP_422_UNPROCESSABLE_CONTENT, "recorrencia_invalida"),
    MetaNaoEncontrada: (status.HTTP_404_NOT_FOUND, "meta_nao_encontrada"),
    PercentualInvalido: (status.HTTP_422_UNPROCESSABLE_CONTENT, "percentual_invalido"),
    PercentuaisExcedem100: (status.HTTP_422_UNPROCESSABLE_CONTENT, "percentuais_excedem_100"),
    MesInvalido: (status.HTTP_422_UNPROCESSABLE_CONTENT, "mes_invalido"),
}

_ERRO_DE_DOMINIO_GENERICO = (status.HTTP_422_UNPROCESSABLE_CONTENT, "erro_de_dominio")


def _resposta_de_erro(
    status_code: int,
    codigo: str,
    mensagem: str,
    detalhes: list[dict[str, str]] | None = None,
    cabecalhos: dict[str, str] | None = None,
) -> JSONResponse:
    erro: dict[str, object] = {"codigo": codigo, "mensagem": mensagem}
    if detalhes:
        erro["detalhes"] = detalhes
    return JSONResponse(status_code=status_code, content={"erro": erro}, headers=cabecalhos)


def _tratar_erro_de_dominio(_request: Request, excecao: Exception) -> JSONResponse:
    status_code, codigo = _ERRO_DE_DOMINIO_GENERICO
    # Percorre o MRO para que subclasses de uma exceção conhecida herdem seu código.
    for classe in type(excecao).__mro__:
        if classe in _ERROS_DE_DOMINIO:
            status_code, codigo = _ERROS_DE_DOMINIO[classe]
            break
    cabecalhos: dict[str, str] = {}
    if status_code == status.HTTP_401_UNAUTHORIZED:
        cabecalhos["WWW-Authenticate"] = "Bearer"
    if isinstance(excecao, MuitasTentativas):
        cabecalhos["Retry-After"] = str(excecao.segundos_para_tentar_de_novo)
    return _resposta_de_erro(status_code, codigo, str(excecao), cabecalhos=cabecalhos)


def _tratar_requisicao_sem_cabecalho_de_origem(
    _request: Request, _excecao: Exception
) -> JSONResponse:
    return _resposta_de_erro(
        status.HTTP_403_FORBIDDEN,
        "requisicao_invalida_origem",
        "Requisição com cookie sem o cabeçalho X-Gastoba-Requisicao.",
    )


def _tratar_requisicao_invalida(_request: Request, excecao: Exception) -> JSONResponse:
    assert isinstance(excecao, RequestValidationError)
    # Sem o "input" de cada erro, para não ecoar os dados enviados.
    detalhes = [
        {"campo": ".".join(map(str, erro["loc"])), "mensagem": erro["msg"]}
        for erro in excecao.errors()
    ]
    return _resposta_de_erro(
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "requisicao_invalida",
        "A requisição tem campos ausentes ou inválidos.",
        detalhes,
    )


def _tratar_erro_inesperado(_request: Request, _excecao: Exception) -> JSONResponse:
    # Sem stack trace nem a mensagem da exceção no corpo (Art. V.4).
    return _resposta_de_erro(status.HTTP_500_INTERNAL_SERVER_ERROR, "erro_interno", "Erro interno.")


def registrar_tratadores_de_erro(app: FastAPI) -> None:
    app.add_exception_handler(ErroDeDominio, _tratar_erro_de_dominio)
    app.add_exception_handler(
        RequisicaoSemCabecalhoDeOrigem, _tratar_requisicao_sem_cabecalho_de_origem
    )
    app.add_exception_handler(RequestValidationError, _tratar_requisicao_invalida)
    # O Starlette instala este no ServerErrorMiddleware: responde e depois relança a exceção.
    app.add_exception_handler(Exception, _tratar_erro_inesperado)
