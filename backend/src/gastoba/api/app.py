import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import timedelta

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from gastoba.api.dependencias import CABECALHO_ANTI_CSRF, criar_sincronizador
from gastoba.api.erros import registrar_tratadores_de_erro
from gastoba.api.rotas.autenticacao import roteador as roteador_de_autenticacao
from gastoba.api.rotas.categorias import roteador as roteador_de_categorias
from gastoba.api.rotas.chaves_de_api import roteador as roteador_de_chaves_de_api
from gastoba.api.rotas.contas import roteador as roteador_de_contas
from gastoba.api.rotas.ganhos import roteador as roteador_de_ganhos
from gastoba.api.rotas.gastos import roteador as roteador_de_gastos
from gastoba.api.rotas.importacao import TRAVA_DA_SINCRONIZACAO
from gastoba.api.rotas.importacao import roteador as roteador_de_importacao
from gastoba.api.rotas.metas import roteador as roteador_de_metas
from gastoba.api.rotas.recorrencias import roteador as roteador_de_recorrencias
from gastoba.api.rotas.resumos import roteador as roteador_de_resumos
from gastoba.api.rotas.saude import roteador as roteador_de_saude
from gastoba.api.rotas.tags import roteador as roteador_de_tags
from gastoba.application.processar_recorrencias import ProcessarRecorrencias
from gastoba.infrastructure.configuracoes import Configuracoes, obter_configuracoes
from gastoba.infrastructure.persistencia.banco import criar_engine, criar_fabrica_de_sessoes
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy
from gastoba.infrastructure.pluggy.provedor_pluggy import ProvedorPluggy
from gastoba.infrastructure.relogio_do_sistema import RelogioDoSistema
from gastoba.infrastructure.seguranca.gerador_de_segredo_seguro import GeradorDeSegredoSeguro
from gastoba.infrastructure.seguranca.hasher_de_senha_scrypt import HasherDeSenhaScrypt
from gastoba.infrastructure.seguranca.limitador_de_tentativas_em_memoria import (
    LimitadorDeTentativasEmMemoria,
)

# Janela do limite de tentativas de login (o número de falhas vem da configuração).
JANELA_DE_TENTATIVAS_DE_LOGIN = timedelta(minutes=15)


_registro = logging.getLogger(__name__)


async def _processar_recorrencias_periodicamente(app: FastAPI, intervalo: timedelta) -> None:
    """Gera o que as recorrências devem desde a última rodada, ao subir e a cada ``intervalo``.

    Uma falha só é registrada (sem dados): a próxima rodada tenta de novo.
    """
    while True:
        try:
            caso_de_uso = ProcessarRecorrencias(
                UnidadeDeTrabalhoSqlAlchemy(app.state.fabrica_de_sessoes), app.state.relogio
            )
            await asyncio.to_thread(caso_de_uso.executar)
        except Exception:
            _registro.exception("Falha ao processar as recorrências.")
        await asyncio.sleep(intervalo.total_seconds())


async def _sincronizar_contas_bancarias_periodicamente(app: FastAPI, intervalo: timedelta) -> None:
    """Busca no banco as contas e transações novas ao subir e a cada ``intervalo``.

    Uma falha só é registrada (sem dados): a próxima rodada tenta de novo.
    """
    while True:
        try:
            await asyncio.to_thread(_sincronizar_uma_vez, app)
        except Exception:
            _registro.exception("Falha ao sincronizar as contas bancárias.")
        await asyncio.sleep(intervalo.total_seconds())


def _sincronizar_uma_vez(app: FastAPI) -> None:
    if not TRAVA_DA_SINCRONIZACAO.acquire(blocking=False):
        return
    try:
        criar_sincronizador(app).executar()
    finally:
        TRAVA_DA_SINCRONIZACAO.release()


def criar_app(configuracoes: Configuracoes | None = None) -> FastAPI:
    """Fábrica da aplicação: cada chamada cria uma app isolada (útil nos testes)."""
    configuracoes = configuracoes or obter_configuracoes()
    # Com cookie de sessão (allow_credentials), uma origem "*" liberaria qualquer site.
    if "*" in configuracoes.origens_permitidas or "*" in configuracoes.hosts_permitidos:
        raise ValueError("Origens e hosts permitidos precisam ser explícitos, nunca '*'.")
    engine = criar_engine(configuracoes.url_banco)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        tarefa = None
        if configuracoes.intervalo_de_recorrencias_minutos > 0:
            tarefa = asyncio.create_task(
                _processar_recorrencias_periodicamente(
                    app, timedelta(minutes=configuracoes.intervalo_de_recorrencias_minutos)
                )
            )
        tarefa_bancaria = None
        if configuracoes.importacao_ativa and configuracoes.pluggy_intervalo_horas > 0:
            tarefa_bancaria = asyncio.create_task(
                _sincronizar_contas_bancarias_periodicamente(
                    app, timedelta(hours=configuracoes.pluggy_intervalo_horas)
                )
            )
        yield
        for em_andamento in (tarefa, tarefa_bancaria):
            if em_andamento is not None:
                em_andamento.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await em_andamento
        engine.dispose()

    app = FastAPI(title="Gastoba", version="0.1.0", lifespan=lifespan)
    app.state.engine = engine
    app.state.fabrica_de_sessoes = criar_fabrica_de_sessoes(engine)
    app.state.configuracoes = configuracoes
    # Só existe com a importação ligada; os testes trocam por um provedor falso.
    app.state.provedor_open_finance = (
        ProvedorPluggy(
            configuracoes.pluggy_client_id or "",
            configuracoes.pluggy_client_secret.get_secret_value()
            if configuracoes.pluggy_client_secret
            else "",
        )
        if configuracoes.importacao_ativa
        else None
    )
    app.state.relogio = RelogioDoSistema()
    app.state.hasher_de_senha = HasherDeSenhaScrypt()
    app.state.gerador_de_segredo = GeradorDeSegredoSeguro()
    # Em memória: vale para uma réplica só da API (cenário aprovado no plano).
    app.state.limitador_de_tentativas = LimitadorDeTentativasEmMemoria(
        limite=configuracoes.tentativas_de_login,
        janela=JANELA_DE_TENTATIVAS_DE_LOGIN,
        relogio=app.state.relogio,
    )

    registrar_tratadores_de_erro(app)

    # Defesa contra DNS rebinding: só atende pelos hosts configurados.
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=configuracoes.hosts_permitidos)

    # Com credenciais (cookie de sessão), as origens são sempre explícitas.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=configuracoes.origens_permitidas,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type", CABECALHO_ANTI_CSRF],
        allow_credentials=True,
        # Fora da lista segura do CORS: sem isso a SPA não lê o Retry-After do 429.
        expose_headers=["Retry-After", "WWW-Authenticate"],
    )

    app.include_router(roteador_de_saude)
    app.include_router(roteador_de_autenticacao)
    app.include_router(roteador_de_chaves_de_api)
    app.include_router(roteador_de_contas)
    app.include_router(roteador_de_gastos)
    app.include_router(roteador_de_ganhos)
    app.include_router(roteador_de_importacao)
    app.include_router(roteador_de_recorrencias)
    app.include_router(roteador_de_metas)
    app.include_router(roteador_de_resumos)
    app.include_router(roteador_de_tags)
    app.include_router(roteador_de_categorias)
    return app
