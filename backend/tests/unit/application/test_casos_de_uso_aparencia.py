from uuid import uuid4

import pytest

from gastoba.application.consultar_aparencia import ConsultarAparencia
from gastoba.application.definir_aparencia import DefinirAparencia
from gastoba.application.restaurar_aparencia import RestaurarAparencia
from gastoba.domain.aparencia import Aparencia, IntensidadeDaCor, MarcaDoApp, TexturaDoFundo
from gastoba.domain.excecoes import AparenciaInvalida


def _definir(uow, usuario_id, **mudancas):
    escolhas = {
        "matiz": 120,
        "intensidade": IntensidadeDaCor.VIVA,
        "textura": TexturaDoFundo.PONTOS,
        "nome": "  Meu bolso ",
        "marca": MarcaDoApp.MOEDA,
    }
    return DefinirAparencia(uow).executar(usuario_id, **{**escolhas, **mudancas})


def test_sem_aparencia_salva_devolve_o_padrao_sem_gravar(unidade_de_trabalho):
    assert ConsultarAparencia(unidade_de_trabalho).executar(uuid4()) == Aparencia.padrao()
    assert unidade_de_trabalho.commits == 0


def test_define_apara_o_nome_e_consulta(unidade_de_trabalho):
    usuario_id = uuid4()
    salva = _definir(unidade_de_trabalho, usuario_id)
    assert salva.nome == "Meu bolso"
    assert ConsultarAparencia(unidade_de_trabalho).executar(usuario_id) == salva
    outra = _definir(unidade_de_trabalho, usuario_id, matiz=10)
    assert ConsultarAparencia(unidade_de_trabalho).executar(usuario_id) == outra
    assert ConsultarAparencia(unidade_de_trabalho).executar(uuid4()) == Aparencia.padrao()


def test_valor_invalido_nao_grava(unidade_de_trabalho):
    usuario_id = uuid4()
    with pytest.raises(AparenciaInvalida):
        _definir(unidade_de_trabalho, usuario_id, nome="   ")
    with pytest.raises(AparenciaInvalida):
        _definir(unidade_de_trabalho, usuario_id, matiz=360)
    assert unidade_de_trabalho.confirmado.aparencias == {}


def test_restaurar_e_idempotente(unidade_de_trabalho):
    usuario_id = uuid4()
    _definir(unidade_de_trabalho, usuario_id)
    RestaurarAparencia(unidade_de_trabalho).executar(usuario_id)
    RestaurarAparencia(unidade_de_trabalho).executar(usuario_id)
    assert ConsultarAparencia(unidade_de_trabalho).executar(usuario_id) == Aparencia.padrao()
