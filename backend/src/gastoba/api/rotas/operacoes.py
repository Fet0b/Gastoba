from decimal import Decimal, InvalidOperation
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response

from gastoba.api.dependencias import (
    obter_alterar_operacao,
    obter_autenticacao_de_sessao,
    obter_excluir_operacao,
    obter_lancar_operacao_manual,
    obter_listar_operacoes,
)
from gastoba.api.esquemas import (
    AlterarOperacaoRequisicao,
    LancarOperacaoRequisicao,
    OperacaoResposta,
    RespostaDeErro,
    dinheiro_para_texto,
)
from gastoba.application.alterar_operacao import AlterarOperacao
from gastoba.application.autenticacao import Autenticacao
from gastoba.application.excluir_operacao import ExcluirOperacao
from gastoba.application.lancar_operacao_manual import LancarOperacaoManual
from gastoba.application.listar_operacoes import ListarOperacoes
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import OperacaoInvalida
from gastoba.domain.operacao import Operacao, TipoDeOperacao

roteador = APIRouter(tags=["operações de investimento"])
_ERROS = {s: {"model": RespostaDeErro} for s in (401, 403, 404, 409, 422)}
# Só sessão: operações são dados financeiros (chave de API recebe 403).
Sessao = Annotated[Autenticacao, Depends(obter_autenticacao_de_sessao)]


def _resposta(o: Operacao) -> OperacaoResposta:
    return OperacaoResposta(
        id=o.id,
        investimento_id=o.posicao_id,
        tipo=o.tipo.value,
        data=o.data,
        quantidade=format(o.quantidade.normalize(), "f"),
        valor=dinheiro_para_texto(o.valor_bruto),
        custos=dinheiro_para_texto(o.custos),
        origem=o.origem.value,
        editavel=not o.imutavel_pela_pessoa,
        quantidade_confirmavel=o.imutavel_pela_pessoa and o.quantidade_estimada,
        quantidade_estimada=o.quantidade_estimada,
        operacao_relacionada_id=o.operacao_relacionada_id,
    )


def _quantidade(texto: str) -> Decimal:
    try:
        quantidade = Decimal(texto)
    except InvalidOperation as erro:
        raise OperacaoInvalida("A quantidade precisa ser um número decimal.") from erro
    if not quantidade.is_finite():
        raise OperacaoInvalida("A quantidade precisa ser um número decimal.")
    return quantidade


def _tipo(texto: str) -> TipoDeOperacao:
    try:
        return TipoDeOperacao(texto)
    except ValueError as erro:
        raise OperacaoInvalida("Escolha um tipo de operação válido.") from erro


@roteador.get(
    "/investimentos/{investimento_id}/operacoes",
    response_model=list[OperacaoResposta],
    responses=_ERROS,
)
def listar(
    investimento_id: UUID,
    sessao: Sessao,
    caso: Annotated[ListarOperacoes, Depends(obter_listar_operacoes)],
) -> list[OperacaoResposta]:
    return [_resposta(o) for o in caso.executar(sessao.usuario.id, investimento_id)]


@roteador.post(
    "/investimentos/{investimento_id}/operacoes",
    status_code=201,
    response_model=OperacaoResposta,
    responses=_ERROS,
)
def lancar(
    investimento_id: UUID,
    corpo: LancarOperacaoRequisicao,
    sessao: Sessao,
    caso: Annotated[LancarOperacaoManual, Depends(obter_lancar_operacao_manual)],
) -> OperacaoResposta:
    operacao = caso.executar(
        sessao.usuario.id,
        investimento_id,
        _tipo(corpo.tipo),
        corpo.data,
        _quantidade(corpo.quantidade),
        Dinheiro.de_reais(corpo.valor),
        custos=Dinheiro.de_reais(corpo.custos) if corpo.custos is not None else None,
        operacao_relacionada_id=corpo.operacao_relacionada_id,
        confirmar_duplicidade=corpo.confirmar_duplicidade,
    )
    return _resposta(operacao)


@roteador.put("/operacoes/{operacao_id}", response_model=OperacaoResposta, responses=_ERROS)
def alterar(
    operacao_id: UUID,
    corpo: AlterarOperacaoRequisicao,
    sessao: Sessao,
    caso: Annotated[AlterarOperacao, Depends(obter_alterar_operacao)],
) -> OperacaoResposta:
    operacao = caso.executar(
        sessao.usuario.id,
        operacao_id,
        data=corpo.data,
        quantidade=_quantidade(corpo.quantidade) if corpo.quantidade is not None else None,
        valor_bruto=Dinheiro.de_reais(corpo.valor) if corpo.valor is not None else None,
        custos=Dinheiro.de_reais(corpo.custos) if corpo.custos is not None else None,
    )
    return _resposta(operacao)


@roteador.delete("/operacoes/{operacao_id}", status_code=204, responses=_ERROS)
def excluir(
    operacao_id: UUID,
    sessao: Sessao,
    caso: Annotated[ExcluirOperacao, Depends(obter_excluir_operacao)],
) -> Response:
    caso.executar(sessao.usuario.id, operacao_id)
    return Response(status_code=204)
