from datetime import date
from decimal import Decimal
from uuid import uuid4

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.investimento import Investimento
from gastoba.domain.rotulo_do_investimento import normalizar_nome, rotulos_dos_investimentos
from gastoba.domain.taxa_do_investimento import TaxaDoInvestimento


def _cdb(nome="CDB - BANCO INTER S.A", vencimento=None, taxa=None, **kw):
    return Investimento(
        id=uuid4(),
        id_externo=str(uuid4()),
        nome=nome,
        tipo="FIXED_INCOME",
        subtipo="CDB",
        saldo=Dinheiro(10000),
        vencimento=vencimento,
        taxa=taxa,
        **kw,
    )


def test_nome_sem_caixa_alta_crua_nem_sufixo_societario():
    assert normalizar_nome("CDB - BANCO INTER S.A") == "CDB Inter"
    assert normalizar_nome("CDB - BANCO GUANABARA S/A") == "CDB Guanabara"
    assert normalizar_nome("LCI BTG") == "LCI BTG"
    assert normalizar_nome("AUPO11") == "AUPO11"
    assert normalizar_nome("Tesouro Selic 2029") == "Tesouro Selic 2029"  # já normalizado


def test_inclui_vencimento_e_taxa_quando_ha():
    taxa = TaxaDoInvestimento(Decimal("101.2"), "CDI", None)
    rotulo = rotulos_dos_investimentos([_cdb(vencimento=date(2028, 10, 1), taxa=taxa)])
    (texto,) = rotulo.values()
    assert texto == "CDB Inter, vence 10/2028, 101,2% CDI"


def test_44_cdbs_do_mesmo_banco_ficam_distinguiveis():
    iguais = [_cdb() for _ in range(44)]
    rotulos = rotulos_dos_investimentos(iguais)
    assert len(set(rotulos.values())) == 44


def test_rotulo_e_determinstico_e_estavel_entre_chamadas():
    lista = [_cdb(), _cdb(), _cdb(vencimento=date(2027, 1, 1))]
    assert rotulos_dos_investimentos(lista) == rotulos_dos_investimentos(list(reversed(lista)))


def test_vencimentos_diferentes_ja_distinguem_sem_sufixo():
    a, b = _cdb(vencimento=date(2027, 1, 1)), _cdb(vencimento=date(2028, 1, 1))
    rotulos = rotulos_dos_investimentos([a, b])
    assert rotulos[a.id] != rotulos[b.id]
    assert "final" not in rotulos[a.id]


def test_nunca_usa_separador_com_ponto_do_meio():
    for texto in rotulos_dos_investimentos([_cdb(), _cdb()]).values():
        assert "·" not in texto
