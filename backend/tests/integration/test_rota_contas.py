from uuid import UUID, uuid4

import pytest

from gastoba.api import dependencias
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy


def _criar_conta(cliente_autenticado, **corpo):
    return cliente_autenticado.post("/contas", json=corpo)


def _confere_formato_de_erro(resposta, codigo: str) -> None:
    corpo = resposta.json()
    assert "detail" not in corpo
    assert set(corpo) == {"erro"}
    assert corpo["erro"]["codigo"] == codigo
    assert isinstance(corpo["erro"]["mensagem"], str)
    assert corpo["erro"]["mensagem"]


def test_criar_conta_devolve_201_com_saldo_em_texto(cliente_autenticado):
    resposta = _criar_conta(cliente_autenticado, nome="Nubank", saldo_inicial="100.00")

    assert resposta.status_code == 201
    corpo = resposta.json()
    assert corpo["nome"] == "Nubank"
    assert corpo["saldo"] == "100.00"
    assert corpo["origem"] == "manual"
    assert corpo["tipo"] == "corrente"
    UUID(corpo["id"])


def test_saldo_inicial_omitido_vale_zero(cliente_autenticado):
    resposta = _criar_conta(cliente_autenticado, nome="Carteira")

    assert resposta.status_code == 201
    assert resposta.json()["saldo"] == "0.00"


def test_saldo_inicial_negativo_e_aceito(cliente_autenticado):
    resposta = _criar_conta(cliente_autenticado, nome="Cheque especial", saldo_inicial="-50.00")

    assert resposta.status_code == 201
    assert resposta.json()["saldo"] == "-50.00"


def test_nome_duplicado_devolve_409(cliente_autenticado):
    _criar_conta(cliente_autenticado, nome="Nubank")

    resposta = _criar_conta(cliente_autenticado, nome="Nubank")

    assert resposta.status_code == 409
    _confere_formato_de_erro(resposta, "conta_ja_existe")


def test_nome_vazio_devolve_422_nome_invalido(cliente_autenticado):
    resposta = _criar_conta(cliente_autenticado, nome="  ")

    assert resposta.status_code == 422
    _confere_formato_de_erro(resposta, "nome_invalido")


def test_saldo_inicial_numerico_devolve_422_requisicao_invalida(cliente_autenticado):
    resposta = _criar_conta(cliente_autenticado, nome="Nubank", saldo_inicial=100)

    assert resposta.status_code == 422
    _confere_formato_de_erro(resposta, "requisicao_invalida")


def test_saldo_inicial_com_virgula_devolve_422_valor_invalido(cliente_autenticado):
    resposta = _criar_conta(cliente_autenticado, nome="Nubank", saldo_inicial="10,00")

    assert resposta.status_code == 422
    _confere_formato_de_erro(resposta, "valor_invalido")


def test_corpo_sem_nome_devolve_422_requisicao_invalida(cliente_autenticado):
    resposta = _criar_conta(cliente_autenticado, saldo_inicial="10.00")

    assert resposta.status_code == 422
    corpo = resposta.json()
    assert "detail" not in corpo
    assert corpo["erro"]["codigo"] == "requisicao_invalida"
    assert corpo["erro"]["detalhes"]
    for detalhe in corpo["erro"]["detalhes"]:
        assert set(detalhe) == {"campo", "mensagem"}
    assert any(d["campo"] == "body.nome" for d in corpo["erro"]["detalhes"])


def test_campo_extra_e_ignorado(cliente_autenticado):
    resposta = _criar_conta(
        cliente_autenticado, nome="Nubank", saldo_inicial="1.00", apelido="roxinho"
    )

    assert resposta.status_code == 201
    # o apelido do corpo é ignorado: só a rota própria o define
    assert resposta.json()["apelido"] is None


def test_usuario_atual_e_caso_de_uso_recebem_unidades_de_trabalho_distintas(
    cliente_autenticado, monkeypatch
):
    criadas = []

    class UnidadeDeTrabalhoRegistrada(UnidadeDeTrabalhoSqlAlchemy):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            criadas.append(self)

    monkeypatch.setattr(dependencias, "UnidadeDeTrabalhoSqlAlchemy", UnidadeDeTrabalhoRegistrada)

    assert _criar_conta(cliente_autenticado, nome="Nubank").status_code == 201

    assert len(criadas) == 2
    assert criadas[0] is not criadas[1]


def test_listar_contas_vazio(cliente_autenticado):
    resposta = cliente_autenticado.get("/contas")

    assert resposta.status_code == 200
    assert resposta.json() == []


def test_listar_contas_ordena_por_nome(cliente_autenticado):
    for nome in ["B", "A"]:
        assert _criar_conta(cliente_autenticado, nome=nome, saldo_inicial="5.00").status_code == 201

    resposta = cliente_autenticado.get("/contas")

    assert resposta.status_code == 200
    contas = resposta.json()
    assert [conta["nome"] for conta in contas] == ["A", "B"]
    assert all(conta["saldo"] == "5.00" for conta in contas)
    assert all(conta["tipo"] == "corrente" for conta in contas)


def test_excluir_conta_apaga_a_conta_com_gastos_e_ganhos(cliente_autenticado):
    conta = _criar_conta(cliente_autenticado, nome="Carteira", saldo_inicial="50.00").json()
    outra = _criar_conta(cliente_autenticado, nome="Banco", saldo_inicial="10.00").json()
    gasto = cliente_autenticado.post(
        "/gastos",
        json={
            "conta_id": conta["id"],
            "valor": "5.00",
            "descricao": "Pão",
            "data": "2026-10-10",
            "categoria": "conforto",
            "tags": [],
        },
    )
    assert gasto.status_code == 201, gasto.text

    resposta = cliente_autenticado.delete(f"/contas/{conta['id']}")

    assert resposta.status_code == 204
    assert [c["id"] for c in cliente_autenticado.get("/contas").json()] == [outra["id"]]
    gastos = cliente_autenticado.get(
        "/gastos", params={"inicio": "2026-10-01", "fim": "2026-10-31"}
    )
    assert gastos.json() == []


def test_excluir_conta_inexistente_devolve_404(cliente_autenticado):
    resposta = cliente_autenticado.delete("/contas/00000000-0000-4000-8000-000000000000")

    assert resposta.status_code == 404
    _confere_formato_de_erro(resposta, "conta_nao_encontrada")


# --- 068: apelido, nome no banco e final do número ---


def _erro(resposta, status, codigo):
    assert resposta.status_code == status
    _confere_formato_de_erro(resposta, codigo)


def _id(cliente, headers, nome):
    return cliente.post("/contas", json={"nome": nome}, headers=headers).json()["id"]


def _com_cabecalhos(autenticar):
    return autenticar(email="ana@x.com", nome="Ana"), autenticar(email="bia@x.com", nome="Bia")


def test_conta_traz_os_campos_novos_e_o_rotulo(cliente, autenticar):
    ana, _ = _com_cabecalhos(autenticar)

    corpo = cliente.post("/contas", json={"nome": "Carteira"}, headers=ana).json()

    assert corpo["apelido"] is None
    assert corpo["nome_no_banco"] is None
    assert corpo["final_do_numero"] is None
    assert corpo["rotulo"] == "Carteira"


def test_define_troca_e_remove_o_apelido(cliente, autenticar):
    ana, _ = _com_cabecalhos(autenticar)
    conta_id = _id(cliente, ana, "Carteira")

    resposta = cliente.put(f"/contas/{conta_id}/apelido", json={"apelido": "  Casa "}, headers=ana)
    assert resposta.status_code == 200
    assert (resposta.json()["apelido"], resposta.json()["rotulo"]) == ("Casa", "Casa")
    assert resposta.json()["nome"] == "Carteira"
    assert cliente.get("/contas", headers=ana).json()[0]["rotulo"] == "Casa"

    assert (
        cliente.put(f"/contas/{conta_id}/apelido", json={"apelido": "Viagem"}, headers=ana).json()[
            "apelido"
        ]
        == "Viagem"
    )
    for _ in range(2):
        apagada = cliente.delete(f"/contas/{conta_id}/apelido", headers=ana)
        assert apagada.status_code == 204
        assert apagada.content == b""
    assert cliente.get("/contas", headers=ana).json()[0]["rotulo"] == "Carteira"


@pytest.mark.parametrize("apelido", ["", "   ", "x" * 41])
def test_apelido_invalido_devolve_422(cliente, autenticar, apelido):
    ana, _ = _com_cabecalhos(autenticar)
    conta_id = _id(cliente, ana, "Carteira")

    resposta = cliente.put(f"/contas/{conta_id}/apelido", json={"apelido": apelido}, headers=ana)

    _erro(resposta, 422, "apelido_invalido")
    assert cliente.get("/contas", headers=ana).json()[0]["apelido"] is None


@pytest.mark.parametrize("corpo", [{}, {"apelido": 5}, {"apelido": None}])
def test_apelido_de_tipo_errado_devolve_requisicao_invalida(cliente, autenticar, corpo):
    ana, _ = _com_cabecalhos(autenticar)
    conta_id = _id(cliente, ana, "Carteira")

    _erro(
        cliente.put(f"/contas/{conta_id}/apelido", json=corpo, headers=ana),
        422,
        "requisicao_invalida",
    )


def test_apelido_repetido_devolve_409_mas_outra_pessoa_pode_usar(cliente, autenticar):
    ana, bia = _com_cabecalhos(autenticar)
    a1, a2 = _id(cliente, ana, "A"), _id(cliente, ana, "B")
    b1 = _id(cliente, bia, "C")
    assert (
        cliente.put(f"/contas/{a1}/apelido", json={"apelido": "Casa"}, headers=ana).status_code
        == 200
    )

    _erro(
        cliente.put(f"/contas/{a2}/apelido", json={"apelido": "Casa"}, headers=ana),
        409,
        "apelido_ja_existe",
    )
    assert (
        cliente.put(f"/contas/{b1}/apelido", json={"apelido": "Casa"}, headers=bia).status_code
        == 200
    )


def test_conta_de_outra_pessoa_ou_inexistente_e_404_e_nada_vaza(cliente, autenticar):
    ana, bia = _com_cabecalhos(autenticar)
    conta_id = _id(cliente, ana, "Carteira")
    cliente.put(f"/contas/{conta_id}/apelido", json={"apelido": "Casa"}, headers=ana)

    _erro(
        cliente.put(f"/contas/{conta_id}/apelido", json={"apelido": "Minha"}, headers=bia),
        404,
        "conta_nao_encontrada",
    )
    _erro(cliente.delete(f"/contas/{conta_id}/apelido", headers=bia), 404, "conta_nao_encontrada")
    _erro(
        cliente.put(f"/contas/{uuid4()}/apelido", json={"apelido": "X"}, headers=ana),
        404,
        "conta_nao_encontrada",
    )
    assert cliente.get("/contas", headers=bia).json() == []
    assert cliente.get("/contas", headers=ana).json()[0]["apelido"] == "Casa"


def test_listagem_segue_o_rotulo(cliente, autenticar):
    ana, _ = _com_cabecalhos(autenticar)
    _id(cliente, ana, "Beta")
    zeta = _id(cliente, ana, "Zeta")
    cliente.put(f"/contas/{zeta}/apelido", json={"apelido": "alfa"}, headers=ana)

    assert [c["rotulo"] for c in cliente.get("/contas", headers=ana).json()] == ["alfa", "Beta"]


def test_chave_de_api_respeita_o_escopo_no_apelido(cliente, autenticar):
    ana, _ = _com_cabecalhos(autenticar)
    conta_id = _id(cliente, ana, "Carteira")
    for escopo in ["leitura", "escrita"]:
        segredo = cliente.post(
            "/chaves-de-api", json={"nome": f"Chave {escopo}", "escopo": escopo}, headers=ana
        ).json()["segredo"]
        chave = {"Authorization": f"Bearer {segredo}"}
        definir = cliente.put(
            f"/contas/{conta_id}/apelido", json={"apelido": "Casa"}, headers=chave
        )
        remover = cliente.delete(f"/contas/{conta_id}/apelido", headers=chave)
        if escopo == "leitura":
            _erro(definir, 403, "acesso_negado")
            _erro(remover, 403, "acesso_negado")
        else:
            assert definir.status_code == 200
            assert remover.status_code == 204


def test_cookie_exige_o_cabecalho_anti_csrf_no_apelido(cliente, autenticar):
    ana, _ = _com_cabecalhos(autenticar)
    conta_id = _id(cliente, ana, "Carteira")
    cookie = {"Cookie": "gastoba_sessao=" + ana["Authorization"].removeprefix("Bearer ")}

    _erro(
        cliente.put(f"/contas/{conta_id}/apelido", json={"apelido": "Casa"}, headers=cookie),
        403,
        "requisicao_invalida_origem",
    )
    _erro(
        cliente.delete(f"/contas/{conta_id}/apelido", headers=cookie),
        403,
        "requisicao_invalida_origem",
    )
    com = {**cookie, "X-Gastoba-Requisicao": "1"}
    assert (
        cliente.put(
            f"/contas/{conta_id}/apelido", json={"apelido": "Casa"}, headers=com
        ).status_code
        == 200
    )
