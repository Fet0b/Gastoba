"""Revisão da bolsa: propostas de ligação entre operações da corretora e lançamentos da conta."""

from typing import Annotated

from fastapi import APIRouter, Depends

from gastoba.api.dependencias import (
    obter_autenticacao_de_sessao,
    obter_confirmar_propostas_da_bolsa,
    obter_listar_revisao_da_bolsa,
)
from gastoba.api.esquemas import (
    CasamentoConfirmadoResposta,
    ConfirmarPropostasRequisicao,
    ConfirmarPropostasResposta,
    EfeitoDaPropostaResposta,
    ItemSemParResposta,
    LigacaoConfirmadaResposta,
    OperacaoNaPropostaResposta,
    PropostaDeCasamentoResposta,
    RespostaDeErro,
    RevisaoDaBolsaResposta,
    TransacaoNaPropostaResposta,
    VinculoDeCasamentoResposta,
    dinheiro_para_texto,
)
from gastoba.application.autenticacao import Autenticacao
from gastoba.application.confirmar_propostas_da_bolsa import (
    ConfirmarPropostasDaBolsa,
    ItemDeConfirmacao,
)
from gastoba.application.listar_revisao_da_bolsa import (
    ListarRevisaoDaBolsa,
    PropostaListada,
)
from gastoba.domain.casamento_de_operacao import PapelDoVinculo
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.revisao_da_bolsa import TransacaoNaRevisao

roteador = APIRouter(tags=["revisão da bolsa"])
_ERROS = {s: {"model": RespostaDeErro} for s in (401, 403, 404, 409, 422)}
# Só sessão: mexe em dados financeiros (chave de API recebe 403, até no GET).
Sessao = Annotated[Autenticacao, Depends(obter_autenticacao_de_sessao)]


def _transacao(t: TransacaoNaRevisao) -> TransacaoNaPropostaResposta:
    return TransacaoNaPropostaResposta(
        id=t.transacao.id,
        data=t.transacao.data,
        descricao=t.transacao.descricao,
        valor=dinheiro_para_texto(t.transacao.valor),
        situacao=t.situacao.value,
    )


def _proposta(item: PropostaListada) -> PropostaDeCasamentoResposta:
    p = item.proposta
    return PropostaDeCasamentoResposta(
        chave=p.chave,
        versao=item.versao,
        tipo=p.tipo,
        data_do_pregao=p.data_do_pregao,
        operacoes=[
            OperacaoNaPropostaResposta(
                id=o.operacao.id,
                posicao_id=o.operacao.posicao_id,
                rotulo=o.rotulo,
                tipo=o.operacao.tipo.value,
                data=o.operacao.data,
                quantidade=format(o.operacao.quantidade, "f"),
                valor_bruto=dinheiro_para_texto(o.operacao.valor_bruto),
                custos=dinheiro_para_texto(o.operacao.custos),
            )
            for o in p.operacoes
        ],
        bruto=[_transacao(t) for t in p.bruto],
        taxas=[_transacao(t) for t in p.taxas],
        diferenca=dinheiro_para_texto(Dinheiro(p.diferenca)),
        diferenca_de_custo=dinheiro_para_texto(Dinheiro(p.diferenca_de_custo)),
        confianca=p.confianca,
        motivo=p.motivo,
        efeitos=[
            EfeitoDaPropostaResposta(transacao_id=e.transacao_id, codigo=e.codigo)
            for e in p.efeitos
        ],
    )


@roteador.get("/revisao-da-bolsa", response_model=RevisaoDaBolsaResposta, responses=_ERROS)
def ler(
    sessao: Sessao,
    caso: Annotated[ListarRevisaoDaBolsa, Depends(obter_listar_revisao_da_bolsa)],
) -> RevisaoDaBolsaResposta:
    revisao = caso.executar(sessao.usuario.id)
    return RevisaoDaBolsaResposta(
        propostas=[_proposta(p) for p in revisao.propostas],
        sem_par=[
            ItemSemParResposta(
                motivo=i.motivo,
                operacao_id=i.operacao_id,
                transacao_id=i.transacao_id,
                descricao=i.descricao,
                data=i.data,
                valor=dinheiro_para_texto(i.valor) if i.valor is not None else None,
            )
            for i in revisao.sem_par
        ],
        confirmados=[
            CasamentoConfirmadoResposta(
                id=c.casamento.id,
                operacao_ids=list(c.casamento.operacao_ids),
                vinculos=[
                    VinculoDeCasamentoResposta(
                        transacao_id=v.transacao_importada_id, papel=v.papel.value
                    )
                    for v in sorted(
                        c.casamento.vinculos,
                        key=lambda v: (
                            v.papel != PapelDoVinculo.BRUTO,
                            str(v.transacao_importada_id),
                        ),
                    )
                ],
                sem_aporte=c.sem_aporte,
            )
            for c in revisao.confirmados
        ],
    )


@roteador.post(
    "/revisao-da-bolsa/confirmar",
    status_code=201,
    response_model=ConfirmarPropostasResposta,
    responses=_ERROS,
)
def confirmar(
    corpo: ConfirmarPropostasRequisicao,
    sessao: Sessao,
    caso: Annotated[ConfirmarPropostasDaBolsa, Depends(obter_confirmar_propostas_da_bolsa)],
) -> ConfirmarPropostasResposta:
    ligacoes = caso.executar(
        sessao.usuario.id,
        [ItemDeConfirmacao(i.chave, i.versao, tuple(i.operacao_ids)) for i in corpo.itens],
    )
    return ConfirmarPropostasResposta(
        confirmados=[
            LigacaoConfirmadaResposta(casamento_id=ligacao.casamento_id, chave=ligacao.chave)
            for ligacao in ligacoes
        ]
    )
