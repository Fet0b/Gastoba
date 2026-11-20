"""Aportes sem investimento: listar, mesclar, excluir e desfazer (lógico, reversível)."""

from datetime import date
from uuid import uuid4

from gastoba.domain.conta import Conta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy

DIA = date(2026, 10, 27)


def _semear(cliente_autenticado):
    estado = cliente_autenticado.app.state
    uow = UnidadeDeTrabalhoSqlAlchemy(estado.fabrica_de_sessoes)
    usuario = cliente_autenticado.get("/auth/eu").json()["id"]
    from uuid import UUID

    conta = Conta(UUID(usuario), "Banco", Dinheiro(0))
    movimentos = [
        MovimentoDeInvestimento(conta.id, TipoDeMovimento.APORTE, Dinheiro(14313), "A", DIA)
        for _ in range(2)
    ]
    with uow as u:
        u.contas.adicionar(conta)
        for m in movimentos:
            u.movimentos_de_investimento.adicionar(m)
        u.commit()
    return movimentos


def test_lista_com_duplicado_sugerido(cliente_autenticado):
    a, b = _semear(cliente_autenticado)
    itens = cliente_autenticado.get("/aportes-sem-investimento").json()
    assert {i["id"] for i in itens} == {str(a.id), str(b.id)}
    assert all(i["duplicado_sugerido_id"] for i in itens)
    assert all(i["valor"] == "143.13" for i in itens)


def test_mesclar_e_logico_nao_muda_total_sem_aprovacao_e_desfaz(cliente_autenticado):
    a, b = _semear(cliente_autenticado)
    criado = cliente_autenticado.post(
        f"/aportes-sem-investimento/{a.id}/mesclar", json={"mantido_id": str(b.id)}
    )
    assert criado.status_code == 200
    assert criado.json()["acao"] == "mesclado" and criado.json()["aprovado"] is False
    # Sem aprovação do dono, o aporte continua nas listas e nos totais.
    assert len(cliente_autenticado.get("/aportes-sem-investimento").json()) == 2
    assert cliente_autenticado.post(f"/aportes-sem-investimento/{a.id}/desfazer").status_code == 204
    segunda = cliente_autenticado.post(f"/aportes-sem-investimento/{a.id}/desfazer")
    assert segunda.status_code == 404
    assert segunda.json()["erro"]["codigo"] == "tratamento_nao_encontrado"


def test_excluir_duas_vezes_e_mescla_invalida(cliente_autenticado):
    a, b = _semear(cliente_autenticado)
    assert cliente_autenticado.post(f"/aportes-sem-investimento/{a.id}/excluir").status_code == 200
    repetida = cliente_autenticado.post(f"/aportes-sem-investimento/{a.id}/excluir")
    assert repetida.status_code == 409
    assert repetida.json()["erro"]["codigo"] == "aporte_ja_tratado"
    invalida = cliente_autenticado.post(
        f"/aportes-sem-investimento/{b.id}/mesclar", json={"mantido_id": str(b.id)}
    )
    assert invalida.status_code == 422
    assert invalida.json()["erro"]["codigo"] == "mescla_invalida"


def test_inexistente_da_404_e_chave_de_api_da_403(cliente_autenticado):
    _semear(cliente_autenticado)
    nada = cliente_autenticado.post(f"/aportes-sem-investimento/{uuid4()}/excluir")
    assert nada.status_code == 404
    chave = cliente_autenticado.post(
        "/chaves-de-api", json={"nome": "T", "escopo": "escrita"}
    ).json()
    headers = {"Authorization": f"Bearer {chave['segredo']}"}
    assert cliente_autenticado.get("/aportes-sem-investimento", headers=headers).status_code == 403
    assert (
        cliente_autenticado.post(
            f"/aportes-sem-investimento/{uuid4()}/excluir", headers=headers
        ).status_code
        == 403
    )


def test_lista_traz_a_descricao_e_a_natureza_do_aporte(cliente_autenticado):
    from uuid import UUID

    uow = UnidadeDeTrabalhoSqlAlchemy(cliente_autenticado.app.state.fabrica_de_sessoes)
    usuario = UUID(cliente_autenticado.get("/auth/eu").json()["id"])
    conta = Conta(usuario, "Banco natureza", Dinheiro(0))
    descricoes = {
        "LIQ BOLSA - VISTA BRUTO - PREGÃO: 03/11/2026": "liquidacao_de_bolsa",
        "LIQ BOLSA - VISTA TX CCP/EMOL/TTA B3": "imposto_ou_taxa",
        "CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA": "conta_remunerada",
        "Aporte antigo": "outra",
    }
    with uow as u:
        u.contas.adicionar(conta)
        for descricao in descricoes:
            u.movimentos_de_investimento.adicionar(
                MovimentoDeInvestimento(
                    conta.id, TipoDeMovimento.APORTE, Dinheiro(1000), descricao, DIA
                )
            )
        u.commit()
    itens = {i["descricao"]: i for i in cliente_autenticado.get("/aportes-sem-investimento").json()}
    assert set(itens) == set(descricoes)
    for descricao, natureza in descricoes.items():
        assert itens[descricao]["natureza"] == natureza, descricao


def test_confirmar_o_tratamento_tira_o_aporte_da_lista_e_repetir_da_409(cliente_autenticado):
    a, b = _semear(cliente_autenticado)
    cliente_autenticado.post(f"/aportes-sem-investimento/{a.id}/excluir")

    confirmado = cliente_autenticado.post(f"/aportes-sem-investimento/{a.id}/confirmar")

    assert confirmado.status_code == 200
    assert confirmado.json()["acao"] == "excluido" and confirmado.json()["aprovado"] is True
    assert {i["id"] for i in cliente_autenticado.get("/aportes-sem-investimento").json()} == {
        str(b.id)
    }
    repetido = cliente_autenticado.post(f"/aportes-sem-investimento/{a.id}/confirmar")
    assert repetido.status_code == 409
    assert repetido.json()["erro"]["codigo"] == "aporte_ja_tratado"


def test_confirmar_sem_tratamento_da_404(cliente_autenticado):
    a, _ = _semear(cliente_autenticado)

    sem_tratamento = cliente_autenticado.post(f"/aportes-sem-investimento/{a.id}/confirmar")
    inexistente = cliente_autenticado.post(f"/aportes-sem-investimento/{uuid4()}/confirmar")

    for resposta in (sem_tratamento, inexistente):
        assert resposta.status_code == 404
        assert resposta.json()["erro"]["codigo"] == "tratamento_nao_encontrado"


def test_confirmar_de_outra_pessoa_responde_como_inexistente(cliente_autenticado, autenticar_em):
    a, _ = _semear(cliente_autenticado)
    cliente_autenticado.post(f"/aportes-sem-investimento/{a.id}/excluir")
    outra = autenticar_em(cliente_autenticado, email="outra-confirmar@x.com", nome="Outra")

    resposta = cliente_autenticado.post(
        f"/aportes-sem-investimento/{a.id}/confirmar", headers=outra
    )

    assert resposta.status_code == 404
    assert resposta.json()["erro"]["codigo"] == "tratamento_nao_encontrado"
    # Nada mudou para a dona: o tratamento continua aguardando confirmação.
    pendente = [
        i
        for i in cliente_autenticado.get("/aportes-sem-investimento").json()
        if i["id"] == str(a.id)
    ]
    assert pendente[0]["tratamento_pendente_de_aprovacao"] is True


def test_confirmar_exige_sessao_chave_de_api_da_403(cliente_autenticado):
    a, _ = _semear(cliente_autenticado)
    cliente_autenticado.post(f"/aportes-sem-investimento/{a.id}/excluir")
    chave = cliente_autenticado.post(
        "/chaves-de-api", json={"nome": "C", "escopo": "escrita"}
    ).json()

    resposta = cliente_autenticado.post(
        f"/aportes-sem-investimento/{a.id}/confirmar",
        headers={"Authorization": f"Bearer {chave['segredo']}"},
    )

    assert resposta.status_code == 403


def test_aviso_de_aportes_sem_destino_so_sai_do_resumo_depois_de_confirmar(cliente_autenticado):
    a, _ = _semear(cliente_autenticado)

    def aviso():
        return cliente_autenticado.get("/investimentos/resumo").json()["aportes_sem_destino"]

    assert aviso()["quantidade"] == 2
    cliente_autenticado.post(f"/aportes-sem-investimento/{a.id}/excluir")
    # Registrado, mas ainda não confirmado: continua contando.
    assert aviso() == {"total": "286.26", "quantidade": 2}
    assert (
        cliente_autenticado.post(f"/aportes-sem-investimento/{a.id}/confirmar").status_code == 200
    )
    assert aviso() == {"total": "143.13", "quantidade": 1}
