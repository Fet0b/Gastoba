from datetime import date

from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.cobertura_de_compra import CoberturaDeCompra
from gastoba.domain.conta import Conta
from gastoba.domain.cor_da_destinacao import CorDaDestinacao
from gastoba.domain.destinacao import ParteDeDestinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.gasto import Gasto
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.tag import Tag
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy


def test_reservas_somam_aportes_e_coberturas_sem_mudar_financas(fabrica_de_sessoes):
    uow = UnidadeDeTrabalhoSqlAlchemy(fabrica_de_sessoes)
    dono = Usuario(nome="Pessoa fictícia")
    outro = Usuario(nome="Outra pessoa fictícia")
    conta = Conta(dono.id, "Carteira fictícia", Dinheiro(90000))
    dia = date(2026, 10, 10)
    g = Gasto(
        conta.id,
        Dinheiro(8001),
        "Compra fictícia",
        dia,
        CategoriaDoGasto.CONFORTO,
        (Tag("loja"), Tag("online")),
    )
    movimentos = []
    with uow as u:
        u.usuarios.salvar(dono)
        u.usuarios.salvar(outro)
        u.contas.adicionar(conta)
        u.gastos.adicionar(g)
        u.investimentos.salvar_posicao(
            dono.id,
            InvestimentoExterno(
                "ficticio", "Reserva fictícia", "FIXED_INCOME", None, Dinheiro(10500), "{}"
            ),
        )
        investimento = u.investimentos.listar_posicoes(dono.id)[0]
        for valor, categoria in [
            (3000, g.categoria),
            (5000, g.categoria),
            (4000, CategoriaDoGasto.LAZER),
            (2000, None),
        ]:
            m = MovimentoDeInvestimento(
                conta.id,
                TipoDeMovimento.APORTE,
                Dinheiro(valor),
                "Aporte fictício",
                dia,
                investimento_id=investimento.id,
                categoria=categoria,
            )
            u.movimentos_de_investimento.adicionar(m)
            u.destinacoes.adicionar(m.id, [ParteDeDestinacao(Tag("celular"), m.valor)])
            movimentos.append(m)
        u.coberturas.adicionar(CoberturaDeCompra(g.id, Tag("celular"), Dinheiro(3000)))
        u.cores_das_destinacoes.definir(dono.id, Tag("casa/escritorio"), CorDaDestinacao.MENTA)
        u.commit()
    with uow as u:
        assert u.destinacoes.somar_reservado_por_tag(dono.id, g.categoria) == {
            Tag("celular"): Dinheiro(8000)
        }
        assert u.destinacoes.somar_reservado_por_tag(outro.id, g.categoria) == {}
        assert u.coberturas.somar_coberto_por_tag(dono.id, g.categoria) == {
            Tag("celular"): Dinheiro(3000)
        }
        assert u.coberturas.somar_coberto_por_tag(outro.id, g.categoria) == {}
        assert u.gastos.somar_por_categoria(dono.id, dia, dia) == {g.categoria: Dinheiro(5001)}
        assert u.gastos.obter(dono.id, g.id).valor == Dinheiro(8001)
        assert u.movimentos_de_investimento.somar_aportes_por_categoria(dono.id, dia, dia) == {
            g.categoria: Dinheiro(8000),
            CategoriaDoGasto.LAZER: Dinheiro(4000),
        }
        assert u.cores_das_destinacoes.listar(dono.id) == {
            Tag("casa/escritorio"): CorDaDestinacao.MENTA
        }
        assert u.cores_das_destinacoes.listar(outro.id) == {}
        assert u.contas.obter(dono.id, conta.id).saldo == conta.saldo
        cobertura = u.coberturas.listar_dos_gastos([g.id])[g.id][0]
        assert u.coberturas.obter(outro.id, cobertura.id) is None
        u.coberturas.remover(cobertura.id)
        u.commit()
    with uow as u:
        assert u.gastos.somar_por_categoria(dono.id, dia, dia) == {g.categoria: g.valor}
        assert len(u.movimentos_de_investimento.listar(dono.id, dia, dia)) == 4
