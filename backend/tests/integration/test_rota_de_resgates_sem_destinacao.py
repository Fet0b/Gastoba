from datetime import date
from uuid import UUID

from gastoba.domain.destinacao import ParteDeDestinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.tag import Tag
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy


def _uow(c):
    return UnidadeDeTrabalhoSqlAlchemy(c.app.state.fabrica_de_sessoes)


def _posicao(c, pessoa, nome):
    with _uow(c) as u:
        u.investimentos.salvar_posicao(
            pessoa, InvestimentoExterno(nome, nome, "FIXED_INCOME", "CDB", Dinheiro(5000), "{}")
        )
        posicao = next(p for p in u.investimentos.listar_posicoes(pessoa) if p.nome == nome)
        u.commit()
    return posicao


def _resgate(c, conta_id, posicao_id, vencimento):
    m = MovimentoDeInvestimento(
        UUID(conta_id), TipoDeMovimento.RESGATE, Dinheiro(10000), "Saque", date(2026, 11, 5)
    )
    m.investimento_id = posicao_id
    m.vencimento_confirmado = vencimento
    with _uow(c) as u:
        u.movimentos_de_investimento.adicionar(m)
        u.commit()
    return str(m.id)


def test_sininho_omite_vencimento_sem_caixinhas_e_mostra_o_resto_com_o_nome(
    cliente_autenticado, autenticar
):
    c = cliente_autenticado
    pessoa = UUID(c.get("/auth/eu").json()["id"])
    conta = c.post("/contas", json={"nome": "Carteira fictícia", "saldo_inicial": "0.00"}).json()
    sem_caixinhas = _posicao(c, pessoa, "CDB sem caixinhas")
    com_caixinhas = _posicao(c, pessoa, "CDB com caixinhas")
    aporte = MovimentoDeInvestimento(
        UUID(conta["id"]), TipoDeMovimento.APORTE, Dinheiro(20000), "Aporte", date(2026, 10, 1)
    )
    aporte.investimento_id = com_caixinhas.id
    with _uow(c) as u:
        u.movimentos_de_investimento.adicionar(aporte)
        u.destinacoes.adicionar(aporte.id, [ParteDeDestinacao(Tag("casa"), Dinheiro(20000))])
        u.commit()
    _resgate(c, conta["id"], sem_caixinhas.id, vencimento=True)
    sem_marca = _resgate(c, conta["id"], sem_caixinhas.id, vencimento=False)
    venc_com = _resgate(c, conta["id"], com_caixinhas.id, vencimento=True)

    corpo = c.get("/resgates-sem-destinacao").json()

    assert {m["id"] for m in corpo} == {sem_marca, venc_com}
    por_id = {m["id"]: m for m in corpo}
    assert por_id[sem_marca]["tipo"] == "resgate"
    assert por_id[sem_marca]["investimento_nome"] == "CDB sem caixinhas"
    assert por_id[venc_com]["tipo"] == "vencimento"
    assert por_id[sem_marca]["casamento_id"] is None
    outro = autenticar(email="outro-vencimento-ficticio@exemplo.com")
    assert c.get("/resgates-sem-destinacao", headers=outro).json() == []
    chave = c.post("/chaves-de-api", json={"nome": "Chave fictícia", "escopo": "leitura"}).json()
    r = c.get("/resgates-sem-destinacao", headers={"Authorization": f"Bearer {chave['segredo']}"})
    assert r.status_code == 403
