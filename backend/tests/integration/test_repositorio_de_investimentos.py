from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy.exc import IntegrityError

from gastoba.domain.conta import Conta
from gastoba.domain.destinacao import ParteDeDestinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.movimento_de_investimento import (
    MovimentoDeInvestimento,
    OrigemDoMovimento,
    TipoDeMovimento,
)
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.tag import Tag
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy


@pytest.fixture
def uow(fabrica_de_sessoes):
    return UnidadeDeTrabalhoSqlAlchemy(fabrica_de_sessoes)


def _cdb(id_externo="i1", centavos=200010, dados="{}"):
    return InvestimentoExterno(
        id_externo, "CDB Banco X", "FIXED_INCOME", "CDB", Dinheiro(centavos), dados
    )


def _usuario(uow, nome="Ana"):
    usuario = Usuario(nome)
    with uow:
        uow.usuarios.garantir(usuario)
        uow.commit()
    return usuario


def test_salva_e_lista_a_posicao_com_todos_os_campos(uow):
    usuario = _usuario(uow)
    with uow:
        uow.investimentos.salvar_posicao(usuario.id, _cdb(dados='{"owner": "Ana"}'))
        uow.commit()

    with uow:
        [posicao] = uow.investimentos.listar(usuario.id)

    assert posicao == _cdb(dados='{"owner": "Ana"}')


def test_salvar_de_novo_atualiza_em_vez_de_duplicar(uow):
    usuario = _usuario(uow)
    for centavos in (100, 250):
        with uow:
            uow.investimentos.salvar_posicao(usuario.id, _cdb(centavos=centavos))
            uow.commit()

    with uow:
        [posicao] = uow.investimentos.listar(usuario.id)

    assert posicao.saldo == Dinheiro(250)


def test_cada_usuario_enxerga_so_as_proprias_posicoes(uow):
    ana, bia = _usuario(uow, "Ana"), _usuario(uow, "Bia")
    with uow:
        uow.investimentos.salvar_posicao(ana.id, _cdb())
        uow.commit()

    with uow:
        assert uow.investimentos.listar(bia.id) == []
        # O mesmo id externo em outro usuário é outra posição.
        uow.investimentos.salvar_posicao(bia.id, _cdb(centavos=5))
        uow.commit()
        assert [p.saldo for p in uow.investimentos.listar(ana.id)] == [Dinheiro(200010)]


def test_usuario_inexistente_relanca_integrity_error(uow):
    with pytest.raises(IntegrityError), uow:
        uow.investimentos.salvar_posicao(uuid4(), _cdb())
        uow.commit()


def test_saldo_inicial_sem_conta_pertence_ao_dono_do_investimento_e_nao_soma_na_meta(uow):
    ana, bia = _usuario(uow, "Ana"), _usuario(uow, "Bia")
    conta = Conta(ana.id, "Banco", Dinheiro(0))
    dia = date(2026, 10, 22)
    with uow:
        uow.contas.adicionar(conta)
        uow.investimentos.salvar_posicao(ana.id, _cdb())
        uow.commit()
    with uow:
        [investimento] = uow.investimentos.listar_posicoes(ana.id)
    saldo_inicial = MovimentoDeInvestimento.de_saldo_inicial(investimento.id, Dinheiro(700), dia)
    aporte = MovimentoDeInvestimento(conta.id, TipoDeMovimento.APORTE, Dinheiro(300), "CDB", dia)
    with uow:
        uow.movimentos_de_investimento.adicionar(saldo_inicial)
        uow.movimentos_de_investimento.adicionar(aporte)
        uow.destinacoes.adicionar(saldo_inicial.id, [ParteDeDestinacao(Tag("casa"), Dinheiro(700))])
        uow.commit()

    with uow:
        lido = uow.movimentos_de_investimento.obter(ana.id, saldo_inicial.id)
        assert lido is not None
        assert (lido.conta_id, lido.origem) == (None, OrigemDoMovimento.SALDO_INICIAL)
        assert {m.id for m in uow.movimentos_de_investimento.listar(ana.id, dia, dia)} == {
            saldo_inicial.id,
            aporte.id,
        }
        assert uow.movimentos_de_investimento.somar_aportes(ana.id, dia, dia) == Dinheiro(300)
        assert uow.movimentos_de_investimento.obter(bia.id, saldo_inicial.id) is None
        assert uow.movimentos_de_investimento.listar(bia.id, dia, dia) == []
        assert uow.movimentos_de_investimento.investimentos_com_movimento(ana.id) == {
            investimento.id
        }


def test_a_taxa_vem_do_registro_guardado_da_instituicao(uow):
    usuario = _usuario(uow)
    registro = '{"rate": 101.2, "rateType": "CDI", "fixedAnnualRate": 0}'
    with uow:
        uow.investimentos.salvar_posicao(usuario.id, _cdb("i1", dados=registro))
        uow.investimentos.salvar_posicao(usuario.id, _cdb("i2", dados="isto não é json"))
        uow.commit()

    with uow:
        taxas = {p.id_externo: p.taxa for p in uow.investimentos.listar_posicoes(usuario.id)}

    assert str(taxas["i1"].percentual) == "101.2"
    assert (taxas["i1"].indexador, taxas["i1"].adicional_anual) == ("CDI", None)
    assert taxas["i2"] is None


@pytest.mark.parametrize("tipo", ["vazio", "posicao", "movimento", "saldo_inicial"])
def test_existe_algum_considera_o_dono_da_conta_ou_do_saldo_inicial(uow, tipo):
    usuario, outra = _usuario(uow), _usuario(uow, "Bia")
    with uow:
        if tipo in ["posicao", "saldo_inicial"]:
            uow.investimentos.salvar_posicao(usuario.id, _cdb())
            investimento = uow.investimentos.listar_posicoes(usuario.id)[0]
            if tipo == "saldo_inicial":
                uow.movimentos_de_investimento.adicionar(
                    MovimentoDeInvestimento.de_saldo_inicial(
                        investimento.id, Dinheiro(100), date(2026, 10, 5)
                    )
                )
        if tipo == "movimento":
            conta = Conta(usuario.id, "Banco exemplo", Dinheiro(0))
            uow.contas.adicionar(conta)
            uow.movimentos_de_investimento.adicionar(
                MovimentoDeInvestimento(
                    conta.id, TipoDeMovimento.APORTE, Dinheiro(100), "Exemplo", date(2026, 10, 5)
                )
            )
        uow.commit()
    with uow:
        assert uow.investimentos.existe_algum(usuario.id) is (tipo in ["posicao", "saldo_inicial"])
        assert uow.movimentos_de_investimento.existe_algum(usuario.id) is (
            tipo in ["movimento", "saldo_inicial"]
        )
        assert uow.investimentos.existe_algum(outra.id) is False
        assert uow.movimentos_de_investimento.existe_algum(outra.id) is False


def test_principais_usa_o_principal_abatido_e_cai_no_valor_nas_linhas_antigas(uow):
    ana = _usuario(uow)
    conta = Conta(ana.id, "Carteira", Dinheiro(0))
    dia = date(2026, 10, 10)
    with uow:
        uow.contas.adicionar(conta)
        uow.investimentos.salvar_posicao(ana.id, _cdb())
        uow.commit()
    with uow:
        [investimento] = uow.investimentos.listar_posicoes(ana.id)
    aporte = MovimentoDeInvestimento(
        conta.id,
        TipoDeMovimento.APORTE,
        Dinheiro(1000),
        "CDB",
        dia,
        investimento_id=investimento.id,
    )
    antigo = MovimentoDeInvestimento(
        conta.id,
        TipoDeMovimento.RESGATE,
        Dinheiro(100),
        "CDB",
        dia,
        investimento_id=investimento.id,
    )
    novo = MovimentoDeInvestimento(
        conta.id,
        TipoDeMovimento.RESGATE,
        Dinheiro(220),
        "CDB",
        dia,
        investimento_id=investimento.id,
    )
    casa = Tag("casa")
    with uow:
        for m in (aporte, antigo, novo):
            uow.movimentos_de_investimento.adicionar(m)
        uow.destinacoes.adicionar(aporte.id, [ParteDeDestinacao(casa, Dinheiro(1000))])
        # Linha antiga: sem principal, abate o próprio valor (100).
        uow.destinacoes.adicionar(antigo.id, [ParteDeDestinacao(casa, Dinheiro(-100))])
        # Linha nova: saem 220 em dinheiro, mas só 200 de principal.
        uow.destinacoes.adicionar(
            novo.id, [ParteDeDestinacao(casa, Dinheiro(-220), Dinheiro(-200))]
        )
        uow.commit()

    with uow:
        principais = uow.destinacoes.principais(ana.id)
        partes = uow.destinacoes.do_movimento([novo.id])

    assert principais[investimento.id] == {casa: Dinheiro(700)}
    assert partes[novo.id] == [(casa, Dinheiro(-220))]


def test_saldo_antes_de_le_o_ultimo_ponto_anterior_e_isola_usuarios(uow):
    ana, bia = _usuario(uow, "Ana"), _usuario(uow, "Bia")
    with uow:
        uow.investimentos.salvar_posicao(ana.id, _cdb(centavos=1000), date(2026, 10, 1))
        uow.investimentos.salvar_posicao(ana.id, _cdb(centavos=2000), date(2026, 10, 5))
        uow.commit()
    with uow:
        id_da_ana = uow.investimentos.listar_posicoes(ana.id)[0].id
        repo = uow.investimentos
        assert repo.saldo_antes_de(ana.id, id_da_ana, date(2026, 10, 5)) == Dinheiro(1000)
        assert repo.saldo_antes_de(ana.id, id_da_ana, date(2026, 10, 6)) == Dinheiro(2000)
        assert repo.saldo_antes_de(ana.id, id_da_ana, date(2026, 10, 1)) is None
        assert repo.saldo_antes_de(bia.id, id_da_ana, date(2026, 10, 6)) is None
        assert repo.saldo_antes_de(ana.id, uuid4(), date(2026, 10, 6)) is None


def test_emissor_vencimento_codigo_e_situacao_vem_do_registro_guardado(uow):
    usuario = _usuario(uow)
    registro = (
        '{"issuer": "BANCO GUANABARA S/A", "dueDate": "2026-10-26T00:00:00.000Z",'
        ' "code": "CDB5250LP3Q", "status": "TOTAL_WITHDRAWAL"}'
    )
    with uow:
        uow.investimentos.salvar_posicao(usuario.id, _cdb("i1", dados=registro))
        uow.investimentos.salvar_posicao(usuario.id, _cdb("i2", dados='{"dueDate": "ruim"}'))
        uow.commit()

    with uow:
        lidos = {p.id_externo: p for p in uow.investimentos.listar_posicoes(usuario.id)}
        unico = uow.investimentos.obter(usuario.id, lidos["i1"].id)

    assert lidos["i1"].emissor == "BANCO GUANABARA S/A"
    assert lidos["i1"].vencimento == date(2026, 10, 26)
    assert (lidos["i1"].codigo, lidos["i1"].situacao) == ("CDB5250LP3Q", "TOTAL_WITHDRAWAL")
    assert unico.vencimento == date(2026, 10, 26)
    assert lidos["i2"].vencimento is None and lidos["i2"].emissor is None


def test_saldos_iniciais_do_investimento_sao_so_os_do_dono_e_do_investimento(uow):
    ana, bia = _usuario(uow, "Ana"), _usuario(uow, "Bia")
    with uow:
        uow.investimentos.salvar_posicao(ana.id, _cdb("i1"))
        uow.investimentos.salvar_posicao(ana.id, _cdb("i2"))
        uow.commit()
    with uow:
        primeiro, segundo = uow.investimentos.listar_posicoes(ana.id)
    dia = date(2026, 10, 12)
    inicial = MovimentoDeInvestimento.de_saldo_inicial(primeiro.id, Dinheiro(700), dia)
    outro = MovimentoDeInvestimento.de_saldo_inicial(segundo.id, Dinheiro(50), dia)
    with uow:
        uow.movimentos_de_investimento.adicionar(inicial)
        uow.movimentos_de_investimento.adicionar(outro)
        uow.commit()
    with uow:
        achados = uow.movimentos_de_investimento.saldos_iniciais_do_investimento(
            ana.id, primeiro.id
        )
        assert [m.id for m in achados] == [inicial.id]
        assert (
            uow.movimentos_de_investimento.saldos_iniciais_do_investimento(bia.id, primeiro.id)
            == []
        )


def test_aporte_de_caixinha_nao_entra_na_soma_de_aportes_do_mes(uow):
    ana = _usuario(uow, "Ana")
    conta = Conta(ana.id, "Banco", Dinheiro(0))
    caixinha = InvestimentoExterno(
        "caixinha:x", "Conta remunerada", "CAIXINHA", None, Dinheiro(1000), "{}"
    )
    dia = date(2026, 11, 5)
    with uow:
        uow.contas.adicionar(conta)
        uow.investimentos.salvar_posicao(ana.id, _cdb())
        uow.investimentos.salvar_posicao(ana.id, caixinha)
        uow.commit()
    with uow:
        posicoes = {p.tipo: p for p in uow.investimentos.listar_posicoes(ana.id)}
    para_cdb = MovimentoDeInvestimento(
        conta.id,
        TipoDeMovimento.APORTE,
        Dinheiro(300),
        "CDB",
        dia,
        investimento_id=posicoes["FIXED_INCOME"].id,
    )
    para_caixinha = MovimentoDeInvestimento(
        conta.id,
        TipoDeMovimento.APORTE,
        Dinheiro(95645),
        "CONTA REMUNERADA - APLICAÇÃO",
        dia,
        investimento_id=posicoes["CAIXINHA"].id,
    )
    sem_vinculo = MovimentoDeInvestimento(
        conta.id, TipoDeMovimento.APORTE, Dinheiro(50), "Aplicação", dia
    )
    with uow:
        for movimento in (para_cdb, para_caixinha, sem_vinculo):
            uow.movimentos_de_investimento.adicionar(movimento)
        uow.commit()
    with uow:
        total = uow.movimentos_de_investimento.somar_aportes(ana.id, dia, dia)
    assert total == Dinheiro(350)
