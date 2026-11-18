from datetime import date
from uuid import UUID

from gastoba.domain.destinacao import ParteDeDestinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.tag import Tag
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy


def _resgate(c, conta_id, com_tag):
    m = MovimentoDeInvestimento(
        UUID(conta_id), TipoDeMovimento.RESGATE, Dinheiro(10000), "Saque", date(2026, 11, 5)
    )
    with UnidadeDeTrabalhoSqlAlchemy(c.app.state.fabrica_de_sessoes) as u:
        u.movimentos_de_investimento.adicionar(m)
        if com_tag:
            u.destinacoes.adicionar(m.id, [ParteDeDestinacao(Tag("viagem"), Dinheiro(-10000))])
        u.commit()
    return str(m.id)


def test_lista_resgates_sem_tag_isola_pessoas_e_exige_sessao(cliente_autenticado, autenticar):
    c = cliente_autenticado
    conta = c.post("/contas", json={"nome": "Carteira fictícia", "saldo_inicial": "0.00"}).json()
    sem_tag = _resgate(c, conta["id"], com_tag=False)
    _resgate(c, conta["id"], com_tag=True)
    corpo = c.get("/resgates-sem-destinacao").json()
    assert [m["id"] for m in corpo] == [sem_tag]
    assert corpo[0]["destinacoes"] == []
    outro = autenticar(email="outro-sininho-ficticio@exemplo.com")
    assert c.get("/resgates-sem-destinacao", headers=outro).json() == []
    chave = c.post("/chaves-de-api", json={"nome": "Chave fictícia", "escopo": "leitura"}).json()
    r = c.get("/resgates-sem-destinacao", headers={"Authorization": f"Bearer {chave['segredo']}"})
    assert r.status_code == 403
