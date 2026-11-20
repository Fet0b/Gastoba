from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response

from gastoba.api.dependencias import (
    obter_aprovar_tratamentos_de_aporte,
    obter_autenticacao_de_sessao,
    obter_desfazer_tratamento_de_aporte,
    obter_excluir_aporte,
    obter_listar_aportes_sem_investimento,
    obter_mesclar_aporte,
)
from gastoba.api.esquemas import (
    AporteSemInvestimentoResposta,
    MesclarAporteRequisicao,
    RespostaDeErro,
    TratamentoDeAporteResposta,
    dinheiro_para_texto,
)
from gastoba.application.aprovar_tratamentos_de_aporte import AprovarTratamentosDeAporte
from gastoba.application.autenticacao import Autenticacao
from gastoba.application.desfazer_tratamento_de_aporte import DesfazerTratamentoDeAporte
from gastoba.application.excluir_aporte_sem_investimento import ExcluirAporteSemInvestimento
from gastoba.application.listar_aportes_sem_investimento import ListarAportesSemInvestimento
from gastoba.application.mesclar_aporte_sem_investimento import MesclarAporteSemInvestimento
from gastoba.domain.natureza_do_movimento import natureza_da_descricao
from gastoba.domain.tratamento_de_aporte import TratamentoDeAporte

roteador = APIRouter(tags=["aportes sem investimento"])
_ERROS = {s: {"model": RespostaDeErro} for s in (401, 403, 404, 409, 422)}
# Só sessão. Associar a um investimento reusa ``POST /movimentos-de-investimento/{id}/destinacoes``;
# confirmar o tratamento (tirar dos totais) é decisão da pessoa, na tela (071) ou pelo comando.
Sessao = Annotated[Autenticacao, Depends(obter_autenticacao_de_sessao)]


def _tratamento(t: TratamentoDeAporte) -> TratamentoDeAporteResposta:
    return TratamentoDeAporteResposta(
        id=t.id, movimento_id=t.movimento_id, acao=t.acao.value, aprovado=t.aprovado_em is not None
    )


@roteador.get(
    "/aportes-sem-investimento",
    response_model=list[AporteSemInvestimentoResposta],
    responses=_ERROS,
)
def listar(
    sessao: Sessao,
    caso: Annotated[ListarAportesSemInvestimento, Depends(obter_listar_aportes_sem_investimento)],
) -> list[AporteSemInvestimentoResposta]:
    return [
        AporteSemInvestimentoResposta(
            id=i.movimento.id,
            conta_id=i.movimento.conta_id,
            data=i.movimento.data,
            valor=dinheiro_para_texto(i.movimento.valor),
            descricao=i.movimento.descricao,
            natureza=natureza_da_descricao(i.movimento.descricao).value,
            duplicado_sugerido_id=i.duplicado_sugerido_id,
            tratamento_pendente_de_aprovacao=i.tratamento_pendente_de_aprovacao,
        )
        for i in caso.executar(sessao.usuario.id)
    ]


@roteador.post(
    "/aportes-sem-investimento/{movimento_id}/mesclar",
    response_model=TratamentoDeAporteResposta,
    responses=_ERROS,
)
def mesclar(
    movimento_id: UUID,
    corpo: MesclarAporteRequisicao,
    sessao: Sessao,
    caso: Annotated[MesclarAporteSemInvestimento, Depends(obter_mesclar_aporte)],
) -> TratamentoDeAporteResposta:
    return _tratamento(caso.executar(sessao.usuario.id, movimento_id, corpo.mantido_id))


@roteador.post(
    "/aportes-sem-investimento/{movimento_id}/excluir",
    response_model=TratamentoDeAporteResposta,
    responses=_ERROS,
)
def excluir(
    movimento_id: UUID,
    sessao: Sessao,
    caso: Annotated[ExcluirAporteSemInvestimento, Depends(obter_excluir_aporte)],
) -> TratamentoDeAporteResposta:
    return _tratamento(caso.executar(sessao.usuario.id, movimento_id))


@roteador.post(
    "/aportes-sem-investimento/{movimento_id}/confirmar",
    response_model=TratamentoDeAporteResposta,
    responses=_ERROS,
)
def confirmar(
    movimento_id: UUID,
    sessao: Sessao,
    caso: Annotated[AprovarTratamentosDeAporte, Depends(obter_aprovar_tratamentos_de_aporte)],
) -> TratamentoDeAporteResposta:
    return _tratamento(caso.confirmar_do_aporte(sessao.usuario.id, movimento_id))


@roteador.post(
    "/aportes-sem-investimento/{movimento_id}/desfazer", status_code=204, responses=_ERROS
)
def desfazer(
    movimento_id: UUID,
    sessao: Sessao,
    caso: Annotated[DesfazerTratamentoDeAporte, Depends(obter_desfazer_tratamento_de_aporte)],
) -> Response:
    caso.por_movimento(sessao.usuario.id, movimento_id)
    return Response(status_code=204)
