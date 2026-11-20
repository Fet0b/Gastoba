from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status

from gastoba.api.dependencias import (
    ConfiguracoesDaApp,
    e_dono_da_importacao,
    obter_alocar_caixinha,
    obter_associar_movimento_ao_investimento,
    obter_autenticacao_de_sessao,
    obter_consultar_historico_de_investimentos,
    obter_definir_cor_da_destinacao,
    obter_definir_destinacoes_do_investimento,
    obter_desfazer_classificacao_de_investimento,
    obter_desfazer_realocacao,
    obter_desfazer_saldo_inicial,
    obter_listar_investimentos,
    obter_listar_movimentos_de_investimento,
    obter_listar_realocacoes,
    obter_listar_reservas_das_destinacoes,
    obter_realocar_destinacao,
    obter_remover_caixinhas_do_resgate,
    obter_remover_cor_da_destinacao,
    obter_resumir_investimentos,
    obter_usuario_atual,
)
from gastoba.api.esquemas import (
    AportesSemDestinoResposta,
    AssociarMovimentoRequisicao,
    ClassificacaoDesfeitaResposta,
    CorDaDestinacaoResposta,
    DefinirCorRequisicao,
    DefinirDestinacoesRequisicao,
    DesfazerClassificacaoRequisicao,
    DestinacaoDoInvestimentoResposta,
    FatiaDeInvestimentoResposta,
    InvestimentoResposta,
    MovimentoDeInvestimentoResposta,
    PartesDoMovimentoResposta,
    PendenciaDeInvestimentoResposta,
    PontoDoHistoricoResposta,
    RealocacaoResposta,
    RealocarRequisicao,
    ReservaDaDestinacaoResposta,
    RespostaDeErro,
    ResumoDeInvestimentosResposta,
    TaxaDoInvestimentoResposta,
    dinheiro_para_texto,
)
from gastoba.application.alocar_caixinha import AlocarCaixinha
from gastoba.application.associar_movimento_ao_investimento import (
    AssociarMovimentoAoInvestimento,
)
from gastoba.application.autenticacao import Autenticacao
from gastoba.application.consultar_historico_de_investimentos import (
    ConsultarHistoricoDeInvestimentos,
)
from gastoba.application.definir_cor_da_destinacao import DefinirCorDaDestinacao
from gastoba.application.definir_destinacoes_do_investimento import (
    DefinirDestinacoesDoInvestimento,
)
from gastoba.application.desfazer_classificacao_de_investimento import (
    DesfazerClassificacaoDeInvestimento,
)
from gastoba.application.desfazer_realocacao import DesfazerRealocacao
from gastoba.application.desfazer_saldo_inicial import DesfazerSaldoInicial
from gastoba.application.listar_investimentos import ListarInvestimentos
from gastoba.application.listar_movimentos_de_investimento import (
    ListarMovimentosDeInvestimento,
    MovimentoComDestinacoes,
)
from gastoba.application.listar_realocacoes import ListarRealocacoes
from gastoba.application.listar_reservas_das_destinacoes import ListarReservasDasDestinacoes
from gastoba.application.realocar_destinacao import RealocarDestinacao
from gastoba.application.remover_caixinhas_do_resgate import RemoverCaixinhasDoResgate
from gastoba.application.remover_cor_da_destinacao import RemoverCorDaDestinacao
from gastoba.application.resumir_investimentos import ResumirInvestimentos, VisaoDosInvestimentos
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.destinacao import Destinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.investimento import Realocacao
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento
from gastoba.domain.natureza_do_movimento import natureza_da_descricao
from gastoba.domain.rotulo_do_investimento import rotulos_dos_investimentos
from gastoba.domain.tag import Tag
from gastoba.domain.taxa_do_investimento import TaxaDoInvestimento
from gastoba.domain.usuario import Usuario

roteador = APIRouter(tags=["investimentos"])

_ERRO = {"model": RespostaDeErro}
_RESPOSTAS_DE_ERRO = {401: _ERRO, 403: _ERRO, 404: _ERRO, 409: _ERRO, 422: _ERRO}


def _dinheiro_ou_nulo(valor: Dinheiro | None) -> str | None:
    return None if valor is None else dinheiro_para_texto(valor)


def _realocacao_para_resposta(r: Realocacao) -> RealocacaoResposta:
    return RealocacaoResposta(
        id=r.id,
        investimento_id=r.investimento_id,
        origem=str(r.origem),
        destino=str(r.destino),
        valor=dinheiro_para_texto(r.valor),
        data=r.data,
    )


def movimento_para_resposta(
    movimento: MovimentoDeInvestimento,
    destinacoes: tuple[tuple[Tag, Dinheiro], ...],
    categorias: tuple[tuple[Tag, CategoriaDoGasto], ...] = (),
    cobertos: tuple[tuple[Tag, Dinheiro], ...] = (),
    casamento_id: UUID | None = None,
) -> MovimentoDeInvestimentoResposta:
    da_parte = dict(categorias)
    usado = dict(cobertos)
    return MovimentoDeInvestimentoResposta(
        id=movimento.id,
        natureza=natureza_da_descricao(movimento.descricao).value,
        casamento_id=casamento_id,
        vencimento_confirmado=movimento.vencimento_confirmado,
        revisao_contabil_pendente=movimento.revisao_contabil_pendente,
        movimento_relacionado_id=movimento.movimento_relacionado_id,
        categoria=movimento.categoria.value if movimento.categoria else None,
        revisao_pendente=movimento.revisao_pendente,
        transacao_importada_id=movimento.transacao_importada_id,
        conta_id=movimento.conta_id,
        investimento_id=movimento.investimento_id,
        tipo=movimento.tipo.value,
        origem=movimento.origem.value,
        descricao=movimento.descricao,
        valor=dinheiro_para_texto(movimento.valor),
        data=movimento.data,
        destinacoes=[
            PartesDoMovimentoResposta(
                tag=str(tag),
                valor=dinheiro_para_texto(valor),
                categoria=categoria.value if (categoria := da_parte.get(tag)) else None,
                coberto=dinheiro_para_texto(usado[tag]) if tag in usado else None,
            )
            for tag, valor in destinacoes
        ],
    )


def _taxa(taxa: TaxaDoInvestimento | None) -> TaxaDoInvestimentoResposta | None:
    if taxa is None:
        return None
    return TaxaDoInvestimentoResposta(
        percentual=None if taxa.percentual is None else format(taxa.percentual, "f"),
        indexador=taxa.indexador,
        adicional_anual=None if taxa.adicional_anual is None else format(taxa.adicional_anual, "f"),
    )


def _decimal_ou_nulo(valor) -> str | None:
    """Decimal em texto, sem notação científica e mantendo as casas (ex.: ``"10.00"``)."""
    return None if valor is None else format(valor, "f")


def _quantidade_ou_nulo(valor) -> str | None:
    """Quantidade sem zeros à direita (``"25"``, não ``"25.000"``)."""
    return None if valor is None else format(valor.normalize(), "f")


# Rotas síncronas porque os casos de uso fazem I/O bloqueante do SQLAlchemy síncrono.
@roteador.get(
    "/investimentos", response_model=list[InvestimentoResposta], responses=_RESPOSTAS_DE_ERRO
)
def listar_investimentos(
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[ListarInvestimentos, Depends(obter_listar_investimentos)],
) -> list[InvestimentoResposta]:
    posicoes = caso_de_uso.executar(usuario.id)
    rotulos = rotulos_dos_investimentos([p.investimento for p in posicoes])
    return [
        InvestimentoResposta(
            rotulo=rotulos[posicao.investimento.id],
            pendencias_de_operacoes=list(posicao.pendencias_de_operacoes),
            alocacao_por_fracao=posicao.alocacao_por_fracao,
            custos_registrados=dinheiro_para_texto(posicao.custos_registrados),
            resultado_realizado=dinheiro_para_texto(posicao.resultado_realizado)
            if posicao.resultado_realizado is not None
            else None,
            id=posicao.investimento.id,
            conta_id=posicao.investimento.conta_remunerada_id,
            data_de_aplicacao=posicao.data_de_aplicacao,
            nome=posicao.investimento.nome,
            tipo=posicao.investimento.tipo,
            subtipo=posicao.investimento.subtipo,
            saldo=dinheiro_para_texto(posicao.investimento.saldo),
            valor_aplicado=_dinheiro_ou_nulo(posicao.valor_aplicado),
            rendimento=_dinheiro_ou_nulo(posicao.rendimento),
            rentabilidade=posicao.rentabilidade,
            origem_da_rentabilidade=posicao.origem_da_rentabilidade,
            valor_aplicado_das_operacoes=_dinheiro_ou_nulo(posicao.valor_aplicado_das_operacoes),
            rendimento_das_operacoes=_dinheiro_ou_nulo(posicao.rendimento_das_operacoes),
            quantidade=_quantidade_ou_nulo(posicao.quantidade),
            custo_medio=_decimal_ou_nulo(posicao.custo_medio),
            historico_completo=posicao.historico_completo,
            rentabilidade_do_periodo=_decimal_ou_nulo(posicao.rentabilidade_do_periodo),
            rentabilidade_anualizada=_decimal_ou_nulo(posicao.rentabilidade_anualizada),
            motivo_sem_rentabilidade=posicao.motivo_sem_rentabilidade,
            acao_do_historico=posicao.acao_do_historico,
            pendencias=[
                PendenciaDeInvestimentoResposta(
                    tipo=p.tipo.value,
                    quantidade_estimada=_quantidade_ou_nulo(p.quantidade_estimada),
                )
                for p in posicao.pendencias
            ],
            taxa=_taxa(posicao.investimento.taxa),
            vencimento=posicao.investimento.vencimento,
            atualizado_em=posicao.investimento.atualizado_em,
            destinacoes=[
                DestinacaoDoInvestimentoResposta(
                    cor=d.cor,
                    tag=None if d.tag is None else str(d.tag),
                    principal=dinheiro_para_texto(d.principal),
                    valor_atual=dinheiro_para_texto(d.valor_atual),
                    rendimento=dinheiro_para_texto(d.rendimento),
                    rentabilidade=d.rentabilidade,
                )
                for d in posicao.destinacoes
            ],
        )
        for posicao in posicoes
    ]


@roteador.post(
    "/investimentos/{investimento_id}/alocar-sem-caixinha",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=_RESPOSTAS_DE_ERRO,
)
def alocar_sem_caixinha(
    investimento_id: UUID,
    requisicao: DefinirDestinacoesRequisicao,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[AlocarCaixinha, Depends(obter_alocar_caixinha)],
) -> Response:
    """Aloca à mão a parte "sem caixinha" (compra nova) às caixinhas existentes (soma 100%)."""
    caso_de_uso.executar(
        usuario.id,
        investimento_id,
        [Destinacao(Tag.de_texto(d.tag), d.percentual) for d in requisicao.destinacoes],
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@roteador.get(
    "/investimentos/resumo",
    response_model=ResumoDeInvestimentosResposta,
    responses=_RESPOSTAS_DE_ERRO,
)
def resumir_investimentos(
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[ResumirInvestimentos, Depends(obter_resumir_investimentos)],
    visao: VisaoDosInvestimentos = VisaoDosInvestimentos.DESTINACAO,
) -> ResumoDeInvestimentosResposta:
    resumo = caso_de_uso.executar(usuario.id, visao)
    return ResumoDeInvestimentosResposta(
        visao=visao.value,
        aportes_sem_destino=AportesSemDestinoResposta(
            total=dinheiro_para_texto(resumo.aportes_sem_destino_total),
            quantidade=resumo.aportes_sem_destino_quantidade,
        ),
        total=dinheiro_para_texto(resumo.total),
        fatias=[
            FatiaDeInvestimentoResposta(
                cor=f.cor, rotulo=f.rotulo, valor=dinheiro_para_texto(f.valor)
            )
            for f in resumo.fatias
        ],
    )


@roteador.get(
    "/investimentos/historico",
    response_model=list[PontoDoHistoricoResposta],
    responses=_RESPOSTAS_DE_ERRO,
)
def consultar_historico_de_investimentos(
    inicio: date,
    fim: date,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[
        ConsultarHistoricoDeInvestimentos, Depends(obter_consultar_historico_de_investimentos)
    ],
) -> list[PontoDoHistoricoResposta]:
    return [
        PontoDoHistoricoResposta(
            investimento_id=p.investimento_id, data=p.data, saldo=dinheiro_para_texto(p.saldo)
        )
        for p in caso_de_uso.executar(usuario.id, inicio, fim)
    ]


@roteador.post(
    "/investimentos/{investimento_id}/destinacoes",
    status_code=status.HTTP_201_CREATED,
    response_model=MovimentoDeInvestimentoResposta,
    responses=_RESPOSTAS_DE_ERRO,
)
def definir_destinacoes_do_investimento(
    investimento_id: UUID,
    requisicao: DefinirDestinacoesRequisicao,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[
        DefinirDestinacoesDoInvestimento, Depends(obter_definir_destinacoes_do_investimento)
    ],
) -> MovimentoDeInvestimentoResposta:
    """Reparte a parte da posição ainda sem principal num aporte de saldo inicial, sem conta."""
    resultado = caso_de_uso.executar(
        usuario.id,
        investimento_id,
        [Destinacao(Tag.de_texto(d.tag), d.percentual) for d in requisicao.destinacoes],
    )
    return movimento_para_resposta(resultado.movimento, resultado.destinacoes)


@roteador.get(
    "/investimentos/{investimento_id}/realocacoes",
    response_model=list[RealocacaoResposta],
    responses=_RESPOSTAS_DE_ERRO,
)
def listar_realocacoes(
    investimento_id: UUID,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[ListarRealocacoes, Depends(obter_listar_realocacoes)],
) -> list[RealocacaoResposta]:
    return [_realocacao_para_resposta(r) for r in caso_de_uso.executar(usuario.id, investimento_id)]


@roteador.post(
    "/investimentos/{investimento_id}/realocacoes",
    status_code=status.HTTP_201_CREATED,
    response_model=RealocacaoResposta,
    responses=_RESPOSTAS_DE_ERRO,
)
def realocar_destinacao(
    investimento_id: UUID,
    requisicao: RealocarRequisicao,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[RealocarDestinacao, Depends(obter_realocar_destinacao)],
) -> RealocacaoResposta:
    valor = None if requisicao.valor is None else Dinheiro.de_reais(requisicao.valor)
    realocacao = caso_de_uso.executar(
        usuario.id,
        investimento_id,
        requisicao.origem,
        requisicao.destino,
        requisicao.data,
        valor=valor,
        percentual=requisicao.percentual,
    )
    return _realocacao_para_resposta(realocacao)


@roteador.delete(
    "/investimentos/{investimento_id}/realocacoes/{realocacao_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=_RESPOSTAS_DE_ERRO,
)
def desfazer_realocacao(
    investimento_id: UUID,
    realocacao_id: UUID,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[DesfazerRealocacao, Depends(obter_desfazer_realocacao)],
) -> None:
    """Apaga uma realocação: o principal volta à origem (422 se o destino já o usou)."""
    caso_de_uso.executar(usuario.id, investimento_id, realocacao_id)


@roteador.delete(
    "/movimentos-de-investimento/{movimento_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=_RESPOSTAS_DE_ERRO,
)
def desfazer_saldo_inicial(
    movimento_id: UUID,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[DesfazerSaldoInicial, Depends(obter_desfazer_saldo_inicial)],
) -> None:
    """Apaga um saldo inicial. A classificação vinda da caixa se desfaz pela rota própria."""
    caso_de_uso.executar(usuario.id, movimento_id)


@roteador.get(
    "/movimentos-de-investimento",
    response_model=list[MovimentoDeInvestimentoResposta],
    responses=_RESPOSTAS_DE_ERRO,
)
def listar_movimentos_de_investimento(
    inicio: date,
    fim: date,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[
        ListarMovimentosDeInvestimento, Depends(obter_listar_movimentos_de_investimento)
    ],
) -> list[MovimentoDeInvestimentoResposta]:
    itens: list[MovimentoComDestinacoes] = caso_de_uso.executar(usuario.id, inicio, fim)
    return [
        movimento_para_resposta(
            i.movimento, i.destinacoes, i.categorias, i.cobertos, i.casamento_id
        )
        for i in itens
    ]


@roteador.post(
    "/movimentos-de-investimento/{movimento_id}/destinacoes",
    response_model=MovimentoDeInvestimentoResposta,
    responses=_RESPOSTAS_DE_ERRO,
)
def associar_movimento_ao_investimento(
    movimento_id: UUID,
    requisicao: AssociarMovimentoRequisicao,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso_de_uso: Annotated[
        AssociarMovimentoAoInvestimento, Depends(obter_associar_movimento_ao_investimento)
    ],
) -> MovimentoDeInvestimentoResposta:
    movimento = caso_de_uso.executar(
        usuario.id,
        movimento_id,
        requisicao.investimento_id,
        [Destinacao(Tag.de_texto(d.tag), d.percentual) for d in requisicao.destinacoes],
    )
    return movimento_para_resposta(movimento, ())


@roteador.delete(
    "/movimentos-de-investimento/{movimento_id}/caixinhas",
    status_code=204,
    response_model=None,
    responses=_RESPOSTAS_DE_ERRO,
)
def remover_caixinhas_do_resgate(
    movimento_id: UUID,
    autenticacao: Annotated[Autenticacao, Depends(obter_autenticacao_de_sessao)],
    caso_de_uso: Annotated[RemoverCaixinhasDoResgate, Depends(obter_remover_caixinhas_do_resgate)],
) -> Response:
    """Só sessão: tira as caixinhas de um resgate (ele continua ligado à posição).

    Recusa (409 ``movimento_nao_desfazivel``) se o resgate paga uma compra ou tem reaplicação.
    """
    caso_de_uso.executar(autenticacao.usuario.id, movimento_id)
    return Response(status_code=204)


@roteador.post(
    "/movimentos-de-investimento/{movimento_id}/desfazer-classificacao",
    response_model=ClassificacaoDesfeitaResposta,
    responses=_RESPOSTAS_DE_ERRO,
)
def desfazer_classificacao(
    movimento_id: UUID,
    autenticacao: Annotated[Autenticacao, Depends(obter_autenticacao_de_sessao)],
    caso_de_uso: Annotated[
        DesfazerClassificacaoDeInvestimento, Depends(obter_desfazer_classificacao_de_investimento)
    ],
    configuracoes: ConfiguracoesDaApp,
    requisicao: DesfazerClassificacaoRequisicao | None = None,
) -> ClassificacaoDesfeitaResposta:
    """Só sessão: remove a classificação e devolve a transação à caixa de entrada.

    Uma divisão exige confirmação separada para remover todas as partes atomicamente.
    """
    resultado = caso_de_uso.executar(
        autenticacao.usuario.id,
        movimento_id,
        caixa_de_entrada_disponivel=e_dono_da_importacao(configuracoes, autenticacao.usuario),
        desfazer_divisao_inteira=requisicao.desfazer_divisao_inteira if requisicao else False,
    )
    return ClassificacaoDesfeitaResposta(
        transacao_id=resultado.transacao_id,
        estado=resultado.estado.value,
        lancamentos_removidos=resultado.lancamentos_removidos,
    )


@roteador.get(
    "/reservas-das-destinacoes",
    response_model=list[ReservaDaDestinacaoResposta],
    responses=_RESPOSTAS_DE_ERRO,
)
def listar_reservas(
    categoria: CategoriaDoGasto,
    autenticacao: Annotated[Autenticacao, Depends(obter_autenticacao_de_sessao)],
    caso: Annotated[ListarReservasDasDestinacoes, Depends(obter_listar_reservas_das_destinacoes)],
) -> list[ReservaDaDestinacaoResposta]:
    return [
        ReservaDaDestinacaoResposta(
            tag=str(r.tag),
            reservado=dinheiro_para_texto(r.reservado),
            coberto=dinheiro_para_texto(r.coberto),
            disponivel=dinheiro_para_texto(r.disponivel),
            cor=r.cor,
        )
        for r in caso.executar(autenticacao.usuario.id, categoria)
    ]


@roteador.put(
    "/cores-das-destinacoes", response_model=CorDaDestinacaoResposta, responses=_RESPOSTAS_DE_ERRO
)
def definir_cor(
    requisicao: DefinirCorRequisicao,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso: Annotated[DefinirCorDaDestinacao, Depends(obter_definir_cor_da_destinacao)],
) -> CorDaDestinacaoResposta:
    caso.executar(usuario.id, requisicao.tag, requisicao.cor)
    return CorDaDestinacaoResposta(tag=str(Tag.de_texto(requisicao.tag)), cor=requisicao.cor.value)


@roteador.delete(
    "/cores-das-destinacoes", status_code=204, response_model=None, responses=_RESPOSTAS_DE_ERRO
)
def remover_cor(
    tag: str,
    usuario: Annotated[Usuario, Depends(obter_usuario_atual)],
    caso: Annotated[RemoverCorDaDestinacao, Depends(obter_remover_cor_da_destinacao)],
) -> Response:
    caso.executar(usuario.id, tag)
    return Response(status_code=204)
