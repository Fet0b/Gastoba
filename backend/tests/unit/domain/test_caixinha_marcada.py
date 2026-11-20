from datetime import date
from uuid import uuid4

import pytest

from gastoba.domain.caixinha_marcada import (
    LIMITE_DE_CAIXINHAS_MARCADAS,
    CaixinhaMarcada,
    GuardadoNasMetas,
    guardado_por_categoria,
    percentual_guardado,
)
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import CategoriaInvalida, GuardadoInvalido
from gastoba.domain.movimento_de_investimento import (
    MovimentoDeInvestimento,
    OrigemDoMovimento,
    TipoDeMovimento,
)
from gastoba.domain.tag import Tag

CONFORTO = CategoriaDoGasto.CONFORTO
LAZER = CategoriaDoGasto.LAZER


def _marca(categoria, tag):
    return CaixinhaMarcada(categoria, Tag.de_texto(tag))


def test_categoria_ativa_e_lista_vazia_sao_validas():
    assert GuardadoNasMetas(True, ()).marcacoes == ()
    assert GuardadoNasMetas(False, (_marca(CONFORTO, "computador"),)).ativo is False


def test_categoria_legada_e_recusada():
    with pytest.raises(CategoriaInvalida):
        _marca(CategoriaDoGasto.INVESTIMENTOS, "computador")


def test_tag_repetida_e_recusada_mesmo_em_outra_categoria():
    with pytest.raises(GuardadoInvalido):
        GuardadoNasMetas(True, (_marca(CONFORTO, "computador"), _marca(LAZER, "computador")))


def test_no_maximo_vinte_marcacoes():
    ok = tuple(_marca(CONFORTO, f"tag{i}") for i in range(LIMITE_DE_CAIXINHAS_MARCADAS))
    assert len(GuardadoNasMetas(True, ok).marcacoes) == 20
    with pytest.raises(GuardadoInvalido):
        GuardadoNasMetas(True, (*ok, _marca(CONFORTO, "tag20")))


def _mov(tipo, valor, dia=10, origem=OrigemDoMovimento.OPEN_FINANCE):
    return MovimentoDeInvestimento(
        None if origem is OrigemDoMovimento.SALDO_INICIAL else uuid4(),
        tipo,
        Dinheiro(valor),
        "Exemplo",
        date(2026, 11, dia),
        investimento_id=uuid4(),
        origem=origem,
    )


def _partes(*itens):
    return tuple((Tag.de_texto(t), Dinheiro(v)) for t, v in itens)


def test_aporte_soma_e_resgate_subtrai_o_valor_absoluto_da_parte():
    marcacoes = (_marca(CONFORTO, "computador"),)
    movimentos = [
        (_mov(TipoDeMovimento.APORTE, 30000), _partes(("computador", 30000))),
        # o sinal gravado do resgate é negativo; vale o tipo do movimento
        (_mov(TipoDeMovimento.RESGATE, 5000), _partes(("computador", -5000))),
    ]
    resultado = guardado_por_categoria(movimentos, marcacoes)
    assert resultado[CONFORTO].valor == Dinheiro(25000)
    assert resultado[CONFORTO].tags == (Tag.de_texto("computador"),)


def test_aporte_dividido_conta_so_a_parte_da_caixinha_marcada():
    movimentos = [
        (
            _mov(TipoDeMovimento.APORTE, 30000),
            _partes(("computador", 10000), ("reserva", 20000)),
        )
    ]
    resultado = guardado_por_categoria(movimentos, (_marca(CONFORTO, "computador"),))
    assert resultado[CONFORTO].valor == Dinheiro(10000)


def test_duas_caixinhas_somam_e_listam_em_ordem_alfabetica():
    movimentos = [
        (_mov(TipoDeMovimento.APORTE, 30000), _partes(("viagem", 10000), ("computador", 20000)))
    ]
    marcacoes = (_marca(CONFORTO, "viagem"), _marca(CONFORTO, "computador"))
    resultado = guardado_por_categoria(movimentos, marcacoes)
    assert resultado[CONFORTO].valor == Dinheiro(30000)
    assert resultado[CONFORTO].tags == (Tag.de_texto("computador"), Tag.de_texto("viagem"))


def test_saldo_inicial_nao_conta():
    movimentos = [
        (
            _mov(TipoDeMovimento.APORTE, 90000, origem=OrigemDoMovimento.SALDO_INICIAL),
            _partes(("computador", 90000)),
        )
    ]
    assert guardado_por_categoria(movimentos, (_marca(CONFORTO, "computador"),)) == {}


def test_resgate_maior_que_os_aportes_da_zero_e_a_categoria_some():
    movimentos = [
        (_mov(TipoDeMovimento.APORTE, 1000), _partes(("computador", 1000))),
        (_mov(TipoDeMovimento.RESGATE, 5000), _partes(("computador", -5000))),
    ]
    assert guardado_por_categoria(movimentos, (_marca(CONFORTO, "computador"),)) == {}


def test_movimento_sem_parte_marcada_e_outros_tipos_nao_contam():
    movimentos = [
        (_mov(TipoDeMovimento.APORTE, 1000), _partes(("outra", 1000))),
        (_mov(TipoDeMovimento.APORTE, 1000), ()),
    ]
    assert guardado_por_categoria(movimentos, (_marca(CONFORTO, "computador"),)) == {}


def test_categorias_separadas():
    movimentos = [
        (_mov(TipoDeMovimento.APORTE, 3000), _partes(("computador", 1000), ("viagem", 2000)))
    ]
    marcacoes = (_marca(CONFORTO, "computador"), _marca(LAZER, "viagem"))
    resultado = guardado_por_categoria(movimentos, marcacoes)
    assert resultado[CONFORTO].valor == Dinheiro(1000)
    assert resultado[LAZER].valor == Dinheiro(2000)


def test_percentual_do_exemplo_da_spec():
    assert percentual_guardado(Dinheiro(30000), Dinheiro(100000)) == 30


def test_percentual_com_limite_zero_e_zero():
    assert percentual_guardado(Dinheiro(30000), Dinheiro(0)) == 0


def test_percentual_positivo_abaixo_de_um_por_cento_vira_um():
    assert percentual_guardado(Dinheiro(1), Dinheiro(100000)) == 1


def test_percentual_de_guardado_zero_e_zero():
    assert percentual_guardado(Dinheiro(0), Dinheiro(100000)) == 0
