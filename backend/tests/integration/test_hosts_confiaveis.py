import pytest


@pytest.mark.parametrize("host", ["localhost", "localhost:8000", "127.0.0.1", "127.0.0.1:8000"])
def test_host_permitido_e_atendido(cliente, host):
    resposta = cliente.get("/health", headers={"Host": host})

    assert resposta.status_code == 200


@pytest.mark.parametrize("host", ["evil.example", "evil.example:8000", "localhost.evil.example"])
def test_host_desconhecido_e_recusado(cliente, host):
    resposta = cliente.get("/health", headers={"Host": host})

    assert resposta.status_code == 400


def test_host_recusado_nas_rotas_de_negocio(cliente):
    resposta = cliente.get("/contas", headers={"Host": "evil.example"})

    assert resposta.status_code == 400
