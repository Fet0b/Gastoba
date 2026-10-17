"""Composition root: único ponto que conhece as implementações concretas das portas."""

from dataclasses import dataclass, field
from datetime import timedelta
from typing import Annotated

from fastapi import Depends, FastAPI, Request
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

from gastoba.api.erros import RequisicaoSemCabecalhoDeOrigem
from gastoba.application.aceitar_transacao_importada import AceitarTransacaoImportada
from gastoba.application.alterar_recorrencia import AlterarRecorrencia
from gastoba.application.autenticacao import Autenticacao, exigir_escopo, exigir_sessao
from gastoba.application.autenticar_por_chave_de_api import AutenticarPorChaveDeApi
from gastoba.application.autenticar_por_sessao import AutenticarPorSessao
from gastoba.application.cadastrar_usuario import CadastrarUsuario
from gastoba.application.consultar_progresso_das_metas import ConsultarProgressoDasMetas
from gastoba.application.criar_chave_de_api import CriarChaveDeApi
from gastoba.application.criar_conta import CriarConta
from gastoba.application.criar_recorrencia import CriarRecorrencia
from gastoba.application.definir_meta import DefinirMeta
from gastoba.application.encerrar_recorrencia import EncerrarRecorrencia
from gastoba.application.entrar_com_senha import EntrarComSenha
from gastoba.application.excluir_ganho import ExcluirGanho
from gastoba.application.ignorar_transacao_importada import IgnorarTransacaoImportada
from gastoba.application.listar_chaves_de_api import ListarChavesDeApi
from gastoba.application.listar_contas import ListarContas
from gastoba.application.listar_ganhos import ListarGanhos
from gastoba.application.listar_gastos import ListarGastos
from gastoba.application.listar_metas import ListarMetas
from gastoba.application.listar_recorrencias import ListarRecorrencias
from gastoba.application.listar_tags import ListarTags
from gastoba.application.listar_transacoes_importadas import ListarTransacoesImportadas
from gastoba.application.registrar_ganho import RegistrarGanho
from gastoba.application.registrar_gasto import RegistrarGasto
from gastoba.application.remover_meta import RemoverMeta
from gastoba.application.resumir_gastos_por_tag import ResumirGastosPorTag
from gastoba.application.revogar_chave_de_api import RevogarChaveDeApi
from gastoba.application.sair_da_sessao import SairDaSessao
from gastoba.application.sincronizar_contas_bancarias import SincronizarContasBancarias
from gastoba.application.verificar_saude import VerificarSaude
from gastoba.domain.chave_de_api import EscopoDaChave
from gastoba.domain.email import Email
from gastoba.domain.excecoes import EmailInvalido, ImportacaoDesligada, NaoAutenticado
from gastoba.domain.portas import (
    GeradorDeSegredo,
    HasherDeSenha,
    LimitadorDeTentativas,
    Relogio,
    UnidadeDeTrabalho,
)
from gastoba.domain.segredo_de_acesso import (
    PREFIXO_DE_CHAVE_DE_API,
    PREFIXO_DE_SESSAO,
    TAMANHO_MAXIMO_DO_SEGREDO,
)
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.configuracoes import Configuracoes
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy
from gastoba.infrastructure.persistencia.verificador_de_banco import VerificadorDeBancoSqlAlchemy

NOME_DO_COOKIE_DE_SESSAO = "gastoba_sessao"
# Cabeçalho que um formulário de outro site não consegue enviar sem o preflight do CORS:
# exigido quando o cookie (que o navegador manda sozinho) autentica uma escrita.
CABECALHO_ANTI_CSRF = "X-Gastoba-Requisicao"
METODOS_DE_LEITURA = frozenset({"GET", "HEAD", "OPTIONS"})


def obter_engine(request: Request) -> Engine:
    return request.app.state.engine


def obter_verificar_saude(engine: Annotated[Engine, Depends(obter_engine)]) -> VerificarSaude:
    return VerificarSaude(VerificadorDeBancoSqlAlchemy(engine))


def obter_fabrica_de_sessoes(request: Request) -> sessionmaker[Session]:
    return request.app.state.fabrica_de_sessoes


def obter_configuracoes_da_app(request: Request) -> Configuracoes:
    return request.app.state.configuracoes


def obter_relogio(request: Request) -> Relogio:
    return request.app.state.relogio


def obter_hasher_de_senha(request: Request) -> HasherDeSenha:
    return request.app.state.hasher_de_senha


def obter_gerador_de_segredo(request: Request) -> GeradorDeSegredo:
    return request.app.state.gerador_de_segredo


def obter_limitador_de_tentativas(request: Request) -> LimitadorDeTentativas:
    return request.app.state.limitador_de_tentativas


def obter_unidade_de_trabalho(
    fabrica_de_sessoes: Annotated[sessionmaker[Session], Depends(obter_fabrica_de_sessoes)],
) -> UnidadeDeTrabalho:
    return UnidadeDeTrabalhoSqlAlchemy(fabrica_de_sessoes)


# use_cache=False: sem isso o FastAPI entregaria a mesma instância a todos que a pedem na
# requisição, e o usuário atual e o caso de uso da rota compartilhariam a unidade de trabalho.
UnidadeDeTrabalhoPropria = Annotated[
    UnidadeDeTrabalho, Depends(obter_unidade_de_trabalho, use_cache=False)
]
ConfiguracoesDaApp = Annotated[Configuracoes, Depends(obter_configuracoes_da_app)]
RelogioDaApp = Annotated[Relogio, Depends(obter_relogio)]
HasherDaApp = Annotated[HasherDeSenha, Depends(obter_hasher_de_senha)]
GeradorDaApp = Annotated[GeradorDeSegredo, Depends(obter_gerador_de_segredo)]


# Autenticação


@dataclass(frozen=True, slots=True)
class Credencial:
    """O token enviado e por onde chegou (o cookie exige a proteção contra CSRF)."""

    token: str = field(repr=False)  # fora do repr: tracebacks e logs não o mostram
    por_cookie: bool


def obter_credencial(request: Request) -> Credencial:
    """``Authorization: Bearer <token>`` ou, sem esse cabeçalho, o cookie de sessão."""
    autorizacao = request.headers.get("Authorization")
    if autorizacao is not None:
        esquema, _, token = autorizacao.strip().partition(" ")
        token = token.strip()
        if esquema.lower() != "bearer" or not token:
            raise NaoAutenticado()
        credencial = Credencial(token, por_cookie=False)
    else:
        token = request.cookies.get(NOME_DO_COOKIE_DE_SESSAO, "")
        # O cookie só carrega sessão: uma chave de API nele não vale.
        if not token.startswith(PREFIXO_DE_SESSAO):
            raise NaoAutenticado()
        credencial = Credencial(token, por_cookie=True)
    # Barra tokens enormes antes de qualquer consulta ou hash.
    if len(credencial.token) > TAMANHO_MAXIMO_DO_SEGREDO:
        raise NaoAutenticado()
    return credencial


def obter_autenticacao(
    request: Request,
    credencial: Annotated[Credencial, Depends(obter_credencial)],
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
    relogio: RelogioDaApp,
) -> Autenticacao:
    """Quem chama e por qual meio; confere a proteção contra CSRF e o escopo pelo método."""
    if credencial.token.startswith(PREFIXO_DE_SESSAO):
        autenticacao = AutenticarPorSessao(unidade_de_trabalho, relogio).executar(credencial.token)
    elif credencial.token.startswith(PREFIXO_DE_CHAVE_DE_API):
        autenticacao = AutenticarPorChaveDeApi(unidade_de_trabalho, relogio).executar(
            credencial.token
        )
    else:
        raise NaoAutenticado()

    eh_leitura = request.method in METODOS_DE_LEITURA
    if credencial.por_cookie and not eh_leitura and request.headers.get(CABECALHO_ANTI_CSRF) != "1":
        raise RequisicaoSemCabecalhoDeOrigem()
    exigir_escopo(autenticacao, EscopoDaChave.LEITURA if eh_leitura else EscopoDaChave.ESCRITA)
    return autenticacao


AutenticacaoAtual = Annotated[Autenticacao, Depends(obter_autenticacao)]


def obter_usuario_atual(autenticacao: AutenticacaoAtual) -> Usuario:
    """Ponto único de autenticação das rotas de negócio: sessão ou chave de API."""
    return autenticacao.usuario


def obter_autenticacao_de_sessao(autenticacao: AutenticacaoAtual) -> Autenticacao:
    """Como ``obter_autenticacao``, mas recusa chave de API (ex.: para gerir chaves)."""
    exigir_sessao(autenticacao)
    return autenticacao


# Casos de uso


def obter_criar_conta(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> CriarConta:
    return CriarConta(unidade_de_trabalho)


def obter_listar_contas(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> ListarContas:
    return ListarContas(unidade_de_trabalho)


def obter_registrar_gasto(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> RegistrarGasto:
    return RegistrarGasto(unidade_de_trabalho)


def obter_listar_gastos(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> ListarGastos:
    return ListarGastos(unidade_de_trabalho)


def obter_resumir_gastos_por_tag(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> ResumirGastosPorTag:
    return ResumirGastosPorTag(unidade_de_trabalho)


def obter_registrar_ganho(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> RegistrarGanho:
    return RegistrarGanho(unidade_de_trabalho)


def obter_excluir_ganho(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> ExcluirGanho:
    return ExcluirGanho(unidade_de_trabalho)


def e_dono_da_importacao(configuracoes: Configuracoes, usuario: Usuario) -> bool:
    """A importação está ligada e a pessoa é a dona dela (o plano gratuito é de uso pessoal)."""
    if not configuracoes.importacao_ativa or usuario.email is None:
        return False
    try:
        dono = Email.de_texto(configuracoes.pluggy_email_do_dono or "")
    except EmailInvalido:
        return False
    return usuario.email == dono


def obter_dono_da_importacao(
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    configuracoes: ConfiguracoesDaApp,
) -> Usuario:
    """Para quem não é a dona (ou com a importação desligada) as rotas não existem: 404."""
    if not e_dono_da_importacao(configuracoes, usuario):
        raise ImportacaoDesligada("A importação bancária não está disponível.")
    return usuario


def obter_listar_transacoes_importadas(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> ListarTransacoesImportadas:
    return ListarTransacoesImportadas(unidade_de_trabalho)


def obter_aceitar_transacao_importada(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> AceitarTransacaoImportada:
    return AceitarTransacaoImportada(unidade_de_trabalho)


def obter_ignorar_transacao_importada(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> IgnorarTransacaoImportada:
    return IgnorarTransacaoImportada(unidade_de_trabalho)


def criar_sincronizador(app: FastAPI) -> SincronizarContasBancarias:
    """Monta a sincronização a partir da app (também usada pela tarefa periódica)."""
    configuracoes: Configuracoes = app.state.configuracoes
    return SincronizarContasBancarias(
        UnidadeDeTrabalhoSqlAlchemy(app.state.fabrica_de_sessoes),
        app.state.provedor_open_finance,
        app.state.relogio,
        tuple(configuracoes.pluggy_item_ids),
        configuracoes.pluggy_email_do_dono or "",
        configuracoes.pluggy_dias_iniciais,
    )


def obter_sincronizador(request: Request) -> SincronizarContasBancarias:
    return criar_sincronizador(request.app)


def obter_listar_ganhos(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> ListarGanhos:
    return ListarGanhos(unidade_de_trabalho)


def obter_criar_recorrencia(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria, relogio: RelogioDaApp
) -> CriarRecorrencia:
    return CriarRecorrencia(unidade_de_trabalho, relogio)


def obter_listar_recorrencias(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> ListarRecorrencias:
    return ListarRecorrencias(unidade_de_trabalho)


def obter_alterar_recorrencia(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> AlterarRecorrencia:
    return AlterarRecorrencia(unidade_de_trabalho)


def obter_encerrar_recorrencia(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> EncerrarRecorrencia:
    return EncerrarRecorrencia(unidade_de_trabalho)


def obter_definir_meta(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> DefinirMeta:
    return DefinirMeta(unidade_de_trabalho)


def obter_remover_meta(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> RemoverMeta:
    return RemoverMeta(unidade_de_trabalho)


def obter_listar_metas(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> ListarMetas:
    return ListarMetas(unidade_de_trabalho)


def obter_consultar_progresso_das_metas(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> ConsultarProgressoDasMetas:
    return ConsultarProgressoDasMetas(unidade_de_trabalho)


def obter_listar_tags(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> ListarTags:
    return ListarTags(unidade_de_trabalho)


def obter_cadastrar_usuario(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
    hasher: HasherDaApp,
    configuracoes: ConfiguracoesDaApp,
) -> CadastrarUsuario:
    return CadastrarUsuario(unidade_de_trabalho, hasher, configuracoes.cadastro_aberto)


def obter_entrar_com_senha(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
    hasher: HasherDaApp,
    gerador: GeradorDaApp,
    relogio: RelogioDaApp,
    configuracoes: ConfiguracoesDaApp,
    limitador: Annotated[LimitadorDeTentativas, Depends(obter_limitador_de_tentativas)],
) -> EntrarComSenha:
    return EntrarComSenha(
        unidade_de_trabalho,
        hasher,
        gerador,
        relogio,
        timedelta(hours=configuracoes.duracao_da_sessao_horas),
        limitador,
    )


def obter_sair_da_sessao(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria, relogio: RelogioDaApp
) -> SairDaSessao:
    return SairDaSessao(unidade_de_trabalho, relogio)


def obter_criar_chave_de_api(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria, gerador: GeradorDaApp, relogio: RelogioDaApp
) -> CriarChaveDeApi:
    return CriarChaveDeApi(unidade_de_trabalho, gerador, relogio)


def obter_listar_chaves_de_api(unidade_de_trabalho: UnidadeDeTrabalhoPropria) -> ListarChavesDeApi:
    return ListarChavesDeApi(unidade_de_trabalho)


def obter_revogar_chave_de_api(
    unidade_de_trabalho: UnidadeDeTrabalhoPropria,
) -> RevogarChaveDeApi:
    return RevogarChaveDeApi(unidade_de_trabalho)
