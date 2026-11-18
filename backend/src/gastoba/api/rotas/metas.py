from enum import StrEnum
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from gastoba.api.dependencias import (
    obter_consultar_progresso_das_metas,
    obter_definir_meta,
    obter_listar_historico_de_metas,
    obter_listar_metas,
    obter_remover_meta,
    obter_usuario_atual,
)
from gastoba.api.esquemas import (
    AlvoDaMetaResposta,
    CaixinhaDaMetaResposta,
    DefinirMetaRequisicao,
    HistoricoDeMetaResposta,
    MetaResposta,
    ProgressoDaMetaResposta,
    RespostaDeErro,
    ResumoDasMetasResposta,
    dinheiro_para_texto,
)
from gastoba.application.consultar_progresso_das_metas import ConsultarProgressoDasMetas
from gastoba.application.definir_meta import DefinirMeta
from gastoba.application.listar_historico_de_metas import ListarHistoricoDeMetas
from gastoba.application.listar_metas import ListarMetas
from gastoba.application.remover_meta import RemoverMeta
from gastoba.domain.mes import Mes
from gastoba.domain.meta import AlvoDaMeta, Meta, ProgressoDaMeta
from gastoba.domain.usuario import Usuario

roteador = APIRouter(tags=["metas"])

_ERRO = {"model": RespostaDeErro}
_RESPOSTAS_DE_ERRO = {401: _ERRO, 403: _ERRO, 404: _ERRO, 422: _ERRO}


class CodigoDaMetaNaRota(StrEnum):
    """investimentos é alias obsoleto de liberdade_financeira."""

    LIBERDADE_FINANCEIRA = "liberdade_financeira"
    INVESTIMENTOS = "investimentos"
    LAZER = "lazer"
    CONHECIMENTO = "conhecimento"
    CONFORTO = "conforto"
    GASTO_FIXO = "gasto_fixo"


def alvo_da_rota(codigo: CodigoDaMetaNaRota) -> AlvoDaMeta:
    return (
        AlvoDaMeta.LIBERDADE_FINANCEIRA
        if codigo == CodigoDaMetaNaRota.INVESTIMENTOS
        else AlvoDaMeta(codigo.value)
    )


@roteador.get("/metas/alvos", response_model=list[AlvoDaMetaResposta], responses=_RESPOSTAS_DE_ERRO)
def listar_alvos(
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
) -> list[AlvoDaMetaResposta]:
    return [AlvoDaMetaResposta(codigo=a.value, nome=a.nome) for a in AlvoDaMeta]


def _meta_para_resposta(meta: Meta) -> MetaResposta:
    return MetaResposta(categoria=meta.alvo.value, nome=meta.alvo.nome, percentual=meta.percentual)


def _progresso_para_resposta(progresso: ProgressoDaMeta) -> ProgressoDaMetaResposta:
    return ProgressoDaMetaResposta(
        categoria=progresso.alvo.value,
        nome=progresso.alvo.nome,
        percentual=progresso.percentual,
        limite=dinheiro_para_texto(progresso.limite),
        gasto=dinheiro_para_texto(progresso.gasto),
        restante=dinheiro_para_texto(progresso.restante),
        percentual_usado=progresso.percentual_usado,
        situacao=progresso.situacao.value,
        gasto_bruto=dinheiro_para_texto(progresso.gasto_bruto),
        limite_adicional=dinheiro_para_texto(progresso.adicional),
        caixinhas=[
            CaixinhaDaMetaResposta(
                tag=str(c.tag), valor=dinheiro_para_texto(c.valor), rentabilidade=c.rentabilidade
            )
            for c in progresso.caixinhas
        ],
        rentabilidade=progresso.rentabilidade,
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
        renda_base=dinheiro_para_texto(resumo.renda_base)
        if resumo.renda_base is not None
        else None,
        renda_de_referencia=dinheiro_para_texto(resumo.renda_de_referencia),
        classificacoes_para_revisar=resumo.classificacoes_para_revisar,
        aportes_do_mes=dinheiro_para_texto(resumo.aportes_do_mes),
        metas=[_progresso_para_resposta(p) for p in resumo.progressos],
    )


@roteador.get(
    "/metas/historico", response_model=list[HistoricoDeMetaResposta], responses=_RESPOSTAS_DE_ERRO
)
def listar_historico_de_metas(
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso: Annotated[ListarHistoricoDeMetas, Depends(obter_listar_historico_de_metas)],
) -> list[HistoricoDeMetaResposta]:
    return [
        HistoricoDeMetaResposta(
            categoria=r.alvo.value,
            nome=r.alvo.nome,
            acao=r.acao,
            percentual_anterior=r.percentual_anterior,
            percentual_novo=r.percentual_novo,
            instante=r.instante,
        )
        for r in caso.executar(usuario.id)
    ]


@roteador.put("/metas/{categoria}", response_model=MetaResposta, responses=_RESPOSTAS_DE_ERRO)
def definir_meta(
    categoria: CodigoDaMetaNaRota,
    requisicao: DefinirMetaRequisicao,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[DefinirMeta, Depends(obter_definir_meta)],
) -> MetaResposta:
    return _meta_para_resposta(
        caso_de_uso.executar(usuario.id, alvo_da_rota(categoria), requisicao.percentual)
    )


@roteador.delete(
    "/metas/{categoria}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=_RESPOSTAS_DE_ERRO,
)
def remover_meta(
    categoria: CodigoDaMetaNaRota,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[RemoverMeta, Depends(obter_remover_meta)],
) -> Response:
    caso_de_uso.executar(usuario.id, alvo_da_rota(categoria))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
