import threading
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response, status

from gastoba.api.dependencias import (
    obter_aceitar_transacao_importada,
    obter_dono_da_importacao,
    obter_ignorar_transacao_importada,
    obter_listar_transacoes_importadas,
    obter_sincronizador,
)
from gastoba.api.esquemas import (
    AceitarTransacaoImportadaRequisicao,
    AceiteResposta,
    RespostaDeErro,
    SincronizacaoResposta,
    TransacaoImportadaResposta,
    dinheiro_para_texto,
)
from gastoba.application.aceitar_transacao_importada import AceitarTransacaoImportada
from gastoba.application.ignorar_transacao_importada import IgnorarTransacaoImportada
from gastoba.application.listar_transacoes_importadas import (
    ItemDaCaixaDeEntrada,
    ListarTransacoesImportadas,
)
from gastoba.application.sincronizar_contas_bancarias import SincronizarContasBancarias
from gastoba.domain.excecoes import SincronizacaoEmAndamento
from gastoba.domain.gasto import Gasto
from gastoba.domain.transacao_importada import EstadoDaTransacaoImportada
from gastoba.domain.usuario import Usuario

roteador = APIRouter(tags=["importacao bancaria"])

_ERRO = {"model": RespostaDeErro}
_RESPOSTAS_DE_ERRO = {401: _ERRO, 403: _ERRO, 404: _ERRO, 409: _ERRO, 422: _ERRO}

# Uma sincronização por vez (uma réplica só da API); a tarefa periódica usa a mesma trava.
TRAVA_DA_SINCRONIZACAO = threading.Lock()


def _para_resposta(item: ItemDaCaixaDeEntrada) -> TransacaoImportadaResposta:
    transacao = item.transacao
    return TransacaoImportadaResposta(
        id=transacao.id,
        conta_id=transacao.conta_id,
        data=transacao.data,
        descricao=transacao.descricao,
        valor=dinheiro_para_texto(transacao.valor),
        sentido=transacao.sentido.value,
        tipo_de_operacao=transacao.tipo_de_operacao,
        estado=transacao.estado.value,
        sugerir_descarte=item.sugerir_descarte,
        possivel_duplicado=item.possivel_duplicado,
    )


# Rotas síncronas porque os casos de uso fazem I/O bloqueante (banco e HTTP).
@roteador.get(
    "/transacoes-importadas",
    response_model=list[TransacaoImportadaResposta],
    responses=_RESPOSTAS_DE_ERRO,
)
def listar_transacoes_importadas(
    dono: Annotated[Usuario, Depends(obter_dono_da_importacao)],
    caso_de_uso: Annotated[ListarTransacoesImportadas, Depends(obter_listar_transacoes_importadas)],
    estado: EstadoDaTransacaoImportada = EstadoDaTransacaoImportada.PENDENTE,
) -> list[TransacaoImportadaResposta]:
    return [_para_resposta(item) for item in caso_de_uso.executar(dono.id, estado)]


@roteador.post(
    "/transacoes-importadas/{transacao_id}/aceitar",
    status_code=status.HTTP_201_CREATED,
    response_model=AceiteResposta,
    responses=_RESPOSTAS_DE_ERRO,
)
def aceitar_transacao_importada(
    transacao_id: UUID,
    requisicao: AceitarTransacaoImportadaRequisicao,
    dono: Annotated[Usuario, Depends(obter_dono_da_importacao)],
    caso_de_uso: Annotated[AceitarTransacaoImportada, Depends(obter_aceitar_transacao_importada)],
) -> AceiteResposta:
    lancamento = caso_de_uso.executar(dono.id, transacao_id, requisicao.categoria, requisicao.tags)
    return AceiteResposta(
        tipo="gasto" if isinstance(lancamento, Gasto) else "ganho", id=lancamento.id
    )


@roteador.post(
    "/transacoes-importadas/{transacao_id}/ignorar",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=_RESPOSTAS_DE_ERRO,
)
def ignorar_transacao_importada(
    transacao_id: UUID,
    dono: Annotated[Usuario, Depends(obter_dono_da_importacao)],
    caso_de_uso: Annotated[IgnorarTransacaoImportada, Depends(obter_ignorar_transacao_importada)],
) -> Response:
    caso_de_uso.executar(dono.id, transacao_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@roteador.post(
    "/sincronizacoes",
    response_model=SincronizacaoResposta,
    responses=_RESPOSTAS_DE_ERRO,
)
def sincronizar(
    request: Request,
    dono: Annotated[Usuario, Depends(obter_dono_da_importacao)],
    sincronizador: Annotated[SincronizarContasBancarias, Depends(obter_sincronizador)],
) -> SincronizacaoResposta:
    """Busca agora as contas e as transações novas no banco (o que o Meu Pluggy já atualizou)."""
    if not TRAVA_DA_SINCRONIZACAO.acquire(blocking=False):
        raise SincronizacaoEmAndamento("Já há uma sincronização em andamento.")
    try:
        resultado = sincronizador.executar()
    finally:
        TRAVA_DA_SINCRONIZACAO.release()
    return SincronizacaoResposta(
        contas=resultado.contas, transacoes_novas=resultado.novas, falhas=resultado.falhas
    )
