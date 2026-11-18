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

from gastoba.administracao.inspecionar_liquidacoes import inspecionar_liquidacoes
from gastoba.administracao.medir_faturas import medir_faturas
from gastoba.administracao.medir_operacoes import medir_operacoes
from gastoba.administracao.planejar_migracao import imprimir, para_json, somente_leitura
from gastoba.administracao.relatorio_de_ganhos import imprimir as imprimir_ganhos
from gastoba.administracao.tratar_aportes import imprimir_plano
from gastoba.application.aprovar_tratamentos_de_aporte import AprovarTratamentosDeAporte
from gastoba.application.assumir_dados_do_usuario_padrao import AssumirDadosDoUsuarioPadrao
from gastoba.application.cadastrar_usuario import CadastrarUsuario
from gastoba.application.migrar_investimentos import MigrarInvestimentos
from gastoba.application.obter_usuario_padrao import ObterUsuarioPadrao
from gastoba.application.planejar_migracao_de_investimentos import (
    PlanejarMigracaoDeInvestimentos,
)
from gastoba.application.planejar_tratamento_de_aportes import PlanejarTratamentoDeAportes
from gastoba.application.relatorio_de_ganhos_que_sao_rendimento import (
    RelatorioDeGanhosQueSaoRendimento,
)
from gastoba.application.reprocessar_investimentos import ReprocessarInvestimentos
from gastoba.domain.email import Email
from gastoba.domain.excecoes import ErroDeDominio
from gastoba.domain.mes import hoje_no_fuso_do_negocio
from gastoba.domain.portas import HasherDeSenha
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.configuracoes import Configuracoes
from gastoba.infrastructure.persistencia.banco import criar_engine, criar_fabrica_de_sessoes
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy
from gastoba.infrastructure.pluggy.provedor_pluggy import ProvedorPluggy
from gastoba.infrastructure.relogio_do_sistema import RelogioDoSistema
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
    subcomandos.add_parser(
        "medir-faturas",
        help="mede, só por leitura, o que a Pluggy devolve sobre faturas de cartão "
        "(contagens e ordens de grandeza, sem dados)",
    )
    subcomandos.add_parser(
        "medir-operacoes-de-investimento",
        help="mede, só por leitura, o que a Pluggy devolve de operações de investimento "
        "(contagens e tipos, sem ids, descrições nem valores)",
    )
    subcomandos.add_parser(
        "inspecionar-liquidacoes",
        help="mostra, só por leitura, como a Pluggy descreve as liquidações da bolsa "
        "(sentido, tipo de operação e valor), sem identificadores",
    )
    planejar = subcomandos.add_parser(
        "planejar-migracao-de-investimentos",
        help="simula, só por leitura, a migração dos investimentos (antes x depois)",
    )
    planejar.add_argument("--email", required=True, help="e-mail da pessoa dona dos dados")
    planejar.add_argument("--formato", choices=["texto", "json"], default="texto")
    migrar = subcomandos.add_parser(
        "migrar-investimentos",
        help="grava o modelo novo dos investimentos nas tabelas novas (por padrão só simula: "
        "dry-run). Faça o backup conferido antes de usar --aplicar",
    )
    migrar.add_argument("--email", required=True, help="e-mail da pessoa dona dos dados")
    modo_da_migracao = migrar.add_mutually_exclusive_group()
    modo_da_migracao.add_argument("--dry-run", action="store_true", help="só mostra (padrão)")
    modo_da_migracao.add_argument("--aplicar", action="store_true", help="grava a migração")
    ganhos = subcomandos.add_parser(
        "relatorio-de-ganhos-que-sao-rendimento",
        help="mostra, só por leitura, quantos ganhos parecem ser rendimento de título e o efeito "
        "mês a mês na renda (contagens e somas, sem descrições nem ids)",
    )
    ganhos.add_argument("--email", required=True, help="e-mail da pessoa dona dos dados")
    tratar = subcomandos.add_parser(
        "tratar-aportes-sem-investimento",
        help="mescla duplicados de aportes sem investimento de forma lógica e reversível (por "
        "padrão só mostra: dry-run; --aplicar registra; --aprovar tira dos totais)",
    )
    tratar.add_argument("--email", required=True, help="e-mail da pessoa dona dos dados")
    modo_do_tratamento = tratar.add_mutually_exclusive_group()
    modo_do_tratamento.add_argument("--dry-run", action="store_true", help="só mostra (padrão)")
    modo_do_tratamento.add_argument("--aplicar", action="store_true", help="registra as mesclas")
    modo_do_tratamento.add_argument("--aprovar", action="store_true", help="aprova os registrados")
    corrigir = subcomandos.add_parser(
        "corrigir-investimentos",
        help="reprocessa os investimentos já gravados com as regras corrigidas "
        "(por padrão só mostra o que mudaria: dry-run)",
    )
    corrigir.add_argument("--email", required=True, help="e-mail da pessoa dona dos dados")
    modo = corrigir.add_mutually_exclusive_group()
    modo.add_argument("--dry-run", action="store_true", help="só mostra (é o padrão)")
    modo.add_argument("--aplicar", action="store_true", help="grava as correções")
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


def _inspecionar_liquidacoes(configuracoes: Configuracoes, saida: TextIO, erros: TextIO) -> int:
    if not (
        configuracoes.pluggy_client_id
        and configuracoes.pluggy_client_secret
        and configuracoes.pluggy_item_ids
    ):
        print(
            "Erro: configure GASTOBA_PLUGGY_CLIENT_ID, GASTOBA_PLUGGY_CLIENT_SECRET e "
            "GASTOBA_PLUGGY_ITEM_IDS no .env.",
            file=erros,
        )
        return 1
    provedor = ProvedorPluggy(
        configuracoes.pluggy_client_id, configuracoes.pluggy_client_secret.get_secret_value()
    )
    try:
        inspecionar_liquidacoes(
            provedor,
            configuracoes.pluggy_item_ids,
            saida,
            hoje=hoje_no_fuso_do_negocio(RelogioDoSistema().agora()),
        )
    except ErroDeDominio as erro:
        print(f"Erro: {erro}", file=erros)
        return 1
    return 0


def _medir_faturas(configuracoes: Configuracoes, saida: TextIO, erros: TextIO) -> int:
    if not (
        configuracoes.pluggy_client_id
        and configuracoes.pluggy_client_secret
        and configuracoes.pluggy_item_ids
    ):
        print(
            "Erro: configure GASTOBA_PLUGGY_CLIENT_ID, GASTOBA_PLUGGY_CLIENT_SECRET e "
            "GASTOBA_PLUGGY_ITEM_IDS no .env.",
            file=erros,
        )
        return 1
    # A administração é um segundo composition root: usa o adaptador concreto.
    provedor = ProvedorPluggy(
        configuracoes.pluggy_client_id, configuracoes.pluggy_client_secret.get_secret_value()
    )
    return medir_faturas(
        provedor,
        configuracoes.pluggy_item_ids,
        saida,
        hoje=hoje_no_fuso_do_negocio(RelogioDoSistema().agora()),
    )


def _medir_operacoes(configuracoes: Configuracoes, saida: TextIO, erros: TextIO) -> int:
    if not (
        configuracoes.pluggy_client_id
        and configuracoes.pluggy_client_secret
        and configuracoes.pluggy_item_ids
    ):
        print(
            "Erro: configure GASTOBA_PLUGGY_CLIENT_ID, GASTOBA_PLUGGY_CLIENT_SECRET e "
            "GASTOBA_PLUGGY_ITEM_IDS no .env.",
            file=erros,
        )
        return 1
    provedor = ProvedorPluggy(
        configuracoes.pluggy_client_id, configuracoes.pluggy_client_secret.get_secret_value()
    )
    return medir_operacoes(
        provedor,
        configuracoes.pluggy_item_ids,
        saida,
        hoje=hoje_no_fuso_do_negocio(RelogioDoSistema().agora()),
    )


def _relatorio_de_ganhos(
    configuracoes: Configuracoes, email: str, saida: TextIO, erros: TextIO
) -> int:
    engine = criar_engine(configuracoes.url_banco)
    somente_leitura(engine)
    try:
        unidade = UnidadeDeTrabalhoSqlAlchemy(criar_fabrica_de_sessoes(engine))
        with unidade as uow:
            usuario = uow.usuarios.obter_por_email(Email.de_texto(email))
        if usuario is None:
            print("Erro: usuário não encontrado.", file=erros)
            return 1
        relatorio = RelatorioDeGanhosQueSaoRendimento(unidade).executar(usuario.id)
    except ErroDeDominio as erro:
        print(f"Erro: {erro}", file=erros)
        return 1
    except SQLAlchemyError:
        print("Erro: não foi possível usar o banco de dados.", file=erros)
        return 1
    finally:
        engine.dispose()
    imprimir_ganhos(relatorio, saida)
    return 0


def _tratar_aportes(
    configuracoes: Configuracoes, email: str, modo: str, saida: TextIO, erros: TextIO
) -> int:
    engine = criar_engine(configuracoes.url_banco)
    if modo == "dry-run":
        somente_leitura(engine)
    try:
        unidade = UnidadeDeTrabalhoSqlAlchemy(criar_fabrica_de_sessoes(engine))
        with unidade as uow:
            usuario = uow.usuarios.obter_por_email(Email.de_texto(email))
        if usuario is None:
            print("Erro: usuário não encontrado.", file=erros)
            return 1
        relogio = RelogioDoSistema()
        planejador = PlanejarTratamentoDeAportes(unidade, relogio)
        if modo == "aprovar":
            with unidade as uow:
                pendentes = [
                    t
                    for t in uow.tratamentos.listar(usuario.id)
                    if t.ativo and t.aprovado_em is None
                ]
            if not pendentes:
                print("Nada a aprovar: rode antes com --aplicar.", file=erros)
                return 1
            aprovados = AprovarTratamentosDeAporte(unidade, relogio).executar(usuario.id)
            print(f"APROVADO: {aprovados} tratamento(s); os totais mudaram.", file=saida)
            return 0
        if modo == "aplicar":
            registrados = planejador.aplicar(usuario.id)
            print(
                f"REGISTRADO: {registrados} mescla(s), sem efeito nos totais até --aprovar.",
                file=saida,
            )
            return 0
        imprimir_plano(
            planejador.planejar(usuario.id), saida, "SIMULAÇÃO (somente leitura; nada foi gravado)"
        )
        return 0
    except ErroDeDominio as erro:
        print(f"Erro: {erro}", file=erros)
        return 1
    except SQLAlchemyError:
        print("Erro: não foi possível usar o banco de dados.", file=erros)
        return 1
    finally:
        engine.dispose()


def _planejar_migracao(
    configuracoes: Configuracoes, email: str, formato: str, saida: TextIO, erros: TextIO
) -> int:
    engine = criar_engine(configuracoes.url_banco)
    somente_leitura(engine)
    try:
        unidade = UnidadeDeTrabalhoSqlAlchemy(criar_fabrica_de_sessoes(engine))
        with unidade as uow:
            usuario = uow.usuarios.obter_por_email(Email.de_texto(email))
        if usuario is None:
            print("Erro: usuário não encontrado.", file=erros)
            return 1
        relatorio = PlanejarMigracaoDeInvestimentos(unidade).executar(usuario.id)
    except ErroDeDominio as erro:
        print(f"Erro: {erro}", file=erros)
        return 1
    except SQLAlchemyError:
        print("Erro: não foi possível usar o banco de dados.", file=erros)
        return 1
    finally:
        engine.dispose()
    if formato == "json":
        print(para_json(relatorio), file=saida)
    else:
        imprimir(relatorio, saida)
    return 0


def _migrar_investimentos(
    configuracoes: Configuracoes, email: str, aplicar: bool, saida: TextIO, erros: TextIO
) -> int:
    if not aplicar:
        return _planejar_migracao(configuracoes, email, "texto", saida, erros)
    engine = criar_engine(configuracoes.url_banco)
    try:
        unidade = UnidadeDeTrabalhoSqlAlchemy(criar_fabrica_de_sessoes(engine))
        with unidade as uow:
            usuario = uow.usuarios.obter_por_email(Email.de_texto(email))
        if usuario is None:
            print("Erro: usuário não encontrado.", file=erros)
            return 1
        relatorio = MigrarInvestimentos(unidade).executar(usuario.id, aplicar=True)
    except ErroDeDominio as erro:
        print(f"Erro: {erro}", file=erros)
        return 1
    except SQLAlchemyError:
        print("Erro: não foi possível usar o banco de dados.", file=erros)
        return 1
    finally:
        engine.dispose()
    print(
        f"APLICADO: {relatorio.posicoes} posições, {relatorio.aberturas_criadas} aberturas "
        f"(quantidade estimada, confirme) e {relatorio.alocacoes_gravadas} alocações.",
        file=saida,
    )
    return 0


def _corrigir_investimentos(
    configuracoes: Configuracoes, email: str, aplicar: bool, saida: TextIO, erros: TextIO
) -> int:
    engine = criar_engine(configuracoes.url_banco)
    try:
        unidade = UnidadeDeTrabalhoSqlAlchemy(criar_fabrica_de_sessoes(engine))
        with unidade as uow:
            usuario = uow.usuarios.obter_por_email(Email.de_texto(email))
        if usuario is None:
            print("Erro: usuário não encontrado.", file=erros)
            return 1
        relatorio = ReprocessarInvestimentos(unidade).executar(usuario.id, aplicar=aplicar)
    except ErroDeDominio as erro:
        print(f"Erro: {erro}", file=erros)
        return 1
    except SQLAlchemyError:
        print("Erro: não foi possível usar o banco de dados.", file=erros)
        return 1
    finally:
        engine.dispose()
    print("APLICADO" if aplicar else "DRY-RUN (nada foi gravado; use --aplicar)", file=saida)
    print(f"\nCorrigidos ({len(relatorio.corrigidos)}):", file=saida)
    for achado in relatorio.corrigidos:
        print(f"  [{achado.tipo}] {achado.texto}", file=saida)
    print(f"\nPara revisar ({len(relatorio.para_revisar)}), não alterados:", file=saida)
    for achado in relatorio.para_revisar:
        print(f"  [{achado.tipo}] {achado.texto}", file=saida)
    return 0


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
    if lidos.comando == "inspecionar-liquidacoes":
        return _inspecionar_liquidacoes(configuracoes or Configuracoes(), saida, erros)
    if lidos.comando == "tratar-aportes-sem-investimento":
        modo = "aprovar" if lidos.aprovar else "aplicar" if lidos.aplicar else "dry-run"
        return _tratar_aportes(configuracoes or Configuracoes(), lidos.email, modo, saida, erros)
    if lidos.comando == "relatorio-de-ganhos-que-sao-rendimento":
        return _relatorio_de_ganhos(configuracoes or Configuracoes(), lidos.email, saida, erros)
    if lidos.comando == "planejar-migracao-de-investimentos":
        return _planejar_migracao(
            configuracoes or Configuracoes(), lidos.email, lidos.formato, saida, erros
        )
    if lidos.comando == "migrar-investimentos":
        return _migrar_investimentos(
            configuracoes or Configuracoes(), lidos.email, lidos.aplicar, saida, erros
        )
    if lidos.comando == "corrigir-investimentos":
        return _corrigir_investimentos(
            configuracoes or Configuracoes(), lidos.email, lidos.aplicar, saida, erros
        )
    if lidos.comando == "medir-operacoes-de-investimento":
        return _medir_operacoes(configuracoes or Configuracoes(), saida, erros)
    if lidos.comando == "medir-faturas":
        return _medir_faturas(configuracoes or Configuracoes(), saida, erros)
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
