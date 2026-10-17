from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from gastoba.api.dependencias import (
    obter_consultar_progresso_das_metas,
    obter_definir_meta,
    obter_listar_metas,
    obter_remover_meta,
    obter_usuario_atual,
)
from gastoba.api.esquemas import (
    DefinirMetaRequisicao,
    MetaResposta,
    ProgressoDaMetaResposta,
    RespostaDeErro,
    ResumoDasMetasResposta,
    dinheiro_para_texto,
)
from gastoba.application.consultar_progresso_das_metas import ConsultarProgressoDasMetas
from gastoba.application.definir_meta import DefinirMeta
from gastoba.application.listar_metas import ListarMetas
from gastoba.application.remover_meta import RemoverMeta
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.mes import Mes
from gastoba.domain.meta import Meta, ProgressoDaMeta
from gastoba.domain.usuario import Usuario

roteador = APIRouter(tags=["metas"])

_ERRO = {"model": RespostaDeErro}
_RESPOSTAS_DE_ERRO = {401: _ERRO, 403: _ERRO, 404: _ERRO, 422: _ERRO}


def _meta_para_resposta(meta: Meta) -> MetaResposta:
    return MetaResposta(categoria=meta.categoria.value, percentual=meta.percentual)


def _progresso_para_resposta(progresso: ProgressoDaMeta) -> ProgressoDaMetaResposta:
    return ProgressoDaMetaResposta(
        categoria=progresso.categoria.value,
        percentual=progresso.percentual,
        limite=dinheiro_para_texto(progresso.limite),
        gasto=dinheiro_para_texto(progresso.gasto),
        restante=dinheiro_para_texto(progresso.restante),
        percentual_usado=progresso.percentual_usado,
        situacao=progresso.situacao.value,
    )


# Rotas síncronas porque os casos de uso fazem I/O bloqueante do SQLAlchemy síncrono.
@roteador.get("/metas", response_model=list[MetaResposta], responses=_RESPOSTAS_DE_ERRO)
def listar_metas(
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[ListarMetas, Depends(obter_listar_metas)],
) -> list[MetaResposta]:
    return [_meta_para_resposta(meta) for meta in caso_de_uso.executar(usuario.id)]


# O mês vem de quem chama (o frontend decide qual é o mês corrente, no fuso local).
@roteador.get(
    "/metas/progresso", response_model=ResumoDasMetasResposta, responses=_RESPOSTAS_DE_ERRO
)
def consultar_progresso_das_metas(
    mes: str,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[
        ConsultarProgressoDasMetas, Depends(obter_consultar_progresso_das_metas)
    ],
) -> ResumoDasMetasResposta:
    competencia = Mes.de_texto(mes)
    resumo = caso_de_uso.executar(usuario.id, competencia)
    return ResumoDasMetasResposta(
        mes=str(competencia),
        renda=dinheiro_para_texto(resumo.renda),
        metas=[_progresso_para_resposta(p) for p in resumo.progressos],
    )


@roteador.put("/metas/{categoria}", response_model=MetaResposta, responses=_RESPOSTAS_DE_ERRO)
def definir_meta(
    categoria: CategoriaDoGasto,
    requisicao: DefinirMetaRequisicao,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[DefinirMeta, Depends(obter_definir_meta)],
) -> MetaResposta:
    return _meta_para_resposta(caso_de_uso.executar(usuario.id, categoria, requisicao.percentual))


@roteador.delete(
    "/metas/{categoria}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=_RESPOSTAS_DE_ERRO,
)
def remover_meta(
    categoria: CategoriaDoGasto,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[RemoverMeta, Depends(obter_remover_meta)],
) -> Response:
    caso_de_uso.executar(usuario.id, categoria)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
