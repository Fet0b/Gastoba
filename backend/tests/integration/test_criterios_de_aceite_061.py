"""Critérios de aceite 1 e 2 da frente 061, num SQLite temporário e com dados sintéticos.

O cenário tem a forma dos dados reais, sem nenhum dado real: dois pregões de bolsa (um com 2
operações e 1 taxa, outro com 1 operação e 3 taxas), um resgate de renda fixa com 2 créditos e o
débito do imposto, e uma ligação antiga já feita."""

from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import text

from gastoba.domain.casamento_de_operacao import (
    CasamentoDeOperacao,
    PapelDoVinculo,
    VinculoDeCasamento,
)
from gastoba.domain.conta import Conta, OrigemDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.operacao import Operacao, OrigemDaOperacao, TipoDeOperacao
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.transacao_importada import SentidoDaTransacao, TransacaoImportada
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy


def _bruto(pregao):
    return f"LIQ BOLSA - VISTA BRUTO - PREGÃO: {pregao} - EXEC.: 1"


def _taxa(pregao):
    return f"LIQ BOLSA - VISTA TX CCP/EMOL/TTA B3 - PREGÃO: {pregao}"


class Cenario:
    def __init__(self, cliente):
        self.uow = UnidadeDeTrabalhoSqlAlchemy(cliente.app.state.fabrica_de_sessoes)
        self.fabrica = cliente.app.state.fabrica_de_sessoes
        self.usuario = UUID(cliente.get("/auth/eu").json()["id"])
        self.conta = Conta(
            self.usuario,
            "Banco",
            Dinheiro(100000),
            origem=OrigemDaConta.OPEN_FINANCE,
            id_externo="c1",
        )
        with self.uow as u:
            u.contas.adicionar(self.conta)
            u.commit()

    def posicao(self, nome, tipo="EQUITY"):
        with self.uow as u:
            u.investimentos.salvar_posicao(
                self.usuario, InvestimentoExterno(nome.lower(), nome, tipo, None, Dinheiro(1), "{}")
            )
            u.commit()
        with self.uow as u:
            return next(p for p in u.investimentos.listar_posicoes(self.usuario) if p.nome == nome)

    def operacao(self, posicao, valor, dia, tipo=TipoDeOperacao.COMPRA, quantidade="1", custos=0):
        operacao = Operacao(
            posicao_id=posicao.id,
            tipo=tipo,
            data=dia,
            quantidade=Decimal(quantidade),
            valor_bruto=Dinheiro(valor),
            custos=Dinheiro(custos),
            origem=OrigemDaOperacao.PLUGGY,
            id_externo=f"op-{posicao.nome}-{dia}-{valor}",
        )
        with self.uow as u:
            u.operacoes.adicionar(self.usuario, operacao)
            u.commit()
        return operacao

    def transacao(self, descricao, valor, dia, sentido=SentidoDaTransacao.SAIDA, como=None):
        """``como``: None (pendente), "aporte" (aporte sem investimento) ou "resgate"/"ganho"."""
        t = TransacaoImportada(
            self.conta.id,
            f"x{descricao[:12]}{valor}{dia}",
            dia,
            descricao,
            Dinheiro(valor),
            sentido,
        )
        with self.uow as u:
            u.transacoes_importadas.adicionar_se_nova(t)
            if como is not None:
                t.aceitar()
                u.transacoes_importadas.atualizar_estado(t)
                if como in ("aporte", "resgate"):
                    u.movimentos_de_investimento.adicionar(
                        MovimentoDeInvestimento(
                            self.conta.id,
                            TipoDeMovimento.APORTE if como == "aporte" else TipoDeMovimento.RESGATE,
                            t.valor,
                            descricao,
                            dia,
                            transacao_importada_id=t.id,
                        )
                    )
            u.commit()
        return t

    def foto(self):
        """O que a ligação NÃO pode mudar: saldos, custos das operações, destinações e alocações."""
        with self.fabrica() as s:
            return {
                "saldos": s.execute(
                    text("SELECT id, saldo_centavos FROM contas ORDER BY id")
                ).all(),
                "custos": s.execute(
                    text("SELECT id, custos_centavos FROM operacoes_de_investimento ORDER BY id")
                ).all(),
                "destinacoes": s.execute(text("SELECT count(*) FROM destinacoes")).scalar(),
                "alocacoes": s.execute(text("SELECT count(*) FROM alocacoes_de_caixinha")).scalar(),
            }


def test_cenario_completo_das_propostas_e_da_confirmacao_em_lote(cliente_autenticado):
    cliente = cliente_autenticado
    c = Cenario(cliente)
    # Pregão de 27/10: 2 compras (BBAS3 R$ 17,40 e ITUB4 R$ 124,65) e 1 taxa; hoje, aportes soltos.
    bbas, itub = c.posicao("BBAS3"), c.posicao("ITUB4")
    c.operacao(bbas, 1740, date(2026, 10, 27), quantidade="1")
    c.operacao(itub, 12465, date(2026, 10, 27), quantidade="3")
    c.transacao(_bruto("27/10/2026"), 14205, date(2026, 10, 29), como="aporte")
    c.transacao(_taxa("27/10/2026"), 3, date(2026, 10, 29), como="aporte")
    # Pregão de 03/11: uma compra (AUPO11 R$ 2.789,30) e 3 taxas.
    aupo = c.posicao("AUPO11")
    c.operacao(aupo, 278930, date(2026, 11, 3), quantidade="25")
    c.transacao(_bruto("03/11/2026"), 278930, date(2026, 11, 4), como="aporte")
    for valor in (62, 13, 7):
        c.transacao(_taxa("03/11/2026"), valor, date(2026, 11, 4), como="aporte")
    # Resgate de renda fixa: 2 créditos (R$ 120,00 e R$ 28,03) e o débito do IRRF (R$ 4,90).
    cdb = c.posicao("CDB", "FIXED_INCOME")
    c.operacao(cdb, 14803, date(2026, 10, 26), TipoDeOperacao.VENCIMENTO, custos=490)
    entrada = SentidoDaTransacao.ENTRADA
    c.transacao("VENCIMENTO CDB", 12000, date(2026, 10, 26), entrada, como="resgate")
    c.transacao("CUPOM CDB", 2803, date(2026, 10, 26), entrada)
    c.transacao("IRRF CDB", 490, date(2026, 10, 26))
    # Uma ligação antiga (09/11), sem aporte.
    xpto = c.posicao("XPTO3")
    antiga = c.operacao(xpto, 5000, date(2026, 11, 9))
    t_antiga = c.transacao(_bruto("09/11/2026"), 5000, date(2026, 11, 10), como="aporte")
    with c.uow as u:
        u.casamentos.adicionar(
            c.usuario,
            CasamentoDeOperacao(
                (antiga.id,), (VinculoDeCasamento(t_antiga.id, PapelDoVinculo.BRUTO),)
            ),
        )
        for m in u.movimentos_de_investimento.da_transacao(c.usuario, t_antiga.id):
            u.movimentos_de_investimento.excluir(m.id)
        u.commit()

    # Critério 1: o que a revisão lista.
    revisao = cliente.get("/revisao-da-bolsa").json()
    exatas = [p for p in revisao["propostas"] if p["confianca"] == "exata"]
    compras = [p for p in exatas if p["tipo"] == "compra_na_bolsa"]
    renda_fixa = [p for p in revisao["propostas"] if p["tipo"] == "resgate_de_renda_fixa"]
    assert len(revisao["propostas"]) == 3 and len(exatas) == 3
    assert {(p["data_do_pregao"], len(p["operacoes"]), len(p["taxas"])) for p in compras} == {
        ("2026-10-27", 2, 1),
        ("2026-11-03", 1, 3),
    }
    (rf,) = renda_fixa
    assert len(rf["bruto"]) == 2 and len(rf["taxas"]) == 1
    assert len(revisao["confirmados"]) == 1 and revisao["confirmados"][0]["sem_aporte"] is True

    # Critério 2: confirmar as 2 propostas de bolsa em lote.
    antes = c.foto()
    aportes_antes = [
        m
        for m in cliente.get(
            "/movimentos-de-investimento", params={"inicio": "2026-10-01", "fim": "2026-11-30"}
        ).json()
        if m["tipo"] == "aporte"
    ]
    # 2 aportes sem investimento (os brutos) + 4 aportes de taxa (1 em 27/10 e 3 em 03/11).
    assert len(aportes_antes) == 6
    resposta = cliente.post(
        "/revisao-da-bolsa/confirmar",
        json={"itens": [{"chave": p["chave"], "versao": p["versao"]} for p in compras]},
    )
    assert resposta.status_code == 201 and len(resposta.json()["confirmados"]) == 2
    movimentos = cliente.get(
        "/movimentos-de-investimento", params={"inicio": "2026-10-01", "fim": "2026-11-30"}
    ).json()
    ligados = [m for m in movimentos if m["casamento_id"] and m["investimento_id"]]
    assert sorted(m["valor"] for m in ligados) == ["124.65", "17.40", "2789.30"]
    assert all(m["tipo"] == "aporte" for m in ligados)
    assert not [m for m in movimentos if "TX CCP" in m["descricao"]]  # os aportes de taxa saíram
    assert c.foto() == antes
