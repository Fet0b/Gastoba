import pytest

from gastoba.domain.aparencia import (
    Aparencia,
    IntensidadeDaCor,
    MarcaDoApp,
    TexturaDoFundo,
)
from gastoba.domain.excecoes import AparenciaInvalida


def _fazer(**mudancas):
    base = {
        "matiz": 120,
        "intensidade": IntensidadeDaCor.VIVA,
        "textura": TexturaDoFundo.GRADE,
        "nome": "Meu bolso",
        "marca": MarcaDoApp.MOEDA,
    }
    return Aparencia(**{**base, **mudancas})


def test_padrao_e_o_roxo_original():
    padrao = Aparencia.padrao()
    assert padrao.matiz == 258
    assert padrao.intensidade is IntensidadeDaCor.MEDIA
    assert padrao.textura is TexturaDoFundo.NENHUMA
    assert padrao.nome == "Gastoba"
    assert padrao.marca is MarcaDoApp.OLHO


@pytest.mark.parametrize("matiz", [0, 1, 180, 359])
def test_aceita_matiz_do_espectro(matiz):
    assert _fazer(matiz=matiz).matiz == matiz


@pytest.mark.parametrize("matiz", [-1, 360, 1000, True, 1.5])
def test_recusa_matiz_fora_do_espectro(matiz):
    with pytest.raises(AparenciaInvalida):
        _fazer(matiz=matiz)


def test_de_escolhas_apara_o_nome():
    assert (
        Aparencia.de_escolhas(
            10, IntensidadeDaCor.SUAVE, TexturaDoFundo.NENHUMA, "  Meu bolso  ", MarcaDoApp.FOLHA
        ).nome
        == "Meu bolso"
    )


@pytest.mark.parametrize("nome", ["", "   ", "x" * 21, "a\tb", "a\nb", " Meu"])
def test_recusa_nome_invalido(nome):
    with pytest.raises(AparenciaInvalida):
        _fazer(nome=nome)


def test_de_escolhas_recusa_so_espacos():
    with pytest.raises(AparenciaInvalida):
        Aparencia.de_escolhas(
            10, IntensidadeDaCor.SUAVE, TexturaDoFundo.NENHUMA, "   ", MarcaDoApp.FOLHA
        )


def test_aceita_vinte_caracteres_e_emoji():
    assert _fazer(nome="x" * 20).nome == "x" * 20
    assert _fazer(nome="Cofrinho 🐷").nome == "Cofrinho 🐷"
    assert len(_fazer(nome="🐷" * 20).nome) == 20


def test_catalogos_fixos():
    assert [m.value for m in MarcaDoApp] == [
        "olho",
        "inicial",
        "moeda",
        "cofre",
        "folha",
        "grafico",
    ]
    assert [t.value for t in TexturaDoFundo] == ["nenhuma", "pontos", "linhas", "grade", "grao"]
    assert [i.value for i in IntensidadeDaCor] == ["suave", "media", "viva"]
