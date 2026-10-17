"""Art. IV.3: senha, token de sessão e segredo de chave nunca aparecem em logs nem em erros."""

import logging
from typing import Annotated

from fastapi import Depends
from fastapi.testclient import TestClient

from gastoba.api.app import criar_app
from gastoba.api.dependencias import Credencial, obter_usuario_atual
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.persistencia.banco import criar_engine
from gastoba.infrastructure.persistencia.modelos import Base
from gastoba.infrastructure.seguranca.hasher_de_senha_scrypt import HasherDeSenhaScrypt

SENHA = "senha-muito-secreta-1"
EMAIL = "ana@x.com"


def _falhar_depois_de_autenticar(
    _usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
) -> dict[str, str]:
    raise RuntimeError("falha inesperada")


def test_fluxo_completo_e_erro_500_nao_registram_segredos(configuracoes_teste, caplog):
    configuracoes = configuracoes_teste.model_copy(update={"cadastro_aberto": True})
    engine = criar_engine(configuracoes.url_banco)
    Base.metadata.create_all(engine)
    engine.dispose()
    app = criar_app(configuracoes)
    app.state.hasher_de_senha = HasherDeSenhaScrypt(n=2, r=1, p=1)
    app.add_api_route("/teste/erro-autenticado", _falhar_depois_de_autenticar)
    caplog.set_level(logging.DEBUG)

    with TestClient(app, base_url="http://localhost", raise_server_exceptions=False) as cliente:
        respostas = [
            cliente.post("/auth/cadastro", json={"nome": "Ana", "email": EMAIL, "senha": SENHA}),
            cliente.post("/auth/cadastro", json={"nome": "Ana", "email": EMAIL, "senha": SENHA}),
            cliente.post("/auth/entrar", json={"email": EMAIL, "senha": "senha-errada-123"}),
        ]
        login = cliente.post("/auth/entrar", json={"email": EMAIL, "senha": SENHA})
        token = login.json()["token"]
        cliente.cookies.clear()
        sessao = {"Authorization": f"Bearer {token}"}
        criada = cliente.post(
            "/chaves-de-api", json={"nome": "script", "escopo": "leitura"}, headers=sessao
        )
        segredo = criada.json()["segredo"]
        chave = {"Authorization": f"Bearer {segredo}"}
        respostas += [
            cliente.get("/contas", headers=chave),
            cliente.post("/contas", json={"nome": "X"}, headers=chave),
            cliente.get("/chaves-de-api", headers=chave),
            cliente.get("/teste/erro-autenticado", headers=sessao),
            cliente.get("/teste/erro-autenticado", headers=chave),
            cliente.post("/auth/sair", headers=sessao),
            cliente.post("/auth/sair", headers=sessao),
        ]

    assert respostas[-4].status_code == 500
    assert respostas[-4].json() == {"erro": {"codigo": "erro_interno", "mensagem": "Erro interno."}}
    for resposta in respostas:
        for texto in (SENHA, token, segredo, "senha-errada-123"):
            assert texto not in resposta.text
    aleatorio_do_token = token.removeprefix("gsess_")
    aleatorio_do_segredo = segredo.split("_", 2)[2]
    for texto in (SENHA, "senha-errada-123", aleatorio_do_token, aleatorio_do_segredo):
        assert texto not in caplog.text


def test_repr_da_credencial_nao_mostra_o_token():
    # Um traceback com variáveis locais ou um log de depuração mostraria o repr.
    credencial = Credencial("gsess_segredo-que-nao-pode-vazar", por_cookie=True)

    assert "segredo-que-nao-pode-vazar" not in repr(credencial)
    assert "segredo-que-nao-pode-vazar" not in str(credencial)
