"""Rotas de faturas do cartão (somente leitura), com banco SQLite temporário."""

from datetime import date
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from gastoba.api.app import criar_app
from gastoba.domain.conta import Conta, OrigemDaConta, TipoDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.fatura import Fatura, FonteDaFatura, PagamentoDeFatura
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    SentidoDaTransacao,
    TransacaoImportada,
)
from gastoba.infrastructure.persistencia.banco import criar_engine
from gastoba.infrastructure.persistencia.modelos import Base
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy
from gastoba.infrastructure.seguranca.hasher_de_senha_scrypt import HasherDeSenhaScrypt

DONO = "dono@x.com"
HOJE = "2026-11-05"


@pytest.fixture
def cliente_da_importacao(configuracoes_teste):
    configuracoes = configuracoes_teste.model_copy(
        update={
            "pluggy_client_id": "id",
            "pluggy_client_secret": SecretStr("segredo"),
            "pluggy_item_ids": ["item-1"],
            "pluggy_email_do_dono": DONO,
            "pluggy_intervalo_horas": 0,
        }
    )
    engine = criar_engine(configuracoes.url_banco)
    Base.metadata.create_all(engine)
    engine.dispose()
    app = criar_app(configuracoes)
    app.state.hasher_de_senha = HasherDeSenhaScrypt(n=2, r=1, p=1)
    with TestClient(app, base_url="http://localhost") as cliente:
        yield cliente


@pytest.fixture
def dono(cliente_da_importacao, autenticar_em):
    return autenticar_em(cliente_da_importacao, email=DONO, nome="Dono")


def _usuario_id(cliente, quem) -> UUID:
    return UUID(cliente.get("/auth/eu", headers=quem).json()["id"])


def _semear(cliente, usuario_id, nome="FREE VISA", saldo=-12218):
    """Um cartão com a fatura aberta (duas compras) e uma anterior paga. Devolve os ids."""
    uow = UnidadeDeTrabalhoSqlAlchemy(cliente.app.state.fabrica_de_sessoes)
    conta = Conta(
        usuario_id=usuario_id,
        nome=nome,
        saldo=Dinheiro(saldo),
        origem=OrigemDaConta.OPEN_FINANCE,
        id_externo=f"ext-{nome}",
        tipo=TipoDaConta.CARTAO,
    )
    aberta = _fatura(conta, date(2026, 10, 16), date(2026, 11, 15), "122.18")
    paga = _fatura(
        conta,
        date(2026, 9, 16),
        date(2026, 10, 15),
        "50.00",
        [PagamentoDeFatura(date(2026, 10, 20), Dinheiro.de_reais("50.00"), None)],
    )
    compras = [
        _compra(conta, "t1", "Anthropic", 11805),
        _compra(conta, "t2", "Padaria", 413, estado=EstadoDaTransacaoImportada.ACEITA),
        _compra(conta, "t3", "Estorno", 100, sentido=SentidoDaTransacao.ENTRADA),
    ]
    with uow:
        uow.contas.adicionar(conta)
        uow.faturas.salvar(conta.id, aberta)
        uow.faturas.salvar(conta.id, paga)
        for compra in compras:
            uow.transacoes_importadas.adicionar_se_nova(compra)
            uow.faturas.vincular_compra(compra.id, aberta.id)
        uow.commit()
    return conta.id, aberta.id, paga.id, compras


def _fatura(conta, inicio, fechamento, total, pagamentos=()):
    return Fatura(
        id=uuid4(),
        conta_id=conta.id,
        id_externo=None,
        inicio=inicio,
        fechamento=fechamento,
        vencimento=date(fechamento.year, fechamento.month, 22),
        total=Dinheiro.de_reais(total),
        minimo=None,
        pagamentos=tuple(pagamentos),
        fonte=FonteDaFatura.ESTIMADA,
    )


def _compra(conta, id_externo, descricao, centavos, sentido=SentidoDaTransacao.SAIDA, estado=None):
    return TransacaoImportada(
        conta_id=conta.id,
        id_externo=id_externo,
        data=date(2026, 10, 20),
        descricao=descricao,
        valor=Dinheiro(centavos),
        sentido=sentido,
        estado=estado or EstadoDaTransacaoImportada.PENDENTE,
        parcela_numero=2 if id_externo == "t1" else None,
        parcela_total=10 if id_externo == "t1" else None,
    )


def test_lista_cartoes_com_a_fatura_aberta(cliente_da_importacao, dono):
    conta_id, aberta_id, paga_id, _ = _semear(
        cliente_da_importacao, _usuario_id(cliente_da_importacao, dono)
    )

    resposta = cliente_da_importacao.get("/faturas", params={"hoje": HOJE}, headers=dono)

    assert resposta.status_code == 200
    (cartao,) = resposta.json()["cartoes"]
    assert cartao["conta_id"] == str(conta_id)
    assert cartao["conta_nome"] == "FREE VISA"
    assert cartao["valor_devido"] == "122.18"
    assert [f["id"] for f in cartao["faturas"]] == [str(aberta_id), str(paga_id)]
    aberta = cartao["faturas"][0]
    assert aberta == {
        "id": str(aberta_id),
        "inicio": "2026-10-16",
        "fechamento": "2026-11-15",
        "vencimento": "2026-11-22",
        "total": "122.18",
        "pago": "0.00",
        "restante": "122.18",
        "a_favor": "0.00",
        "minimo": None,
        "situacao": "aberta",
        "fonte": "estimada",
        "quantidade_de_compras": 3,
    }
    assert cartao["faturas"][1]["situacao"] == "paga"
    assert cartao["faturas"][1]["pago"] == "50.00"


def test_situacao_depende_do_hoje_enviado(cliente_da_importacao, dono):
    _semear(cliente_da_importacao, _usuario_id(cliente_da_importacao, dono))
    resposta = cliente_da_importacao.get("/faturas", params={"hoje": "2026-11-30"}, headers=dono)
    assert resposta.json()["cartoes"][0]["faturas"][0]["situacao"] == "vencida"


def test_filtra_por_conta(cliente_da_importacao, dono):
    usuario = _usuario_id(cliente_da_importacao, dono)
    conta_id, *_ = _semear(cliente_da_importacao, usuario)
    _semear(cliente_da_importacao, usuario, nome="Outro")
    resposta = cliente_da_importacao.get(
        "/faturas", params={"hoje": HOJE, "conta_id": str(conta_id)}, headers=dono
    )
    assert [c["conta_nome"] for c in resposta.json()["cartoes"]] == ["FREE VISA"]


def test_conta_inexistente_devolve_404(cliente_da_importacao, dono):
    resposta = cliente_da_importacao.get(
        "/faturas", params={"hoje": HOJE, "conta_id": str(uuid4())}, headers=dono
    )
    assert resposta.status_code == 404
    assert resposta.json()["erro"]["codigo"] == "conta_nao_encontrada"


@pytest.mark.parametrize("hoje", [None, "", "05/11/2026", "2026-13-01", "ontem"])
def test_hoje_ausente_ou_invalido_devolve_422(cliente_da_importacao, dono, hoje):
    parametros = {} if hoje is None else {"hoje": hoje}
    resposta = cliente_da_importacao.get("/faturas", params=parametros, headers=dono)
    assert resposta.status_code == 422
    assert resposta.json()["erro"]["codigo"] == "requisicao_invalida"
    resposta = cliente_da_importacao.get(f"/faturas/{uuid4()}", params=parametros, headers=dono)
    assert resposta.status_code == 422


def test_detalhe_traz_compras_e_pagamentos(cliente_da_importacao, dono):
    _, aberta_id, paga_id, compras = _semear(
        cliente_da_importacao, _usuario_id(cliente_da_importacao, dono)
    )

    aberta = cliente_da_importacao.get(
        f"/faturas/{aberta_id}", params={"hoje": HOJE}, headers=dono
    ).json()
    assert aberta["situacao"] == "aberta"
    assert sorted(
        (c["descricao"], c["valor"], c["sentido"], c["estado"]) for c in aberta["compras"]
    ) == [
        ("Anthropic", "118.05", "saida", "pendente"),
        ("Estorno", "1.00", "entrada", "pendente"),
        ("Padaria", "4.13", "saida", "aceita"),
    ]
    anthropic = next(c for c in aberta["compras"] if c["descricao"] == "Anthropic")
    assert (anthropic["parcela_numero"], anthropic["parcela_total"]) == (2, 10)
    assert anthropic["id"] == str(compras[0].id)
    assert aberta["pagamentos"] == []

    paga = cliente_da_importacao.get(
        f"/faturas/{paga_id}", params={"hoje": HOJE}, headers=dono
    ).json()
    assert paga["pagamentos"] == [{"data": "2026-10-20", "valor": "50.00", "forma": None}]
    assert paga["compras"] == []


def test_fatura_inexistente_devolve_404(cliente_da_importacao, dono):
    resposta = cliente_da_importacao.get(f"/faturas/{uuid4()}", params={"hoje": HOJE}, headers=dono)
    assert resposta.status_code == 404
    assert resposta.json()["erro"]["codigo"] == "fatura_nao_encontrada"


def test_quem_nao_e_a_dona_recebe_importacao_desligada(cliente_da_importacao, autenticar_em):
    outra = autenticar_em(cliente_da_importacao, email="outra@x.com", nome="Outra")
    resposta = cliente_da_importacao.get("/faturas", params={"hoje": HOJE}, headers=outra)
    assert resposta.status_code == 404
    assert resposta.json()["erro"]["codigo"] == "importacao_desligada"


def test_sem_credencial_devolve_401(cliente_da_importacao):
    assert cliente_da_importacao.get("/faturas", params={"hoje": HOJE}).status_code == 401


def test_dono_nao_ve_faturas_de_outra_pessoa(cliente_da_importacao, dono, autenticar_em):
    outra = autenticar_em(cliente_da_importacao, email="outra@x.com", nome="Outra")
    _, _, fatura_alheia, _ = _semear(
        cliente_da_importacao, _usuario_id(cliente_da_importacao, outra), nome="Alheio"
    )
    lista = cliente_da_importacao.get("/faturas", params={"hoje": HOJE}, headers=dono).json()
    assert lista == {"cartoes": []}
    resposta = cliente_da_importacao.get(
        f"/faturas/{fatura_alheia}", params={"hoje": HOJE}, headers=dono
    )
    assert resposta.status_code == 404
    assert resposta.json()["erro"]["codigo"] == "fatura_nao_encontrada"


@pytest.mark.parametrize("escopo", ["leitura", "escrita"])
def test_chave_de_api_de_qualquer_escopo_le(cliente_da_importacao, dono, escopo):
    _semear(cliente_da_importacao, _usuario_id(cliente_da_importacao, dono))
    chave = cliente_da_importacao.post(
        "/chaves-de-api", json={"nome": "k", "escopo": escopo}, headers=dono
    ).json()["segredo"]
    resposta = cliente_da_importacao.get(
        "/faturas", params={"hoje": HOJE}, headers={"Authorization": f"Bearer {chave}"}
    )
    assert resposta.status_code == 200


def test_nao_ha_rota_de_escrita(cliente_da_importacao, dono):
    for metodo in ("post", "put", "delete", "patch"):
        resposta = getattr(cliente_da_importacao, metodo)("/faturas", headers=dono)
        assert resposta.status_code == 405


def test_faturas_nao_alteram_saldo_metas_nem_gastos(cliente_da_importacao, dono):
    """Regressão (FR-010): guardar e vincular faturas não mexe em nada do resto."""
    cliente = cliente_da_importacao
    usuario = _usuario_id(cliente, dono)
    uow = UnidadeDeTrabalhoSqlAlchemy(cliente.app.state.fabrica_de_sessoes)
    conta = Conta(
        usuario_id=usuario,
        nome="Cartão",
        saldo=Dinheiro(-12218),
        origem=OrigemDaConta.OPEN_FINANCE,
        id_externo="ext-regressao",
        tipo=TipoDaConta.CARTAO,
    )
    compra = _compra(conta, "t1", "Anthropic", 11805)
    with uow:
        uow.contas.adicionar(conta)
        uow.transacoes_importadas.adicionar_se_nova(compra)
        uow.commit()

    def fotografia():
        return (
            cliente.get("/contas", headers=dono).json(),
            cliente.get("/metas/progresso", params={"mes": "2026-10"}, headers=dono).json(),
            cliente.get(
                "/gastos", params={"inicio": "2026-10-01", "fim": "2026-11-30"}, headers=dono
            ).json(),
            cliente.get("/transacoes-importadas", headers=dono).json(),
        )

    antes = fotografia()
    with uow:
        fatura = _fatura(conta, date(2026, 10, 16), date(2026, 11, 15), "118.05")
        uow.faturas.salvar(conta.id, fatura)
        uow.faturas.vincular_compra(compra.id, fatura.id)
        uow.commit()

    assert fotografia() == antes
    assert antes[0][0]["saldo"] == "-122.18"
