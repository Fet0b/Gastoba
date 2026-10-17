from uuid import UUID

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
    assert "apelido" not in resposta.json()


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
