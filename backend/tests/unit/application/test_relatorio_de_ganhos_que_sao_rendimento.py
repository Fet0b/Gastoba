from datetime import date
from uuid import uuid4

from gastoba.application.relatorio_de_ganhos_que_sao_rendimento import (
    RelatorioDeGanhosQueSaoRendimento,
)
from gastoba.domain.conta import Conta, OrigemDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.ganho import Ganho, OrigemDoGanho
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento

USUARIO, OUTRO = uuid4(), uuid4()
DIA = date(2026, 10, 26)


def _montar(uow, ganhos, resgates=()):
    conta = Conta(USUARIO, "Banco", Dinheiro(0), origem=OrigemDaConta.OPEN_FINANCE, id_externo="c")
    with uow as u:
        u.contas.adicionar(conta)
        for descricao, centavos, dia, origem in ganhos:
            u.ganhos.adicionar(Ganho(conta.id, Dinheiro(centavos), descricao, dia, origem=origem))
        for centavos, dia in resgates:
            u.movimentos_de_investimento.adicionar(
                MovimentoDeInvestimento(
                    conta.id, TipoDeMovimento.RESGATE, Dinheiro(centavos), "Resgate", dia
                )
            )
        u.commit()


OF = OrigemDoGanho.OPEN_FINANCE


def test_ganho_no_dia_de_um_resgate_e_candidato_forte(unidade_de_trabalho):
    _montar(
        unidade_de_trabalho,
        [("Credito CDB", 2803, DIA, OF), ("Salário", 500000, DIA, OF)],
        resgates=[(12000, DIA)],
    )
    relatorio = RelatorioDeGanhosQueSaoRendimento(unidade_de_trabalho).executar(USUARIO)
    (mes,) = relatorio.meses
    assert mes.mes == "2026-10"
    assert mes.candidatos == 2  # os dois ganhos caem no dia do resgate
    assert mes.renda == Dinheiro(502803)


def test_descricao_de_rendimento_e_candidato_possivel_sem_resgate(unidade_de_trabalho):
    _montar(
        unidade_de_trabalho,
        [("RENDIMENTO CDB", 1500, DIA, OF), ("Salário", 500000, DIA, OF)],
    )
    relatorio = RelatorioDeGanhosQueSaoRendimento(unidade_de_trabalho).executar(USUARIO)
    (mes,) = relatorio.meses
    assert mes.candidatos == 1
    assert mes.valor_dos_candidatos == Dinheiro(1500)
    assert mes.renda_sem_candidatos == Dinheiro(500000)


def test_ganho_manual_e_o_salario_nao_entram(unidade_de_trabalho):
    _montar(
        unidade_de_trabalho,
        [("Rendimento do aluguel", 90000, DIA, OrigemDoGanho.MANUAL), ("Salário", 400000, DIA, OF)],
    )
    relatorio = RelatorioDeGanhosQueSaoRendimento(unidade_de_trabalho).executar(USUARIO)
    assert relatorio.total_de_candidatos == 0


def test_nao_altera_nada_e_isola_por_pessoa(unidade_de_trabalho):
    _montar(unidade_de_trabalho, [("Credito CDB", 2803, DIA, OF)], resgates=[(12000, DIA)])
    commits = unidade_de_trabalho.commits
    assert RelatorioDeGanhosQueSaoRendimento(unidade_de_trabalho).executar(OUTRO).meses == ()
    RelatorioDeGanhosQueSaoRendimento(unidade_de_trabalho).executar(USUARIO)
    assert unidade_de_trabalho.commits == commits
    with unidade_de_trabalho as u:
        assert len(u.ganhos.listar(USUARIO, DIA, DIA, None)) == 1


def test_separa_por_mes(unidade_de_trabalho):
    _montar(
        unidade_de_trabalho,
        [("RENDIMENTO", 100, date(2026, 9, 5), OF), ("RENDIMENTO", 200, date(2026, 10, 5), OF)],
    )
    relatorio = RelatorioDeGanhosQueSaoRendimento(unidade_de_trabalho).executar(USUARIO)
    assert [m.mes for m in relatorio.meses] == ["2026-09", "2026-10"]
    assert relatorio.total_de_candidatos == 2
