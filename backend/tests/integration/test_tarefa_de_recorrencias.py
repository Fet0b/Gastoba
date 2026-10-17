import time
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi.testclient import TestClient
from pydantic import SecretStr

from gastoba.api.app import criar_app
from gastoba.domain.conta import Conta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.recorrencia import Recorrencia, TipoDeRecorrencia
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy


def _semear_recorrencia_pendente(cliente, usuario_id: UUID):
    """Uma recorrência no banco que nunca gerou nada (como após o servidor ficar parado)."""
    uow = UnidadeDeTrabalhoSqlAlchemy(cliente.app.state.fabrica_de_sessoes)
    conta = Conta(usuario_id=usuario_id, nome="Nubank", saldo=Dinheiro(0))
    inicio = (datetime.now(UTC) - timedelta(days=40)).date()
    with uow:
        uow.contas.adicionar(conta)
        uow.recorrencias.adicionar(
            Recorrencia(
                usuario_id=usuario_id,
                tipo=TipoDeRecorrencia.GANHO,
                conta_id=conta.id,
                valor=Dinheiro(100000),
                descricao="Salário",
                dia_do_mes=1,
                inicio=inicio,
            )
        )
        uow.commit()
    return inicio


def test_a_tarefa_de_fundo_gera_ao_subir_o_que_estava_pendente(
    cliente_autenticado, configuracoes_teste
):
    usuario_id = UUID(cliente_autenticado.get("/auth/eu").json()["id"])
    inicio = _semear_recorrencia_pendente(cliente_autenticado, usuario_id)
    cabecalho = {"Authorization": cliente_autenticado.headers["Authorization"]}
    periodo = {"inicio": inicio.isoformat(), "fim": "2999-12-31"}
    assert cliente_autenticado.get("/ganhos", params=periodo).json() == []

    # Outra instância da API sobre o mesmo banco, agora com a tarefa ligada.
    ligada = configuracoes_teste.model_copy(update={"intervalo_de_recorrencias_minutos": 1})
    with TestClient(criar_app(ligada), base_url="http://localhost") as segundo:
        ganhos = []
        for _ in range(50):
            ganhos = segundo.get("/ganhos", params=periodo, headers=cabecalho).json()
            if ganhos:
                break
            time.sleep(0.1)

    # O dia 1º dos últimos ~40 dias: o do mês atual e, em geral, o do anterior; sempre ao menos um.
    assert len(ganhos) >= 1
    assert all(g["descricao"] == "Salário" and g["data"].endswith("-01") for g in ganhos)


def test_com_o_intervalo_zero_a_tarefa_nao_roda(cliente_autenticado):
    usuario_id = UUID(cliente_autenticado.get("/auth/eu").json()["id"])
    inicio = _semear_recorrencia_pendente(cliente_autenticado, usuario_id)

    time.sleep(0.3)

    periodo = {"inicio": inicio.isoformat(), "fim": "2999-12-31"}
    assert cliente_autenticado.get("/ganhos", params=periodo).json() == []


def test_a_sincronizacao_bancaria_so_roda_ao_subir_com_a_importacao_ligada(
    cliente, autenticar, configuracoes_teste
):
    chamadas = []

    class ProvedorContador:
        def listar_contas(self, id_do_item):
            chamadas.append(id_do_item)
            return []

        def listar_transacoes(self, id_da_conta, desde):
            return []

    ligada = configuracoes_teste.model_copy(
        update={
            "pluggy_client_id": "id",
            "pluggy_client_secret": SecretStr("segredo"),
            "pluggy_item_ids": ["item-1"],
            "pluggy_email_do_dono": "dono@x.com",
            "pluggy_intervalo_horas": 1,
        }
    )
    # O banco já existe (fixture `cliente`) e a dona já está cadastrada quando a segunda API sobe.
    autenticar(email="dono@x.com", nome="Dono")
    app = criar_app(ligada)
    app.state.provedor_open_finance = ProvedorContador()
    with TestClient(app, base_url="http://localhost"):
        for _ in range(50):
            if chamadas:
                break
            time.sleep(0.1)

    assert chamadas == ["item-1"]


def test_sem_as_credenciais_a_importacao_nao_cria_provedor_nem_tarefa(configuracoes_teste):
    app = criar_app(configuracoes_teste.model_copy(update={"pluggy_intervalo_horas": 1}))

    assert app.state.provedor_open_finance is None
    assert app.state.configuracoes.importacao_ativa is False
