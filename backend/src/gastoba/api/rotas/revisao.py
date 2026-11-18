from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response

from gastoba.api.dependencias import (
    obter_autenticacao_de_sessao,
    obter_classificar_natureza_do_resgate,
    obter_listar_avisos_de_resgates,
    obter_listar_pendencias_de_revisao,
    obter_revisar_aporte,
    obter_revisar_gasto_legado,
    obter_revisar_recorrencia_legada,
)
from gastoba.api.esquemas import (
    GastoResposta,
    MovimentoDeInvestimentoResposta,
    NaturezaDoResgateRequisicao,
    PendenciasDeRevisaoResposta,
    RecorrenciaResposta,
    RespostaDeErro,
    RevisarAporteRequisicao,
    RevisarCategoriaRequisicao,
)
from gastoba.api.rotas.gastos import gasto_para_resposta
from gastoba.api.rotas.investimentos import movimento_para_resposta
from gastoba.api.rotas.recorrencias import recorrencia_para_resposta
from gastoba.application.autenticacao import Autenticacao
from gastoba.application.classificar_natureza_do_resgate import ClassificarNaturezaDoResgate
from gastoba.application.listar_avisos_de_resgates import ListarAvisosDeResgates
from gastoba.application.listar_pendencias_de_revisao import ListarPendenciasDeRevisao
from gastoba.application.revisar_aporte import RevisarAporte
from gastoba.application.revisar_gasto_legado import RevisarGastoLegado
from gastoba.application.revisar_recorrencia_legada import RevisarRecorrenciaLegada
from gastoba.domain.destinacao import Destinacao
from gastoba.domain.tag import Tag

roteador = APIRouter(tags=["revisão de investimentos"])
_RESPOSTAS_DE_ERRO = {codigo: {"model": RespostaDeErro} for codigo in [401, 403, 404, 409, 422]}
Sessao = Annotated[Autenticacao, Depends(obter_autenticacao_de_sessao)]


@roteador.get(
    "/revisao-de-investimentos",
    response_model=PendenciasDeRevisaoResposta,
    responses=_RESPOSTAS_DE_ERRO,
)
def listar(
    autenticacao: Sessao,
    caso: Annotated[ListarPendenciasDeRevisao, Depends(obter_listar_pendencias_de_revisao)],
) -> PendenciasDeRevisaoResposta:
    p = caso.executar(autenticacao.usuario.id)
    return PendenciasDeRevisaoResposta(
        aportes=[movimento_para_resposta(m, ()) for m in p.aportes],
        gastos=[gasto_para_resposta(g) for g in p.gastos],
        recorrencias=[recorrencia_para_resposta(r) for r in p.recorrencias],
    )


@roteador.post(
    "/revisao-de-investimentos/aportes/{id}",
    response_model=MovimentoDeInvestimentoResposta,
    responses=_RESPOSTAS_DE_ERRO,
)
def revisar_aporte(
    id: UUID,
    requisicao: RevisarAporteRequisicao,
    autenticacao: Sessao,
    caso: Annotated[RevisarAporte, Depends(obter_revisar_aporte)],
) -> MovimentoDeInvestimentoResposta:
    m = caso.executar(
        autenticacao.usuario.id,
        id,
        requisicao.categoria,
        requisicao.investimento_id,
        tuple(Destinacao(Tag.de_texto(d.tag), d.percentual) for d in requisicao.destinacoes),
    )
    return movimento_para_resposta(m, ())


@roteador.post(
    "/revisao-de-investimentos/gastos/{id}",
    response_model=GastoResposta,
    responses=_RESPOSTAS_DE_ERRO,
)
def revisar_gasto(
    id: UUID,
    requisicao: RevisarCategoriaRequisicao,
    autenticacao: Sessao,
    caso: Annotated[RevisarGastoLegado, Depends(obter_revisar_gasto_legado)],
) -> GastoResposta:
    return gasto_para_resposta(caso.executar(autenticacao.usuario.id, id, requisicao.categoria))


@roteador.post(
    "/revisao-de-investimentos/recorrencias/{id}",
    response_model=RecorrenciaResposta,
    responses=_RESPOSTAS_DE_ERRO,
)
def revisar_recorrencia(
    id: UUID,
    requisicao: RevisarCategoriaRequisicao,
    autenticacao: Sessao,
    caso: Annotated[RevisarRecorrenciaLegada, Depends(obter_revisar_recorrencia_legada)],
) -> RecorrenciaResposta:
    return recorrencia_para_resposta(
        caso.executar(autenticacao.usuario.id, id, requisicao.categoria)
    )


@roteador.get(
    "/resgates-sem-destinacao",
    response_model=list[MovimentoDeInvestimentoResposta],
    responses=_RESPOSTAS_DE_ERRO,
)
def listar_resgates_sem_destinacao(
    autenticacao: Sessao,
    caso: Annotated[ListarAvisosDeResgates, Depends(obter_listar_avisos_de_resgates)],
) -> list[MovimentoDeInvestimentoResposta]:
    """Os saques de investimento ainda sem tag: alimentam o sininho de avisos."""
    return [
        movimento_para_resposta(aviso.movimento, ()).model_copy(
            update={
                "tipo": "vencimento" if aviso.movimento.vencimento_confirmado else "resgate",
                "investimento_nome": aviso.investimento_nome,
            }
        )
        for aviso in caso.executar(autenticacao.usuario.id)
    ]


@roteador.put(
    "/movimentos-de-investimento/{id}/natureza-do-resgate",
    status_code=204,
    response_class=Response,
    response_model=None,
    responses=_RESPOSTAS_DE_ERRO,
)
def classificar_natureza_do_resgate(
    id: UUID,
    requisicao: NaturezaDoResgateRequisicao,
    autenticacao: Sessao,
    caso: Annotated[ClassificarNaturezaDoResgate, Depends(obter_classificar_natureza_do_resgate)],
) -> Response:
    caso.executar(autenticacao.usuario.id, id, requisicao.tipo == "vencimento")
    return Response(status_code=204)
