import hashlib
from datetime import UTC, datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select, text

from gastoba.domain.chave_de_api import ChaveDeApi, EscopoDaChave
from gastoba.domain.email import Email
from gastoba.domain.excecoes import EmailJaCadastrado
from gastoba.domain.senha import SenhaComHash
from gastoba.domain.sessao import Sessao
from gastoba.domain.usuario import ID_USUARIO_PADRAO, Usuario
from gastoba.infrastructure.persistencia.modelos import (
    ChaveDeApiModelo,
    SessaoModelo,
    UsuarioModelo,
)
from gastoba.infrastructure.persistencia.repositorios import RepositorioDeUsuariosSqlAlchemy
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy

AGORA = datetime(2026, 10, 12, 15, 0, tzinfo=UTC)


def hash_de(texto: str) -> str:
    return hashlib.sha256(texto.encode()).hexdigest()


@pytest.fixture
def uow(fabrica_de_sessoes):
    return UnidadeDeTrabalhoSqlAlchemy(fabrica_de_sessoes)


def salvar_usuario(uow, nome="Ana", email="ana@exemplo.com", senha_hash="scrypt$hash"):
    usuario = Usuario(
        nome,
        email=Email.de_texto(email) if email else None,
        senha_hash=SenhaComHash(senha_hash) if senha_hash else None,
    )
    with uow:
        uow.usuarios.salvar(usuario)
        uow.commit()
    return usuario


@pytest.fixture
def ana(uow):
    return salvar_usuario(uow)


@pytest.fixture
def bia(uow):
    return salvar_usuario(uow, nome="Bia", email="bia@exemplo.com")


def nova_sessao(usuario_id, segredo="sessao-1", criada_em=AGORA, horas=12):
    return Sessao(
        usuario_id=usuario_id,
        hash_do_segredo=hash_de(segredo),
        criada_em=criada_em,
        expira_em=criada_em + timedelta(hours=horas),
    )


def nova_chave(usuario_id, segredo="chave-1", nome="Script", criada_em=AGORA, **outros):
    return ChaveDeApi(
        usuario_id=usuario_id,
        nome=nome,
        prefixo="Ab12Cd34",
        hash_do_segredo=hash_de(segredo),
        escopo=outros.pop("escopo", EscopoDaChave.LEITURA),
        criada_em=criada_em,
        **outros,
    )


def adicionar_sessao(uow, sessao):
    with uow:
        uow.sessoes.adicionar(sessao)
        uow.commit()
    return sessao


def adicionar_chave(uow, chave):
    with uow:
        uow.chaves_de_api.adicionar(chave)
        uow.commit()
    return chave


# --- usuários ---


def test_salvar_insere_e_obter_devolve_email_e_senha(uow, ana):
    with uow:
        obtido = uow.usuarios.obter(ana.id)

    assert obtido == ana
    assert obtido.nome == "Ana"
    assert obtido.email == Email("ana@exemplo.com")
    assert obtido.senha_hash == SenhaComHash("scrypt$hash")


def test_obter_por_email(uow, ana, bia):
    with uow:
        assert uow.usuarios.obter_por_email(Email("bia@exemplo.com")) == bia
        assert uow.usuarios.obter_por_email(Email("ninguem@exemplo.com")) is None


def test_usuario_sem_email_nem_senha(uow):
    usuario = salvar_usuario(uow, nome="Padrão", email=None, senha_hash=None)

    with uow:
        obtido = uow.usuarios.obter(usuario.id)

    assert obtido.email is None
    assert obtido.senha_hash is None
    assert obtido.tem_credenciais is False


def test_varios_usuarios_sem_email_convivem(uow):
    salvar_usuario(uow, nome="Um", email=None, senha_hash=None)
    salvar_usuario(uow, nome="Dois", email=None, senha_hash=None)

    with uow:
        total = uow._sessao.scalar(text("SELECT count(*) FROM usuarios"))

    assert total == 2


def test_salvar_atualiza_usuario_existente(uow):
    # Como o comando administrativo que dá e-mail e senha ao usuário padrão herdado.
    with uow:
        uow.usuarios.garantir(Usuario("Usuário", id=ID_USUARIO_PADRAO))
        uow.commit()

    atualizado = Usuario(
        "Ana",
        id=ID_USUARIO_PADRAO,
        email=Email("ana@exemplo.com"),
        senha_hash=SenhaComHash("scrypt$novo"),
    )
    with uow:
        uow.usuarios.salvar(atualizado)
        uow.commit()

    with uow:
        obtido = uow.usuarios.obter(ID_USUARIO_PADRAO)
        total = uow._sessao.scalar(text("SELECT count(*) FROM usuarios"))

    assert total == 1
    assert (obtido.nome, obtido.email, obtido.senha_hash) == (
        "Ana",
        Email("ana@exemplo.com"),
        SenhaComHash("scrypt$novo"),
    )


def test_salvar_o_mesmo_usuario_com_o_mesmo_email_nao_conflita(uow, ana):
    ana.nome = "Ana Maria"
    with uow:
        uow.usuarios.salvar(ana)
        uow.commit()

    with uow:
        assert uow.usuarios.obter(ana.id).nome == "Ana Maria"


def test_email_de_outro_usuario_levanta_email_ja_cadastrado(uow, ana):
    with uow, pytest.raises(EmailJaCadastrado):
        uow.usuarios.salvar(Usuario("Outra", email=Email("ana@exemplo.com")))


def test_atualizar_para_email_de_outro_usuario_levanta(uow, ana, bia):
    bia.email = Email("ana@exemplo.com")

    with uow, pytest.raises(EmailJaCadastrado):
        uow.usuarios.salvar(bia)


def test_corrida_pela_unique_do_email_vira_email_ja_cadastrado(uow, fabrica_de_sessoes, ana):
    # Simula outra transação que gravou o e-mail depois da verificação prévia do repositório.
    sessao = fabrica_de_sessoes()
    try:
        repositorio = RepositorioDeUsuariosSqlAlchemy(sessao)
        repositorio._email_de_outro_usuario = lambda _usuario: False
        with pytest.raises(EmailJaCadastrado) as erro:
            repositorio.salvar(Usuario("Outra", email=Email("ana@exemplo.com")))
        # hide_parameters: a IntegrityError encadeada não traz o e-mail (nem outro valor).
        assert "ana@exemplo.com" not in str(erro.value.__cause__)
    finally:
        sessao.rollback()
        sessao.close()


def test_mensagem_de_email_ja_cadastrado_nao_traz_o_email(uow, ana):
    with uow, pytest.raises(EmailJaCadastrado) as erro:
        uow.usuarios.salvar(Usuario("Outra", email=Email("ana@exemplo.com")))

    assert "ana@exemplo.com" not in str(erro.value)


# --- sessões ---


def test_ida_e_volta_de_sessao_com_fuso_utc(uow, ana):
    sessao = adicionar_sessao(uow, nova_sessao(ana.id))

    with uow:
        obtida = uow.sessoes.obter_por_hash(hash_de("sessao-1"))

    assert obtida == sessao
    assert obtida.usuario_id == ana.id
    assert obtida.criada_em == AGORA
    assert obtida.expira_em == AGORA + timedelta(hours=12)
    assert obtida.expira_em.utcoffset() == timedelta(0)
    assert obtida.revogada is False


def test_sessao_com_outro_fuso_e_gravada_em_utc(uow, ana, fabrica_de_sessoes):
    brasilia = timezone(timedelta(hours=-3))
    criada_em = datetime(2026, 10, 12, 12, 0, tzinfo=brasilia)
    adicionar_sessao(uow, nova_sessao(ana.id, criada_em=criada_em))

    with uow:
        obtida = uow.sessoes.obter_por_hash(hash_de("sessao-1"))
    with fabrica_de_sessoes() as sessao:
        gravado = sessao.scalar(text("SELECT criada_em FROM sessoes"))

    assert obtida.criada_em == AGORA
    assert obtida.criada_em.tzinfo is UTC
    assert gravado.startswith("2026-10-12 15:00:00")


def test_expiracao_lida_do_banco_compara_com_relogio_utc(uow, ana):
    adicionar_sessao(uow, nova_sessao(ana.id, horas=1))

    with uow:
        obtida = uow.sessoes.obter_por_hash(hash_de("sessao-1"))

    assert obtida.esta_ativa(AGORA + timedelta(minutes=59)) is True
    assert obtida.esta_ativa(AGORA + timedelta(hours=1)) is False


def test_instante_sem_fuso_e_recusado_na_gravacao(uow, ana):
    sessao = nova_sessao(ana.id)
    # Contorna a validação da entidade para provar a defesa da camada de persistência.
    sessao.criada_em = datetime(2026, 10, 12, 15, 0)

    with uow, pytest.raises(Exception, match="fuso"):
        uow.sessoes.adicionar(sessao)
        uow._sessao.flush()


def test_obter_sessao_por_hash_inexistente(uow, ana):
    adicionar_sessao(uow, nova_sessao(ana.id))

    with uow:
        assert uow.sessoes.obter_por_hash(hash_de("outro")) is None


def test_revogar_sessao(uow, ana):
    sessao = adicionar_sessao(uow, nova_sessao(ana.id))

    with uow:
        uow.sessoes.revogar(sessao.id)
        uow.commit()

    with uow:
        assert uow.sessoes.obter_por_hash(hash_de("sessao-1")).revogada is True


def test_revogar_sem_commit_nao_persiste(uow, ana):
    sessao = adicionar_sessao(uow, nova_sessao(ana.id))

    with uow:
        uow.sessoes.revogar(sessao.id)

    with uow:
        assert uow.sessoes.obter_por_hash(hash_de("sessao-1")).revogada is False


def test_hash_de_sessao_e_unico(uow, ana, bia):
    adicionar_sessao(uow, nova_sessao(ana.id))

    with uow, pytest.raises(Exception, match="UNIQUE"):
        uow.sessoes.adicionar(nova_sessao(bia.id))
        uow._sessao.flush()


def test_sessao_grava_so_o_hash(uow, ana, fabrica_de_sessoes):
    adicionar_sessao(uow, nova_sessao(ana.id, segredo="gsess_segredo-em-claro"))

    with fabrica_de_sessoes() as sessao:
        linha = sessao.execute(select(SessaoModelo)).scalar_one()

    assert linha.hash_do_segredo == hash_de("gsess_segredo-em-claro")
    assert "segredo-em-claro" not in repr(linha.__dict__)


# --- chaves de API ---


def test_ida_e_volta_de_chave(uow, ana):
    expira_em = AGORA + timedelta(days=30)
    chave = adicionar_chave(
        uow, nova_chave(ana.id, escopo=EscopoDaChave.ESCRITA, expira_em=expira_em)
    )

    with uow:
        obtida = uow.chaves_de_api.obter(ana.id, chave.id)

    assert obtida == chave
    assert (obtida.nome, obtida.prefixo, obtida.escopo) == (
        "Script",
        "Ab12Cd34",
        EscopoDaChave.ESCRITA,
    )
    assert obtida.hash_do_segredo == hash_de("chave-1")
    assert obtida.criada_em == AGORA
    assert obtida.expira_em == expira_em
    assert obtida.expira_em.utcoffset() == timedelta(0)
    assert obtida.ultimo_uso is None
    assert obtida.revogada is False


def test_chave_de_outro_usuario_nao_e_obtida(uow, ana, bia):
    chave = adicionar_chave(uow, nova_chave(ana.id))

    with uow:
        assert uow.chaves_de_api.obter(bia.id, chave.id) is None
        assert uow.chaves_de_api.obter(ana.id, uuid4()) is None


def test_obter_chave_por_hash(uow, ana):
    chave = adicionar_chave(uow, nova_chave(ana.id))

    with uow:
        assert uow.chaves_de_api.obter_por_hash(hash_de("chave-1")) == chave
        assert uow.chaves_de_api.obter_por_hash(hash_de("outra")) is None


def test_listar_chaves_so_do_usuario_nao_revogadas_da_mais_nova(uow, ana, bia):
    antiga = adicionar_chave(uow, nova_chave(ana.id, segredo="a", nome="Antiga"))
    nova = adicionar_chave(
        uow, nova_chave(ana.id, segredo="b", nome="Nova", criada_em=AGORA + timedelta(hours=1))
    )
    revogada = adicionar_chave(uow, nova_chave(ana.id, segredo="c", nome="Revogada"))
    expirada = adicionar_chave(
        uow,
        nova_chave(
            ana.id,
            segredo="d",
            nome="Expirada",
            criada_em=AGORA - timedelta(days=2),
            expira_em=AGORA - timedelta(days=1),
        ),
    )
    adicionar_chave(uow, nova_chave(bia.id, segredo="e", nome="Da Bia"))
    with uow:
        uow.chaves_de_api.revogar(revogada.id)
        uow.commit()

    with uow:
        chaves = uow.chaves_de_api.listar(ana.id)

    assert [c.nome for c in chaves] == ["Nova", "Antiga", "Expirada"]
    assert chaves == [nova, antiga, expirada]


def test_revogar_chave(uow, ana):
    chave = adicionar_chave(uow, nova_chave(ana.id))

    with uow:
        uow.chaves_de_api.revogar(chave.id)
        uow.commit()

    with uow:
        assert uow.chaves_de_api.obter(ana.id, chave.id).revogada is True


def test_registrar_uso_grava_o_instante_em_utc(uow, ana):
    chave = adicionar_chave(uow, nova_chave(ana.id))
    quando = datetime(2026, 10, 12, 13, 30, tzinfo=timezone(timedelta(hours=-3)))

    with uow:
        uow.chaves_de_api.registrar_uso(chave.id, quando)
        uow.commit()

    with uow:
        ultimo_uso = uow.chaves_de_api.obter(ana.id, chave.id).ultimo_uso

    assert ultimo_uso == quando
    assert ultimo_uso.tzinfo is UTC


def test_registrar_uso_nao_volta_para_um_instante_anterior(uow, ana):
    # Duas requisições concorrentes: a que chega por último com o instante mais antigo
    # não pode apagar o uso mais recente.
    chave = adicionar_chave(uow, nova_chave(ana.id))
    mais_recente = AGORA + timedelta(minutes=5)

    with uow:
        uow.chaves_de_api.registrar_uso(chave.id, mais_recente)
        uow.commit()
    with uow:
        uow.chaves_de_api.registrar_uso(chave.id, AGORA)
        uow.commit()

    with uow:
        assert uow.chaves_de_api.obter(ana.id, chave.id).ultimo_uso == mais_recente


def test_hash_de_chave_e_unico(uow, ana):
    adicionar_chave(uow, nova_chave(ana.id))

    with uow, pytest.raises(Exception, match="UNIQUE"):
        uow.chaves_de_api.adicionar(nova_chave(ana.id, nome="Outra"))
        uow._sessao.flush()


@pytest.mark.parametrize(
    ("coluna", "valor", "restricao"),
    [
        ("escopo", "admin", "ck_chaves_de_api_escopo_valido"),
        ("nome", "", "ck_chaves_de_api_nome_valido"),
        ("nome", "x" * 61, "ck_chaves_de_api_nome_valido"),
    ],
)
def test_checks_da_tabela_de_chaves(uow, ana, fabrica_de_sessoes, coluna, valor, restricao):
    # A entidade já valida nome e escopo; o CHECK protege contra gravações por fora dela.
    adicionar_chave(uow, nova_chave(ana.id))

    with fabrica_de_sessoes() as sessao, pytest.raises(Exception, match=restricao):
        sessao.execute(text(f"UPDATE chaves_de_api SET {coluna} = :valor"), {"valor": valor})


def test_chave_grava_so_o_hash(uow, ana, fabrica_de_sessoes):
    adicionar_chave(uow, nova_chave(ana.id, segredo="gapi_Ab12Cd34_segredo-em-claro"))

    with fabrica_de_sessoes() as sessao:
        linha = sessao.execute(select(ChaveDeApiModelo)).scalar_one()

    assert linha.hash_do_segredo == hash_de("gapi_Ab12Cd34_segredo-em-claro")
    assert "segredo-em-claro" not in repr(linha.__dict__)


def test_chave_e_sessao_de_usuario_inexistente_violam_a_chave_estrangeira(uow):
    with uow, pytest.raises(Exception, match="FOREIGN KEY"):
        uow.sessoes.adicionar(nova_sessao(uuid4()))
        uow._sessao.flush()


def test_usuario_modelo_tem_email_e_senha(uow, ana, fabrica_de_sessoes):
    with fabrica_de_sessoes() as sessao:
        modelo = sessao.get(UsuarioModelo, ana.id)

    assert modelo.email == "ana@exemplo.com"
    assert modelo.senha_hash == "scrypt$hash"
