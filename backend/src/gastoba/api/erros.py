"""Tratadores de exceção: todo erro sai no formato ``{"erro": {"codigo", "mensagem"}}``.

As mensagens vêm das exceções e são fixas: nunca trazem e-mail, senha nem token.
"""

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from gastoba.domain.excecoes import (
    AcessoNegado,
    AporteJaTratado,
    CadastroFechado,
    CasamentoAmbiguo,
    CasamentoJaExiste,
    CasamentoNaoEncontrado,
    CategoriaInvalida,
    ChaveDeApiNaoEncontrada,
    CoberturaInvalida,
    CoberturaJaExiste,
    CoberturaNaoEncontrada,
    ContaImportada,
    ContaJaExiste,
    ContaNaoEncontrada,
    CredenciaisInvalidas,
    DescricaoInvalida,
    DestinacaoInvalida,
    DivisaoExigeConfirmacao,
    DivisaoInvalida,
    EmailInvalido,
    EmailJaCadastrado,
    ErroDeDominio,
    ExpiracaoInvalida,
    FaturaNaoEncontrada,
    GanhoDeRecorrencia,
    GanhoNaoEncontrado,
    GastoNaoEncontrado,
    ImportacaoDesligada,
    InvestimentoNaoEncontrado,
    MesclaInvalida,
    MesInvalido,
    MetaNaoEncontrada,
    MovimentoDeInvestimentoNaoEncontrado,
    MovimentoIncompativelComInvestimento,
    MovimentoJaAssociado,
    MovimentoNaoDesfazivel,
    MuitasTentativas,
    NaoAutenticado,
    NomeDeChaveInvalido,
    NomeInvalido,
    OperacaoDaCorretoraImutavel,
    OperacaoInvalida,
    OperacaoNaoEncontrada,
    OperacaoPossivelmenteDuplicada,
    PercentuaisExcedem100,
    PercentualInvalido,
    PeriodoInvalido,
    PrincipalInsuficiente,
    RealocacaoNaoEncontrada,
    ReaplicacaoInvalida,
    ReaplicacaoJaExiste,
    ReaplicacaoNaoEncontrada,
    RecorrenciaEmRevisao,
    RecorrenciaInvalida,
    RecorrenciaNaoEncontrada,
    ResgateMaiorQueOValorDaDestinacao,
    RevisaoDesatualizada,
    RevisaoNaoPendente,
    SemValorADestinar,
    SenhaInvalida,
    SincronizacaoEmAndamento,
    TagInvalida,
    TransacaoCasada,
    TransacaoImportadaInvalida,
    TransacaoImportadaNaoEncontrada,
    TransacaoJaTratada,
    TratamentoNaoEncontrado,
    ValorInvalido,
)


class RequisicaoSemCabecalhoDeOrigem(Exception):
    """Escrita autenticada por cookie sem o cabeçalho anti-CSRF (``X-Gastoba-Requisicao``)."""


# Exceções de domínio conhecidas: (status HTTP, código do erro).
_ERROS_DE_DOMINIO: dict[type[ErroDeDominio], tuple[int, str]] = {
    ReaplicacaoInvalida: (422, "reaplicacao_invalida"),
    ReaplicacaoJaExiste: (409, "reaplicacao_ja_existe"),
    ReaplicacaoNaoEncontrada: (404, "reaplicacao_nao_encontrada"),
    OperacaoNaoEncontrada: (404, "operacao_nao_encontrada"),
    OperacaoDaCorretoraImutavel: (409, "operacao_da_corretora_imutavel"),
    OperacaoInvalida: (422, "operacao_invalida"),
    OperacaoPossivelmenteDuplicada: (409, "operacao_possivelmente_duplicada"),
    CasamentoAmbiguo: (409, "casamento_ambiguo"),
    TransacaoCasada: (409, "transacao_casada"),
    RevisaoDesatualizada: (409, "revisao_desatualizada"),
    CasamentoJaExiste: (409, "casamento_ja_existe"),
    AporteJaTratado: (409, "aporte_ja_tratado"),
    MesclaInvalida: (422, "mescla_invalida"),
    TratamentoNaoEncontrado: (404, "tratamento_nao_encontrado"),
    CasamentoNaoEncontrado: (404, "casamento_nao_encontrado"),
    RevisaoNaoPendente: (409, "revisao_nao_pendente"),
    RecorrenciaEmRevisao: (409, "recorrencia_em_revisao"),
    CoberturaInvalida: (422, "cobertura_invalida"),
    CoberturaJaExiste: (409, "cobertura_ja_existe"),
    CoberturaNaoEncontrada: (404, "cobertura_nao_encontrada"),
    GastoNaoEncontrado: (404, "gasto_nao_encontrado"),
    FaturaNaoEncontrada: (404, "fatura_nao_encontrada"),
    ContaNaoEncontrada: (status.HTTP_404_NOT_FOUND, "conta_nao_encontrada"),
    ContaImportada: (status.HTTP_409_CONFLICT, "conta_importada"),
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
    CategoriaInvalida: (status.HTTP_422_UNPROCESSABLE_CONTENT, "categoria_invalida"),
    DivisaoExigeConfirmacao: (status.HTTP_409_CONFLICT, "divisao_exige_confirmacao"),
    DivisaoInvalida: (status.HTTP_422_UNPROCESSABLE_CONTENT, "divisao_invalida"),
    DestinacaoInvalida: (status.HTTP_422_UNPROCESSABLE_CONTENT, "destinacao_invalida"),
    MovimentoIncompativelComInvestimento: (
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "movimento_incompativel_com_investimento",
    ),
    PrincipalInsuficiente: (status.HTTP_422_UNPROCESSABLE_CONTENT, "principal_insuficiente"),
    ResgateMaiorQueOValorDaDestinacao: (
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "resgate_maior_que_o_valor",
    ),
    InvestimentoNaoEncontrado: (status.HTTP_404_NOT_FOUND, "investimento_nao_encontrado"),
    MovimentoDeInvestimentoNaoEncontrado: (
        status.HTTP_404_NOT_FOUND,
        "movimento_de_investimento_nao_encontrado",
    ),
    MovimentoJaAssociado: (status.HTTP_409_CONFLICT, "movimento_ja_associado"),
    MovimentoNaoDesfazivel: (status.HTTP_409_CONFLICT, "movimento_nao_desfazivel"),
    RealocacaoNaoEncontrada: (status.HTTP_404_NOT_FOUND, "realocacao_nao_encontrada"),
    SemValorADestinar: (status.HTTP_409_CONFLICT, "sem_valor_a_destinar"),
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
