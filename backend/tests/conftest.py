from collections.abc import Callable
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from gastoba.api.app import criar_app
from gastoba.application.cadastrar_usuario import CadastrarUsuario
from gastoba.application.entrar_com_senha import EntrarComSenha
from gastoba.infrastructure.configuracoes import Configuracoes
from gastoba.infrastructure.persistencia.banco import criar_engine
from gastoba.infrastructure.persistencia.modelos import Base
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy
from gastoba.infrastructure.seguranca.hasher_de_senha_scrypt import HasherDeSenhaScrypt

SENHA_DE_TESTE = "senha-de-teste-1"


@pytest.fixture
def configuracoes_teste(tmp_path):
    # Valores passados explicitamente para que um backend/.env local não altere os testes.
    return Configuracoes(
        url_banco=f"sqlite:///{tmp_path}/teste.db",
        origens_permitidas=["http://localhost:5173"],
        hosts_permitidos=["localhost", "127.0.0.1"],
        cadastro_aberto=False,
        duracao_da_sessao_horas=12,
        cookie_seguro=True,
        tentativas_de_login=5,
        # Sem tarefa em segundo plano nos testes; o teste da tarefa liga o intervalo.
        intervalo_de_recorrencias_minutos=0,
    )


@pytest.fixture
def cliente(configuracoes_teste):
    """Cliente sem credencial (só ``/health`` e as rotas públicas de ``/auth`` respondem)."""
    # O esquema vem dos modelos (sem migrations), criado antes de subir a app.
    engine = criar_engine(configuracoes_teste.url_banco)
    Base.metadata.create_all(engine)
    engine.dispose()
    app = criar_app(configuracoes_teste)
    # scrypt barato nos testes: o custo real (~0,1 s por hash) só deixaria a suíte lenta.
    app.state.hasher_de_senha = HasherDeSenhaScrypt(n=2, r=1, p=1)
    # Usado como context manager para disparar o lifespan da aplicação.
    with TestClient(app, base_url="http://localhost") as c:
        yield c


@pytest.fixture
def autenticar_em() -> Callable[..., dict[str, str]]:
    """Como ``autenticar``, para um cliente qualquer (ex.: um com a importação bancária ligada).

    Cadastra o usuário direto pelos casos de uso e devolve o cabeçalho Bearer da sessão. Não passa
    por ``POST /auth/entrar`` para não deixar o cookie de sessão no cliente.
    """

    def _autenticar_em(
        cliente: TestClient,
        email: str = "ana@x.com",
        nome: str = "Ana",
        senha: str = SENHA_DE_TESTE,
    ) -> dict[str, str]:
        estado = cliente.app.state
        CadastrarUsuario(
            UnidadeDeTrabalhoSqlAlchemy(estado.fabrica_de_sessoes),
            estado.hasher_de_senha,
            cadastro_aberto=True,
        ).executar(nome, email, senha)
        sessao = EntrarComSenha(
            UnidadeDeTrabalhoSqlAlchemy(estado.fabrica_de_sessoes),
            estado.hasher_de_senha,
            estado.gerador_de_segredo,
            estado.relogio,
            timedelta(hours=12),
            estado.limitador_de_tentativas,
        ).executar(email, senha)
        return {"Authorization": f"Bearer {sessao.token.valor}"}

    return _autenticar_em


@pytest.fixture
def autenticar(cliente, autenticar_em) -> Callable[..., dict[str, str]]:
    """Cadastra um usuário no ``cliente`` padrão e devolve o cabeçalho Bearer da sessão."""

    def _autenticar(
        email: str = "ana@x.com", nome: str = "Ana", senha: str = SENHA_DE_TESTE
    ) -> dict[str, str]:
        return autenticar_em(cliente, email=email, nome=nome, senha=senha)

    return _autenticar


@pytest.fixture
def cliente_autenticado(cliente, autenticar):
    """O mesmo cliente, com a sessão de um usuário (Ana) em todas as requisições."""
    cliente.headers.update(autenticar())
    return cliente
