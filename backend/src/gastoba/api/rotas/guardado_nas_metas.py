from typing import Annotated

from fastapi import APIRouter, Depends

from gastoba.api.dependencias import (
    obter_consultar_guardado_nas_metas,
    obter_definir_guardado_nas_metas,
    obter_usuario_atual,
)
from gastoba.api.esquemas import CaixinhaMarcadaCorpo, GuardadoNasMetasCorpo, RespostaDeErro
from gastoba.application.consultar_guardado_nas_metas import ConsultarGuardadoNasMetas
from gastoba.application.definir_guardado_nas_metas import DefinirGuardadoNasMetas
from gastoba.domain.caixinha_marcada import CaixinhaMarcada, GuardadoNasMetas
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.excecoes import CategoriaInvalida
from gastoba.domain.tag import Tag
from gastoba.domain.usuario import Usuario

roteador = APIRouter(tags=["guardado-nas-metas"])

_ERRO = {"model": RespostaDeErro}
_RESPOSTAS_DE_ERRO = {401: _ERRO, 403: _ERRO, 422: _ERRO}


def _para_resposta(guardado: GuardadoNasMetas) -> GuardadoNasMetasCorpo:
    return GuardadoNasMetasCorpo(
        ativo=guardado.ativo,
        marcacoes=[
            CaixinhaMarcadaCorpo(categoria=m.categoria.value, tag=str(m.tag))
            for m in guardado.marcacoes
        ],
    )


def _marcacao(corpo: CaixinhaMarcadaCorpo) -> CaixinhaMarcada:
    try:
        categoria = CategoriaDoGasto(corpo.categoria)
    except ValueError:
        raise CategoriaInvalida("Escolha uma categoria de gasto ativa.") from None
    return CaixinhaMarcada(categoria, Tag.de_texto(corpo.tag))


@roteador.get(
    "/guardado-nas-metas", response_model=GuardadoNasMetasCorpo, responses=_RESPOSTAS_DE_ERRO
)
def consultar_guardado_nas_metas(
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[ConsultarGuardadoNasMetas, Depends(obter_consultar_guardado_nas_metas)],
) -> GuardadoNasMetasCorpo:
    return _para_resposta(caso_de_uso.executar(usuario.id))


@roteador.put(
    "/guardado-nas-metas", response_model=GuardadoNasMetasCorpo, responses=_RESPOSTAS_DE_ERRO
)
def definir_guardado_nas_metas(
    requisicao: GuardadoNasMetasCorpo,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[DefinirGuardadoNasMetas, Depends(obter_definir_guardado_nas_metas)],
) -> GuardadoNasMetasCorpo:
    marcacoes = [_marcacao(m) for m in requisicao.marcacoes]
    return _para_resposta(caso_de_uso.executar(usuario.id, requisicao.ativo, marcacoes))
