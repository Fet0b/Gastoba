from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response

from gastoba.api.dependencias import (
    obter_autenticacao_de_sessao,
    obter_confirmar_reaplicacao_de_resgate,
    obter_listar_reaplicacoes_de_resgates,
    obter_listar_resgates_para_reaplicar,
    obter_remover_reaplicacao_de_resgate,
    obter_sugerir_reaplicacao,
)
from gastoba.api.esquemas import (
    ConfirmarReaplicacaoRequisicao,
    ReaplicacaoDeResgateResposta,
    ResgateParaReaplicarResposta,
    RespostaDeErro,
    SugestaoDeReaplicacaoResposta,
    dinheiro_para_texto,
)
from gastoba.application.autenticacao import Autenticacao
from gastoba.application.confirmar_reaplicacao_de_resgate import ConfirmarReaplicacaoDeResgate
from gastoba.application.listar_reaplicacoes_de_resgates import ListarReaplicacoesDeResgates
from gastoba.application.listar_resgates_para_reaplicar import ListarResgatesParaReaplicar
from gastoba.application.remover_reaplicacao_de_resgate import RemoverReaplicacaoDeResgate
from gastoba.application.sugerir_reaplicacao import SugerirReaplicacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.reaplicacao_de_resgate import ReaplicacaoDeResgate

roteador = APIRouter(tags=["reaplicacoes de resgates"])
_ERROS = {s: {"model": RespostaDeErro} for s in (401, 403, 404, 409, 422)}
Sessao = Annotated[Autenticacao, Depends(obter_autenticacao_de_sessao)]


def resposta(r: ReaplicacaoDeResgate) -> ReaplicacaoDeResgateResposta:
    return ReaplicacaoDeResgateResposta(
        id=r.id, aporte_id=r.aporte_id, resgate_id=r.resgate_id, valor=dinheiro_para_texto(r.valor)
    )


@roteador.get(
    "/reaplicacoes-de-resgates", response_model=list[ReaplicacaoDeResgateResposta], responses=_ERROS
)
def listar(
    sessao: Sessao,
    caso: Annotated[ListarReaplicacoesDeResgates, Depends(obter_listar_reaplicacoes_de_resgates)],
) -> list[ReaplicacaoDeResgateResposta]:
    return [resposta(r) for r in caso.executar(sessao.usuario.id)]


@roteador.get(
    "/movimentos-de-investimento/{aporte_id}/resgates-para-reaplicar",
    response_model=list[ResgateParaReaplicarResposta],
    responses=_ERROS,
)
def candidatos(
    aporte_id: UUID,
    sessao: Sessao,
    caso: Annotated[ListarResgatesParaReaplicar, Depends(obter_listar_resgates_para_reaplicar)],
) -> list[ResgateParaReaplicarResposta]:
    return [
        ResgateParaReaplicarResposta(
            id=r.movimento.id,
            data=r.movimento.data,
            descricao=r.movimento.descricao,
            investimento_nome=r.investimento_nome,
            valor=dinheiro_para_texto(r.movimento.valor),
            disponivel=dinheiro_para_texto(r.disponivel),
        )
        for r in caso.executar(sessao.usuario.id, aporte_id)
    ]


@roteador.post(
    "/reaplicacoes-de-resgates",
    status_code=201,
    response_model=ReaplicacaoDeResgateResposta,
    responses=_ERROS,
)
def confirmar(
    corpo: ConfirmarReaplicacaoRequisicao,
    sessao: Sessao,
    caso: Annotated[ConfirmarReaplicacaoDeResgate, Depends(obter_confirmar_reaplicacao_de_resgate)],
) -> ReaplicacaoDeResgateResposta:
    return resposta(
        caso.executar(
            sessao.usuario.id, corpo.aporte_id, corpo.resgate_id, Dinheiro.de_reais(corpo.valor)
        )
    )


@roteador.delete("/reaplicacoes-de-resgates/{id}", status_code=204, responses=_ERROS)
def remover(
    id: UUID,
    sessao: Sessao,
    caso: Annotated[RemoverReaplicacaoDeResgate, Depends(obter_remover_reaplicacao_de_resgate)],
) -> Response:
    caso.executar(sessao.usuario.id, id)
    return Response(status_code=204)


@roteador.get(
    "/reaplicacoes/sugestoes", response_model=list[SugestaoDeReaplicacaoResposta], responses=_ERROS
)
def sugestoes(
    sessao: Sessao,
    caso: Annotated[SugerirReaplicacao, Depends(obter_sugerir_reaplicacao)],
) -> list[SugestaoDeReaplicacaoResposta]:
    return [
        SugestaoDeReaplicacaoResposta(
            operacao_id=s.operacao_id, aporte_id=s.aporte_id, valor=dinheiro_para_texto(s.valor)
        )
        for s in caso.executar(sessao.usuario.id)
    ]
