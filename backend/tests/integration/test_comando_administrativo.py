import io
import os
import subprocess
import sys

import pytest

from gastoba.administracao.comandos import principal
from gastoba.domain.conta import Conta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.email import Email
from gastoba.domain.senha import SenhaEmClaro
from gastoba.domain.usuario import ID_USUARIO_PADRAO, Usuario
from gastoba.infrastructure.configuracoes import Configuracoes
from gastoba.infrastructure.persistencia.banco import criar_engine, criar_fabrica_de_sessoes
from gastoba.infrastructure.persistencia.modelos import Base
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy
from gastoba.infrastructure.seguranca.hasher_de_senha_scrypt import HasherDeSenhaScrypt

SENHA = "senha-do-admin-1"
HASHER = HasherDeSenhaScrypt(n=2, r=1, p=1)


@pytest.fixture
def configuracoes(tmp_path):
    configuracoes = Configuracoes(
        url_banco=f"sqlite:///{tmp_path}/admin.db", nome_usuario_padrao="Usuário"
    )
    engine = criar_engine(configuracoes.url_banco)
    Base.metadata.create_all(engine)
    engine.dispose()
    return configuracoes


def _unidade(configuracoes) -> UnidadeDeTrabalhoSqlAlchemy:
    return UnidadeDeTrabalhoSqlAlchemy(
        criar_fabrica_de_sessoes(criar_engine(configuracoes.url_banco))
    )


def _executar(configuracoes, *argumentos, ambiente=None, senhas=(SENHA, SENHA)):
    digitadas = iter(senhas)
    perguntas: list[str] = []

    def ler_senha(pergunta: str) -> str:
        perguntas.append(pergunta)
        return next(digitadas)

    saida, erros = io.StringIO(), io.StringIO()
    codigo = principal(
        ["criar-usuario", *argumentos],
        ambiente=ambiente or {},
        ler_senha=ler_senha,
        configuracoes=configuracoes,
        hasher=HASHER,
        saida=saida,
        erros=erros,
    )
    return codigo, saida.getvalue(), erros.getvalue(), perguntas


def _usuario_por_email(configuracoes, email: str) -> Usuario | None:
    with _unidade(configuracoes) as uow:
        return uow.usuarios.obter_por_email(Email.de_texto(email))


def test_cria_usuario_novo_com_senha_perguntada_sem_eco(configuracoes):
    codigo, saida, erros, perguntas = _executar(
        configuracoes, "--email", "Ana@X.com", "--nome", "Ana"
    )

    assert codigo == 0, erros
    assert perguntas == ["Senha: ", "Repita a senha: "]
    usuario = _usuario_por_email(configuracoes, "ana@x.com")
    assert usuario is not None
    assert usuario.id != ID_USUARIO_PADRAO
    assert usuario.nome == "Ana"
    assert HASHER.verificar(SenhaEmClaro(SENHA), usuario.senha_hash)
    assert "ana@x.com" in saida
    assert SENHA not in saida + erros


def test_senha_vem_da_variavel_de_ambiente_sem_perguntar(configuracoes):
    codigo, saida, erros, perguntas = _executar(
        configuracoes,
        "--email",
        "ana@x.com",
        "--nome",
        "Ana",
        ambiente={"GASTOBA_SENHA_INICIAL": SENHA},
    )

    assert codigo == 0, erros
    assert perguntas == []
    usuario = _usuario_por_email(configuracoes, "ana@x.com")
    assert HASHER.verificar(SenhaEmClaro(SENHA), usuario.senha_hash)
    assert SENHA not in saida + erros


def test_senhas_diferentes_nao_criam_usuario(configuracoes):
    codigo, saida, erros, _ = _executar(
        configuracoes, "--email", "ana@x.com", "--nome", "Ana", senhas=(SENHA, "outra-senha-1")
    )

    assert codigo == 1
    assert "não conferem" in erros
    assert _usuario_por_email(configuracoes, "ana@x.com") is None
    assert SENHA not in saida + erros


def test_senha_fora_da_politica_e_recusada_sem_ser_impressa(configuracoes):
    codigo, saida, erros, _ = _executar(
        configuracoes, "--email", "ana@x.com", "--nome", "Ana", senhas=("curta", "curta")
    )

    assert codigo == 1
    assert "senha" in erros.lower()
    assert "curta" not in saida + erros
    assert _usuario_por_email(configuracoes, "ana@x.com") is None


def test_email_repetido_e_recusado(configuracoes):
    assert _executar(configuracoes, "--email", "ana@x.com", "--nome", "Ana")[0] == 0

    codigo, _, erros, _ = _executar(configuracoes, "--email", "ANA@x.com", "--nome", "Outra")

    assert codigo == 1
    assert "e-mail" in erros


def test_senha_nao_e_aceita_como_argumento(configuracoes):
    with pytest.raises(SystemExit):
        principal(
            ["criar-usuario", "--email", "ana@x.com", "--nome", "Ana", "--senha", SENHA],
            ambiente={},
            configuracoes=configuracoes,
            hasher=HASHER,
        )


def test_assumir_dados_do_padrao_mantem_id_e_dados(configuracoes):
    with _unidade(configuracoes) as uow:
        uow.usuarios.garantir(Usuario("Usuário", id=ID_USUARIO_PADRAO))
        conta = Conta(usuario_id=ID_USUARIO_PADRAO, nome="Nubank", saldo=Dinheiro(1000))
        uow.contas.adicionar(conta)
        uow.commit()

    codigo, saida, erros, _ = _executar(
        configuracoes, "--email", "ana@x.com", "--nome", "Ana", "--assumir-dados-do-padrao"
    )

    assert codigo == 0, erros
    usuario = _usuario_por_email(configuracoes, "ana@x.com")
    assert usuario.id == ID_USUARIO_PADRAO
    assert usuario.nome == "Ana"
    assert HASHER.verificar(SenhaEmClaro(SENHA), usuario.senha_hash)
    with _unidade(configuracoes) as uow:
        assert [c.nome for c in uow.contas.listar(ID_USUARIO_PADRAO)] == ["Nubank"]
    assert "padrão" in saida


def test_assumir_cria_o_padrao_se_ainda_nao_existe(configuracoes):
    codigo, _, erros, _ = _executar(
        configuracoes, "--email", "ana@x.com", "--nome", "Ana", "--assumir-dados-do-padrao"
    )

    assert codigo == 0, erros
    assert _usuario_por_email(configuracoes, "ana@x.com").id == ID_USUARIO_PADRAO


def test_assumir_de_novo_e_recusado(configuracoes):
    argumentos = ("--email", "ana@x.com", "--nome", "Ana", "--assumir-dados-do-padrao")
    assert _executar(configuracoes, *argumentos)[0] == 0

    codigo, _, erros, _ = _executar(
        configuracoes, "--email", "bia@x.com", "--nome", "Bia", "--assumir-dados-do-padrao"
    )

    assert codigo == 1
    assert "padrão" in erros
    assert _usuario_por_email(configuracoes, "bia@x.com") is None
    assert _usuario_por_email(configuracoes, "ana@x.com").id == ID_USUARIO_PADRAO


@pytest.mark.parametrize("assumir", [False, True])
def test_banco_sem_migrations_da_mensagem_clara_sem_traceback(tmp_path, assumir):
    sem_tabelas = Configuracoes(
        url_banco=f"sqlite:///{tmp_path}/vazio.db", nome_usuario_padrao="Usuário"
    )
    argumentos = ["--email", "ana@x.com", "--nome", "Ana"]
    if assumir:
        argumentos.append("--assumir-dados-do-padrao")

    codigo, saida, erros, _ = _executar(sem_tabelas, *argumentos)

    assert codigo == 1
    assert "alembic upgrade head" in erros
    assert "Traceback" not in erros
    assert SENHA not in saida + erros
    assert "ana@x.com" not in erros


@pytest.mark.parametrize("interrupcao", [EOFError, KeyboardInterrupt])
def test_leitura_da_senha_interrompida_sai_sem_traceback(configuracoes, interrupcao):
    def ler_senha(_pergunta: str) -> str:
        raise interrupcao()

    erros = io.StringIO()
    codigo = principal(
        ["criar-usuario", "--email", "ana@x.com", "--nome", "Ana"],
        ambiente={},
        ler_senha=ler_senha,
        configuracoes=configuracoes,
        hasher=HASHER,
        saida=io.StringIO(),
        erros=erros,
    )

    assert codigo == 1
    assert "cancelado" in erros.getvalue().lower()
    assert _usuario_por_email(configuracoes, "ana@x.com") is None


def test_usuario_criado_pelo_comando_entra_pela_api(cliente):
    configuracoes_da_api = cliente.app.state.configuracoes
    codigo, _, erros, _ = _executar(configuracoes_da_api, "--email", "ana@x.com", "--nome", "Ana")
    assert codigo == 0, erros

    resposta = cliente.post("/auth/entrar", json={"email": "ana@x.com", "senha": SENHA})

    assert resposta.status_code == 200


def test_modulo_executavel_com_senha_do_ambiente(configuracoes, tmp_path):
    # Executa como a pessoa executaria, num diretório sem .env; scrypt real (~0,1 s).
    ambiente = {
        **os.environ,
        "GASTOBA_URL_BANCO": configuracoes.url_banco,
        "GASTOBA_SENHA_INICIAL": SENHA,
    }

    processo = subprocess.run(
        [
            sys.executable,
            "-m",
            "gastoba.administracao",
            "criar-usuario",
            "--email",
            "ana@x.com",
            "--nome",
            "Ana",
        ],
        cwd=tmp_path,
        env=ambiente,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )

    assert processo.returncode == 0, processo.stderr
    assert "ana@x.com" in processo.stdout
    assert SENHA not in processo.stdout + processo.stderr
    usuario = _usuario_por_email(configuracoes, "ana@x.com")
    assert HasherDeSenhaScrypt().verificar(SenhaEmClaro(SENHA), usuario.senha_hash)
