from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from gastoba.api.dependencias import (
    obter_dono_da_importacao,
    obter_listar_faturas,
    obter_obter_fatura,
)
from gastoba.api.esquemas import (
    CartaoComFaturasResposta,
    CompraDaFaturaResposta,
    FaturaDetalhadaResposta,
    FaturaResposta,
    ListaDeFaturasResposta,
    PagamentoDaFaturaResposta,
    RespostaDeErro,
    dinheiro_para_texto,
)
from gastoba.application.listar_faturas import FaturaDoCartao, ListarFaturas
from gastoba.application.obter_fatura import FaturaDetalhada, ObterFatura
from gastoba.domain.usuario import Usuario

roteador = APIRouter(tags=["faturas"])

_ERRO = {"model": RespostaDeErro}
_RESPOSTAS_DE_ERRO = {401: _ERRO, 404: _ERRO, 422: _ERRO}


def _campos_da_fatura(item: FaturaDoCartao | FaturaDetalhada) -> dict[str, object]:
    fatura = item.fatura
    return {
        "id": fatura.id,
        "inicio": fatura.inicio,
        "fechamento": fatura.fechamento,
        "vencimento": fatura.vencimento,
        "total": dinheiro_para_texto(fatura.total),
        "pago": dinheiro_para_texto(fatura.pago),
        "restante": dinheiro_para_texto(fatura.restante),
        "a_favor": dinheiro_para_texto(fatura.a_favor),
        "minimo": dinheiro_para_texto(fatura.minimo) if fatura.minimo is not None else None,
        "situacao": item.situacao.value,
        "fonte": fatura.fonte.value,
    }


# Rotas síncronas porque os casos de uso fazem I/O bloqueante (banco). Só leitura: a situação
# depende do "hoje" do cliente (como o `mes` das metas), por isso `hoje` é obrigatório.
@roteador.get("/faturas", response_model=ListaDeFaturasResposta, responses=_RESPOSTAS_DE_ERRO)
def listar_faturas(
    hoje: date,
    dono: Annotated[Usuario, Depends(obter_dono_da_importacao)],
    caso_de_uso: Annotated[ListarFaturas, Depends(obter_listar_faturas)],
    conta_id: UUID | None = None,
) -> ListaDeFaturasResposta:
    cartoes = caso_de_uso.executar(dono.id, hoje, conta_id)
    return ListaDeFaturasResposta(
        cartoes=[
            CartaoComFaturasResposta(
                conta_id=cartao.conta_id,
                conta_nome=cartao.conta_nome,
                valor_devido=dinheiro_para_texto(cartao.valor_devido),
                faturas=[
                    FaturaResposta(
                        **_campos_da_fatura(item),
                        quantidade_de_compras=item.quantidade_de_compras,
                    )
                    for item in cartao.faturas
                ],
            )
            for cartao in cartoes
        ]
    )


@roteador.get(
    "/faturas/{fatura_id}", response_model=FaturaDetalhadaResposta, responses=_RESPOSTAS_DE_ERRO
)
def obter_fatura(
    fatura_id: UUID,
    hoje: date,
    dono: Annotated[Usuario, Depends(obter_dono_da_importacao)],
    caso_de_uso: Annotated[ObterFatura, Depends(obter_obter_fatura)],
) -> FaturaDetalhadaResposta:
    detalhe = caso_de_uso.executar(dono.id, fatura_id, hoje)
    return FaturaDetalhadaResposta(
        **_campos_da_fatura(detalhe),
        quantidade_de_compras=len(detalhe.compras),
        compras=[
            CompraDaFaturaResposta(
                id=compra.id,
                data=compra.data,
                descricao=compra.descricao,
                valor=dinheiro_para_texto(compra.valor),
                sentido=compra.sentido.value,
                parcela_numero=compra.parcela_numero,
                parcela_total=compra.parcela_total,
                estado=compra.estado.value,
            )
            for compra in detalhe.compras
        ],
        pagamentos=[
            PagamentoDaFaturaResposta(
                data=pagamento.data,
                valor=dinheiro_para_texto(pagamento.valor),
                forma=pagamento.forma,
            )
            for pagamento in detalhe.fatura.pagamentos
        ],
    )
