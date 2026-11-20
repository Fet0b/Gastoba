from uuid import UUID

from gastoba.domain.cobertura_de_compra import (
    CoberturaDeCompra,
    ReservaDaDestinacao,
    validar_cobertura,
    validar_cobertura_com_resgate,
)
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import (
    CoberturaInvalida,
    GastoNaoEncontrado,
    MovimentoDeInvestimentoNaoEncontrado,
)
from gastoba.domain.movimento_de_investimento import TipoDeMovimento
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.tag import Tag


class AssociarCompraADestinacao:
    """Marca a compra como paga com uma caixinha.

    Com ``movimento_id``, o pagamento é um resgate real da caixinha, já classificado com a tag: o
    valor aumenta o limite da categoria no mês e nada é criado nem alterado em saldo, posição ou
    principal. Sem ``movimento_id``, vale a cobertura só de métrica (reserva de aporte com
    categoria histórica).
    """

    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self,
        usuario_id: UUID,
        gasto_id: UUID,
        tag: str,
        valor: Dinheiro,
        movimento_id: UUID | None = None,
    ) -> CoberturaDeCompra:
        with self._unidade_de_trabalho as uow:
            if movimento_id is not None:
                uow.reaplicacoes_de_resgates.bloquear(usuario_id)
            gasto = uow.gastos.obter(usuario_id, gasto_id)
            if gasto is None:
                raise GastoNaoEncontrado("Gasto não encontrado.")
            destino = Tag.de_texto(tag)
            reservado = uow.destinacoes.somar_reservado_por_tag(usuario_id, gasto.categoria).get(
                destino, Dinheiro(0)
            )
            coberto = uow.coberturas.somar_coberto_por_tag(usuario_id, gasto.categoria).get(
                destino, Dinheiro(0)
            )
            if movimento_id is None:
                cobertura = validar_cobertura(
                    gasto,
                    destino,
                    valor,
                    uow.coberturas.somar_do_gasto(gasto.id),
                    ReservaDaDestinacao(gasto.categoria, destino, reservado, coberto),
                    uow.coberturas.tags_do_gasto(gasto.id),
                )
            else:
                movimento = uow.movimentos_de_investimento.obter(usuario_id, movimento_id)
                if movimento is None:
                    raise MovimentoDeInvestimentoNaoEncontrado("Resgate não encontrado.")
                if movimento.tipo != TipoDeMovimento.RESGATE:
                    raise CoberturaInvalida("Só um resgate pode pagar uma compra.")
                do_resgate = uow.destinacoes.resgate_da_tag(movimento.id, destino)
                if do_resgate is None:
                    raise CoberturaInvalida("Este resgate não está classificado com esta tag.")
                reaplicacao = uow.reaplicacoes_de_resgates.para_movimento(usuario_id, movimento.id)
                usados = uow.coberturas.usado_dos_resgates([movimento.id]).get(movimento.id, {})
                livre = movimento.valor - Dinheiro(sum(v.centavos for v in usados.values()))
                if reaplicacao is not None:
                    livre -= reaplicacao.valor
                cobertura = validar_cobertura_com_resgate(
                    gasto,
                    destino,
                    valor,
                    movimento.id,
                    uow.coberturas.somar_do_gasto(gasto.id),
                    uow.coberturas.tags_do_gasto(gasto.id),
                    resgate_da_tag=do_resgate[0],
                    principal_do_resgate_da_tag=do_resgate[1],
                    ja_usado_do_resgate=uow.coberturas.usado_do_resgate(movimento.id, destino),
                    reservado=do_resgate[1],
                    principal_ja_usado_na_reserva=Dinheiro(0),
                    disponivel_do_resgate=livre,
                )
            uow.coberturas.adicionar(cobertura)
            uow.commit()
            return cobertura
