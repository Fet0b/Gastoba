import threading
from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response, status

from gastoba.api.dependencias import (
    obter_aceitar_transacao_importada,
    obter_aceitar_transacao_importada_dividida,
    obter_aceitar_transacoes_importadas_em_lote,
    obter_autenticacao_de_sessao,
    obter_classificar_transferencia,
    obter_completar_par_da_transferencia,
    obter_consultar_impacto_da_reversao,
    obter_consultar_reconciliacao_da_caixinha,
    obter_definir_caixinha,
    obter_definir_referencia_da_caixinha,
    obter_desfazer_classificacao_importada,
    obter_dono_da_importacao,
    obter_ignorar_transacao_importada,
    obter_listar_transacoes_importadas,
    obter_listar_transferencias,
    obter_reclassificar_transacao_importada,
    obter_restaurar_transacao_importada,
    obter_sincronizador,
)
from gastoba.api.esquemas import (
    AceitarEmLoteRequisicao,
    AceitarEmLoteResposta,
    AceitarTransacaoImportadaRequisicao,
    AceiteResposta,
    CaixinhaResposta,
    ClassificacaoDesfeitaResposta,
    ClassificarTransferenciaRequisicao,
    CompletarParRequisicao,
    DefinirCaixinhaRequisicao,
    DesfazerClassificacaoRequisicao,
    DestinacaoRequisicao,
    DividirTransacaoRequisicao,
    DivisaoResposta,
    IgnorarTransacaoRequisicao,
    ImpactoDaReversaoResposta,
    ReclassificarTransacaoRequisicao,
    ReconciliacaoDaCaixinhaResposta,
    ReferenciaDaCaixinhaRequisicao,
    ReferenciaDaCaixinhaResposta,
    RespostaDeErro,
    SincronizacaoResposta,
    TransacaoImportadaResposta,
    TransferenciaResposta,
    dinheiro_para_texto,
)
from gastoba.application.aceitar_transacao_importada import AceitarTransacaoImportada
from gastoba.application.aceitar_transacao_importada_dividida import (
    AceitarTransacaoImportadaDividida,
)
from gastoba.application.aceitar_transacoes_importadas_em_lote import (
    AceitarTransacoesImportadasEmLote,
)
from gastoba.application.autenticacao import Autenticacao
from gastoba.application.classificar_transferencia import ClassificarTransferencia
from gastoba.application.completar_par_da_transferencia import CompletarParDaTransferencia
from gastoba.application.consultar_impacto_da_reversao import ConsultarImpactoDaReversao
from gastoba.application.consultar_reconciliacao_da_caixinha import ConsultarReconciliacaoDaCaixinha
from gastoba.application.definir_caixinha import DefinirCaixinha
from gastoba.application.definir_referencia_da_caixinha import DefinirReferenciaDaCaixinha
from gastoba.application.desfazer_classificacao_importada import DesfazerClassificacaoImportada
from gastoba.application.ignorar_transacao_importada import IgnorarTransacaoImportada
from gastoba.application.listar_transacoes_importadas import (
    ItemDaCaixaDeEntrada,
    ListarTransacoesImportadas,
)
from gastoba.application.listar_transferencias import ListarTransferencias
from gastoba.application.reclassificar_transacao_importada import ReclassificarTransacaoImportada
from gastoba.application.restaurar_transacao_importada import RestaurarTransacaoImportada
from gastoba.application.sincronizar_contas_bancarias import SincronizarContasBancarias
from gastoba.domain.destinacao import Destinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.divisao_da_transacao import ParteDaTransacao
from gastoba.domain.excecoes import SincronizacaoEmAndamento, TransacaoImportadaInvalida
from gastoba.domain.ganho import Ganho
from gastoba.domain.gasto import Gasto
from gastoba.domain.mes import Mes
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento
from gastoba.domain.natureza_do_movimento import (
    NaturezaDoMovimento,
    natureza_da_descricao,
    tipo_sugerido,
)
from gastoba.domain.tag import Tag
from gastoba.domain.transacao_importada import EstadoDaTransacaoImportada, MotivoDaTransacaoIgnorada
from gastoba.domain.transferencia_entre_contas import TransferenciaEntreContas
from gastoba.domain.usuario import Usuario

roteador = APIRouter(tags=["importacao bancaria"])

_ERRO = {"model": RespostaDeErro}
_RESPOSTAS_DE_ERRO = {401: _ERRO, 403: _ERRO, 404: _ERRO, 409: _ERRO, 422: _ERRO}

# Uma sincronização por vez (uma réplica só da API); a tarefa periódica usa a mesma trava.
TRAVA_DA_SINCRONIZACAO = threading.Lock()


def _para_resposta(item: ItemDaCaixaDeEntrada) -> TransacaoImportadaResposta:
    transacao = item.transacao
    return TransacaoImportadaResposta(
        tipo_de_movimento_sugerido=tipo_sugerido(transacao.descricao).value
        if tipo_sugerido(transacao.descricao)
        else None,
        id=transacao.id,
        conta_id=transacao.conta_id,
        data=transacao.data,
        descricao=transacao.descricao,
        valor=dinheiro_para_texto(transacao.valor),
        sentido=transacao.sentido.value,
        tipo_de_operacao=transacao.tipo_de_operacao,
        estado=transacao.estado.value,
        motivo_ignorada=transacao.motivo_ignorada,
        sugerir_descarte=item.sugerir_descarte,
        possivel_duplicado=item.possivel_duplicado,
        investimento_sugerido_id=item.investimento_sugerido_id,
        par_sugerido_id=item.par_sugerido_id,
        transferencia_sugerida_id=item.transferencia_sugerida_id,
        liquidacao_de_bolsa=natureza_da_descricao(transacao.descricao)
        == NaturezaDoMovimento.LIQUIDACAO_DE_BOLSA,
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
    motivo: MotivoDaTransacaoIgnorada | None = None,
) -> list[TransacaoImportadaResposta]:
    return [_para_resposta(item) for item in caso_de_uso.executar(dono.id, estado, motivo)]


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
    lancamento = caso_de_uso.executar(
        dono.id,
        transacao_id,
        requisicao.categoria,
        requisicao.tags,
        tipo_de_movimento=requisicao.tipo_de_movimento,
        movimento_relacionado_id=requisicao.movimento_relacionado_id,
        como_investimento=requisicao.como_investimento,
        investimento_id=requisicao.investimento_id,
        destinacoes=_destinacoes(requisicao.destinacoes),
    )
    return _aceite(lancamento)


@roteador.post(
    "/transacoes-importadas/{transacao_id}/dividir",
    status_code=status.HTTP_201_CREATED,
    response_model=DivisaoResposta,
    responses=_RESPOSTAS_DE_ERRO,
)
def dividir_transacao_importada(
    transacao_id: UUID,
    requisicao: DividirTransacaoRequisicao,
    dono: Annotated[Usuario, Depends(obter_dono_da_importacao)],
    caso_de_uso: Annotated[
        AceitarTransacaoImportadaDividida, Depends(obter_aceitar_transacao_importada_dividida)
    ],
) -> DivisaoResposta:
    partes = [
        ParteDaTransacao(
            categoria=parte.categoria,
            tags=tuple(Tag.de_texto(tag) for tag in parte.tags),
            percentual=parte.percentual,
            como_investimento=parte.como_investimento,
            investimento_id=parte.investimento_id,
            destinacoes=tuple(_destinacoes(parte.destinacoes)),
        )
        for parte in requisicao.partes
    ]
    criados = caso_de_uso.executar(dono.id, transacao_id, partes)
    return DivisaoResposta(criados=[_aceite(lancamento) for lancamento in criados])


@roteador.post(
    "/transacoes-importadas/aceitar-em-lote",
    status_code=status.HTTP_201_CREATED,
    response_model=AceitarEmLoteResposta,
    responses=_RESPOSTAS_DE_ERRO,
)
def aceitar_transacoes_importadas_em_lote(
    requisicao: AceitarEmLoteRequisicao,
    dono: Annotated[Usuario, Depends(obter_dono_da_importacao)],
    caso_de_uso: Annotated[
        AceitarTransacoesImportadasEmLote, Depends(obter_aceitar_transacoes_importadas_em_lote)
    ],
) -> AceitarEmLoteResposta:
    if requisicao.tipo_de_movimento is not None or requisicao.movimento_relacionado_id is not None:
        raise TransacaoImportadaInvalida(
            "Custos e rendimentos devem ser classificados individualmente."
        )
    lancamentos = caso_de_uso.executar(
        dono.id,
        requisicao.transacao_ids,
        requisicao.categoria,
        requisicao.tags,
        como_investimento=requisicao.como_investimento,
        investimento_id=requisicao.investimento_id,
        destinacoes=_destinacoes(requisicao.destinacoes),
    )
    return AceitarEmLoteResposta(aceitas=[_aceite(lancamento) for lancamento in lancamentos])


def _destinacoes(entrada: list[DestinacaoRequisicao]) -> list[Destinacao]:
    return [Destinacao(Tag.de_texto(item.tag), item.percentual) for item in entrada]


def _aceite(lancamento: Gasto | Ganho | MovimentoDeInvestimento) -> AceiteResposta:
    if isinstance(lancamento, MovimentoDeInvestimento):
        tipo = lancamento.tipo.value
    else:
        tipo = "gasto" if isinstance(lancamento, Gasto) else "ganho"
    return AceiteResposta(tipo=tipo, id=lancamento.id)


@roteador.post(
    "/transacoes-importadas/{transacao_id}/ignorar",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=_RESPOSTAS_DE_ERRO,
)
def ignorar_transacao_importada(
    transacao_id: UUID,
    dono: Annotated[Usuario, Depends(obter_dono_da_importacao)],
    caso_de_uso: Annotated[IgnorarTransacaoImportada, Depends(obter_ignorar_transacao_importada)],
    requisicao: IgnorarTransacaoRequisicao | None = None,
) -> Response:
    caso_de_uso.executar(dono.id, transacao_id, requisicao.motivo if requisicao else None)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@roteador.post(
    "/transacoes-importadas/{transacao_id}/restaurar",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=_RESPOSTAS_DE_ERRO,
)
def restaurar_transacao_importada(
    transacao_id: UUID,
    dono: Annotated[Usuario, Depends(obter_dono_da_importacao)],
    caso_de_uso: Annotated[
        RestaurarTransacaoImportada, Depends(obter_restaurar_transacao_importada)
    ],
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


@roteador.get(
    "/transacoes-importadas/{transacao_id}/impacto-da-reversao",
    response_model=ImpactoDaReversaoResposta,
    responses=_RESPOSTAS_DE_ERRO,
)
def consultar_impacto_da_reversao(
    transacao_id: UUID,
    dono: Annotated[Usuario, Depends(obter_dono_da_importacao)],
    autenticacao: Annotated[Autenticacao, Depends(obter_autenticacao_de_sessao)],
    caso: Annotated[ConsultarImpactoDaReversao, Depends(obter_consultar_impacto_da_reversao)],
) -> ImpactoDaReversaoResposta:
    impacto = caso.executar(dono.id, transacao_id)
    return ImpactoDaReversaoResposta(
        transacoes_reabertas=impacto.transacoes_reabertas,
        coberturas_removidas=impacto.coberturas_removidas,
        transacao_id=impacto.transacao_id,
        versao=impacto.versao,
        lancamentos_removidos=impacto.lancamentos_removidos,
        divisao_inteira=impacto.divisao_inteira,
    )


@roteador.post(
    "/transacoes-importadas/{transacao_id}/desfazer-classificacao",
    response_model=ClassificacaoDesfeitaResposta,
    responses=_RESPOSTAS_DE_ERRO,
)
def desfazer_classificacao_importada(
    transacao_id: UUID,
    requisicao: DesfazerClassificacaoRequisicao,
    dono: Annotated[Usuario, Depends(obter_dono_da_importacao)],
    autenticacao: Annotated[Autenticacao, Depends(obter_autenticacao_de_sessao)],
    caso: Annotated[
        DesfazerClassificacaoImportada, Depends(obter_desfazer_classificacao_importada)
    ],
) -> ClassificacaoDesfeitaResposta:
    resultado = caso.executar(
        dono.id,
        transacao_id,
        desfazer_divisao_inteira=requisicao.desfazer_divisao_inteira,
        versao_esperada=requisicao.versao_esperada,
        desfazer_dependencias=requisicao.desfazer_dependencias,
    )
    return ClassificacaoDesfeitaResposta(
        transacao_id=resultado.transacao_id,
        estado=resultado.estado.value,
        lancamentos_removidos=resultado.lancamentos_removidos,
    )


@roteador.post(
    "/transacoes-importadas/{transacao_id}/reclassificar",
    response_model=AceiteResposta,
    responses=_RESPOSTAS_DE_ERRO,
)
def reclassificar_transacao_importada(
    transacao_id: UUID,
    requisicao: ReclassificarTransacaoRequisicao,
    dono: Annotated[Usuario, Depends(obter_dono_da_importacao)],
    autenticacao: Annotated[Autenticacao, Depends(obter_autenticacao_de_sessao)],
    caso: Annotated[
        ReclassificarTransacaoImportada, Depends(obter_reclassificar_transacao_importada)
    ],
) -> AceiteResposta:
    """Troca a classificação numa só transação (desfaz a atual e aplica a nova); só sessão."""
    lancamento = caso.executar(
        dono.id,
        transacao_id,
        requisicao.rotulo,
        versao_esperada=requisicao.versao_esperada,
        categoria=requisicao.categoria,
        tags=requisicao.tags,
        investimento_id=requisicao.investimento_id,
        movimento_relacionado_id=requisicao.movimento_relacionado_id,
        destinacoes=_destinacoes(requisicao.destinacoes),
        desfazer_divisao_inteira=requisicao.desfazer_divisao_inteira,
        desfazer_dependencias=requisicao.desfazer_dependencias,
    )
    return _aceite(lancamento)


def transferencia_para_resposta(t: TransferenciaEntreContas) -> TransferenciaResposta:
    return TransferenciaResposta(
        id=t.id,
        conta_origem_id=t.conta_origem_id,
        conta_destino_id=t.conta_destino_id,
        valor=dinheiro_para_texto(t.valor),
        data=t.data,
        aporte_liquido=dinheiro_para_texto(t.aporte_liquido),
        papel_origem=t.papel_origem.value,
        papel_destino=t.papel_destino.value,
        transacao_origem_id=t.transacao_origem_id,
        transacao_destino_id=t.transacao_destino_id,
        competencia_provisoria=t.competencia_provisoria,
    )


@roteador.post(
    "/transacoes-importadas/{transacao_id}/aceitar-como-transferencia",
    response_model=TransferenciaResposta,
    responses=_RESPOSTAS_DE_ERRO,
)
def classificar_transferencia(
    transacao_id: UUID,
    requisicao: ClassificarTransferenciaRequisicao,
    dono: Annotated[Usuario, Depends(obter_dono_da_importacao)],
    autenticacao: Annotated[Autenticacao, Depends(obter_autenticacao_de_sessao)],
    caso: Annotated[ClassificarTransferencia, Depends(obter_classificar_transferencia)],
) -> TransferenciaResposta:
    return transferencia_para_resposta(
        caso.executar(
            dono.id, transacao_id, requisicao.conta_contraparte_id, requisicao.par_transacao_id
        )
    )


@roteador.get(
    "/transferencias-entre-contas",
    response_model=list[TransferenciaResposta],
    responses=_RESPOSTAS_DE_ERRO,
)
def listar_transferencias(
    inicio: date,
    fim: date,
    dono: Annotated[Usuario, Depends(obter_dono_da_importacao)],
    autenticacao: Annotated[Autenticacao, Depends(obter_autenticacao_de_sessao)],
    caso: Annotated[ListarTransferencias, Depends(obter_listar_transferencias)],
) -> list[TransferenciaResposta]:
    return [transferencia_para_resposta(t) for t in caso.executar(dono.id, inicio, fim)]


@roteador.post(
    "/transferencias-entre-contas/{transferencia_id}/completar-par",
    response_model=TransferenciaResposta,
    responses=_RESPOSTAS_DE_ERRO,
)
def completar_par_da_transferencia(
    transferencia_id: UUID,
    requisicao: CompletarParRequisicao,
    dono: Annotated[Usuario, Depends(obter_dono_da_importacao)],
    autenticacao: Annotated[Autenticacao, Depends(obter_autenticacao_de_sessao)],
    caso: Annotated[CompletarParDaTransferencia, Depends(obter_completar_par_da_transferencia)],
) -> TransferenciaResposta:
    return transferencia_para_resposta(
        caso.executar(dono.id, transferencia_id, requisicao.transacao_id)
    )


@roteador.post("/caixinhas", response_model=CaixinhaResposta, responses=_RESPOSTAS_DE_ERRO)
def definir_caixinha(
    requisicao: DefinirCaixinhaRequisicao,
    dono: Annotated[Usuario, Depends(obter_dono_da_importacao)],
    autenticacao: Annotated[Autenticacao, Depends(obter_autenticacao_de_sessao)],
    caso: Annotated[DefinirCaixinha, Depends(obter_definir_caixinha)],
) -> CaixinhaResposta:
    inv = caso.executar(
        dono.id,
        requisicao.conta_id,
        Dinheiro.de_reais(requisicao.saldo_remunerado),
        requisicao.data_do_saldo,
    )
    return CaixinhaResposta(id=inv.id, nome=inv.nome, saldo=dinheiro_para_texto(inv.saldo))


@roteador.put(
    "/investimentos/{investimento_id}/referencias-da-caixinha/{mes}",
    response_model=ReferenciaDaCaixinhaResposta,
    responses=_RESPOSTAS_DE_ERRO,
)
def definir_referencia_da_caixinha(
    investimento_id: UUID,
    mes: str,
    requisicao: ReferenciaDaCaixinhaRequisicao,
    dono: Annotated[Usuario, Depends(obter_dono_da_importacao)],
    autenticacao: Annotated[Autenticacao, Depends(obter_autenticacao_de_sessao)],
    caso: Annotated[DefinirReferenciaDaCaixinha, Depends(obter_definir_referencia_da_caixinha)],
) -> ReferenciaDaCaixinhaResposta:
    r = caso.executar(
        dono.id,
        investimento_id,
        Mes.de_texto(mes),
        Dinheiro.de_reais(requisicao.saldo_inicial),
        Dinheiro.de_reais(requisicao.saldo_final),
        requisicao.periodo_completo,
    )
    return ReferenciaDaCaixinhaResposta(
        investimento_id=r.investimento_id,
        mes=str(r.mes),
        saldo_inicial=dinheiro_para_texto(r.saldo_inicial),
        saldo_final=dinheiro_para_texto(r.saldo_final),
        periodo_completo=r.periodo_completo,
    )


@roteador.get(
    "/investimentos/{investimento_id}/reconciliacao",
    response_model=ReconciliacaoDaCaixinhaResposta,
    responses=_RESPOSTAS_DE_ERRO,
)
def consultar_reconciliacao_da_caixinha(
    investimento_id: UUID,
    mes: str,
    dono: Annotated[Usuario, Depends(obter_dono_da_importacao)],
    autenticacao: Annotated[Autenticacao, Depends(obter_autenticacao_de_sessao)],
    caso: Annotated[
        ConsultarReconciliacaoDaCaixinha, Depends(obter_consultar_reconciliacao_da_caixinha)
    ],
) -> ReconciliacaoDaCaixinhaResposta:
    r = caso.executar(dono.id, investimento_id, Mes.de_texto(mes))
    return ReconciliacaoDaCaixinhaResposta(
        saldo_inicial=dinheiro_para_texto(r.saldo_inicial),
        saldo_observado=dinheiro_para_texto(r.saldo_observado),
        saldo_calculado=dinheiro_para_texto(r.saldo_calculado),
        diferenca=dinheiro_para_texto(r.diferenca),
        completo=r.completo,
        conciliado=r.conciliado,
    )
