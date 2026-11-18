from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response

from gastoba.api.dependencias import (
    obter_autenticacao_de_sessao,
    obter_desfazer_casamento,
    obter_listar_casamentos,
    obter_refazer_casamento,
)
from gastoba.api.esquemas import (
    CasamentoResposta,
    LigacaoConfirmadaResposta,
    RespostaDeErro,
    VinculoDeCasamentoResposta,
)
from gastoba.application.autenticacao import Autenticacao
from gastoba.application.desfazer_casamento import DesfazerCasamento
from gastoba.application.listar_casamentos import ListarCasamentos
from gastoba.application.refazer_casamento import RefazerCasamento
from gastoba.domain.casamento_de_operacao import CasamentoDeOperacao, PapelDoVinculo

roteador = APIRouter(tags=["casamentos de operações"])
_ERROS = {s: {"model": RespostaDeErro} for s in (401, 403, 404, 409, 422)}
# Só sessão: escrever aqui mexe em dados financeiros (chave de API recebe 403).
Sessao = Annotated[Autenticacao, Depends(obter_autenticacao_de_sessao)]


def _casamento(c: CasamentoDeOperacao) -> CasamentoResposta:
    return CasamentoResposta(
        id=c.id,
        operacao_ids=list(c.operacao_ids),
        vinculos=[
            VinculoDeCasamentoResposta(transacao_id=v.transacao_importada_id, papel=v.papel.value)
            for v in sorted(
                c.vinculos,
                key=lambda v: (v.papel != PapelDoVinculo.BRUTO, str(v.transacao_importada_id)),
            )
        ],
    )


@roteador.delete("/casamentos/{casamento_id}", status_code=204, responses=_ERROS)
def desfazer(
    casamento_id: UUID,
    sessao: Sessao,
    caso: Annotated[DesfazerCasamento, Depends(obter_desfazer_casamento)],
) -> Response:
    caso.executar(sessao.usuario.id, casamento_id)
    return Response(status_code=204)


@roteador.get("/casamentos", response_model=list[CasamentoResposta], responses=_ERROS)
def listar(
    sessao: Sessao, caso: Annotated[ListarCasamentos, Depends(obter_listar_casamentos)]
) -> list[CasamentoResposta]:
    return [_casamento(c) for c in caso.executar(sessao.usuario.id)]


@roteador.post(
    "/casamentos/{casamento_id}/refazer",
    response_model=LigacaoConfirmadaResposta,
    responses=_ERROS,
)
def refazer(
    casamento_id: UUID,
    sessao: Sessao,
    caso: Annotated[RefazerCasamento, Depends(obter_refazer_casamento)],
) -> LigacaoConfirmadaResposta:
    ligacao = caso.executar(sessao.usuario.id, casamento_id)
    return LigacaoConfirmadaResposta(casamento_id=ligacao.casamento_id, chave=ligacao.chave)
