"""``uv run python -m gastoba.administracao criar-usuario --email E --nome N``.

A senha nunca vem por argumento (ficaria no histórico do shell e na lista de processos) e
nunca é impressa: é lida da variável de ambiente ``GASTOBA_SENHA_INICIAL`` ou perguntada
sem eco (``getpass``), com confirmação.
"""

import argparse
import getpass
import os
import sys
from collections.abc import Callable, Mapping, Sequence
from typing import TextIO

from sqlalchemy.exc import SQLAlchemyError

from gastoba.application.assumir_dados_do_usuario_padrao import AssumirDadosDoUsuarioPadrao
from gastoba.application.cadastrar_usuario import CadastrarUsuario
from gastoba.application.obter_usuario_padrao import ObterUsuarioPadrao
from gastoba.domain.excecoes import ErroDeDominio
from gastoba.domain.portas import HasherDeSenha
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.configuracoes import Configuracoes
from gastoba.infrastructure.persistencia.banco import criar_engine, criar_fabrica_de_sessoes
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy
from gastoba.infrastructure.seguranca.hasher_de_senha_scrypt import HasherDeSenhaScrypt

VARIAVEL_DA_SENHA = "GASTOBA_SENHA_INICIAL"

LerSenha = Callable[[str], str]


class SenhaNaoConfirmada(Exception):
    """As duas digitações da senha não conferem."""


def _criar_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m gastoba.administracao", description="Comandos administrativos do Gastoba."
    )
    subcomandos = parser.add_subparsers(dest="comando", required=True)
    criar = subcomandos.add_parser(
        "criar-usuario",
        help="cria um usuário com e-mail e senha (a senha vem de "
        f"{VARIAVEL_DA_SENHA} ou é perguntada sem eco)",
    )
    criar.add_argument("--email", required=True)
    criar.add_argument("--nome", required=True)
    criar.add_argument(
        "--assumir-dados-do-padrao",
        action="store_true",
        help="dá e-mail, nome e senha ao usuário padrão herdado, que mantém contas e gastos",
    )
    return parser


def _obter_senha(ambiente: Mapping[str, str], ler_senha: LerSenha) -> str:
    senha = ambiente.get(VARIAVEL_DA_SENHA)
    if senha:
        return senha
    senha = ler_senha("Senha: ")
    if ler_senha("Repita a senha: ") != senha:
        raise SenhaNaoConfirmada()
    return senha


def _criar_usuario(
    configuracoes: Configuracoes,
    hasher: HasherDeSenha,
    email: str,
    nome: str,
    senha: str,
    assumir_dados_do_padrao: bool,
) -> Usuario:
    engine = criar_engine(configuracoes.url_banco)
    try:
        fabrica = criar_fabrica_de_sessoes(engine)
        if not assumir_dados_do_padrao:
            # O cadastro administrativo vale mesmo com o cadastro pela API fechado.
            return CadastrarUsuario(
                UnidadeDeTrabalhoSqlAlchemy(fabrica), hasher, cadastro_aberto=True
            ).executar(nome, email, senha)
        ObterUsuarioPadrao(
            UnidadeDeTrabalhoSqlAlchemy(fabrica), configuracoes.nome_usuario_padrao
        ).executar()
        return AssumirDadosDoUsuarioPadrao(UnidadeDeTrabalhoSqlAlchemy(fabrica), hasher).executar(
            nome, email, senha
        )
    finally:
        engine.dispose()


def principal(
    argumentos: Sequence[str] | None = None,
    *,
    ambiente: Mapping[str, str] | None = None,
    ler_senha: LerSenha = getpass.getpass,
    configuracoes: Configuracoes | None = None,
    hasher: HasherDeSenha | None = None,
    saida: TextIO | None = None,
    erros: TextIO | None = None,
) -> int:
    """Executa o comando e devolve o código de saída (0 em caso de sucesso)."""
    saida = saida or sys.stdout
    erros = erros or sys.stderr
    lidos = _criar_parser().parse_args(argumentos)
    ambiente = os.environ if ambiente is None else ambiente
    try:
        senha = _obter_senha(ambiente, ler_senha)
        usuario = _criar_usuario(
            configuracoes or Configuracoes(),
            hasher or HasherDeSenhaScrypt(),
            lidos.email,
            lidos.nome,
            senha,
            lidos.assumir_dados_do_padrao,
        )
    except EOFError, KeyboardInterrupt:
        print("\nCancelado: nenhum usuário foi criado.", file=erros)
        return 1
    except SenhaNaoConfirmada:
        print("Erro: as senhas não conferem.", file=erros)
        return 1
    except SQLAlchemyError:
        # Sem ``from``/traceback: a mensagem do banco não deve chegar ao terminal nem a logs.
        print(
            "Erro: não foi possível usar o banco de dados. Confira GASTOBA_URL_BANCO e "
            "aplique as migrations com `uv run alembic upgrade head`.",
            file=erros,
        )
        return 1
    except ErroDeDominio as erro:
        # As mensagens de domínio são fixas: não trazem a senha.
        print(f"Erro: {erro}", file=erros)
        return 1
    if lidos.assumir_dados_do_padrao:
        print(f"Usuário padrão assumido por {usuario.email} (id {usuario.id}).", file=saida)
    else:
        print(f"Usuário {usuario.email} criado (id {usuario.id}).", file=saida)
    return 0
