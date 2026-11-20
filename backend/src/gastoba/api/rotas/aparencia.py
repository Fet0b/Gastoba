from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from gastoba.api.dependencias import (
    obter_definir_aparencia,
    obter_restaurar_aparencia,
    obter_usuario_atual,
)
from gastoba.api.esquemas import (
    AparenciaResposta,
    DefinirAparenciaRequisicao,
    OpcaoDeAparenciaResposta,
    OpcoesDeAparenciaResposta,
    RespostaDeErro,
    aparencia_para_resposta,
)
from gastoba.application.definir_aparencia import DefinirAparencia
from gastoba.application.restaurar_aparencia import RestaurarAparencia
from gastoba.domain.aparencia import IntensidadeDaCor, MarcaDoApp, TexturaDoFundo
from gastoba.domain.usuario import Usuario

roteador = APIRouter(tags=["aparencia"])

_ERRO = {"model": RespostaDeErro}
_RESPOSTAS_DE_ERRO = {401: _ERRO, 403: _ERRO, 422: _ERRO}

_NOMES_DAS_INTENSIDADES = {
    IntensidadeDaCor.SUAVE: "Suave",
    IntensidadeDaCor.MEDIA: "Média",
    IntensidadeDaCor.VIVA: "Viva",
}
_NOMES_DAS_TEXTURAS = {
    TexturaDoFundo.NENHUMA: "Nenhuma",
    TexturaDoFundo.PONTOS: "Pontos",
    TexturaDoFundo.LINHAS: "Linhas",
    TexturaDoFundo.GRADE: "Grade",
    TexturaDoFundo.GRAO: "Grão",
}
_NOMES_DAS_MARCAS = {
    MarcaDoApp.OLHO: "Olho",
    MarcaDoApp.INICIAL: "Inicial do nome",
    MarcaDoApp.MOEDA: "Moeda",
    MarcaDoApp.COFRE: "Cofre",
    MarcaDoApp.FOLHA: "Folha",
    MarcaDoApp.GRAFICO: "Gráfico",
}


def _opcoes[E: (IntensidadeDaCor, TexturaDoFundo, MarcaDoApp)](
    tipo: type[E], nomes: dict[E, str]
) -> list[OpcaoDeAparenciaResposta]:
    return [OpcaoDeAparenciaResposta(codigo=e.value, nome=nomes[e]) for e in tipo]


@roteador.get(
    "/aparencia/opcoes", response_model=OpcoesDeAparenciaResposta, responses=_RESPOSTAS_DE_ERRO
)
def listar_opcoes_de_aparencia(
    _usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
) -> OpcoesDeAparenciaResposta:
    return OpcoesDeAparenciaResposta(
        intensidades=_opcoes(IntensidadeDaCor, _NOMES_DAS_INTENSIDADES),
        texturas=_opcoes(TexturaDoFundo, _NOMES_DAS_TEXTURAS),
        marcas=_opcoes(MarcaDoApp, _NOMES_DAS_MARCAS),
    )


@roteador.put("/aparencia", response_model=AparenciaResposta, responses=_RESPOSTAS_DE_ERRO)
def definir_aparencia(
    requisicao: DefinirAparenciaRequisicao,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[DefinirAparencia, Depends(obter_definir_aparencia)],
) -> AparenciaResposta:
    aparencia = caso_de_uso.executar(
        usuario.id,
        requisicao.matiz,
        requisicao.intensidade,
        requisicao.textura,
        requisicao.nome,
        requisicao.marca,
    )
    return aparencia_para_resposta(aparencia)


@roteador.delete(
    "/aparencia",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    responses=_RESPOSTAS_DE_ERRO,
)
def restaurar_aparencia(
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[RestaurarAparencia, Depends(obter_restaurar_aparencia)],
) -> Response:
    caso_de_uso.executar(usuario.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
