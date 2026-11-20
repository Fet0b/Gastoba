"""Da configuração lida do ambiente até o adaptador, contra um transporte simulado (sem rede)."""

import json

import httpx
import pytest

from gastoba.domain.excecoes import ProvedorIndisponivel
from gastoba.infrastructure.configuracoes import Configuracoes
from gastoba.infrastructure.pluggy.provedor_pluggy import ProvedorPluggy

ID_DO_CLIENTE = "id-sintetico"
SEGREDO_DO_CLIENTE = "segredo-sintetico"
ID_DO_ITEM = "item-sintetico"


def pluggy_estrita(pedido: httpx.Request) -> httpx.Response:
    """Só aceita credenciais e item exatos, como a Pluggy: sem aparar nada."""
    if pedido.url.path == "/auth":
        credenciais = {"clientId": ID_DO_CLIENTE, "clientSecret": SEGREDO_DO_CLIENTE}
        if json.loads(pedido.read()) == credenciais:
            return httpx.Response(200, json={"apiKey": "chave"})
        return httpx.Response(403, json={})
    if pedido.url.params.get("itemId") != ID_DO_ITEM:
        return httpx.Response(404, json={})
    conta = {"id": "c1", "name": "Conta", "type": "BANK", "currencyCode": "BRL", "balance": 10}
    return httpx.Response(200, json={"results": [conta]})


@pytest.fixture
def ambiente(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    for chave in ("ID", "SECRET", "ITEM_IDS", "EMAIL_DO_DONO"):
        monkeypatch.delenv(f"GASTOBA_PLUGGY_{chave}", raising=False)
    monkeypatch.setenv("GASTOBA_PLUGGY_EMAIL_DO_DONO", "dona@exemplo.com")
    return monkeypatch


def provedor_da_configuracao(configuracoes: Configuracoes) -> ProvedorPluggy:
    # Mesma montagem de `criar_app`.
    return ProvedorPluggy(
        configuracoes.pluggy_client_id or "",
        configuracoes.pluggy_client_secret.get_secret_value()
        if configuracoes.pluggy_client_secret
        else "",
        cliente=httpx.Client(transport=httpx.MockTransport(pluggy_estrita)),
    )


def test_valores_colados_com_quebra_de_linha_e_espaco_ainda_sincronizam(ambiente):
    ambiente.setenv("GASTOBA_PLUGGY_CLIENT_ID", ID_DO_CLIENTE + "\n")
    ambiente.setenv("GASTOBA_PLUGGY_CLIENT_SECRET", " " + SEGREDO_DO_CLIENTE + "\n")
    ambiente.setenv("GASTOBA_PLUGGY_ITEM_IDS", f'[" {ID_DO_ITEM}\\n"]')
    configuracoes = Configuracoes()

    contas = provedor_da_configuracao(configuracoes).listar_contas(configuracoes.pluggy_item_ids[0])

    assert [conta.id_externo for conta in contas] == ["c1"]


def test_valores_sem_espacos_seguem_iguais(ambiente):
    ambiente.setenv("GASTOBA_PLUGGY_CLIENT_ID", ID_DO_CLIENTE)
    ambiente.setenv("GASTOBA_PLUGGY_CLIENT_SECRET", SEGREDO_DO_CLIENTE)
    ambiente.setenv("GASTOBA_PLUGGY_ITEM_IDS", f'["{ID_DO_ITEM}"]')
    configuracoes = Configuracoes()

    assert configuracoes.pluggy_item_ids == [ID_DO_ITEM]
    assert provedor_da_configuracao(configuracoes).listar_contas(ID_DO_ITEM)


def test_controle_credencial_realmente_errada_continua_falhando(ambiente):
    ambiente.setenv("GASTOBA_PLUGGY_CLIENT_ID", "outro-id")
    ambiente.setenv("GASTOBA_PLUGGY_CLIENT_SECRET", SEGREDO_DO_CLIENTE)
    ambiente.setenv("GASTOBA_PLUGGY_ITEM_IDS", f'["{ID_DO_ITEM}"]')
    configuracoes = Configuracoes()

    with pytest.raises(ProvedorIndisponivel) as erro:
        provedor_da_configuracao(configuracoes).listar_contas(ID_DO_ITEM)
    assert erro.value.motivo == "autenticacao http 403"
