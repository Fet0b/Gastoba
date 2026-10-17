from datetime import date
from uuid import uuid4

import pytest

from gastoba.application.consultar_progresso_das_metas import ConsultarProgressoDasMetas
from gastoba.application.definir_meta import DefinirMeta
from gastoba.application.listar_metas import ListarMetas
from gastoba.application.registrar_ganho import RegistrarGanho
from gastoba.application.registrar_gasto import RegistrarGasto
from gastoba.application.remover_meta import RemoverMeta
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import MetaNaoEncontrada, PercentuaisExcedem100, PercentualInvalido
from gastoba.domain.mes import Mes
from gastoba.domain.meta import SituacaoDaMeta

USUARIO_ID = uuid4()
LAZER = CategoriaDoGasto.LAZER
FIXO = CategoriaDoGasto.GASTO_FIXO


def definir(unidade_de_trabalho, categoria, percentual, usuario_id=USUARIO_ID):
    return DefinirMeta(unidade_de_trabalho).executar(usuario_id, categoria, percentual)


def test_define_a_meta_e_troca_o_percentual_da_mesma_categoria(unidade_de_trabalho):
    primeira = definir(unidade_de_trabalho, LAZER, 20)
    definir(unidade_de_trabalho, LAZER, 35)

    metas = unidade_de_trabalho.confirmado.metas
    assert len(metas) == 1
    assert next(iter(metas.values())).percentual == 35
    assert primeira.percentual == 20  # a devolvida na primeira vez não muda
    assert unidade_de_trabalho.commits == 2


@pytest.mark.parametrize("percentual", [0, -1, 101])
def test_percentual_invalido_nao_grava(unidade_de_trabalho, percentual):
    with pytest.raises(PercentualInvalido):
        definir(unidade_de_trabalho, LAZER, percentual)

    assert unidade_de_trabalho.confirmado.metas == {}
    assert unidade_de_trabalho.commits == 0


def test_soma_acima_de_100_e_recusada_e_exatamente_100_e_aceita(unidade_de_trabalho):
    definir(unidade_de_trabalho, FIXO, 60)
    definir(unidade_de_trabalho, LAZER, 40)  # 100% exatos

    with pytest.raises(PercentuaisExcedem100, match="101%"):
        definir(unidade_de_trabalho, CategoriaDoGasto.CONFORTO, 1)

    assert len(unidade_de_trabalho.confirmado.metas) == 2


def test_trocar_o_percentual_conta_so_as_outras_categorias(unidade_de_trabalho):
    definir(unidade_de_trabalho, FIXO, 60)
    definir(unidade_de_trabalho, LAZER, 40)

    definir(unidade_de_trabalho, LAZER, 40)  # mesmo valor: a própria meta não conta em dobro
    with pytest.raises(PercentuaisExcedem100):
        definir(unidade_de_trabalho, LAZER, 41)
    definir(unidade_de_trabalho, LAZER, 10)


def test_a_soma_e_por_usuario(unidade_de_trabalho):
    definir(unidade_de_trabalho, FIXO, 100)

    definir(unidade_de_trabalho, FIXO, 100, usuario_id=uuid4())


def test_listar_na_ordem_das_categorias_e_so_do_usuario(unidade_de_trabalho):
    definir(unidade_de_trabalho, FIXO, 30)
    definir(unidade_de_trabalho, CategoriaDoGasto.INVESTIMENTOS, 10)
    definir(unidade_de_trabalho, LAZER, 20)
    definir(unidade_de_trabalho, LAZER, 20, usuario_id=uuid4())

    metas = ListarMetas(unidade_de_trabalho).executar(USUARIO_ID)

    assert [(m.categoria, m.percentual) for m in metas] == [
        (CategoriaDoGasto.INVESTIMENTOS, 10),
        (LAZER, 20),
        (FIXO, 30),
    ]


def test_remover_apaga_a_meta_e_libera_a_soma(unidade_de_trabalho):
    definir(unidade_de_trabalho, FIXO, 90)
    RemoverMeta(unidade_de_trabalho).executar(USUARIO_ID, FIXO)

    assert unidade_de_trabalho.confirmado.metas == {}
    definir(unidade_de_trabalho, LAZER, 100)


def test_remover_meta_inexistente_ou_de_outro_usuario(unidade_de_trabalho):
    definir(unidade_de_trabalho, FIXO, 30, usuario_id=uuid4())

    with pytest.raises(MetaNaoEncontrada):
        RemoverMeta(unidade_de_trabalho).executar(USUARIO_ID, FIXO)
    assert len(unidade_de_trabalho.confirmado.metas) == 1


class TestProgresso:
    """Renda do mês = ganhos do mês; gasto = gastos da categoria no mês, em todas as contas."""

    OUTUBRO = Mes(2026, 10)

    def _registrar_ganho(self, unidade_de_trabalho, conta, centavos, data=date(2026, 10, 5)):
        RegistrarGanho(unidade_de_trabalho).executar(
            USUARIO_ID, conta.id, Dinheiro(centavos), "Salário", data, []
        )

    def _registrar_gasto(self, unidade_de_trabalho, conta, centavos, categoria, data):
        RegistrarGasto(unidade_de_trabalho).executar(
            USUARIO_ID, conta.id, Dinheiro(centavos), "Compra", data, categoria, []
        )

    def _progresso(self, unidade_de_trabalho, mes=None):
        return ConsultarProgressoDasMetas(unidade_de_trabalho).executar(
            USUARIO_ID, mes or self.OUTUBRO
        )

    def test_sem_metas_so_traz_a_renda(self, unidade_de_trabalho, semear_conta):
        conta = semear_conta(usuario_id=USUARIO_ID, saldo=Dinheiro(0))
        self._registrar_ganho(unidade_de_trabalho, conta, 500000)

        resumo = self._progresso(unidade_de_trabalho)

        assert resumo.renda == Dinheiro(500000)
        assert resumo.progressos == ()

    def test_cada_meta_com_limite_gasto_e_situacao(self, unidade_de_trabalho, semear_conta):
        carteira = semear_conta(usuario_id=USUARIO_ID, nome="Carteira", saldo=Dinheiro(0))
        banco = semear_conta(usuario_id=USUARIO_ID, nome="Banco", saldo=Dinheiro(0))
        self._registrar_ganho(unidade_de_trabalho, carteira, 300000)
        self._registrar_ganho(unidade_de_trabalho, banco, 200000)  # renda: 5.000,00
        definir(unidade_de_trabalho, LAZER, 10)  # limite 500,00
        definir(unidade_de_trabalho, FIXO, 40)  # limite 2.000,00
        definir(unidade_de_trabalho, CategoriaDoGasto.CONFORTO, 5)  # limite 250,00, sem gasto
        # lazer: 450,00 no total (em duas contas) = 90% -> alerta
        self._registrar_gasto(unidade_de_trabalho, carteira, 20000, LAZER, date(2026, 10, 1))
        self._registrar_gasto(unidade_de_trabalho, banco, 25000, LAZER, date(2026, 10, 31))
        # gasto fixo: 2.100,00 -> estourou em 100,00
        self._registrar_gasto(unidade_de_trabalho, banco, 210000, FIXO, date(2026, 10, 10))

        resumo = self._progresso(unidade_de_trabalho)

        por_categoria = {p.categoria: p for p in resumo.progressos}
        assert resumo.renda == Dinheiro(500000)
        assert list(por_categoria) == [LAZER, CategoriaDoGasto.CONFORTO, FIXO]  # ordem do enum
        assert por_categoria[LAZER].limite == Dinheiro(50000)
        assert por_categoria[LAZER].gasto == Dinheiro(45000)
        assert por_categoria[LAZER].percentual_usado == 90
        assert por_categoria[LAZER].situacao == SituacaoDaMeta.ALERTA
        assert por_categoria[FIXO].restante == Dinheiro(-10000)
        assert por_categoria[FIXO].situacao == SituacaoDaMeta.ESTOUROU
        assert por_categoria[CategoriaDoGasto.CONFORTO].gasto == Dinheiro(0)
        assert por_categoria[CategoriaDoGasto.CONFORTO].situacao == SituacaoDaMeta.DENTRO

    def test_so_conta_o_mes_pedido(self, unidade_de_trabalho, semear_conta):
        conta = semear_conta(usuario_id=USUARIO_ID, saldo=Dinheiro(0))
        self._registrar_ganho(unidade_de_trabalho, conta, 100000, date(2026, 9, 30))
        self._registrar_ganho(unidade_de_trabalho, conta, 300000, date(2026, 10, 1))
        self._registrar_ganho(unidade_de_trabalho, conta, 700000, date(2026, 11, 1))
        definir(unidade_de_trabalho, LAZER, 50)
        self._registrar_gasto(unidade_de_trabalho, conta, 1000, LAZER, date(2026, 9, 30))
        self._registrar_gasto(unidade_de_trabalho, conta, 2000, LAZER, date(2026, 10, 31))
        self._registrar_gasto(unidade_de_trabalho, conta, 4000, LAZER, date(2026, 11, 1))

        outubro = self._progresso(unidade_de_trabalho)

        assert outubro.renda == Dinheiro(300000)
        assert outubro.progressos[0].gasto == Dinheiro(2000)
        assert self._progresso(unidade_de_trabalho, Mes(2026, 11)).renda == Dinheiro(700000)

    def test_sem_renda_no_mes_a_meta_fica_sem_renda(self, unidade_de_trabalho, semear_conta):
        conta = semear_conta(usuario_id=USUARIO_ID, saldo=Dinheiro(0))
        definir(unidade_de_trabalho, LAZER, 20)
        self._registrar_gasto(unidade_de_trabalho, conta, 5000, LAZER, date(2026, 10, 3))

        [progresso] = self._progresso(unidade_de_trabalho).progressos

        assert progresso.renda == Dinheiro(0)
        assert progresso.situacao == SituacaoDaMeta.SEM_RENDA
        assert progresso.gasto == Dinheiro(5000)

    def test_nao_mistura_dados_de_outro_usuario(self, unidade_de_trabalho, semear_conta):
        alheio = uuid4()
        conta_alheia = semear_conta(usuario_id=alheio, saldo=Dinheiro(0))
        RegistrarGanho(unidade_de_trabalho).executar(
            alheio, conta_alheia.id, Dinheiro(999999), "Salário", date(2026, 10, 5), []
        )
        RegistrarGasto(unidade_de_trabalho).executar(
            alheio, conta_alheia.id, Dinheiro(5000), "x", date(2026, 10, 5), LAZER, []
        )
        definir(unidade_de_trabalho, LAZER, 20)

        resumo = self._progresso(unidade_de_trabalho)

        assert resumo.renda == Dinheiro(0)
        assert resumo.progressos[0].gasto == Dinheiro(0)
