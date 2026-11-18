from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends

from gastoba.api.dependencias import (
    obter_autenticacao_de_sessao,
    obter_diagnosticar_contabilidade,
    obter_dono_da_importacao,
)
from gastoba.api.esquemas import RespostaDeErro, dinheiro_para_texto
from gastoba.api.esquemas_de_revisao_contabil import (
    ImpactoContabilDaCategoriaResposta,
    RevisaoContabilResposta,
    RevisaoMensalContabilResposta,
)
from gastoba.application.autenticacao import Autenticacao
from gastoba.application.diagnosticar_contabilidade import DiagnosticarContabilidade
from gastoba.domain.usuario import Usuario

roteador = APIRouter(tags=["revisao contabil"])
_ERROS = {status: {"model": RespostaDeErro} for status in (401, 403, 404, 422)}


@roteador.get("/revisao-contabil", response_model=RevisaoContabilResposta, responses=_ERROS)
def diagnosticar_contabilidade(
    inicio: date,
    fim: date,
    dono: Annotated[Usuario, Depends(obter_dono_da_importacao)],
    autenticacao: Annotated[Autenticacao, Depends(obter_autenticacao_de_sessao)],
    caso: Annotated[DiagnosticarContabilidade, Depends(obter_diagnosticar_contabilidade)],
) -> RevisaoContabilResposta:
    meses = caso.executar(dono.id, inicio, fim)
    return RevisaoContabilResposta(
        inicio=inicio,
        fim=fim,
        meses=[
            RevisaoMensalContabilResposta(
                mes=str(m.mes),
                periodo_completo=m.periodo_completo,
                classificacoes_pendentes=m.classificacoes_pendentes,
                aportes_categorizados=m.aportes_categorizados,
                custos_como_aporte=m.custos_como_aporte,
                regra_anterior_liberdade_financeira=dinheiro_para_texto(
                    m.regra_anterior_liberdade_financeira
                ),
                aporte_liquido_confirmado=dinheiro_para_texto(m.aporte_liquido_confirmado),
                diferenca_liberdade_financeira=dinheiro_para_texto(
                    m.diferenca_liberdade_financeira
                ),
                categorias=[
                    ImpactoContabilDaCategoriaResposta(
                        categoria=i.categoria.value, diferenca=dinheiro_para_texto(i.diferenca)
                    )
                    for i in m.categorias
                ],
                afetado=m.afetado,
            )
            for m in meses
        ],
    )
