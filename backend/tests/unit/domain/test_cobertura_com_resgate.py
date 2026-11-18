from datetime import date
from uuid import uuid4

import pytest

from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.cobertura_de_compra import validar_cobertura_com_resgate
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import CategoriaInvalida, CoberturaInvalida, CoberturaJaExiste
from gastoba.domain.gasto import Gasto
from gastoba.domain.tag import Tag

TAG = Tag("computador")


def _gasto(valor=420000):
    return Gasto(
        uuid4(), Dinheiro(valor), "Computador", date(2026, 11, 5), CategoriaDoGasto.CONFORTO, ()
    )


def _validar(valor, **kw):
    base = dict(
        gasto=_gasto(),
        tag=TAG,
        valor=Dinheiro(valor),
        movimento_id=uuid4(),
        coberto_do_gasto=Dinheiro(0),
        tags_ja_cobertas=frozenset(),
        resgate_da_tag=Dinheiro(370000),
        principal_do_resgate_da_tag=Dinheiro(350000),
        ja_usado_do_resgate=Dinheiro(0),
        reservado=Dinheiro(350000),
        principal_ja_usado_na_reserva=Dinheiro(0),
    )
    base.update(kw)
    return validar_cobertura_com_resgate(**base)


def test_cobre_o_resgate_inteiro_com_rendimento():
    c = _validar(370000)
    assert c.valor == Dinheiro(370000)
    assert c.principal == Dinheiro(350000)
    assert c.movimento_id is not None


def test_cobertura_parcial_abate_principal_proporcional_truncado():
    assert _validar(185001).principal == Dinheiro(350000 * 185001 // 370000)


@pytest.mark.parametrize("valor", [0, -1, 370001, 420001])
def test_valor_fora_dos_limites(valor):
    with pytest.raises(CoberturaInvalida):
        _validar(valor)


def test_nao_passa_do_restante_da_compra():
    with pytest.raises(CoberturaInvalida):
        _validar(100, gasto=_gasto(150), coberto_do_gasto=Dinheiro(100))


def test_nao_passa_do_saldo_ainda_livre_do_resgate():
    with pytest.raises(CoberturaInvalida):
        _validar(1000, ja_usado_do_resgate=Dinheiro(369500))


def test_dinheiro_guardado_antes_do_vinculo_nao_eleva_o_limite():
    with pytest.raises(CoberturaInvalida):
        _validar(370000, reservado=Dinheiro(0))


def test_principal_ja_usado_na_reserva_conta():
    with pytest.raises(CoberturaInvalida):
        _validar(370000, principal_ja_usado_na_reserva=Dinheiro(1000))


def test_resgate_sem_valor_na_tag():
    with pytest.raises(CoberturaInvalida):
        _validar(1, resgate_da_tag=Dinheiro(0))


def test_tag_ja_cobre_a_compra():
    with pytest.raises(CoberturaJaExiste):
        _validar(1, tags_ja_cobertas=frozenset([TAG]))


def test_categoria_legada_e_recusada():
    g = _gasto()
    g.categoria = CategoriaDoGasto.INVESTIMENTOS
    with pytest.raises(CategoriaInvalida):
        _validar(1, gasto=g)


def test_progresso_da_meta_bruto_mais_adicional_sem_mudar_a_situacao():
    from gastoba.domain.meta import AlvoDaMeta, ProgressoDaMeta

    p = ProgressoDaMeta(
        AlvoDaMeta.CONFORTO,
        18,
        renda=Dinheiro(530000),
        gasto=Dinheiro(50000),
        adicional=Dinheiro(370000),
    )
    assert p.limite == Dinheiro(95400)
    assert p.gasto_bruto == Dinheiro(420000)
    assert p.restante == Dinheiro(45400)
    assert (p.percentual_usado, p.situacao.value) == (52, "dentro")
