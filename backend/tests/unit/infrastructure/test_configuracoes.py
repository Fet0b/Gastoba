from pathlib import Path

import pytest
from pydantic import ValidationError

from gastoba.infrastructure.configuracoes import Configuracoes

VARIAVEIS = (
    "GASTOBA_CADASTRO_ABERTO",
    "GASTOBA_DURACAO_DA_SESSAO_HORAS",
    "GASTOBA_COOKIE_SEGURO",
    "GASTOBA_TENTATIVAS_DE_LOGIN",
)


@pytest.fixture
def sem_ambiente(monkeypatch, tmp_path):
    # Diretório sem .env e sem as variáveis: só os padrões do código valem.
    monkeypatch.chdir(tmp_path)
    for variavel in VARIAVEIS:
        monkeypatch.delenv(variavel, raising=False)


def test_padroes_da_autenticacao(sem_ambiente):
    configuracoes = Configuracoes()

    assert configuracoes.cadastro_aberto is False
    assert configuracoes.duracao_da_sessao_horas == 12
    assert configuracoes.cookie_seguro is True
    assert configuracoes.tentativas_de_login == 5


def test_valores_lidos_do_ambiente(sem_ambiente, monkeypatch):
    monkeypatch.setenv("GASTOBA_CADASTRO_ABERTO", "true")
    monkeypatch.setenv("GASTOBA_DURACAO_DA_SESSAO_HORAS", "8")
    monkeypatch.setenv("GASTOBA_COOKIE_SEGURO", "false")
    monkeypatch.setenv("GASTOBA_TENTATIVAS_DE_LOGIN", "3")

    configuracoes = Configuracoes()

    assert configuracoes.cadastro_aberto is True
    assert configuracoes.duracao_da_sessao_horas == 8
    assert configuracoes.cookie_seguro is False
    assert configuracoes.tentativas_de_login == 3


@pytest.mark.parametrize("horas", [0, -1])
def test_duracao_da_sessao_precisa_ser_positiva(sem_ambiente, horas):
    with pytest.raises(ValidationError):
        Configuracoes(duracao_da_sessao_horas=horas)


@pytest.mark.parametrize("tentativas", [0, -1])
def test_tentativas_de_login_precisam_ser_positivas(sem_ambiente, tentativas):
    with pytest.raises(ValidationError):
        Configuracoes(tentativas_de_login=tentativas)


def test_env_example_documenta_as_variaveis_novas():
    exemplo = (Path(__file__).resolve().parents[3] / ".env.example").read_text(encoding="utf-8")

    for variavel in VARIAVEIS:
        assert f"{variavel}=" in exemplo


def test_credenciais_e_itens_da_pluggy_perdem_espacos_e_quebras_de_linha(sem_ambiente, monkeypatch):
    # Segredo colado com uma quebra de linha no fim (ou item com espaço) faria a Pluggy recusar a
    # credencial ou não achar o item, sem nenhum erro de configuração que explicasse a falha.
    monkeypatch.setenv("GASTOBA_PLUGGY_CLIENT_ID", "meu-id\n")
    monkeypatch.setenv("GASTOBA_PLUGGY_CLIENT_SECRET", " meu-segredo \n")
    monkeypatch.setenv("GASTOBA_PLUGGY_ITEM_IDS", '[" item-1\\n", "", "item-2 "]')
    monkeypatch.setenv("GASTOBA_PLUGGY_EMAIL_DO_DONO", " dona@exemplo.com\n")

    configuracoes = Configuracoes()

    assert configuracoes.pluggy_client_id == "meu-id"
    assert configuracoes.pluggy_client_secret.get_secret_value() == "meu-segredo"
    assert configuracoes.pluggy_item_ids == ["item-1", "item-2"]
    assert configuracoes.pluggy_email_do_dono == "dona@exemplo.com"


def test_credencial_da_pluggy_so_com_espacos_conta_como_ausente(sem_ambiente, monkeypatch):
    monkeypatch.setenv("GASTOBA_PLUGGY_CLIENT_ID", "meu-id")
    monkeypatch.setenv("GASTOBA_PLUGGY_CLIENT_SECRET", "  \n")
    monkeypatch.setenv("GASTOBA_PLUGGY_ITEM_IDS", '["item-1"]')
    monkeypatch.setenv("GASTOBA_PLUGGY_EMAIL_DO_DONO", "dona@exemplo.com")

    assert Configuracoes().importacao_ativa is False
