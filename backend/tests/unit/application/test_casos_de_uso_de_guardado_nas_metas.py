from uuid import uuid4

import pytest

from gastoba.application.consultar_guardado_nas_metas import ConsultarGuardadoNasMetas
from gastoba.application.definir_guardado_nas_metas import DefinirGuardadoNasMetas
from gastoba.domain.caixinha_marcada import CaixinhaMarcada, GuardadoNasMetas
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.excecoes import CategoriaInvalida, GuardadoInvalido
from gastoba.domain.tag import Tag

CONFORTO = CategoriaDoGasto.CONFORTO


def _cadastrar(unidade, usuario_id, *tags):
    for t in tags:
        unidade.confirmado.destinacoes_cadastradas.add((usuario_id, Tag.de_texto(t)))


def _marca(tag, categoria=CONFORTO):
    return CaixinhaMarcada(categoria, Tag.de_texto(tag))


def test_sem_configuracao_devolve_desligado_sem_gravar(unidade_de_trabalho):
    guardado = ConsultarGuardadoNasMetas(unidade_de_trabalho).executar(uuid4())
    assert guardado == GuardadoNasMetas(False, ())
    assert unidade_de_trabalho.commits == 0


def test_define_consulta_e_troca_o_conjunto_inteiro(unidade_de_trabalho):
    pessoa = uuid4()
    _cadastrar(unidade_de_trabalho, pessoa, "computador", "viagem")
    definir = DefinirGuardadoNasMetas(unidade_de_trabalho)
    definir.executar(pessoa, True, (_marca("computador"),))
    definir.executar(pessoa, True, (_marca("viagem", CategoriaDoGasto.LAZER),))
    guardado = ConsultarGuardadoNasMetas(unidade_de_trabalho).executar(pessoa)
    assert guardado == GuardadoNasMetas(True, (_marca("viagem", CategoriaDoGasto.LAZER),))


def test_desligar_preserva_as_marcacoes(unidade_de_trabalho):
    pessoa = uuid4()
    _cadastrar(unidade_de_trabalho, pessoa, "computador")
    definir = DefinirGuardadoNasMetas(unidade_de_trabalho)
    definir.executar(pessoa, True, (_marca("computador"),))
    definir.executar(pessoa, False, (_marca("computador"),))
    guardado = ConsultarGuardadoNasMetas(unidade_de_trabalho).executar(pessoa)
    assert guardado == GuardadoNasMetas(False, (_marca("computador"),))


def test_tag_inexistente_ou_de_outra_pessoa_e_recusada_sem_gravar(unidade_de_trabalho):
    pessoa, outra = uuid4(), uuid4()
    _cadastrar(unidade_de_trabalho, outra, "computador")
    with pytest.raises(GuardadoInvalido):
        DefinirGuardadoNasMetas(unidade_de_trabalho).executar(pessoa, True, (_marca("computador"),))
    assert unidade_de_trabalho.confirmado.guardados_nas_metas == {}


def test_destinacao_apagada_some_da_resposta(unidade_de_trabalho):
    pessoa = uuid4()
    _cadastrar(unidade_de_trabalho, pessoa, "computador", "viagem")
    DefinirGuardadoNasMetas(unidade_de_trabalho).executar(
        pessoa, True, (_marca("computador"), _marca("viagem"))
    )
    unidade_de_trabalho.confirmado.destinacoes_cadastradas.discard((pessoa, Tag.de_texto("viagem")))
    guardado = ConsultarGuardadoNasMetas(unidade_de_trabalho).executar(pessoa)
    assert guardado.marcacoes == (_marca("computador"),)


def test_dominio_valida_repeticao(unidade_de_trabalho):
    pessoa = uuid4()
    _cadastrar(unidade_de_trabalho, pessoa, "computador")
    with pytest.raises(GuardadoInvalido):
        DefinirGuardadoNasMetas(unidade_de_trabalho).executar(
            pessoa, True, (_marca("computador"), _marca("computador", CategoriaDoGasto.LAZER))
        )


def test_categoria_legada_e_recusada():
    with pytest.raises(CategoriaInvalida):
        _marca("computador", CategoriaDoGasto.INVESTIMENTOS)
